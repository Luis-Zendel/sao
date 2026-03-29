import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..services.weather import get_cached_forecast, fetch_all_zones_forecast
from ..services.alert_engine import (
    evaluate_alerts,
    get_zone_thresholds,
    get_alert_memory,
    reset_alert_memory,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# In-memory alert history log
_alert_history: list[dict[str, Any]] = []
MAX_HISTORY = 200


@router.get("/current-forecast")
async def current_forecast(force_refresh: bool = Query(False)):
    """Return current precipitation forecast for all 14 zones."""
    try:
        if force_refresh:
            data = await fetch_all_zones_forecast()
        else:
            data = await get_cached_forecast()
        return {"zones": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/evaluate")
async def evaluate(force_refresh: bool = Query(False)):
    """Run the decision engine and return active alerts."""
    try:
        if force_refresh:
            forecast = await fetch_all_zones_forecast()
        else:
            forecast = await get_cached_forecast()

        alerts = evaluate_alerts(forecast)

        # Append to history
        for alert in alerts:
            _alert_history.append(alert)
        # Trim
        if len(_alert_history) > MAX_HISTORY:
            del _alert_history[: len(_alert_history) - MAX_HISTORY]

        return {
            "alerts": alerts,
            "alert_count": len(alerts),
            "evaluated_zones": len(forecast),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
def alert_history(limit: int = Query(50, le=200)):
    """Return recent alert history."""
    return {
        "history": list(reversed(_alert_history))[:limit],
        "total": len(_alert_history),
    }


@router.get("/zone-thresholds")
def zone_thresholds():
    """Return per-zone calibrated thresholds (derived from historical data)."""
    try:
        thresholds = get_zone_thresholds()
        return {
            "thresholds": [
                {"zone": zone, **data} for zone, data in thresholds.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory")
def alert_memory():
    """Return current alert deduplication state."""
    return {"memory": get_alert_memory()}


@router.delete("/memory")
def clear_alert_memory(zone: str = Query(None)):
    """Clear alert memory (optionally for a specific zone)."""
    reset_alert_memory(zone)
    return {"status": "cleared", "zone": zone or "all"}
