"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { GeoJSONCollection, ZoneGeoJSONProperties } from "@/lib/api";

// Status → color mappings for polygons and markers
const STATUS_FILL: Record<string, { fill: string; stroke: string; label: string }> = {
  saturacion:  { fill: "#ef4444", stroke: "#dc2626", label: "Saturación"  },
  elevado:     { fill: "#f97316", stroke: "#ea580c", label: "Elevado"     },
  saludable:   { fill: "#22c55e", stroke: "#16a34a", label: "Saludable"   },
  bajo:        { fill: "#3b82f6", stroke: "#2563eb", label: "Bajo"        },
  sobre_oferta:{ fill: "#eab308", stroke: "#ca8a04", label: "Sobre-oferta"},
  sin_datos:   { fill: "#94a3b8", stroke: "#64748b", label: "Sin datos"   },
};

// CartoDB tile layers — free, no API key, great look
const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark:  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

interface Props {
  geojson: GeoJSONCollection;
}

export default function ZoneMapLeaflet({ geojson }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);   // holds the L.Map instance
  const tileRef    = useRef<unknown>(null);   // holds the current tile layer
  const { resolvedTheme } = useTheme();

  // ── First mount: initialise map ──────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      // Fix default icon path broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Create map centered on Monterrey
      const map = L.map(mapRef.current!, {
        center: [25.67, -100.31],
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });

      leafletRef.current = map;

      // Tile layer
      const isDark = resolvedTheme === "dark";
      const tile = L.tileLayer(isDark ? TILES.dark : TILES.light, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        subdomains: "abcd",
      });
      tile.addTo(map);
      tileRef.current = tile;

      // Add GeoJSON features
      addFeatures(L, map, geojson);
    })();

    // Cleanup on unmount
    return () => {
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tiles when theme changes ────────────────────────────────────────
  useEffect(() => {
    if (!leafletRef.current || !tileRef.current) return;
    (async () => {
      const L   = (await import("leaflet")).default;
      const map = leafletRef.current as { removeLayer: (l: unknown) => void; addLayer: (l: unknown) => void };
      map.removeLayer(tileRef.current as object);
      const isDark = resolvedTheme === "dark";
      const tile = L.tileLayer(isDark ? TILES.dark : TILES.light, {
        attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd",
      });
      // Insert below other layers
      (tile as { addTo: (m: unknown) => void; bringToBack: () => void }).addTo(leafletRef.current);
      (tile as { bringToBack: () => void }).bringToBack();
      tileRef.current = tile;
    })();
  }, [resolvedTheme]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-[var(--border)] shadow-sm">
      <div ref={mapRef} style={{ height: 420 }} />

      {/* Legend overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-[var(--border)]
        bg-[var(--surface)]/90 backdrop-blur-sm px-3 py-2.5 shadow-md">
        <p className="text-[9px] font-semibold text-[var(--txt-3)] uppercase tracking-wide mb-2">
          Estado operacional
        </p>
        <div className="space-y-1">
          {Object.entries(STATUS_FILL).filter(([k]) => k !== "sin_datos").map(([, v]) => (
            <div key={v.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: v.fill }} />
              <span className="text-[10px] text-[var(--txt-2)]">{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ratio reference overlay */}
      <div className="absolute top-3 right-3 z-[1000] rounded-xl border border-[var(--border)]
        bg-[var(--surface)]/90 backdrop-blur-sm px-2.5 py-2 text-[9px] text-[var(--txt-3)] shadow-md space-y-0.5">
        <p><span className="text-yellow-500 font-semibold">&lt;0.5</span> Sobre-oferta</p>
        <p><span className="text-green-500 font-semibold">0.9–1.2</span> Saludable</p>
        <p><span className="text-red-500 font-semibold">&gt;1.8</span> Saturación</p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addFeatures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: GeoJSONCollection
) {
  geojson.features.forEach((feature) => {
    const props = feature.properties as ZoneGeoJSONProperties;
    const cfg   = STATUS_FILL[props.status] ?? STATUS_FILL.sin_datos;
    const popup = buildPopup(props, cfg);

    // Render polygon if geometry is available
    if (feature.geometry) {
      L.geoJSON(feature, {
        style: {
          color:       cfg.stroke,
          weight:      1.5,
          fillColor:   cfg.fill,
          fillOpacity: 0.35,
          opacity:     0.8,
        },
      })
        .bindPopup(popup)
        .addTo(map);
    }

    // Always add a circle marker at centroid
    const circle = L.circleMarker([props.centroid_lat, props.centroid_lon], {
      radius:      props.status === "saturacion" ? 10 : 7,
      color:       cfg.stroke,
      weight:      2,
      fillColor:   cfg.fill,
      fillOpacity: props.status === "saturacion" ? 0.95 : 0.8,
    }).bindPopup(popup);

    // Pulse animation class for saturated zones
    circle.addTo(map);

    // Tooltip (always visible zone name)
    L.tooltip({
      permanent:  false,
      direction:  "top",
      className:  "leaflet-zone-tooltip",
    })
      .setContent(`<span style="font-size:11px;font-weight:600">${props.zone}</span>`)
      .setLatLng([props.centroid_lat, props.centroid_lon]);
  });
}

function buildPopup(props: ZoneGeoJSONProperties, cfg: { fill: string; label: string }): string {
  const ratio   = props.ratio?.toFixed(2) ?? "—";
  const precip  = props.precipitation_mm?.toFixed(1) ?? "0.0";
  return `
    <div style="font-family:-apple-system,sans-serif;min-width:180px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${cfg.fill};flex-shrink:0"></div>
        <strong style="font-size:13px">${props.zone}</strong>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;color:#475569">
        <span>Estado:</span>    <span style="font-weight:600;color:${cfg.fill}">${cfg.label}</span>
        <span>Ratio:</span>     <span style="font-weight:600">${ratio}</span>
        <span>Órdenes:</span>   <span>${props.orders}</span>
        <span>Repartidores:</span><span>${props.connected_rt}</span>
        <span>Earnings:</span>  <span>$${props.earnings?.toFixed(0)} MXN</span>
        <span>Lluvia:</span>    <span>${precip} mm/hr</span>
      </div>
    </div>
  `;
}
