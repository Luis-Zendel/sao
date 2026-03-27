"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getZonesGeoJSON, type GeoJSONCollection, type ZoneStatus } from "@/lib/api";
import { Spinner } from "./Spinner";

// Dynamic import: Leaflet uses `window` and must not run during SSR
const ZoneMapLeaflet = dynamic(() => import("./ZoneMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)]"
      style={{ height: 420 }}>
      <div className="flex items-center justify-center h-full gap-2">
        <Spinner />
        <span className="text-sm text-[var(--txt-3)]">Cargando mapa…</span>
      </div>
    </div>
  ),
});

interface Props {
  // Passed from parent so we don't double-fetch; used to trigger refetch
  zones: ZoneStatus[];
}

export function ZoneMap({ zones }: Props) {
  const [geojson, setGeojson] = useState<GeoJSONCollection | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    getZonesGeoJSON()
      .then(setGeojson)
      .catch((e) => setError((e as Error).message));
  // Refetch when zones change (snapshot updates)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones.length]);

  if (error) {
    return (
      <div className="w-full rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20
        flex items-center justify-center text-xs text-red-500 p-8" style={{ height: 420 }}>
        Error cargando mapa: {error}
      </div>
    );
  }

  if (!geojson) {
    return (
      <div className="w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)]"
        style={{ height: 420 }}>
        <div className="flex items-center justify-center h-full gap-2">
          <Spinner />
          <span className="text-sm text-[var(--txt-3)]">Cargando datos del mapa…</span>
        </div>
      </div>
    );
  }

  return <ZoneMapLeaflet geojson={geojson} />;
}
