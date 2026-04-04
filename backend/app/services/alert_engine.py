"""
Alert decision engine: calibrated from historical data.

Thresholds and earnings recommendations are derived from RAW_DATA.csv analysis:
- Per-zone precipitation sensitivity (P3 regression slopes)
- Historical saturation events during rain (P2 bucket analysis)
- Earnings effectiveness under rain conditions (P5 interaction analysis)
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from .data_loader import load_raw_data, load_zone_info

logger = logging.getLogger(__name__)

SATURATION_THRESHOLD = 1.8
ALERT_COOLDOWN_HOURS = 2

# In-memory alert deduplication store: {zone: last_alert_datetime}
_alert_memory: dict[str, datetime] = {}


def _compute_zone_thresholds() -> dict[str, dict]:
    """
    Derive per-zone precipitation thresholds and earnings deltas from historical data.
    Returns {zone_name: {precip_threshold, earnings_slope, baseline_earnings, baseline_ratio}}
    """
    df = load_raw_data()
    thresholds = {}

    for zone in df["ZONE"].unique():
        z = df[df["ZONE"] == zone].copy()
        rain_events = z[z["PRECIPITATION_MM"] > 0]
        sat_rain = z[(z["PRECIPITATION_MM"] > 0) & (z["RATIO"] > SATURATION_THRESHOLD)]

        # Precipitation threshold: lowest mm/hr observed when saturation occurred
        if len(sat_rain) > 0:
            precip_threshold = sat_rain["PRECIPITATION_MM"].quantile(0.25)
        else:
            precip_threshold = 3.0  # default fallback

        # Ensure minimum threshold
        precip_threshold = max(precip_threshold, 0.5)

        # Earnings slope: how much to raise earnings per mm/hr of rain
        # Derived from events where raising earnings correlated with ratio recovery
        if len(rain_events) >= 10 and rain_events["PRECIPITATION_MM"].std() > 0:
            slope, _, _, _, _ = stats.linregress(
                rain_events["PRECIPITATION_MM"], rain_events["EARNINGS"]
            )
            earnings_slope = max(float(slope), 0.5)  # at least 0.5 MXN per mm
        else:
            earnings_slope = 2.0

        baseline_earnings = float(z["EARNINGS"].median())
        baseline_ratio = float(z["RATIO"].median()) if not z["RATIO"].isna().all() else 1.0

        # Vulnerability: % of rain hours that resulted in saturation
        vuln = len(sat_rain) / max(len(rain_events), 1) * 100

        thresholds[zone] = {
            "precip_threshold": round(precip_threshold, 2),
            "earnings_slope": round(earnings_slope, 3),
            "baseline_earnings": round(baseline_earnings, 1),
            "baseline_ratio": round(baseline_ratio, 3),
            "vulnerability_pct": round(vuln, 1),
        }

    return thresholds


# Cache thresholds at startup (computed once from data)
_zone_thresholds: dict[str, dict] | None = None


def get_zone_thresholds() -> dict[str, dict]:
    global _zone_thresholds
    if _zone_thresholds is None:
        _zone_thresholds = _compute_zone_thresholds()
    return _zone_thresholds


def _get_sensitivity_tier(vuln_pct: float) -> str:
    """Classify a zone's historical sensitivity to rain-driven saturation."""
    if vuln_pct >= 60:
        return "alta"
    if vuln_pct >= 30:
        return "media"
    return "baja"


def _get_risk_level(zone: str, precip_mm: float) -> str:
    """Map precipitation level to risk category for a specific zone."""
    thresholds = get_zone_thresholds()
    t = thresholds.get(zone, {})
    base = t.get("precip_threshold", 3.0)
    vuln = t.get("vulnerability_pct", 30)

    # Zones with higher vulnerability get elevated risk at lower precip
    vuln_factor = 1.0 - min(vuln / 100, 0.5)  # 0.5–1.0

    if precip_mm <= 0:
        return "ninguno"
    if precip_mm < base * vuln_factor * 0.5:
        return "bajo"
    if precip_mm < base * vuln_factor:
        return "medio"
    if precip_mm < base * 2:
        return "alto"
    return "critico"


def _compute_recommended_earnings(zone: str, precip_mm: float) -> dict:
    """Compute specific earnings recommendation based on historical regression."""
    thresholds = get_zone_thresholds()
    t = thresholds.get(zone, {})
    baseline = t.get("baseline_earnings", 55.0)
    slope = t.get("earnings_slope", 2.0)

    recommended = baseline + slope * precip_mm
    recommended = round(recommended, 0)

    return {
        "current_baseline_earnings": baseline,
        "recommended_earnings": recommended,
        "delta": round(recommended - baseline, 1),
        "formula": f"{baseline:.0f} + {slope:.1f} × {precip_mm:.1f}mm = {recommended:.0f} MXN",
    }


