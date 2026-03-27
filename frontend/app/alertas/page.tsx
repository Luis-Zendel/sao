"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, CloudRain, Zap, Shield, Clock, TrendingUp } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/Spinner";
import {
  getAlertForecast, evaluateAlerts, getAlertHistory, getZoneThresholds,
  type ForecastResponse, type AlertEvalResponse, type AlertHistoryResponse, type ZoneThresholdsResponse,
} from "@/lib/api";
import { RISK_CONFIG, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const AXIS = { fill: "#94a3b8", fontSize: 9 };
const GRID = "#e2e8f0";
const TT   = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 };

function precipColor(mm: number) {
  if (mm >= 7) return "#ef4444";
  if (mm >= 3) return "#f97316";
  if (mm >= 1) return "#eab308";
  return "#3b82f6";
}

export default function AlertasPage() {
  const [forecast,   setForecast]   = useState<ForecastResponse | null>(null);
  const [evalResult, setEvalResult] = useState<AlertEvalResponse | null>(null);
  const [history,    setHistory]    = useState<AlertHistoryResponse | null>(null);
  const [thresholds, setThresholds] = useState<ZoneThresholdsResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [f, h, t] = await Promise.all([getAlertForecast(), getAlertHistory(30), getZoneThresholds()]);
      setForecast(f); setHistory(h); setThresholds(t); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const result = await evaluateAlerts(true);
      setEvalResult(result);
      setHistory(await getAlertHistory(30));
    } catch (e) { setError((e as Error).message); }
    finally { setEvaluating(false); }
  };

  const forecastZones = (forecast?.zones ?? []).sort((a, b) => b.max_2h_precipitation_mm - a.max_2h_precipitation_mm);
  const thresh = thresholds?.thresholds ?? [];

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Motor de Alertas Tempranas" subtitle="Módulo 2 — Open-Meteo + Motor de decisión calibrado" />

      <div className="flex-1 p-6 space-y-5">
        {/* Action bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-xs text-[var(--txt-2)] flex gap-5">
            <span>Weather: <span className="font-medium text-green-600 dark:text-green-400">Open-Meteo (gratuito)</span></span>
            <span>Ventana: <span className="font-medium text-[var(--txt)]">2 horas</span></span>
            <span>Cooldown: <span className="font-medium text-[var(--txt)]">2h / zona</span></span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={fetchAll}><RefreshCw size={13} /> Actualizar</Button>
            <Button size="sm" onClick={handleEvaluate} loading={evaluating}><Zap size={13} /> Evaluar Alertas</Button>
          </div>
        </div>

        {loading ? <LoadingState message="Cargando forecast..." /> :
         error   ? <ErrorState message={error} onRetry={fetchAll} /> : (
          <>
            {/* Evaluation result */}
            {evalResult && (
              <Card className={cn("border", evalResult.alert_count > 0
                ? "border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-500/5"
                : "border-green-300 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5")}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <CardTitle>Resultado de Evaluación</CardTitle>
                    <CardSubtitle>{evalResult.alert_count} alerta(s) · {evalResult.evaluated_zones} zonas evaluadas</CardSubtitle>
                  </div>
                  {evalResult.alert_count === 0
                    ? <Badge className="bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30"><Shield size={10} /> Operación normal</Badge>
                    : <Badge className="bg-orange-50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30">{evalResult.alert_count} alertas</Badge>}
                </div>

                {evalResult.alerts.map((alert, i) => {
                  const rc = RISK_CONFIG[alert.risk_level as keyof typeof RISK_CONFIG];
                  return (
                    <div key={i} className={cn("rounded-xl border p-4 mb-3", rc?.bg, rc?.border)}>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-lg">{rc?.icon}</span>
                        <p className="text-sm font-bold text-[var(--txt)]">{alert.zone}</p>
                        <Badge className={rc?.badge}>{rc?.label}</Badge>
                        <span className="text-xs text-[var(--txt-3)] ml-auto"><Clock size={10} className="inline mr-1" />Actuar en {alert.action_window_minutes} min</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><p className="text-[var(--txt-3)]">Precipitación trigger</p><p className="font-semibold text-[var(--txt)]">{alert.trigger_precipitation_mm} mm/hr</p></div>
                        <div><p className="text-[var(--txt-3)]">Ratio proyectado</p><p className={cn("font-semibold", rc?.color)}>{alert.projected_ratio}</p></div>
                        <div><p className="text-[var(--txt-3)]">Earnings actual</p><p className="text-[var(--txt-2)]">{alert.earnings_recommendation.current_baseline_earnings} MXN</p></div>
                        <div><p className="text-[var(--txt-3)]">Earnings recomendado</p>
                          <p className="text-green-600 dark:text-green-400 font-bold">
                            {alert.earnings_recommendation.recommended_earnings} MXN
                            <span className="text-[var(--txt-3)] font-normal ml-1">(+{alert.earnings_recommendation.delta})</span>
                          </p>
                        </div>
                      </div>
                      {alert.secondary_zones.length > 0 && (
                        <p className="text-xs text-[var(--txt-3)] mt-2">Zonas secundarias: {alert.secondary_zones.join(", ")}</p>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}

            {/* Forecast bar chart */}
            <Card>
              <CardHeader>
                <CardTitle>Precipitación Forecast — Próximas 2 horas por zona</CardTitle>
                <CardSubtitle>Fuente: Open-Meteo · Ordenado por mayor precipitación esperada</CardSubtitle>
              </CardHeader>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={forecastZones} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${v}mm`} domain={[0, "auto"]} />
                  <YAxis type="category" dataKey="zone" tick={AXIS} width={130} />
                  <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${(v as number)?.toFixed(2)} mm/hr`, "Precip máx 2h"]} />
                  <Bar dataKey="max_2h_precipitation_mm" radius={[0, 4, 4, 0]}>
                    {forecastZones.map((e, i) => <Cell key={i} fill={precipColor(e.max_2h_precipitation_mm)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Thresholds table */}
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-[var(--border)]">
                <CardTitle>Umbrales por Zona</CardTitle>
                <CardSubtitle>Calibrados desde datos históricos — sensibilidad y earnings slope</CardSubtitle>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-2)]">
                    <tr className="border-b border-[var(--border)]">
                      {["Zona", "Umbral (mm)", "Earnings base", "Slope MXN/mm", "Vulnerabilidad", "Forecast 2h"].map((h) => (
                        <th key={h} className={cn("px-4 py-2.5 text-xs text-[var(--txt-3)] font-medium", h === "Zona" ? "text-left" : "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {thresh.sort((a, b) => b.vulnerability_pct - a.vulnerability_pct).map((t) => {
                      const fZone  = forecast?.zones.find((z) => z.zone === t.zone);
                      const precip = fZone?.max_2h_precipitation_mm ?? 0;
                      const isAlert= precip >= t.precip_threshold;
                      return (
                        <tr key={t.zone} className={cn("border-b border-[var(--border)] transition-colors",
                          isAlert ? "bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15"
                                  : "hover:bg-[var(--surface-2)]")}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {isAlert && <CloudRain size={11} className="text-orange-500" />}
                              <span className="text-xs font-medium text-[var(--txt)]">{t.zone}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs font-medium text-yellow-600 dark:text-yellow-400">{t.precip_threshold} mm</td>
                          <td className="px-3 py-2.5 text-right text-xs text-[var(--txt-2)]">{t.baseline_earnings} MXN</td>
                          <td className="px-3 py-2.5 text-right text-xs text-blue-600 dark:text-blue-400">+{t.earnings_slope.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <div className="w-12 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                                <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(t.vulnerability_pct, 100)}%` }} />
                              </div>
                              <span className="text-xs text-[var(--txt-3)]">{t.vulnerability_pct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className={cn("px-3 py-2.5 text-right text-xs font-semibold",
                            precip >= 7 ? "text-red-500" : precip >= 3 ? "text-orange-500" : "text-[var(--txt-3)]")}>
                            {precip.toFixed(2)} mm
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Historial de Alertas</CardTitle>
                    <CardSubtitle>Últimas {history?.total ?? 0} alertas registradas</CardSubtitle>
                  </div>
                  <TrendingUp size={16} className="text-[var(--txt-3)]" />
                </div>
              </CardHeader>
              {!history?.history.length ? (
                <p className="text-center text-sm text-[var(--txt-3)] py-6">
                  Sin historial. Usa &quot;Evaluar Alertas&quot; para generar alertas.
                </p>
              ) : (
                <div className="space-y-2">
                  {history.history.map((alert, i) => {
                    const rc = RISK_CONFIG[alert.risk_level as keyof typeof RISK_CONFIG];
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs">
                        <span>{rc?.icon}</span>
                        <span className="font-medium text-[var(--txt)] w-32 shrink-0">{alert.zone}</span>
                        <Badge className={rc?.badge}>{rc?.label}</Badge>
                        <span className="text-[var(--txt-3)]">{alert.trigger_precipitation_mm}mm/hr</span>
                        <span className="text-[var(--txt-3)]">ratio ~{alert.projected_ratio}</span>
                        <span className="text-green-600 dark:text-green-400 font-medium ml-auto">
                          → {alert.earnings_recommendation.recommended_earnings} MXN
                        </span>
                        <span className="text-[var(--txt-3)]">{formatDateTime(alert.alert_time)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
