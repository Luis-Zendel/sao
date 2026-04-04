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

const STAT_META = [
  {
    key: "pearson_r" as const,
    label: "Pearson r",
    fmt: (v: number) => v.toFixed(3),
    sub: "Correlación positiva moderada — a más lluvia, mayor ratio",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  {
    key: "r_squared" as const,
    label: "R²",
    fmt: (v: number) => v.toFixed(3),
    sub: (v: number) => `La lluvia explica el ${(v * 100).toFixed(1)}% de la variación del ratio`,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  {
    key: "slope" as const,
    label: "Slope",
    fmt: (v: number) => (v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3)),
    sub: (v: number) => `Cada mm/hr adicional de lluvia sube el ratio ~${v.toFixed(3)} pts`,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-500/10",
    border: "border-orange-200 dark:border-orange-500/20",
  },
  {
    key: "p_value" as const,
    label: "p-value",
    fmt: (v: number) => (v < 0.001 ? "<0.001" : v.toFixed(4)),
    sub: "Estadísticamente significativo — la relación no es aleatoria",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-500/10",
    border: "border-green-200 dark:border-green-500/20",
  },
] as const;

export function P2CorrelationChart({ data }: { data: unknown }) {
  const d = data as P2Data;
  if (!d) return null;
  const { correlation: c, bucket_stats: buckets } = d;

  // Only show observations where it actually rained — avoids the x=0 collapse
  const rainSample = (d.scatter_sample ?? []).filter((p) => p.PRECIPITATION_MM > 0);

  return (
    <div className="space-y-5">
      {/* Stat cards with descriptions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAT_META.map((m) => {
          const raw = c[m.key];
          const subText = typeof m.sub === "function" ? m.sub(raw) : m.sub;
          return (
            <div key={m.label} className={`rounded-xl border p-3 ${m.bg} ${m.border}`}>
              <p className="text-xs text-[var(--txt-3)]">{m.label}</p>
              <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.fmt(raw)}</p>
              <p className="text-[10px] text-[var(--txt-3)] mt-1 leading-tight">{subText}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-[var(--txt-3)] mb-1 uppercase tracking-wide">
            Scatter: Precipitación vs Ratio
          </p>
          <p className="text-[10px] text-[var(--txt-3)] mb-3">
            Solo registros con lluvia &gt; 0 mm/hr · línea roja = umbral saturación (1.8)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis
                dataKey="PRECIPITATION_MM"
                name="Precipitación"
                tick={AXIS}
                type="number"
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v.toFixed(1)}`}
                label={{ value: "Precipitación (mm/hr)", position: "insideBottom", fill: "#94a3b8", fontSize: 10, offset: -12 }}
              />
              <YAxis
                dataKey="RATIO"
                name="Ratio"
                tick={AXIS}
                type="number"
                domain={[0, 4]}
                label={{ value: "Ratio", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 10, offset: 14 }}
              />
              <Tooltip
                contentStyle={TT}
                cursor={{ stroke: "#e2e8f0" }}
                formatter={(v: unknown, name: unknown) => [
                  name === "PRECIPITATION_MM"
                    ? `${(v as number)?.toFixed(2)} mm/hr`
                    : (v as number)?.toFixed(3),
                  name === "PRECIPITATION_MM" ? "Precipitación" : "Ratio",
                ]}
              />
              <ReferenceLine y={1.8} stroke="#ef4444" strokeDasharray="4 2"
                label={{ value: "Sat. 1.8", fill: "#ef4444", fontSize: 9, position: "right" }} />
              <Scatter data={rainSample} fill="#FF441F" fillOpacity={0.45} r={3} />
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
