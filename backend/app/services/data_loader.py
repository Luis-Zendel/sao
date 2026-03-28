"""
Simulated database layer: loads CSV files and provides cached access.
Handles the European decimal comma format used in EARNINGS and PRECIPITATION_MM.
"""

import os
import logging
from functools import lru_cache
from typing import Optional

import pandas as pd
import numpy as np
from shapely.geometry import Point
from shapely import wkt

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def _parse_comma_decimal(value: str) -> float:
    """Convert European decimal comma strings like '54,4' to float 54.4."""
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value).replace(",", "."))


@lru_cache(maxsize=1)
def load_raw_data() -> pd.DataFrame:
    """Load and preprocess the main operational dataset."""
    path = os.path.join(DATA_DIR, "RAW_DATA.csv")
    logger.info(f"Loading RAW_DATA from {path}")

    df = pd.read_csv(path, dtype={"EARNINGS": str, "PRECIPITATION_MM": str})

    # Normalize decimal comma separators
    df["EARNINGS"] = df["EARNINGS"].apply(_parse_comma_decimal)
    df["PRECIPITATION_MM"] = df["PRECIPITATION_MM"].apply(_parse_comma_decimal)

    # Parse date and create datetime column
    df["DATE"] = pd.to_datetime(df["DATE"])
    df["DATETIME"] = df["DATE"] + pd.to_timedelta(df["HOUR"], unit="h")
    df["DAY"] = df["DATE"].dt.day
    df["DOW"] = df["DATE"].dt.dayofweek  # 0=Monday

    # Core operational metric
    df["RATIO"] = df.apply(
        lambda r: r["ORDERS"] / r["CONNECTED_RT"] if r["CONNECTED_RT"] > 0 else np.nan,
        axis=1,
    )

    # Operational status classification
    df["STATUS"] = df["RATIO"].apply(_classify_ratio)

    logger.info(f"Loaded {len(df)} rows, {df['ZONE'].nunique()} zones, {df['DATE'].nunique()} days")
    return df


def _classify_ratio(ratio: float) -> str:
    if pd.isna(ratio):
        return "sin_datos"
    if ratio < 0.5:
        return "sobre_oferta"
    if ratio <= 0.9:
        return "bajo"
    if ratio <= 1.2:
        return "saludable"
    if ratio <= 1.8:
        return "elevado"
    return "saturacion"


@lru_cache(maxsize=1)
def load_zone_info() -> pd.DataFrame:
    """Load zone centroids, normalizing decimal commas."""
    path = os.path.join(DATA_DIR, "ZONE_INFO.csv")
    df = pd.read_csv(path, dtype={"LATITUDE_CENTER": str, "LONGITUDE_CENTER": str})
    df["LATITUDE_CENTER"] = df["LATITUDE_CENTER"].apply(_parse_comma_decimal)
    df["LONGITUDE_CENTER"] = df["LONGITUDE_CENTER"].apply(_parse_comma_decimal)
    return df


def _repair_truncated_wkt(wkt_str: str, zone_name: str) -> str:
    """
    Fix WKT polygons truncated at Excel's 32,767-char cell limit.
    Strategy: remove the trailing incomplete coordinate, then close the
    ring by repeating the first coordinate (required by WKT spec).
    """
    import re as _re
    if len(wkt_str) < 32767:
        return wkt_str  # not truncated

    logger.warning(
        f"Zone '{zone_name}': WKT truncated at {len(wkt_str)} chars (Excel 32,767 limit). "
        "Attempting auto-repair by closing the polygon ring."
    )

    # Extract first coordinate pair from the polygon opening
    first_match = _re.search(r"POLYGON \(\((-?\d+\.\d+ -?\d+\.\d+)", wkt_str)
    first_coord = first_match.group(1) if first_match else None

    # Drop the last incomplete coordinate token (a partial number at the end)
    fixed = _re.sub(r",\s*-?\d+\.?\d*\s*$", "", wkt_str.rstrip()).rstrip(", ")

    # Close the linear ring with the first point, then close all parens
    suffix = f", {first_coord}))" if first_coord else "))"
    return fixed + suffix


@lru_cache(maxsize=1)
def load_zone_polygons() -> dict:
    """Load zone polygons as Shapely geometries. Returns {zone_name: geometry}."""
    from shapely.validation import make_valid

    path = os.path.join(DATA_DIR, "ZONE_POLYGONS.csv")
    df = pd.read_csv(path)
    polygons = {}
    for _, row in df.iterrows():
        zone_name = row.get("ZONE_NAME", "unknown")
        raw_wkt   = row["GEOMETRY_WKT"]
        try:
            repaired = _repair_truncated_wkt(raw_wkt, zone_name)
            geom = wkt.loads(repaired)
            if not geom.is_valid:
                geom = make_valid(geom)
            polygons[zone_name] = geom
        except Exception as e:
            logger.warning(f"Failed to parse polygon for zone {zone_name}: {e}")
    logger.info(f"Loaded {len(polygons)} zone polygons")
    return polygons


def get_zone_for_coordinate(lat: float, lon: float) -> Optional[str]:
    """Return the zone name for a given lat/lon coordinate using point-in-polygon."""
    point = Point(lon, lat)  # Shapely uses (longitude, latitude)
    polygons = load_zone_polygons()
    for zone_name, geom in polygons.items():
        if geom.contains(point):
            return zone_name

    # Fallback: nearest centroid
    zone_info = load_zone_info()
    zone_info = zone_info.copy()
    zone_info["dist"] = (
        (zone_info["LATITUDE_CENTER"] - lat) ** 2
        + (zone_info["LONGITUDE_CENTER"] - lon) ** 2
    ) ** 0.5
    nearest = zone_info.loc[zone_info["dist"].idxmin()]
    logger.debug(f"Point ({lat},{lon}) not in any polygon, nearest zone: {nearest['ZONE']}")
    return nearest["ZONE"]


def get_zones() -> list[str]:
    """Return list of all zone names."""
    return load_zone_info()["ZONE"].tolist()


def get_zone_centroids() -> list[dict]:
    """Return list of zone centroid dicts."""
    df = load_zone_info()
    return df.to_dict(orient="records")
