"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine,
} from "recharts";

interface P1Data {
  hourly_summary: Array<{ hour: number; ratio_mean: number; saturation_pct: number }>;
  zone_summary:   Array<{ zone: string; ratio_mean: number; saturation_pct: number }>;
  key_findings:   { peak_saturation_hour: number; most_saturated_zone: string; overall_saturation_pct: number };
}

function ratioColor(r: number) {
  if (r >= 1.8) return "#ef4444";
  if (r >= 1.2) return "#f97316";
  if (r >= 0.9) return "#22c55e";
  if (r >= 0.5) return "#3b82f6";
  return "#eab308";
}

const AXIS = { fill: "#94a3b8", fontSize: 10 };
const GRID = "#e2e8f0";
const TT   = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 };

export function P1HeatmapChart({ data }: { data: unknown }) {
  const d = data as P1Data;
  if (!d) return null;
  const hourly = d.hourly_summary ?? [];
  const byZone = [...(d.zone_summary ?? [])].sort((a, b) => b.saturation_pct - a.saturation_pct).slice(0, 14);
  const kf = d.key_findings;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Hora pico",           val: `${kf.peak_saturation_hour}:00h`,              color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20" },
          { label: "Zona más saturada",   val: kf.most_saturated_zone,                        color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20" },
          { label: "% horas en saturación",val: `${kf.overall_saturation_pct.toFixed(1)}%`,   color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.bg} ${item.border}`}>
            <p className="text-xs text-[var(--txt-3)]">{item.label}</p>
            <p className={`text-xl font-bold mt-1 truncate ${item.color}`}>{item.val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            Ratio promedio por hora del día
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hourly} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="hour" tick={AXIS} tickFormatter={(v) => `${v}h`} />
              <YAxis tick={AXIS} domain={[0, 2.5]} />
              <Tooltip contentStyle={TT} labelStyle={{ color: "#64748b", fontSize: 11 }}
                formatter={(v: unknown) => [(v as number)?.toFixed(3), "Ratio"]}
                labelFormatter={(v) => `${v}:00h`} />
              <ReferenceLine y={1.8} stroke="#ef4444" strokeDasharray="4 2"
                label={{ value: "Saturación 1.8", fill: "#ef4444", fontSize: 9, position: "right" }} />
              <ReferenceLine y={0.9} stroke="#22c55e" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="ratio_mean" stroke="#FF441F" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            % Horas en saturación por zona
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byZone} layout="vertical" margin={{ top: 0, right: 10, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="zone" tick={{ ...AXIS, fontSize: 9 }} width={110} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "% saturación"]} />
              <Bar dataKey="saturation_pct" radius={[0, 4, 4, 0]}>
                {byZone.map((e, i) => <Cell key={i} fill={ratioColor(e.ratio_mean)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-red-200 dark:border-red-500/15 bg-red-50 dark:bg-red-500/5 p-3">
        <p className="text-xs text-[var(--txt-2)]">
          <span className="text-red-600 dark:text-red-400 font-semibold">Hallazgo P1: </span>
          La saturación se concentra en las {kf.peak_saturation_hour}:00h (pico) y en la zona{" "}
          <strong className="text-[var(--txt)]">{kf.most_saturated_zone}</strong>.{" "}
          El {kf.overall_saturation_pct.toFixed(1)}% de todas las horas-zona tuvieron ratio &gt; 1.8.
        </p>
      </div>
    </div>
  );
}
