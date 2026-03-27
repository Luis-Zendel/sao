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
        {/* Intro banner */}
        <div className="rounded-xl border border-orange-200 dark:border-[#FF441F]/20 bg-orange-50 dark:bg-[#FF441F]/5 p-4">
          <p className="text-sm text-[var(--txt-2)]">
            <span className="font-semibold text-[#FF441F]">Métrica central:</span>{" "}
            Ratio = Órdenes / Repartidores ·{" "}
            <span className="text-yellow-600 dark:text-yellow-400">&lt;0.5 sobre-oferta</span> ·{" "}
            <span className="text-green-600 dark:text-green-400">0.9–1.2 saludable</span> ·{" "}
            <span className="text-red-600 dark:text-red-400">&gt;1.8 saturación</span>
          </p>
          <p className="text-xs text-[var(--txt-3)] mt-1">
            Dataset: 10,080 filas · Marzo 2024 · 14 zonas operacionales de Monterrey
          </p>
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
