"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ReferenceLine, Legend,
} from "recharts";

const AXIS = { fill: "#94a3b8", fontSize: 10 };
const GRID = "#e2e8f0";
const TT   = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 };

interface BoxDatum {
  earnings_bucket: string; rain_context: string;
  saturation_pct: number;
}
interface P5Data {
  box_data: BoxDatum[];
  scatter_sample: Array<{ EARNINGS: number; RATIO: number; rain_context: string }>;
  interaction: { rain_earnings_corr: number; no_rain_earnings_corr: number };
  key_findings: { explanation: string };
}

export function P5SaturationChart({ data }: { data: unknown }) {
  const d = data as P5Data;
  if (!d) return null;
  const { interaction: ia } = d;

  const buckets = [...new Set((d.box_data ?? []).map((b) => b.earnings_bucket))];
  const grouped = buckets.map((bucket) => {
    const rain   = d.box_data.find((b) => b.earnings_bucket === bucket && b.rain_context === "Con lluvia");
    const noRain = d.box_data.find((b) => b.earnings_bucket === bucket && b.rain_context === "Sin lluvia");
    return { bucket, sat_rain: rain?.saturation_pct ?? 0, sat_no_rain: noRain?.saturation_pct ?? 0 };
  });

  const withRain    = (d.scatter_sample ?? []).filter((s) => s.rain_context === "Con lluvia");
  const withoutRain = (d.scatter_sample ?? []).filter((s) => s.rain_context === "Sin lluvia");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Correlación earnings→ratio con lluvia",    val: ia.rain_earnings_corr.toFixed(4),    sub: "Negativo = subir earnings reduce el ratio ✓", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20" },
          { label: "Correlación earnings→ratio sin lluvia",    val: ia.no_rain_earnings_corr.toFixed(4), sub: "Diferente contexto = diferente efecto", color: "text-[var(--txt-2)]", bg: "bg-[var(--surface-2)]", border: "border-[var(--border)]" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.bg} ${item.border}`}>
            <p className="text-xs text-[var(--txt-3)]">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.val}</p>
            <p className="text-[10px] text-[var(--txt-3)]">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            % Saturación por tramo de earnings × contexto climático
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={grouped} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="bucket" tick={{ ...AXIS, fontSize: 9 }} angle={-15} textAnchor="end" />
              <YAxis tick={AXIS} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={TT}
                formatter={(v: unknown, name: unknown) => [`${(v as number)?.toFixed(1)}%`, String(name)]} />
              <Bar dataKey="sat_no_rain" name="Sin lluvia" fill="#3b82f6" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              <Bar dataKey="sat_rain"    name="Con lluvia" fill="#ef4444" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            Earnings vs Ratio — con vs sin lluvia
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="EARNINGS" name="Earnings" tick={AXIS}
                label={{ value: "MXN", position: "insideBottom", fill: "#94a3b8", fontSize: 10, offset: -5 }} />
              <YAxis dataKey="RATIO" name="Ratio" tick={AXIS} domain={[0, 4]} />
              <Tooltip contentStyle={TT} cursor={{ stroke: GRID }}
                formatter={(v: unknown) => [(v as number)?.toFixed(2)]} />
              <ReferenceLine y={1.8} stroke="#ef4444" strokeDasharray="4 2" />
              <Scatter data={withoutRain} fill="#3b82f6" fillOpacity={0.3} r={2} name="Sin lluvia" />
              <Scatter data={withRain}    fill="#ef4444" fillOpacity={0.5} r={3} name="Con lluvia" />
              <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-purple-200 dark:border-purple-500/15 bg-purple-50 dark:bg-purple-500/5 p-3">
        <p className="text-xs text-[var(--txt-2)]">
          <span className="text-purple-600 dark:text-purple-400 font-semibold">Hallazgo P5: </span>
          {d.key_findings.explanation}
        </p>
      </div>
    </div>
  );
}
