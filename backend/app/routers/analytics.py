from fastapi import APIRouter, HTTPException
from ..services import analytics as svc
from ..services.data_loader import load_zone_polygons, load_zone_info

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/p1-saturation-heatmap")
def p1_saturation_heatmap():
    try:
        return svc.get_p1_saturation_heatmap()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/p2-precipitation-correlation")
def p2_precipitation_correlation():
    try:
        return svc.get_p2_precipitation_correlation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/p3-zone-vulnerability")
def p3_zone_vulnerability():
    try:
        return svc.get_p3_zone_vulnerability()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/p4-earnings-calibration")
def p4_earnings_calibration():
    try:
        return svc.get_p4_earnings_calibration()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/p5-earnings-saturation")
def p5_earnings_saturation():
    try:
        return svc.get_p5_earnings_saturation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshot")
def current_snapshot():
    try:
        return svc.get_current_snapshot()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones-geojson")
def zones_geojson():
    """
    Returns a GeoJSON FeatureCollection of all 14 zones.
    Each feature includes the polygon geometry + operational properties
    from the last snapshot hour so the frontend can color them by status.
    """
    try:
        import json
        from shapely.geometry import mapping

        polygons   = load_zone_polygons()   # {zone_name: shapely_geom}
        zone_info  = load_zone_info()       # centroid lat/lon
        snapshot   = svc.get_current_snapshot()
        zone_stats = {z["zone"]: z for z in snapshot["zones"]}

        features = []
        for zone_name, geom in polygons.items():
            stats = zone_stats.get(zone_name, {})
            info_row = zone_info[zone_info["ZONE"] == zone_name]
            centroid_lat = float(info_row["LATITUDE_CENTER"].iloc[0])  if len(info_row) else geom.centroid.y
            centroid_lon = float(info_row["LONGITUDE_CENTER"].iloc[0]) if len(info_row) else geom.centroid.x

            features.append({
                "type": "Feature",
                "geometry": json.loads(json.dumps(mapping(geom))),
                "properties": {
                    "zone":           zone_name,
                    "status":         stats.get("status", "sin_datos"),
                    "ratio":          stats.get("ratio", 0),
                    "orders":         stats.get("orders", 0),
                    "connected_rt":   stats.get("connected_rt", 0),
                    "earnings":       stats.get("earnings", 0),
                    "precipitation_mm": stats.get("precipitation_mm", 0),
                    "centroid_lat":   centroid_lat,
                    "centroid_lon":   centroid_lon,
                },
            })

        # Zones whose polygon failed to parse: add centroid-only features
        for _, row in zone_info.iterrows():
            name = row["ZONE"]
            if name not in polygons:
                stats = zone_stats.get(name, {})
                features.append({
                    "type": "Feature",
                    "geometry": None,
                    "properties": {
                        "zone": name,
                        "status": stats.get("status", "sin_datos"),
                        "ratio": stats.get("ratio", 0),
                        "orders": stats.get("orders", 0),
                        "connected_rt": stats.get("connected_rt", 0),
                        "earnings": stats.get("earnings", 0),
                        "precipitation_mm": stats.get("precipitation_mm", 0),
                        "centroid_lat": float(row["LATITUDE_CENTER"]),
                        "centroid_lon": float(row["LONGITUDE_CENTER"]),
                    },
                })

        return {"type": "FeatureCollection", "features": features}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
