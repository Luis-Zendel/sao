"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { LoadingState, ErrorState } from "@/components/ui/Spinner";
import { getP1, getP2, getP3, getP4, getP5 } from "@/lib/api";
import { P1HeatmapChart }    from "@/components/charts/P1HeatmapChart";
import { P2CorrelationChart }from "@/components/charts/P2CorrelationChart";
import { P3VulnerabilityChart } from "@/components/charts/P3VulnerabilityChart";
import { P4EarningsChart }   from "@/components/charts/P4EarningsChart";
import { P5SaturationChart } from "@/components/charts/P5SaturationChart";

type Status = "loading" | "error" | "done";

const SECTIONS = [
  { id: "p1", q: "P1", title: "¿En qué horas y zonas alcanza niveles críticos de saturación?",      sub: "Heatmap hora × zona del ratio promedio y porcentaje de saturación" },
  { id: "p2", q: "P2", title: "¿Qué variable externa se correlaciona con el deterioro del ratio?",  sub: "Correlación precipitación vs ratio — regresión y análisis por tramos" },
  { id: "p3", q: "P3", title: "¿Todas las zonas responden igual a la lluvia?",                       sub: "Sensibilidad por zona — radar de vulnerabilidad operacional" },
  { id: "p4", q: "P4", title: "¿El nivel de earnings está bien calibrado a lo largo del mes?",      sub: "Timeline diario con días de gasto ineficiente marcados" },
  { id: "p5", q: "P5", title: "¿Qué relación tiene el nivel de earnings con la saturación?",         sub: "Boxplot earnings × ratio por contexto climático — relación no lineal" },
] as const;

const FETCHERS: Record<string, () => Promise<unknown>> = {
  p1: getP1, p2: getP2, p3: getP3, p4: getP4, p5: getP5,
};

const CHARTS: Record<string, React.ComponentType<{ data: unknown }>> = {
  p1: P1HeatmapChart, p2: P2CorrelationChart, p3: P3VulnerabilityChart,
  p4: P4EarningsChart, p5: P5SaturationChart,
};