def _get_similar_historical_events(zone: str, precip_mm: float, n: int = 3) -> list[dict]:
    """Find top N historical hours with similar precipitation in the same zone."""
    df = load_raw_data()
    z = df[df["ZONE"] == zone].copy()

    if len(z) == 0:
        return []

    z["precip_diff"] = (z["PRECIPITATION_MM"] - precip_mm).abs()
    similar = z.nsmallest(n * 3, "precip_diff")
    similar = similar[similar["PRECIPITATION_MM"] > 0].head(n)

    results = []
    for _, row in similar.iterrows():
        results.append(
            {
                "date": row["DATE"].strftime("%Y-%m-%d"),
                "hour": int(row["HOUR"]),
                "precipitation_mm": round(float(row["PRECIPITATION_MM"]), 2),
                "ratio": round(float(row["RATIO"]) if not pd.isna(row["RATIO"]) else 0, 3),
                "status": row["STATUS"],
                "connected_rt": int(row["CONNECTED_RT"]),
                "orders": int(row["ORDERS"]),
                "earnings": round(float(row["EARNINGS"]), 1),
            }
        )
    return results


def _get_secondary_zones(primary_zone: str, risk_level: str) -> list[str]:
    """Return zones that may be secondarily affected (geographically adjacent)."""
    df = load_raw_data()

    # Zones with similar precipitation correlation patterns
    zone_info = load_zone_info()
    primary_coords = zone_info[zone_info["ZONE"] == primary_zone]
    if len(primary_coords) == 0:
        return []

    plat = primary_coords.iloc[0]["LATITUDE_CENTER"]
    plon = primary_coords.iloc[0]["LONGITUDE_CENTER"]

    # Find 3 nearest zones by centroid distance
    zone_info = zone_info[zone_info["ZONE"] != primary_zone].copy()
    zone_info["dist"] = (
        (zone_info["LATITUDE_CENTER"] - plat) ** 2
        + (zone_info["LONGITUDE_CENTER"] - plon) ** 2
    ) ** 0.5
    nearest = zone_info.nsmallest(3, "dist")["ZONE"].tolist()
    return nearest


def evaluate_alerts(forecast: list[dict]) -> list[dict]:
    """
    Core decision engine: evaluate weather forecast and return list of active alerts.
    Each alert contains zone, risk level, recommendation, and context.
    """
    alerts = []
    now = datetime.now()

    for zone_forecast in forecast:
        zone = zone_forecast["zone"]
        precip_2h = zone_forecast.get("max_2h_precipitation_mm", 0)
        precip_current = zone_forecast.get("current_precipitation_mm", 0)
        error = zone_forecast.get("error")

        if error:
            logger.warning(f"Skipping {zone} due to weather fetch error: {error}")
            continue

        # Use 2h forecast as primary trigger (balance precision/reaction window)
        trigger_precip = max(precip_2h, precip_current)
        risk = _get_risk_level(zone, trigger_precip)

        if risk in ("ninguno", "bajo"):
            continue

        # Check cooldown (reads from env at runtime so PUT /api/agent/config takes effect)
        cooldown_hours = int(os.getenv("ALERT_COOLDOWN_HOURS", ALERT_COOLDOWN_HOURS))
        last_alert = _alert_memory.get(zone)
        if last_alert and (now - last_alert).total_seconds() < cooldown_hours * 3600:
            logger.debug(
                f"Alert for {zone} suppressed (cooldown, last: {last_alert.isoformat()})"
            )
            continue

        earnings_rec = _compute_recommended_earnings(zone, trigger_precip)
        historical = _get_similar_historical_events(zone, trigger_precip)
        secondary = _get_secondary_zones(zone, risk)
        thresholds = get_zone_thresholds()
        zone_data = thresholds.get(zone, {})

        # Projected ratio from historical regression
        hist_ratios = [h["ratio"] for h in historical if h["ratio"] > 0]
        projected_ratio = round(np.mean(hist_ratios), 2) if hist_ratios else round(
            zone_data.get("baseline_ratio", 1.0) + 0.4 * trigger_precip, 2
        )

        vuln_pct = zone_data.get("vulnerability_pct", 0)
        alert = {
            "zone": zone,
            "risk_level": risk,
            "sensitivity_tier": _get_sensitivity_tier(vuln_pct),
            "trigger_precipitation_mm": round(trigger_precip, 2),
            "current_precipitation_mm": round(precip_current, 2),
            "forecast_2h_precipitation_mm": round(precip_2h, 2),
            "projected_ratio": projected_ratio,
            "zone_threshold_mm": zone_data.get("precip_threshold", 3.0),
            "vulnerability_pct": vuln_pct,
            "earnings_recommendation": earnings_rec,
            "historical_context": historical,
            "secondary_zones": secondary,
            "alert_time": now.isoformat(),
            "action_window_minutes": 30 if risk == "critico" else 60,
        }
        alerts.append(alert)

        # Update alert memory
        _alert_memory[zone] = now

    return alerts


def get_alert_memory() -> list[dict]:
    """Return current alert memory state (for debugging/display)."""
    return [
        {"zone": zone, "last_alert": ts.isoformat(), "minutes_ago": int((datetime.now() - ts).total_seconds() / 60)}
        for zone, ts in sorted(_alert_memory.items(), key=lambda x: x[1], reverse=True)
    ]


def reset_alert_memory(zone: str | None = None) -> None:
    """Reset alert memory for a zone or all zones."""
    if zone:
        _alert_memory.pop(zone, None)
    else:
        _alert_memory.clear()
