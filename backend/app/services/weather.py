"""
Weather service: fetches hourly precipitation forecast from Open-Meteo.
Free API, no key required, covers Monterrey coordinates.

Uses a SINGLE bulk request for all zones to avoid 429 rate-limit errors.
Open-Meteo accepts comma-separated lat/lon lists and returns an array.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from .data_loader import load_zone_info

logger = logging.getLogger(__name__)

OPEN_METEO_URL  = "https://api.open-meteo.com/v1/forecast"
FORECAST_HOURS  = 6


def _parse_zone_response(data: dict, zone_name: str, lat: float, lon: float) -> dict[str, Any]:
    """Extract relevant precipitation fields from a single Open-Meteo zone response."""
    try:
        times  = data["hourly"]["time"]
        precip = data["hourly"]["precipitation"]

        now          = datetime.now(tz=timezone.utc).astimezone()
        now_hour_str = now.strftime("%Y-%m-%dT%H:00")

        current_idx = next((i for i, t in enumerate(times) if t >= now_hour_str), 0)

        hourly_forecast = [
            {
                "time":             times[i],
                "precipitation_mm": float(precip[i]) if precip[i] is not None else 0.0,
                "hours_ahead":      i - current_idx,
            }
            for i in range(current_idx, min(current_idx + FORECAST_HOURS, len(times)))
        ]

        current_precip = hourly_forecast[0]["precipitation_mm"] if hourly_forecast else 0.0
        max_2h         = max((h["precipitation_mm"] for h in hourly_forecast[:2]), default=0.0)
        max_3h         = max((h["precipitation_mm"] for h in hourly_forecast[:3]), default=0.0)

        return {
            "zone":                    zone_name,
            "lat":                     lat,
            "lon":                     lon,
            "current_precipitation_mm":current_precip,
            "max_2h_precipitation_mm": max_2h,
            "max_3h_precipitation_mm": max_3h,
            "hourly_forecast":         hourly_forecast,
            "fetch_time":              now.isoformat(),
            "source":                  "open-meteo",
            "error":                   None,
        }
    except Exception as e:
        return _error_response(zone_name, lat, lon, str(e))


def _error_response(zone_name: str, lat: float, lon: float, err: str) -> dict[str, Any]:
    return {
        "zone":                    zone_name,
        "lat":                     lat,
        "lon":                     lon,
        "current_precipitation_mm":0.0,
        "max_2h_precipitation_mm": 0.0,
        "max_3h_precipitation_mm": 0.0,
        "hourly_forecast":         [],
        "fetch_time":              datetime.now().isoformat(),
        "source":                  "open-meteo",
        "error":                   err,
    }


async def fetch_all_zones_forecast() -> list[dict[str, Any]]:
    """
    Fetch precipitation forecast for ALL 14 zones in ONE HTTP request.
    Open-Meteo accepts comma-separated lat/lon lists → returns a JSON array.
    This avoids the 429 rate-limit caused by 14 simultaneous requests.
    """
    zone_info  = load_zone_info()
    zones      = zone_info.to_dict(orient="records")
    lats       = ",".join(str(round(z["LATITUDE_CENTER"],  4)) for z in zones)
    lons       = ",".join(str(round(z["LONGITUDE_CENTER"], 4)) for z in zones)

    params = {
        "latitude":     lats,
        "longitude":    lons,
        "hourly":       "precipitation",
        "timezone":     "America/Monterrey",
        "forecast_days": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            raw = resp.json()

        # Bulk response is a list when multiple coordinates are given,
        # a single dict when only one coordinate.
        if isinstance(raw, dict):
            raw = [raw]

        results = []
        for i, zone in enumerate(zones):
            if i < len(raw):
                results.append(
                    _parse_zone_response(raw[i], zone["ZONE"], zone["LATITUDE_CENTER"], zone["LONGITUDE_CENTER"])
                )
            else:
                results.append(_error_response(zone["ZONE"], zone["LATITUDE_CENTER"], zone["LONGITUDE_CENTER"], "No data in bulk response"))

        logger.info(f"Bulk weather fetch OK — {len(results)} zones, errors: {sum(1 for r in results if r['error'])}")
        return results

    except Exception as e:
        logger.error(f"Bulk weather fetch failed: {e}")
        # Fallback: return zero-precipitation for all zones so the rest of the pipeline keeps running
        return [
            _error_response(z["ZONE"], z["LATITUDE_CENTER"], z["LONGITUDE_CENTER"], str(e))
            for z in zones
        ]


# ── Cache (15 min TTL) ────────────────────────────────────────────────────────
_forecast_cache: dict[str, Any] = {"data": None, "fetched_at": None}
CACHE_TTL_SECONDS = 900


async def get_cached_forecast() -> list[dict[str, Any]]:
    """Return cached forecast if fresh, otherwise re-fetch."""
    now   = datetime.now()
    cache = _forecast_cache

    if (
        cache["data"] is not None
        and cache["fetched_at"] is not None
        and (now - cache["fetched_at"]).total_seconds() < CACHE_TTL_SECONDS
    ):
        logger.debug("Returning cached weather forecast")
        return cache["data"]

    logger.info("Fetching fresh bulk weather forecast")
    data = await fetch_all_zones_forecast()
    cache["data"]       = data
    cache["fetched_at"] = now
    return data
