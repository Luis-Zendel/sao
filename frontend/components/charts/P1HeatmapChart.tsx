"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface HeatmapCell {
  zone: string;
  hour: number;
  ratio_mean: number;
  saturation_pct: number;
  oversupply_pct: number;
}

interface HourlySummary {
  hour: number;
  ratio_mean: number;
  saturation_pct: number;
  oversupply_pct: number;
}

interface ZoneSummary {
  zone: string;
  ratio_mean: number;
  saturation_pct: number;
  saturation_hours: number;
  oversupply_pct: number;
  oversupply_hours: number;
}

interface KeyFindings {
  peak_saturation_hour: number;
  most_saturated_zone: string;
  overall_saturation_pct: number;
  saturation_threshold: number;
  peak_oversupply_hour: number;
  most_oversupply_zone: string;
  overall_oversupply_pct: number;
  oversupply_threshold: number;
}

interface P1Data {
  heatmap: HeatmapCell[];
  hourly_summary: HourlySummary[];
  zone_summary: ZoneSummary[];
  top_critical_slots: HeatmapCell[];
  key_findings: KeyFindings;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function ratioColor(r: number | null | undefined): string {
  if (r == null || isNaN(r)) return "#94a3b8";
  if (r >= 1.8) return "#ef4444";
  if (r >= 1.2) return "#f97316";
  if (r >= 0.9) return "#22c55e";
  if (r >= 0.5) return "#3b82f6";
  return "#eab308";
}

function ratioBg(r: number | null | undefined): string {
  if (r == null || isNaN(r)) return "bg-slate-200/60 dark:bg-slate-700/30";
  if (r >= 1.8) return "bg-red-500/20 dark:bg-red-500/25";
  if (r >= 1.2) return "bg-orange-400/20 dark:bg-orange-400/20";
  if (r >= 0.9) return "bg-green-500/20 dark:bg-green-500/20";
  if (r >= 0.5) return "bg-blue-400/15 dark:bg-blue-400/15";
  return "bg-yellow-400/20 dark:bg-yellow-400/20";
}

function ratioText(r: number | null | undefined): string {
  if (r == null || isNaN(r)) return "text-slate-400";
  if (r >= 1.8) return "text-red-700 dark:text-red-400 font-bold";
  if (r >= 1.2) return "text-orange-700 dark:text-orange-400 font-semibold";
  if (r >= 0.9) return "text-green-700 dark:text-green-400";
  if (r >= 0.5) return "text-blue-700 dark:text-blue-400";
  return "text-yellow-700 dark:text-yellow-400 font-semibold";
}

const AXIS_STYLE  = { fill: "#94a3b8", fontSize: 10 };
const GRID_COLOR  = "#e2e8f0";
const TT_STYLE    = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 };

