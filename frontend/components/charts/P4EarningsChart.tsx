"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const AXIS = { fill: "#94a3b8", fontSize: 10 };
const GRID = "#e2e8f0";

interface DailyRecord {
  DATE: string; DAY: number; avg_earnings: number; avg_ratio: number;
  oversupply_pct: number; saturation_pct: number;
  is_inefficient: boolean; is_underpaid_sat: boolean;
}
interface P4Data {
  daily_timeline: DailyRecord[];
  inefficient_days: number[]; underpaid_saturation_days: number[];
  thresholds: { earnings_p75: number; earnings_p25: number };
  key_findings: { inefficient_count: number; underpaid_count: number; explanation: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as DailyRecord;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-xs space-y-1 shadow-lg">
      <p className="font-semibold text-[var(--txt)]">Día {label}</p>
      <p className="text-[#FF441F]">Earnings: {d.avg_earnings.toFixed(1)} MXN</p>
      <p className="text-blue-500">Ratio: {d.avg_ratio.toFixed(3)}</p>
      <p className="text-yellow-600 dark:text-yellow-400">Sobre-oferta: {d.oversupply_pct.toFixed(0)}%</p>
      {d.is_inefficient    && <p className="text-yellow-600 dark:text-yellow-400 font-bold">⚠ Gasto ineficiente</p>}
      {d.is_underpaid_sat  && <p className="text-red-500 font-bold">⚠ Incentivo insuficiente</p>}
    </div>
  );
};

export function P4EarningsChart({ data }: { data: unknown }) {
  const d = data as P4Data;
  if (!d) return null;
  const { daily_timeline: timeline, key_findings: kf, thresholds: thresh } = d;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Días gasto ineficiente",    val: kf.inefficient_count, sub: "Earnings alto + sobre-oferta",    color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
          { label: "Días incentivo insuficiente",val: kf.underpaid_count,   sub: "Earnings bajo + saturación",      color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-500/10",    border: "border-red-200 dark:border-red-500/20" },
          { label: "Días inexactos / total",     val: `${kf.inefficient_count + kf.underpaid_count} / 30`, sub: `${(((kf.inefficient_count + kf.underpaid_count) / 30) * 100).toFixed(0)}% del mes`, color: "text-[var(--txt-2)]", bg: "bg-[var(--surface-2)]", border: "border-[var(--border)]" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.bg} ${item.border}`}>
            <p className="text-xs text-[var(--txt-3)]">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.val}</p>
            <p className="text-[10px] text-[var(--txt-3)]">{item.sub}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-[var(--txt-3)] mb-3 uppercase tracking-wide">
          Timeline diario: Earnings promedio + días marcados
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={timeline} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="DAY" tick={AXIS} tickFormatter={(v) => `D${v}`} />
            <YAxis yAxisId="earnings" tick={AXIS} domain={[45, 65]} />
            <YAxis yAxisId="ratio" orientation="right" tick={AXIS} domain={[0, 2]} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="earnings" y={thresh.earnings_p75} stroke="#eab308"
              strokeDasharray="4 2" label={{ value: "p75", fill: "#eab308", fontSize: 9, position: "right" }} />
            <ReferenceLine yAxisId="earnings" y={thresh.earnings_p25} stroke="#94a3b8"
              strokeDasharray="4 2" label={{ value: "p25", fill: "#94a3b8", fontSize: 9, position: "right" }} />
            <Bar yAxisId="earnings" dataKey="avg_earnings" radius={[2, 2, 0, 0]} name="Earnings">
              {timeline.map((entry, i) => (
                <Cell key={i}
                  fill={entry.is_inefficient ? "#eab308" : entry.is_underpaid_sat ? "#ef4444" : "#FF441F"}
                  fillOpacity={entry.is_inefficient || entry.is_underpaid_sat ? 1 : 0.6}
                />
              ))}
            </Bar>
            <Line yAxisId="ratio" type="monotone" dataKey="avg_ratio" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-4 mt-2 text-[10px] text-[var(--txt-3)]">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-yellow-500" /> Gasto ineficiente</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-500" /> Incentivo insuficiente</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-[#FF441F] opacity-60" /> Normal</div>
          <div className="flex items-center gap-1"><div className="w-5 h-0.5 bg-blue-500" /> Ratio (eje der.)</div>
        </div>
      </div>

      <div className="rounded-lg border border-yellow-200 dark:border-yellow-500/15 bg-yellow-50 dark:bg-yellow-500/5 p-3">
        <p className="text-xs text-[var(--txt-2)]">
          <span className="text-yellow-600 dark:text-yellow-400 font-semibold">Hallazgo P4: </span>
          {kf.explanation}
        </p>
      </div>
    </div>
  );
}
