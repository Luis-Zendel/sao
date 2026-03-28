"""
Analytics service: answers the 5 business questions from Module 1.
All analysis is based on the historical RAW_DATA dataset.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from .data_loader import load_raw_data, load_zone_info

logger = logging.getLogger(__name__)

SATURATION_THRESHOLD = 1.8
OVERSUPPLY_THRESHOLD = 0.5
HEALTHY_MIN = 0.9
HEALTHY_MAX = 1.2


# ---------------------------------------------------------------------------
# P1: Saturation heatmap — which hours and zones reach critical levels?
# ---------------------------------------------------------------------------
def _sat_pct(x):
    return (x > SATURATION_THRESHOLD).mean() * 100


def _over_pct(x):
    return ((x < OVERSUPPLY_THRESHOLD) & x.notna()).mean() * 100


def get_p1_saturation_heatmap() -> dict[str, Any]:
    df = load_raw_data()

    # Zone × hour pivot: ratio_mean, saturation_pct, oversupply_pct
    pivot = (
        df.groupby(["ZONE", "HOUR"])["RATIO"]
        .agg(
            ratio_mean="mean",
            ratio_median="median",
            saturation_pct=_sat_pct,
            oversupply_pct=_over_pct,
        )
        .reset_index()
        .rename(columns={"ZONE": "zone", "HOUR": "hour"})
    )

    # Heatmap data: one record per zone×hour
    heatmap_data = pivot[
        ["zone", "hour", "ratio_mean", "saturation_pct", "oversupply_pct"]
    ].to_dict(orient="records")

    # Top 10 zone×hour combos by saturation %
    top_critical = (
        pivot.sort_values("saturation_pct", ascending=False)
        .head(10)
        .to_dict(orient="records")
    )

    # Saturation by hour (all zones aggregated)
    hourly = (
        df.groupby("HOUR")["RATIO"]
        .agg(
            ratio_mean="mean",
            saturation_pct=_sat_pct,
            oversupply_pct=_over_pct,
        )
        .reset_index()
        .rename(columns={"HOUR": "hour"})
        .to_dict(orient="records")
    )

    # Saturation + oversupply by zone
    by_zone = (
        df.groupby("ZONE")["RATIO"]
        .agg(
            ratio_mean="mean",
            saturation_pct=_sat_pct,
            saturation_hours=lambda x: (x > SATURATION_THRESHOLD).sum(),
            oversupply_pct=_over_pct,
            oversupply_hours=lambda x: ((x < OVERSUPPLY_THRESHOLD) & x.notna()).sum(),
        )
        .reset_index()
        .rename(columns={"ZONE": "zone"})
        .to_dict(orient="records")
    )

    # Key findings — saturation
    peak_sat_hour = pivot.groupby("hour")["saturation_pct"].mean().idxmax()
    peak_sat_zone = pivot.groupby("zone")["saturation_pct"].mean().idxmax()
    overall_sat_pct = (df["RATIO"] > SATURATION_THRESHOLD).mean() * 100

    # Key findings — oversupply
    peak_over_hour = pivot.groupby("hour")["oversupply_pct"].mean().idxmax()
    peak_over_zone = pivot.groupby("zone")["oversupply_pct"].mean().idxmax()
    overall_over_pct = ((df["RATIO"] < OVERSUPPLY_THRESHOLD) & df["RATIO"].notna()).mean() * 100

    return {
        "heatmap": heatmap_data,
        "hourly_summary": hourly,
        "zone_summary": by_zone,
        "top_critical_slots": top_critical,
        "key_findings": {
            "peak_saturation_hour": int(peak_sat_hour),
            "most_saturated_zone": peak_sat_zone,
            "overall_saturation_pct": round(float(overall_sat_pct), 2),
            "saturation_threshold": SATURATION_THRESHOLD,
            "peak_oversupply_hour": int(peak_over_hour),
            "most_oversupply_zone": peak_over_zone,
            "overall_oversupply_pct": round(float(overall_over_pct), 2),
            "oversupply_threshold": OVERSUPPLY_THRESHOLD,
        },
    }


# ---------------------------------------------------------------------------
# P2: External variable correlation — precipitation vs ratio
# ---------------------------------------------------------------------------
def get_p2_precipitation_correlation() -> dict[str, Any]:
    df = load_raw_data()

    # Filter out rows without precipitation data or zero-connected
    valid = df.dropna(subset=["RATIO", "PRECIPITATION_MM"])
    valid = valid[valid["CONNECTED_RT"] > 0]

    # Overall Pearson correlation
    corr, pvalue = stats.pearsonr(
        valid["PRECIPITATION_MM"], valid["RATIO"].clip(upper=5)
    )

    # Correlation by precipitation bucket
    valid["precip_bucket"] = pd.cut(
        valid["PRECIPITATION_MM"],
        bins=[-0.001, 0, 1, 3, 7, 15, 100],
        labels=["Sin lluvia", "0–1mm", "1–3mm", "3–7mm", "7–15mm", ">15mm"],
    )
    bucket_stats = (
        valid.groupby("precip_bucket", observed=True)["RATIO"]
        .agg(["mean", "median", "count", lambda x: (x > SATURATION_THRESHOLD).mean() * 100])
        .reset_index()
    )
    bucket_stats.columns = [
        "precip_bucket",
        "ratio_mean",
        "ratio_median",
        "count",
        "saturation_pct",
    ]

    # Scatter sample (max 500 points)
    sample = valid[["PRECIPITATION_MM", "RATIO", "ZONE"]].copy()
    sample["RATIO"] = sample["RATIO"].clip(upper=5)
    if len(sample) > 500:
        sample = sample.sample(500, random_state=42)

    # Linear regression for trendline
    slope, intercept, r_value, _, _ = stats.linregress(
        valid["PRECIPITATION_MM"], valid["RATIO"].clip(upper=5)
    )

    return {
        "scatter_sample": sample.to_dict(orient="records"),
        "bucket_stats": bucket_stats.to_dict(orient="records"),
        "correlation": {
            "pearson_r": round(float(corr), 4),
            "p_value": round(float(pvalue), 6),
            "r_squared": round(float(r_value ** 2), 4),
            "slope": round(float(slope), 4),
            "intercept": round(float(intercept), 4),
        },
        "key_findings": {
            "interpretation": (
                "La precipitación tiene correlación positiva con el ratio operacional. "
                f"Por cada mm/hr adicional de lluvia, el ratio sube ~{slope:.3f} puntos."
            ),
            "mechanism": (
                "La lluvia reduce la oferta de repartidores disponibles (menos conectados) "
                "mientras mantiene o incrementa la demanda de pedidos, degradando el ratio."
            ),
        },
    }


# ---------------------------------------------------------------------------
# P3: Zone vulnerability — which zones are most sensitive to precipitation?
# ---------------------------------------------------------------------------
def get_p3_zone_vulnerability() -> dict[str, Any]:
    df = load_raw_data()
    zone_info = load_zone_info()

    valid = df.dropna(subset=["RATIO"]).copy()
    valid["RATIO_CLIPPED"] = valid["RATIO"].clip(upper=5)

    results = []
    for zone in valid["ZONE"].unique():
        z = valid[valid["ZONE"] == zone]
        rain = z[z["PRECIPITATION_MM"] > 0]
        no_rain = z[z["PRECIPITATION_MM"] == 0]

        if len(rain) < 5 or len(no_rain) < 5:
            continue

        # Sensitivity: regression slope ratio ~ precipitation
        if rain["PRECIPITATION_MM"].std() > 0:
            slope, intercept, r_val, pval, _ = stats.linregress(
                rain["PRECIPITATION_MM"], rain["RATIO_CLIPPED"]
            )
        else:
            slope, r_val, pval = 0, 0, 1

        # Mean ratio delta: rain vs no-rain
        ratio_delta = rain["RATIO_CLIPPED"].mean() - no_rain["RATIO_CLIPPED"].mean()
        sat_rain = (rain["RATIO"] > SATURATION_THRESHOLD).mean() * 100
        sat_no_rain = (no_rain["RATIO"] > SATURATION_THRESHOLD).mean() * 100
        sat_delta = sat_rain - sat_no_rain

        results.append(
            {
                "zone": zone,
                "sensitivity_slope": round(float(slope), 4),
                "r_squared": round(float(r_val ** 2), 4),
                "p_value": round(float(pval), 4),
                "ratio_delta_rain": round(float(ratio_delta), 4),
                "sat_pct_rain": round(float(sat_rain), 2),
                "sat_pct_no_rain": round(float(sat_no_rain), 2),
                "sat_delta": round(float(sat_delta), 2),
                "baseline_ratio": round(float(no_rain["RATIO_CLIPPED"].mean()), 4),
                "rain_hours": int(len(rain)),
            }
        )

    results_df = pd.DataFrame(results)
    results_df["vulnerability_rank"] = results_df["sensitivity_slope"].rank(ascending=False)

    # Merge with descriptions
    desc = zone_info[["ZONE", "DESCRIPTION"]].rename(columns={"ZONE": "zone"})
    results_df = results_df.merge(desc, on="zone", how="left")

    # Radar chart data: normalize slopes 0-100
    max_slope = results_df["sensitivity_slope"].max()
    if max_slope > 0:
        results_df["sensitivity_normalized"] = (
            results_df["sensitivity_slope"] / max_slope * 100
        ).clip(0, 100)
    else:
        results_df["sensitivity_normalized"] = 0

    top_vulnerable = (
        results_df.sort_values("sensitivity_slope", ascending=False)
        .head(5)["zone"]
        .tolist()
    )

    return {
        "zone_vulnerability": results_df.sort_values(
            "sensitivity_slope", ascending=False
        ).to_dict(orient="records"),
        "radar_data": results_df[
            ["zone", "sensitivity_normalized", "sat_delta", "baseline_ratio"]
        ].to_dict(orient="records"),
        "key_findings": {
            "most_vulnerable": top_vulnerable,
            "explanation": (
                "Las zonas más vulnerables son aquellas con mayor pendiente (slope) "
                "en la regresión ratio~precipitación. Factores: accesibilidad reducida "
                "con lluvia, terreno elevado, zonas periféricas con menos repartidores."
            ),
        },
    }


# ---------------------------------------------------------------------------
# P4: Earnings calibration — are incentives well-calibrated across the month?
# ---------------------------------------------------------------------------
def get_p4_earnings_calibration() -> dict[str, Any]:
    df = load_raw_data()

    # Daily aggregates
    daily = (
        df.groupby(["DATE", "DAY"])
        .agg(
            avg_earnings=("EARNINGS", "mean"),
            avg_ratio=("RATIO", "mean"),
            total_orders=("ORDERS", "sum"),
            total_rt=("CONNECTED_RT", "mean"),
            oversupply_pct=("STATUS", lambda x: (x == "sobre_oferta").mean() * 100),
            saturation_pct=("STATUS", lambda x: (x == "saturacion").mean() * 100),
        )
        .reset_index()
    )

    # Inefficient days: high earnings + oversupply (paying repartidores who have no orders)
    earnings_p75 = daily["avg_earnings"].quantile(0.75)
    oversupply_threshold = 30  # >30% of hours in oversupply

    daily["is_inefficient"] = (daily["avg_earnings"] >= earnings_p75) & (
        daily["oversupply_pct"] >= oversupply_threshold
    )

    # Underpaid saturation: low earnings + high saturation
    earnings_p25 = daily["avg_earnings"].quantile(0.25)
    daily["is_underpaid_sat"] = (daily["avg_earnings"] <= earnings_p25) & (
        daily["saturation_pct"] >= 20
    )

    inefficient_days = daily[daily["is_inefficient"]]["DAY"].tolist()
    underpaid_days = daily[daily["is_underpaid_sat"]]["DAY"].tolist()

    daily_records = daily.copy()
    daily_records["DATE"] = daily_records["DATE"].dt.strftime("%Y-%m-%d")

    return {
        "daily_timeline": daily_records.to_dict(orient="records"),
        "inefficient_days": inefficient_days,
        "underpaid_saturation_days": underpaid_days,
        "thresholds": {
            "earnings_p75": round(float(earnings_p75), 2),
            "earnings_p25": round(float(earnings_p25), 2),
            "oversupply_threshold_pct": oversupply_threshold,
        },
        "key_findings": {
            "inefficient_count": len(inefficient_days),
            "underpaid_count": len(underpaid_days),
            "explanation": (
                f"Se detectaron {len(inefficient_days)} días con gasto ineficiente "
                f"(earnings >= p75 pero >30% de horas en sobre-oferta). "
                f"Y {len(underpaid_days)} días con saturación y earnings bajos "
                "(incentivos insuficientes para atraer repartidores)."
            ),
        },
    }


# ---------------------------------------------------------------------------
# P5: Earnings vs saturation — simple or complex relationship?
# ---------------------------------------------------------------------------
def get_p5_earnings_saturation() -> dict[str, Any]:
    df = load_raw_data()
    valid = df.dropna(subset=["RATIO"]).copy()

    # Earnings buckets
    valid["earnings_bucket"] = pd.qcut(
        valid["EARNINGS"], q=4, labels=["Q1 (bajo)", "Q2", "Q3", "Q4 (alto)"]
    )

    # Rain context
    valid["rain_context"] = valid["PRECIPITATION_MM"].apply(
        lambda x: "Con lluvia" if x > 1 else "Sin lluvia"
    )

    # Boxplot data: earnings bucket × ratio by rain context
    box_data = []
    for bucket in valid["earnings_bucket"].cat.categories:
        for ctx in ["Sin lluvia", "Con lluvia"]:
            subset = valid[
                (valid["earnings_bucket"] == bucket) & (valid["rain_context"] == ctx)
            ]["RATIO"].clip(upper=5)
            if len(subset) > 0:
                q = subset.quantile([0.25, 0.5, 0.75])
                box_data.append(
                    {
                        "earnings_bucket": bucket,
                        "rain_context": ctx,
                        "q1": round(float(q[0.25]), 3),
                        "median": round(float(q[0.5]), 3),
                        "q3": round(float(q[0.75]), 3),
                        "min": round(float(subset.quantile(0.05)), 3),
                        "max": round(float(subset.quantile(0.95)), 3),
                        "saturation_pct": round(
                            float((subset > SATURATION_THRESHOLD).mean() * 100), 2
                        ),
                        "count": int(len(subset)),
                    }
                )

    # Interaction effect: does earnings help more when it rains?
    rain = valid[valid["PRECIPITATION_MM"] > 1]
    no_rain = valid[valid["PRECIPITATION_MM"] <= 1]

    rain_corr = rain["EARNINGS"].corr(rain["RATIO"].clip(upper=5))
    no_rain_corr = no_rain["EARNINGS"].corr(no_rain["RATIO"].clip(upper=5))

    # Scatter sample: earnings vs ratio colored by rain
    sample = valid[["EARNINGS", "RATIO", "rain_context", "ZONE"]].copy()
    sample["RATIO"] = sample["RATIO"].clip(upper=5)
    if len(sample) > 600:
        sample = sample.sample(600, random_state=42)

    return {
        "box_data": box_data,
        "scatter_sample": sample.to_dict(orient="records"),
        "interaction": {
            "rain_earnings_corr": round(float(rain_corr), 4),
            "no_rain_earnings_corr": round(float(no_rain_corr), 4),
        },
        "key_findings": {
            "is_simple_relationship": False,
            "explanation": (
                "La relación earnings→saturación NO es simple. Con lluvia, subir earnings "
                "ayuda a atraer repartidores y bajar el ratio. Sin lluvia y con over-supply, "
                "subir earnings aumenta costos sin reducir la saturación. "
                "La efectividad de los incentivos depende del contexto climático y horario."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Summary endpoint: current operational snapshot from last available hour
# ---------------------------------------------------------------------------
def get_current_snapshot() -> dict[str, Any]:
    df = load_raw_data()
    latest = df.loc[df["DATETIME"] == df["DATETIME"].max()]

    zone_status = []
    for _, row in latest.iterrows():
        zone_status.append(
            {
                "zone": row["ZONE"],
                "connected_rt": int(row["CONNECTED_RT"]),
                "orders": int(row["ORDERS"]),
                "ratio": round(float(row["RATIO"]) if not pd.isna(row["RATIO"]) else 0, 3),
                "status": row["STATUS"],
                "earnings": round(float(row["EARNINGS"]), 1),
                "precipitation_mm": round(float(row["PRECIPITATION_MM"]), 2),
            }
        )

    status_counts = {
        "saturacion": sum(1 for z in zone_status if z["status"] == "saturacion"),
        "elevado": sum(1 for z in zone_status if z["status"] == "elevado"),
        "saludable": sum(1 for z in zone_status if z["status"] == "saludable"),
        "bajo": sum(1 for z in zone_status if z["status"] == "bajo"),
        "sobre_oferta": sum(1 for z in zone_status if z["status"] == "sobre_oferta"),
    }

    return {
        "snapshot_datetime": latest["DATETIME"].iloc[0].isoformat() if len(latest) > 0 else None,
        "zones": zone_status,
        "summary": status_counts,
        "total_zones": len(zone_status),
    }
