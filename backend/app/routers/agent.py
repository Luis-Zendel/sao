import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services.agent import (
    run_agent_cycle,
    run_full_evaluation,
    send_daily_summary,
    get_agent_logs,
    get_agent_status,
)
from ..services.telegram_bot import send_message, test_connection, detect_chat_id
from ..services.chat_service import get_chat_history, clear_chat_history

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentConfig(BaseModel):
    gemini_api_key: str | None = None
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    alert_cooldown_hours: int | None = None
    scheduler_interval_minutes: int | None = None


@router.post("/trigger")
async def trigger_agent(force_refresh: bool = Query(False)):
    """Manually trigger one agent cycle."""
    try:
        result = await run_agent_cycle(force_refresh=force_refresh)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def agent_status():
    """Return agent configuration and status."""
    return get_agent_status()


@router.get("/logs")
def agent_logs(limit: int = Query(100, le=500)):
    """Return agent activity log."""
    return {"logs": get_agent_logs(limit), "total": limit}


@router.post("/perform-evaluation")
async def perform_evaluation():
    """
    Full on-demand evaluation: fetches fresh precipitation data for all zones,
    generates a holistic LLM summary with risk levels, and sends it to Telegram.
    """
    try:
        result = await run_full_evaluation()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/daily-summary")
async def daily_summary():
    """Send end-of-day summary to Telegram."""
    try:
        result = await send_daily_summary()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/detect-chat-id")
async def detect_chat_id_endpoint(token: str = Query(None)):
    """
    Calls Telegram getUpdates to find available chat IDs.
    The user must have sent at least one message to the bot first.
    """
    try:
        result = await detect_chat_id(token or None)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-telegram")
async def test_telegram():
    """Test Telegram bot connectivity and send a real test message."""
    try:
        bot_info = await test_connection()
        if bot_info.get("ok"):
            result = await send_message(
                "✅ <b>Rappi Ops Alert System</b> — conexión verificada.\n\n"
                "🚨 <b>ALERTA CRÍTICA — Centro (PRUEBA)</b>\n"
                "Lluvia esperada: 8.5 mm/hr en las próximas 2h\n"
                "Ratio proyectado: ~2.1 (SATURACIÓN)\n"
                "ACCIÓN: Subir earnings de 55 a 79 MXN en los próximos 30 min\n"
                "Zonas secundarias: Mitras Centro, Independencia\n\n"
                "<i>Este es un mensaje de prueba — el agente está activo.</i>"
            )
            bot_info["message_sent"] = result.get("ok", False)
            bot_info["message_error"] = result.get("error") if not result.get("ok") else None
        return bot_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat-history")
def chat_history():
    """Return the in-memory bidirectional chat history."""
    history = get_chat_history()
    return {"history": history, "total": len(history)}


@router.post("/clear-chat")
def clear_chat():
    """Clear the in-memory bidirectional chat conversation history."""
    clear_chat_history()
    return {"status": "cleared"}


@router.put("/config")
async def update_config(config: AgentConfig):
    """
    Update agent configuration (sets env vars in-process).
    Note: for persistent config, edit the .env file directly.
    """
    if config.gemini_api_key:
        os.environ["GEMINI_API_KEY"] = config.gemini_api_key
    if config.telegram_bot_token:
        os.environ["TELEGRAM_BOT_TOKEN"] = config.telegram_bot_token
    if config.telegram_chat_id:
        os.environ["TELEGRAM_CHAT_ID"] = config.telegram_chat_id
    if config.alert_cooldown_hours is not None:
        os.environ["ALERT_COOLDOWN_HOURS"] = str(config.alert_cooldown_hours)
    if config.scheduler_interval_minutes is not None:
        os.environ["SCHEDULER_INTERVAL_MINUTES"] = str(config.scheduler_interval_minutes)

    return {"status": "updated", "current": get_agent_status()}