export default function DiagnosticoPage() {
  const [sectionData, setSectionData] = useState<Record<string, { data: unknown; status: Status; error?: string }>>(
    Object.fromEntries(SECTIONS.map((s) => [s.id, { data: null, status: "loading" }]))
  );

  useEffect(() => {
    SECTIONS.forEach(async ({ id }) => {
      try {
        const data = await FETCHERS[id]();
        setSectionData((p) => ({ ...p, [id]: { data, status: "done" } }));
      } catch (e) {
        setSectionData((p) => ({ ...p, [id]: { data: null, status: "error", error: (e as Error).message } }));
      }
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Diagnóstico Operacional" subtitle="Módulo 1 — Análisis histórico 30 días · 14 zonas" />

      <div className="flex-1 p-6 space-y-5">

        {/* ── Objetivo del proyecto ── */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-[#FF441F]/20 text-[#FF441F] flex items-center justify-center text-base">🎯</span>
            <h2 className="text-sm font-semibold text-[var(--txt-1)] uppercase tracking-wider">Objetivo del proyecto</h2>
          </div>
          <p className="text-sm text-[var(--txt-2)] leading-relaxed">
            Este módulo analiza <span className="font-medium text-[var(--txt-1)]">30 días de operación histórica</span> de Rappi Monterrey
            para responder cinco preguntas críticas de negocio. El propósito es identificar patrones de saturación,
            correlaciones con variables externas (lluvia) y oportunidades de calibración de incentivos —
            convirtiendo datos crudos en <span className="font-medium text-[var(--txt-1)]">inteligencia accionable</span> para el equipo de Operaciones.
          </p>
        </div>

        {/* ── Parámetros del Dataset ── */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-base">🗂️</span>
            <h2 className="text-sm font-semibold text-[var(--txt-1)] uppercase tracking-wider">Parámetros del Dataset</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: "Registros", value: "10,080", desc: "filas totales" },
              { label: "Periodo", value: "Mar 2024", desc: "30 días completos" },
              { label: "Ciudad", value: "Monterrey", desc: "México" },
              { label: "Zonas", value: "14", desc: "zonas operacionales" },
              { label: "Granularidad", value: "1 h", desc: "por zona y hora" },
              { label: "Cobertura", value: "24 / 7", desc: "horas × días" },
            ].map(({ label, value, desc }) => (
              <div key={label} className="rounded-lg bg-[var(--surface-2)] p-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-[var(--txt-3)] uppercase tracking-wider">{label}</span>
                <span className="text-lg font-bold text-[var(--txt-1)] leading-tight">{value}</span>
                <span className="text-[10px] text-[var(--txt-3)]">{desc}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--txt-3)] mb-3 font-medium uppercase tracking-wider">Columnas del dataset</p>
            <div className="flex flex-wrap gap-2">
              {[
                { col: "COUNTRY", type: "cat", tip: "País (México)" },
                { col: "DATE", type: "time", tip: "Fecha del registro" },
                { col: "HOUR", type: "time", tip: "Hora del día (0–23)" },
                { col: "CITY", type: "cat", tip: "Ciudad (Monterrey)" },
                { col: "ZONE", type: "cat", tip: "Nombre de la zona operacional" },
                { col: "CONNECTED_RT", type: "num", tip: "Repartidores conectados en esa hora" },
                { col: "ORDERS", type: "num", tip: "Órdenes activas en esa hora" },
                { col: "EARNINGS", type: "num", tip: "Nivel de incentivo económico ofrecido" },
                { col: "PRECIPITATION_MM", type: "num", tip: "Precipitación en milímetros" },
              ].map(({ col, type, tip }) => (
                <div key={col} title={tip} className="group relative flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 cursor-default">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${type === "num" ? "bg-blue-400" : type === "time" ? "bg-purple-400" : "bg-slate-400"}`} />
                  <span className="text-xs font-mono font-medium text-[var(--txt-2)]">{col}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--txt-3)] mt-2 flex gap-3">
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1" />Numérica</span>
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 mr-1" />Temporal</span>
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mr-1" />Categórica</span>
            </p>
          </div>
        </div>

        {/* ── Métrica central: Ratio ── */}
        <div className="rounded-xl border border-orange-200 dark:border-[#FF441F]/30 bg-orange-50/60 dark:bg-[#FF441F]/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-[#FF441F]/20 text-[#FF441F] flex items-center justify-center text-base">📐</span>
            <h2 className="text-sm font-semibold text-[var(--txt-1)] uppercase tracking-wider">Métrica central: el Ratio</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="flex-1">
              <p className="text-sm text-[var(--txt-2)] leading-relaxed mb-3">
                El <span className="font-semibold text-[#FF441F]">Ratio</span> es la métrica fundamental que mide el equilibrio
                entre demanda y oferta en tiempo real dentro de cada zona operacional. Se calcula como:
              </p>
              <div className="inline-flex items-center gap-3 rounded-lg bg-white dark:bg-[var(--surface-2)] border border-orange-200 dark:border-[#FF441F]/20 px-4 py-2.5">
                <span className="text-base font-bold text-[#FF441F] font-mono">Ratio = ORDERS ÷ CONNECTED_RT</span>
              </div>
              <p className="text-xs text-[var(--txt-3)] mt-2">
                Un ratio alto indica que hay más pedidos que repartidores disponibles → saturación y tiempos de entrega elevados.
                Un ratio bajo indica exceso de oferta → ineficiencia y costos innecesarios en incentivos.
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0 w-full sm:w-64">
              {[
                { range: "< 0.5", label: "Sobre-oferta", desc: "Demasiados repartidores. Incentivos desperdiciados.", color: "yellow", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-300 dark:border-yellow-500/30", text: "text-yellow-700 dark:text-yellow-400" },
                { range: "0.5 – 0.9", label: "Sub-óptimo", desc: "Oferta levemente alta. Zona estable pero ineficiente.", color: "blue", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-300 dark:border-blue-500/30", text: "text-blue-700 dark:text-blue-400" },
                { range: "0.9 – 1.2", label: "Saludable ✓", desc: "Balance ideal entre órdenes y repartidores.", color: "green", bg: "bg-green-50 dark:bg-green-500/10", border: "border-green-300 dark:border-green-500/30", text: "text-green-700 dark:text-green-400" },
                { range: "1.2 – 1.8", label: "Tensión", desc: "Demanda supera la oferta. Riesgo de demora.", color: "orange", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-300 dark:border-orange-500/30", text: "text-orange-700 dark:text-orange-400" },
                { range: "> 1.8", label: "Saturación crítica", desc: "Operación colapsada. Acción inmediata requerida.", color: "red", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-300 dark:border-red-500/30", text: "text-red-700 dark:text-red-400" },
              ].map(({ range, label, desc, bg, border, text }) => (
                <div key={range} className={`rounded-lg border ${bg} ${border} px-3 py-2 flex items-center gap-3`}>
                  <span className={`text-xs font-bold font-mono w-16 shrink-0 ${text}`}>{range}</span>
                  <div>
                    <p className={`text-xs font-semibold ${text}`}>{label}</p>
                    <p className="text-[10px] text-[var(--txt-3)] leading-tight">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Separador descubrimientos ── */}
        <div className="flex items-center gap-3 pt-1">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs font-semibold text-[var(--txt-3)] uppercase tracking-widest">5 Descubrimientos operacionales</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {SECTIONS.map(({ id, q, title, sub }) => {
          const { data, status, error } = sectionData[id];
          const ChartComp = CHARTS[id];
          return (
            <Card key={id} className="p-0 overflow-hidden">
              <div className="p-5 border-b border-[var(--border)] flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-orange-100 dark:bg-[#FF441F]/20 text-[#FF441F] font-bold text-xs flex items-center justify-center">
                  {q}
                </span>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardSubtitle>{sub}</CardSubtitle>
                </div>
              </div>
              <div className="p-5">
                {status === "loading" && <LoadingState message="Calculando análisis..." />}
                {status === "error"   && <ErrorState message={error ?? "Error al cargar"} />}
                {status === "done"    && <ChartComp data={data} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
