"""
AI Agent: orchestrates the full pipeline.
Weather → Alert Engine → Gemini → Telegram
Runs on a configurable scheduler and maintains alert memory.
"""

import json
import logging
import os
from datetime import datetime, date
from typing import Any

from .weather import get_cached_forecast, fetch_all_zones_forecast
from .alert_engine import evaluate_alerts, get_zone_thresholds
from .llm import generate_alert_message, generate_daily_summary
from .telegram_bot import send_message

logger = logging.getLogger(__name__)

# In-memory agent state
_agent_logs: list[dict[str, Any]] = []
_daily_events: list[dict[str, Any]] = []
_agent_running = False
_last_run: datetime | None = None
MAX_LOGS = 500


def _log_event(event_type: str, data: dict) -> None:
    entry = {
        "timestamp": datetime.now().isoformat(),
        "type": event_type,
        **data,
    }
    _agent_logs.append(entry)
    if len(_agent_logs) > MAX_LOGS:
        del _agent_logs[: len(_agent_logs) - MAX_LOGS]


async def run_agent_cycle(force_refresh: bool = False) -> dict[str, Any]:
    """
    Execute one full agent cycle:
    1. Fetch weather forecast
    2. Evaluate alerts via decision engine
    3. For each alert, generate Gemini message + send to Telegram
    4. Log everything
    """
    global _last_run
    _last_run = datetime.now()
    cycle_results = []

    try:
        # Step 1: Weather
        logger.info("Agent cycle: fetching weather forecast")
        if force_refresh:
            forecast = await fetch_all_zones_forecast()
        else:
            forecast = await get_cached_forecast()

        _log_event("weather_fetch", {"zones_fetched": len(forecast)})

        # Step 2: Evaluate
        logger.info("Agent cycle: evaluating alerts")
        alerts = evaluate_alerts(forecast)
        _log_event("alerts_evaluated", {"alert_count": len(alerts), "alerts": [a["zone"] for a in alerts]})

        if not alerts:
            logger.info("Agent cycle: no active alerts")
            _log_event("cycle_complete", {"alerts_sent": 0, "status": "no_alerts"})
            return {"status": "ok", "alerts_sent": 0, "alerts": []}

        # Step 3: Generate messages and send
        for alert in alerts:
            zone = alert["zone"]
            risk = alert["risk_level"]

            # Only send Telegram for medium/high/critical
            should_notify = risk in ("medio", "alto", "critico")

            try:
                message = await generate_alert_message(alert)
                _log_event(
                    "message_generated",
                    {"zone": zone, "risk": risk, "message_length": len(message)},
                )

                telegram_result = {"ok": False, "skipped": True}
                if should_notify:
                    telegram_result = await send_message(message)

                cycle_results.append(
                    {
                        "zone": zone,
                        "risk_level": risk,
                        "message": message,
                        "telegram_sent": telegram_result.get("ok", False),
                        "telegram_simulated": telegram_result.get("simulated", False),
                        "alert_data": alert,
                        "timestamp": datetime.now().isoformat(),
                    }
                )

                _log_event(
                    "notification_sent" if telegram_result.get("ok") else "notification_skipped",
                    {
                        "zone": zone,
                        "risk": risk,
                        "sent": telegram_result.get("ok", False),
                        "reason": "cooldown/risk_low" if not should_notify else None,
                    },
                )

                # Track for daily summary
                _daily_events.append(alert)

            except Exception as e:
                logger.error(f"Error processing alert for {zone}: {e}")
                _log_event("error", {"zone": zone, "error": str(e)})

        _log_event(
            "cycle_complete",
            {"alerts_sent": len([r for r in cycle_results if r["telegram_sent"]]), "status": "ok"},
        )

        return {
            "status": "ok",
            "alerts_sent": len([r for r in cycle_results if r["telegram_sent"]]),
            "alerts": cycle_results,
            "cycle_time": _last_run.isoformat(),
        }

    except Exception as e:
        logger.error(f"Agent cycle error: {e}")
        _log_event("cycle_error", {"error": str(e)})
        return {"status": "error", "error": str(e), "alerts_sent": 0}


async def send_daily_summary() -> dict[str, Any]:
    """Send an end-of-day summary to Telegram."""
    today = date.today().strftime("%d/%m/%Y")
    today_events = [
        e for e in _daily_events
        if e.get("alert_time", "").startswith(date.today().isoformat())
    ]

    # Split events into confirmed (rain present at alert time) vs forecast-only
    confirmed = [e for e in today_events if e.get("current_precipitation_mm", 0) > 0]
    preventive = [e for e in today_events if e.get("current_precipitation_mm", 0) == 0]

    message = await generate_daily_summary(
        today_events, today, len(confirmed), len(preventive)
    )
    result = await send_message(message)

    _log_event(
        "daily_summary_sent",
        {"date": today, "events_count": len(today_events), "sent": result.get("ok")},
    )

    # Clear today's events
    _daily_events.clear()

    return {"status": "ok", "message": message, "events_summarized": len(today_events)}


def get_agent_logs(limit: int = 100) -> list[dict]:
    return list(reversed(_agent_logs))[:limit]


def get_agent_status() -> dict[str, Any]:
    return {
        "running": _agent_running,
        "last_run": _last_run.isoformat() if _last_run else None,
        "total_log_entries": len(_agent_logs),
        "pending_daily_events": len(_daily_events),
        "scheduler_interval_minutes": int(os.getenv("SCHEDULER_INTERVAL_MINUTES", 30)),
        "cooldown_hours": int(os.getenv("ALERT_COOLDOWN_HOURS", 2)),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "telegram_configured": bool(os.getenv("TELEGRAM_BOT_TOKEN"))
        and bool(os.getenv("TELEGRAM_CHAT_ID")),
    }


def set_agent_running(state: bool) -> None:
    global _agent_running
    _agent_running = state
