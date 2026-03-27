"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Users, ShoppingBag, AlertTriangle, TrendingUp, CloudRain, Activity } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/Spinner";
import { ZoneMap } from "@/components/ui/ZoneMap";
import { getSnapshot, getAlertHistory, type SnapshotResponse, type Alert } from "@/lib/api";
import { STATUS_CONFIG, RISK_CONFIG, formatRatio, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [snapshot, setSnapshot]   = useState<SnapshotResponse | null>(null);
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [snap, hist] = await Promise.all([getSnapshot(), getAlertHistory(20)]);
      setSnapshot(snap);
      setAlerts(hist.history);
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 60_000); return () => clearInterval(id); }, [fetchData]);

  const summary   = snapshot?.summary ?? {};
  const zones     = snapshot?.zones   ?? [];
  const totalOrders = zones.reduce((s, z) => s + z.orders, 0);
  const totalRt     = zones.reduce((s, z) => s + z.connected_rt, 0);
  const rainZones   = zones.filter((z) => z.precipitation_mm > 0.5).length;

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Dashboard Operacional" subtitle="Monterrey · Tiempo real" />

      <div className="flex-1 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--txt-3)]">
            Snapshot histórico ·{" "}
            {snapshot?.snapshot_datetime ? formatDateTime(snapshot.snapshot_datetime) : "—"}
          </p>
          <Button variant="secondary" size="sm" onClick={() => { setRefreshing(true); fetchData(); }} loading={refreshing}>
            <RefreshCw size={13} /> Actualizar
          </Button>
        </div>

        {loading ? <LoadingState message="Cargando operación..." /> :
         error   ? <ErrorState message={error} onRetry={fetchData} /> : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="Saturación"  value={summary.saturacion  ?? 0} sublabel="ratio > 1.8"    color="red"    icon={<AlertTriangle size={14}/>} />
              <KpiCard label="Elevado"     value={summary.elevado     ?? 0} sublabel="ratio 1.2–1.8"  color="orange" icon={<TrendingUp size={14}/>} />
              <KpiCard label="Saludable"   value={summary.saludable   ?? 0} sublabel="ratio 0.9–1.2"  color="green"  icon={<Activity size={14}/>} />
              <KpiCard label="Sobre-oferta"value={summary.sobre_oferta?? 0} sublabel="ratio < 0.5"    color="yellow" icon={<Users size={14}/>} />
              <KpiCard label="Órdenes"     value={totalOrders}             sublabel={`${totalRt} RT`} color="blue"   icon={<ShoppingBag size={14}/>} />
              <KpiCard label="Zonas lluvia"value={rainZones}               sublabel="> 0.5 mm/hr"     color={rainZones > 2 ? "orange" : "gray"} icon={<CloudRain size={14}/>} />
            </div>

            {/* Map + table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="mb-3">
                  <CardTitle>Mapa de Zonas</CardTitle>
                  <CardSubtitle>Estado operacional — hover para detalles</CardSubtitle>
                </CardHeader>
                <ZoneMap zones={zones} />
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-[var(--border)]">
                  <CardTitle>Estado por Zona</CardTitle>
                  <CardSubtitle>Ratio = Órdenes / Repartidores</CardSubtitle>
                </div>
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--surface-2)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-2 text-left text-xs text-[var(--txt-3)] font-medium">Zona</th>
                        <th className="px-3 py-2 text-right text-xs text-[var(--txt-3)] font-medium">RT</th>
                        <th className="px-3 py-2 text-right text-xs text-[var(--txt-3)] font-medium">Órd</th>
                        <th className="px-3 py-2 text-right text-xs text-[var(--txt-3)] font-medium">Ratio</th>
                        <th className="px-3 py-2 text-right text-xs text-[var(--txt-3)] font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.sort((a, b) => b.ratio - a.ratio).map((z) => {
                        const cfg = STATUS_CONFIG[z.status as keyof typeof STATUS_CONFIG];
                        return (
                          <tr key={z.zone} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {z.precipitation_mm > 0.5 && <CloudRain size={11} className="text-blue-500 shrink-0" />}
                                <span className="text-xs text-[var(--txt)] font-medium">{z.zone}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs text-[var(--txt-2)]">{z.connected_rt}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-[var(--txt-2)]">{z.orders}</td>
                            <td className={cn("px-3 py-2.5 text-right text-xs font-bold tabular-nums", cfg.color)}>
                              {formatRatio(z.ratio)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Badge className={cfg.badge}>{cfg.label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Alert feed */}
            <Card>
              <CardHeader>
                <CardTitle>Alertas Recientes</CardTitle>
                <CardSubtitle>Últimas alertas del motor de decisión</CardSubtitle>
              </CardHeader>
              {alerts.length === 0 ? (
                <p className="text-center py-8 text-sm text-[var(--txt-3)]">
                  Sin alertas registradas. El sistema monitorea cada 30 min.
                </p>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 10).map((alert, i) => {
                    const rc = RISK_CONFIG[alert.risk_level as keyof typeof RISK_CONFIG];
                    return (
                      <div key={i} className={cn("flex items-start gap-3 p-3 rounded-lg border", rc?.bg, rc?.border)}>
                        <span className="text-lg leading-none mt-0.5">{rc?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[var(--txt)]">{alert.zone}</p>
                            <Badge className={rc?.badge}>{rc?.label}</Badge>
                            <span className="text-xs text-[var(--txt-3)]">{formatDateTime(alert.alert_time)}</span>
                          </div>
                          <p className="text-xs text-[var(--txt-2)] mt-0.5">
                            {alert.trigger_precipitation_mm.toFixed(1)}mm · ratio proyectado{" "}
                            <span className={rc?.color}>{alert.projected_ratio}</span>
                            {" · "}subir earnings a{" "}
                            <span className="font-semibold text-[var(--txt)]">
                              {alert.earnings_recommendation.recommended_earnings} MXN
                            </span>
                          </p>
                        </div>
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