/* ─── Pivot Table ─────────────────────────────────────────────────────────── */
function PivotTable({ heatmap }: { heatmap: HeatmapCell[] }) {
  const zones = Array.from(new Set(heatmap.map((c) => c.zone))).sort();

  // Build lookup: zone → hour → cell
  const lookup = new Map<string, Map<number, HeatmapCell>>();
  heatmap.forEach((c) => {
    if (!lookup.has(c.zone)) lookup.set(c.zone, new Map());
    lookup.get(c.zone)!.set(c.hour, c);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="text-[10px] border-collapse min-w-max">
        <thead>
          <tr className="bg-[var(--surface-2)]">
            <th className="sticky left-0 z-10 bg-[var(--surface-2)] px-3 py-2 text-left text-xs font-semibold text-[var(--txt-3)] border-b border-r border-[var(--border)] min-w-[130px]">
              Zona
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                className="px-1.5 py-2 text-center font-medium text-[var(--txt-3)] border-b border-[var(--border)] min-w-[38px]"
              >
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zones.map((zone, zi) => (
            <tr key={zone} className={zi % 2 === 0 ? "" : "bg-[var(--surface-2)]/40"}>
              <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--txt-2)] border-r border-[var(--border)] whitespace-nowrap">
                {zone}
              </td>
              {HOURS.map((h) => {
                const cell = lookup.get(zone)?.get(h);
                const r = cell?.ratio_mean;
                return (
                  <td
                    key={h}
                    title={
                      cell
                        ? `${zone} · ${h}:00h\nRatio: ${r?.toFixed(2)}\nSat: ${cell.saturation_pct.toFixed(1)}%\nSobre-oferta: ${cell.oversupply_pct.toFixed(1)}%`
                        : "Sin datos"
                    }
                    className={`px-1 py-1.5 text-center tabular-nums transition-colors ${ratioBg(r)} ${ratioText(r)}`}
                  >
                    {r != null ? r.toFixed(2) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Section: Saturation Charts ──────────────────────────────────────────── */
function SaturationCharts({
  hourly,
  byZone,
}: {
  hourly: HourlySummary[];
  byZone: ZoneSummary[];
}) {
  const sortedZones = [...byZone].sort((a, b) => b.saturation_pct - a.saturation_pct);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
        <p className="text-xs font-semibold text-[var(--txt-3)] uppercase tracking-wide">
          Saturación crítica — ratio &gt; 1.8
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By hour */}
        <div>
          <p className="text-[11px] text-[var(--txt-3)] mb-2">% horas en saturación por hora del día</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ top: 2, right: 8, left: -14, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="hour" tick={AXIS_STYLE} tickFormatter={(v) => `${v}h`} interval={2} />
              <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TT_STYLE}
                labelStyle={{ color: "#64748b", fontSize: 11 }}
                formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "Saturación"]}
                labelFormatter={(v) => `${v}:00h`}
              />
              <Bar dataKey="saturation_pct" radius={[3, 3, 0, 0]}>
                {hourly.map((e, i) => (
                  <Cell key={i} fill={e.saturation_pct >= 20 ? "#ef4444" : e.saturation_pct >= 10 ? "#f97316" : "#fca5a5"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By zone */}
        <div>
          <p className="text-[11px] text-[var(--txt-3)] mb-2">% registros en saturación por zona</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sortedZones} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="zone" tick={{ ...AXIS_STYLE, fontSize: 9 }} width={115} />
              <Tooltip
                contentStyle={TT_STYLE}
                formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "Saturación"]}
              />
              <Bar dataKey="saturation_pct" radius={[0, 3, 3, 0]}>
                {sortedZones.map((e, i) => (
                  <Cell key={i} fill={ratioColor(e.ratio_mean)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ─── Section: Oversupply Charts ──────────────────────────────────────────── */
function OversupplyCharts({
  hourly,
  byZone,
}: {
  hourly: HourlySummary[];
  byZone: ZoneSummary[];
}) {
  const sortedZones = [...byZone].sort((a, b) => b.oversupply_pct - a.oversupply_pct);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
        <p className="text-xs font-semibold text-[var(--txt-3)] uppercase tracking-wide">
          Sobre-oferta — ratio &lt; 0.5
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By hour */}
        <div>
          <p className="text-[11px] text-[var(--txt-3)] mb-2">% horas en sobre-oferta por hora del día</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ top: 2, right: 8, left: -14, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="hour" tick={AXIS_STYLE} tickFormatter={(v) => `${v}h`} interval={2} />
              <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TT_STYLE}
                labelStyle={{ color: "#64748b", fontSize: 11 }}
                formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "Sobre-oferta"]}
                labelFormatter={(v) => `${v}:00h`}
              />
              <Bar dataKey="oversupply_pct" radius={[3, 3, 0, 0]}>
                {hourly.map((e, i) => (
                  <Cell key={i} fill={e.oversupply_pct >= 40 ? "#ca8a04" : e.oversupply_pct >= 20 ? "#eab308" : "#fde68a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By zone */}
        <div>
          <p className="text-[11px] text-[var(--txt-3)] mb-2">% registros en sobre-oferta por zona</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sortedZones} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="zone" tick={{ ...AXIS_STYLE, fontSize: 9 }} width={115} />
              <Tooltip
                contentStyle={TT_STYLE}
                formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "Sobre-oferta"]}
              />
              <Bar dataKey="oversupply_pct" radius={[0, 3, 3, 0]}>
                {sortedZones.map((_, i) => (
                  <Cell key={i} fill={i < 3 ? "#ca8a04" : i < 7 ? "#eab308" : "#fde68a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ─── Legend ──────────────────────────────────────────────────────────────── */
function RatioLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[10px]">
      {[
        { color: "#ef4444", label: "Saturación ≥ 1.8" },
        { color: "#f97316", label: "Elevado 1.2–1.8" },
        { color: "#22c55e", label: "Saludable 0.9–1.2" },
        { color: "#3b82f6", label: "Bajo 0.5–0.9" },
        { color: "#eab308", label: "Sobre-oferta < 0.5" },
        { color: "#94a3b8", label: "Sin datos" },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
          <span className="text-[var(--txt-3)]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */
export function P1HeatmapChart({ data }: { data: unknown }) {
  const d = data as P1Data;
  if (!d) return null;

  const heatmap = d.heatmap ?? [];
  const hourly  = d.hourly_summary ?? [];
  const byZone  = d.zone_summary ?? [];
  const kf      = d.key_findings;

  return (
    <div className="space-y-6">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Hora pico saturación",    val: `${kf.peak_saturation_hour}:00h`,           color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20" },
          { label: "Zona más saturada",        val: kf.most_saturated_zone,                     color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20" },
          { label: "% en saturación",          val: `${kf.overall_saturation_pct.toFixed(1)}%`, color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20" },
          { label: "Hora pico sobre-oferta",   val: `${kf.peak_oversupply_hour}:00h`,           color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
          { label: "Zona más sobre-oferta",    val: kf.most_oversupply_zone,                    color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
          { label: "% en sobre-oferta",        val: `${kf.overall_oversupply_pct.toFixed(1)}%`, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.bg} ${item.border}`}>
            <p className="text-[10px] text-[var(--txt-3)] leading-tight">{item.label}</p>
            <p className={`text-base font-bold mt-1 truncate ${item.color}`}>{item.val}</p>
          </div>
        ))}
      </div>

      {/* ── Pivot Table ── */}
      <div className="space-y-2">
        <div>
          <p className="text-xs font-semibold text-[var(--txt)] mb-0.5">
            Ratio promedio por zona y hora
          </p>
          <p className="text-[11px] text-[var(--txt-3)]">
            Cada celda muestra el ratio medio histórico (Órdenes / Repartidores) en esa zona y hora del día. Hover para detalle.
          </p>
        </div>
        <RatioLegend />
        <PivotTable heatmap={heatmap} />
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-[var(--border)]" />

      {/* ── Saturation Charts ── */}
      <SaturationCharts hourly={hourly} byZone={byZone} />

      {/* ── Divider ── */}
      <div className="border-t border-[var(--border)]" />

      {/* ── Oversupply Charts ── */}
      <OversupplyCharts hourly={hourly} byZone={byZone} />

      {/* ── Insight note ── */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="text-red-600 dark:text-red-400 font-semibold mb-0.5">Saturación crítica</p>
          <p className="text-[var(--txt-2)]">
            La saturación se concentra en las <strong className="text-[var(--txt)]">{kf.peak_saturation_hour}:00h</strong> y
            en la zona <strong className="text-[var(--txt)]">{kf.most_saturated_zone}</strong>.{" "}
            {kf.overall_saturation_pct.toFixed(1)}% de los registros históricos superaron ratio {kf.saturation_threshold}.
          </p>
        </div>
        <div>
          <p className="text-yellow-600 dark:text-yellow-400 font-semibold mb-0.5">Sobre-oferta</p>
          <p className="text-[var(--txt-2)]">
            La sobre-oferta pico ocurre a las <strong className="text-[var(--txt)]">{kf.peak_oversupply_hour}:00h</strong> y
            en la zona <strong className="text-[var(--txt)]">{kf.most_oversupply_zone}</strong>.{" "}
            {kf.overall_oversupply_pct.toFixed(1)}% de los registros tuvieron ratio &lt; {kf.oversupply_threshold}.
          </p>
        </div>
      </div>
    </div>
  );
}
