"use client";

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar, Cell,
} from "recharts";

const AXIS = { fill: "#94a3b8", fontSize: 10 };
const GRID = "#e2e8f0";
const TT   = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 };

interface P2Data {
  scatter_sample: Array<{ PRECIPITATION_MM: number; RATIO: number; ZONE: string }>;
  bucket_stats:   Array<{ precip_bucket: string; ratio_mean: number; saturation_pct: number; count: number }>;
  correlation:    { pearson_r: number; r_squared: number; slope: number; intercept: number; p_value: number };
  key_findings:   { interpretation: string; mechanism: string };
}

export function P2CorrelationChart({ data }: { data: unknown }) {
  const d = data as P2Data;
  if (!d) return null;
  const { correlation: c, bucket_stats: buckets } = d;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pearson r",     val: c.pearson_r.toFixed(3),  color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-500/10",    border: "border-blue-200 dark:border-blue-500/20" },
          { label: "R²",            val: c.r_squared.toFixed(3),  color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-500/10",    border: "border-blue-200 dark:border-blue-500/20" },
          { label: "Slope",         val: `+${c.slope.toFixed(3)}`,color: "text-orange-600 dark:text-orange-400",bg: "bg-orange-50 dark:bg-orange-500/10",border: "border-orange-200 dark:border-orange-500/20" },
          { label: "p-value",       val: c.p_value < 0.001 ? "<0.001" : c.p_value.toFixed(4), color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-200 dark:border-green-500/20" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.bg} ${item.border}`}>
            <p className="text-xs text-[var(--txt-3)]">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            Scatter: Precipitación vs Ratio
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="PRECIPITATION_MM" name="Precipitación" tick={AXIS}
                label={{ value: "mm/hr", position: "insideBottom", fill: "#94a3b8", fontSize: 10, offset: -5 }} />
              <YAxis dataKey="RATIO" name="Ratio" tick={AXIS} domain={[0, 4]} />
              <Tooltip contentStyle={TT} cursor={{ stroke: "#e2e8f0" }}
                formatter={(v: unknown) => [(v as number)?.toFixed(3)]} />
              <ReferenceLine y={1.8} stroke="#ef4444" strokeDasharray="4 2" />
              <Scatter data={d.scatter_sample} fill="#FF441F" fillOpacity={0.4} r={3} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
            % Saturación por tramo de precipitación
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={buckets} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="precip_bucket" tick={{ ...AXIS, fontSize: 9 }} angle={-20} textAnchor="end" />
              <YAxis tick={AXIS} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={TT}
                formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, "% saturación"]} />
              <Bar dataKey="saturation_pct" radius={[4, 4, 0, 0]}>
                {buckets.map((e, i) => (
                  <Cell key={i} fill={e.saturation_pct > 30 ? "#ef4444" : e.saturation_pct > 15 ? "#f97316" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 dark:border-blue-500/15 bg-blue-50 dark:bg-blue-500/5 p-3 space-y-1">
        <p className="text-xs text-[var(--txt-2)]">
          <span className="text-blue-600 dark:text-blue-400 font-semibold">Hallazgo P2: </span>
          {d.key_findings.interpretation}
        </p>
        <p className="text-xs text-[var(--txt-3)]">
          <span className="font-medium text-[var(--txt-2)]">Mecanismo: </span>
          {d.key_findings.mechanism}
        </p>
      </div>
    </div>
  );
}
