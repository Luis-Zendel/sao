"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, Send, Settings, Activity, CheckCircle, XCircle, MessageSquare, RefreshCw, Zap, BookOpen } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState } from "@/components/ui/Spinner";
import {
  getAgentStatus, getAgentLogs, triggerAgent, testTelegram, sendDailySummary, updateAgentConfig,
  detectChatId,
  type AgentStatus, type AgentLogsResponse, type AgentCycleResult, type DetectChatIdResponse,
} from "@/lib/api";
import { RISK_CONFIG, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const LOG_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  weather_fetch:        { color: "text-blue-600 dark:text-blue-400",    label: "Weather"     },
  alerts_evaluated:     { color: "text-yellow-600 dark:text-yellow-400",label: "Alertas"     },
  message_generated:    { color: "text-purple-600 dark:text-purple-400",label: "Gemini"      },
  notification_sent:    { color: "text-green-600 dark:text-green-400",  label: "Telegram ✓"  },
  notification_skipped: { color: "text-[var(--txt-3)]",                 label: "Omitido"     },
  cycle_complete:       { color: "text-green-600 dark:text-green-400",  label: "Ciclo OK"    },
  cycle_error:          { color: "text-red-600 dark:text-red-400",      label: "Error"       },
  error:                { color: "text-red-600 dark:text-red-400",      label: "Error"       },
  daily_summary_sent:   { color: "text-cyan-600 dark:text-cyan-400",    label: "Resumen"     },
};

const InputField = ({ label, type = "text", placeholder, value, onChange }: {
  label: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs text-[var(--txt-3)] block mb-1">{label}</label>
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-sm text-[var(--txt)] placeholder-[var(--txt-3)]
        bg-[var(--surface-2)] border border-[var(--border)]
        focus:outline-none focus:ring-2 focus:ring-[#FF441F]/30 focus:border-[#FF441F]/50 transition-colors"
    />
  </div>
);

export default function AgentePage() {
  const [status,    setStatus]    = useState<AgentStatus | null>(null);
  const [logs,      setLogs]      = useState<AgentLogsResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [triggering,setTriggering]= useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [lastCycle, setLastCycle] = useState<AgentCycleResult | null>(null);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [configOpen,setConfigOpen]= useState(false);
  const [configSaved,setConfigSaved]=useState(false);
  const [savingConfig,setSavingConfig]=useState(false);
  const [detecting, setDetecting]   = useState(false);
  const [detectedChats, setDetectedChats] = useState<DetectChatIdResponse | null>(null);
  const [form, setForm] = useState({
    gemini_api_key: "", telegram_bot_token: "", telegram_chat_id: "",
    alert_cooldown_hours: 2, scheduler_interval_minutes: 30,
  });

  const fetchData = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([getAgentStatus(), getAgentLogs(80)]);
      setStatus(s); setLogs(l); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 15_000); return () => clearInterval(id); }, [fetchData]);

  const handleTrigger = async () => {
    setTriggering(true);
    try { setLastCycle(await triggerAgent(true)); await fetchData(); }
    catch (e) { setError((e as Error).message); }
    finally { setTriggering(false); }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await updateAgentConfig({
        ...(form.gemini_api_key       && { gemini_api_key: form.gemini_api_key }),
        ...(form.telegram_bot_token   && { telegram_bot_token: form.telegram_bot_token }),
        ...(form.telegram_chat_id     && { telegram_chat_id: form.telegram_chat_id }),
        alert_cooldown_hours: form.alert_cooldown_hours,
        scheduler_interval_minutes: form.scheduler_interval_minutes,
      });
      setConfigSaved(true); setTimeout(() => setConfigSaved(false), 3000);
      await fetchData();
    } catch (e) { setError((e as Error).message); }
    finally { setSavingConfig(false); }
  };

  const StatusCard = ({ icon: Icon, label, val, sub, ok }: {
    icon: typeof Bot; label: string; val: string; sub: string; ok: boolean;
  }) => (
    <div className={cn("rounded-xl border p-3",
      ok ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20"
         : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20")}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={ok ? "text-green-600 dark:text-green-400" : "text-red-500"} />
        <p className="text-xs text-[var(--txt-3)]">{label}</p>
      </div>
      <p className={cn("text-sm font-bold", ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{val}</p>
      <p className="text-[10px] text-[var(--txt-3)]">{sub}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Agente AI — Módulo 3" subtitle="Gemini Flash · Telegram · Scheduler automático" />
      <div className="flex-1 p-6 space-y-5">
        {loading ? <LoadingState message="Cargando agente..." /> :
         error   ? <ErrorState message={error} onRetry={fetchData} /> : (
          <>
            {/* Status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatusCard icon={Activity}      label="Estado"   val={status?.running ? "Activo" : "Inactivo"}   sub={`Cada ${status?.scheduler_interval_minutes} min`}   ok={!!status?.running} />
              <StatusCard icon={Bot}           label="Gemini"   val={status?.gemini_configured ? "Configurado" : "Sin API Key"} sub="Gemini 2.5 Flash"          ok={!!status?.gemini_configured} />
              <StatusCard icon={Send}          label="Telegram" val={status?.telegram_configured ? "Configurado" : "Sin config"} sub="Bot API"                  ok={!!status?.telegram_configured} />
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-[var(--txt-3)]" />
                  <p className="text-xs text-[var(--txt-3)]">Logs</p>
                </div>
                <p className="text-sm font-bold text-[var(--txt)]">{status?.total_log_entries ?? 0}</p>
                <p className="text-[10px] text-[var(--txt-3)]">Cooldown: {status?.cooldown_hours}h</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleTrigger} loading={triggering}><Zap size={14} /> Disparar Ciclo</Button>
              <Button variant="secondary" onClick={() => { setTestingTg(true); testTelegram().then(fetchData).finally(() => setTestingTg(false)); }} loading={testingTg}><Send size={14} /> Test Telegram</Button>
              <Button variant="secondary" onClick={() => { setSendingSummary(true); sendDailySummary().then(fetchData).finally(() => setSendingSummary(false)); }} loading={sendingSummary}><BookOpen size={14} /> Resumen Diario</Button>
              <Button variant="ghost" onClick={fetchData}><RefreshCw size={13} /></Button>
              <Button variant="secondary" onClick={() => setConfigOpen(!configOpen)}><Settings size={13} /> {configOpen ? "Ocultar config" : "Configuración"}</Button>
            </div>

            {/* Config panel */}
            {configOpen && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Configuración del Agente</CardTitle>
                      <CardSubtitle>Se aplica en memoria. Para persistir, edita el archivo .env</CardSubtitle>
                    </div>
                    {configSaved && <Badge className="bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30"><CheckCircle size={10} /> Guardado</Badge>}
                  </div>
                </CardHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="GEMINI_API_KEY"       type="password" placeholder="AIza..."       value={form.gemini_api_key}       onChange={(v) => setForm((p) => ({ ...p, gemini_api_key: v }))} />
                  <InputField label="TELEGRAM_BOT_TOKEN"   type="password" placeholder="123456:ABC..." value={form.telegram_bot_token}   onChange={(v) => setForm((p) => ({ ...p, telegram_bot_token: v }))} />
                  {/* Chat ID with auto-detect */}
                  <div>
                    <label className="text-xs text-[var(--txt-3)] block mb-1">TELEGRAM_CHAT_ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="-100123456789"
                        value={form.telegram_chat_id}
                        onChange={(e) => setForm((p) => ({ ...p, telegram_chat_id: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-[var(--txt)] placeholder-[var(--txt-3)]
                          bg-[var(--surface-2)] border border-[var(--border)]
                          focus:outline-none focus:ring-2 focus:ring-[#FF441F]/30 focus:border-[#FF441F]/50 transition-colors"
                      />
                      <Button
                        variant="secondary" size="sm"
                        loading={detecting}
                        onClick={async () => {
                          setDetecting(true);
                          setDetectedChats(null);
                          const result = await detectChatId(form.telegram_bot_token || undefined);
                          setDetectedChats(result);
                          setDetecting(false);
                        }}
                      >
                        Detectar
                      </Button>
                    </div>

                    {/* Instructions */}
                    <p className="text-[10px] text-[var(--txt-3)] mt-1">
                      Primero envía <span className="font-mono bg-[var(--surface-3)] px-1 rounded">/start</span> a tu bot en Telegram, luego haz click en Detectar.
                    </p>

                    {/* Detection results */}
                    {detectedChats && (
                      <div className={cn("mt-2 rounded-lg border p-3 text-xs",
                        detectedChats.ok
                          ? "bg-[var(--surface-2)] border-[var(--border)]"
                          : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20")}>
                        {!detectedChats.ok ? (
                          <p className="text-red-600 dark:text-red-400">{detectedChats.error}</p>
                        ) : detectedChats.total === 0 ? (
                          <div className="space-y-2 text-[var(--txt-2)]">
                            <p className="font-semibold text-yellow-600 dark:text-yellow-400">
                              Sin mensajes pendientes
                            </p>
                            <p className="text-xs text-[var(--txt-3)]">
                              El bot <strong className="text-[var(--txt)]">@{detectedChats.bot_username || detectedChats.bot_name}</strong> está
                              activo pero no ha recibido mensajes nuevos.
                            </p>
                            <ol className="list-decimal list-inside space-y-1 text-xs text-[var(--txt-3)]">
                              <li>
                                Abre el chat con tu bot:
                                {detectedChats.bot_url && (
                                  <a
                                    href={detectedChats.bot_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-1 inline-flex items-center gap-1 text-[#FF441F] hover:underline font-semibold"
                                  >
                                    Abrir @{detectedChats.bot_username} ↗
                                  </a>
                                )}
                              </li>
                              <li>Envía cualquier mensaje (por ejemplo: <span className="font-mono bg-[var(--surface-3)] px-1 rounded">/start</span>)</li>
                              <li>Regresa aquí y haz click en <strong>Detectar</strong> de nuevo</li>
                            </ol>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="font-semibold text-[var(--txt)]">
                              {detectedChats.total} chat(s) encontrado(s) — selecciona uno:
                            </p>
                            {detectedChats.chats?.map((c) => (
                              <button
                                key={c.chat_id}
                                onClick={() => {
                                  setForm((p) => ({ ...p, telegram_chat_id: String(c.chat_id) }));
                                  setDetectedChats(null);
                                }}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                                  bg-[var(--surface)] border border-[var(--border)]
                                  hover:border-[#FF441F]/40 hover:bg-orange-50 dark:hover:bg-[#FF441F]/5
                                  transition-colors text-left"
                              >
                                <div>
                                  <p className="font-semibold text-[var(--txt)]">{c.title}</p>
                                  <p className="text-[10px] text-[var(--txt-3)]">
                                    {c.type}
                                    {c.username && ` · @${c.username}`}
                                  </p>
                                </div>
                                <span className="font-mono text-[var(--txt-3)] text-[10px] ml-3">{c.chat_id}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--txt-3)] block mb-1">Cooldown (h)</label>
                      <input type="number" min={1} max={24} value={form.alert_cooldown_hours}
                        onChange={(e) => setForm((p) => ({ ...p, alert_cooldown_hours: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg text-sm text-[var(--txt)] bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#FF441F]/30" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--txt-3)] block mb-1">Interval (min)</label>
                      <input type="number" min={5} max={120} value={form.scheduler_interval_minutes}
                        onChange={(e) => setForm((p) => ({ ...p, scheduler_interval_minutes: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-lg text-sm text-[var(--txt)] bg-[var(--surface-2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#FF441F]/30" />
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Button onClick={handleSaveConfig} loading={savingConfig}>Guardar configuración</Button>
                </div>
              </Card>
            )}

            {/* Last cycle result */}
            {lastCycle && (
              <Card className={cn("border",
                lastCycle.status === "ok"
                  ? "border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5"
                  : "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5")}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {lastCycle.status === "ok"
                      ? <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                      : <XCircle size={14} className="text-red-500" />}
                    <CardTitle>Resultado del Último Ciclo</CardTitle>
                    <Badge className={lastCycle.status === "ok"
                      ? "bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30"
                      : "bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30"}>
                      {lastCycle.alerts_sent} alertas enviadas
                    </Badge>
                  </div>
                </CardHeader>
                {lastCycle.error && <p className="text-sm text-red-500 mb-3">{lastCycle.error}</p>}
                {lastCycle.alerts.map((a, i) => {
                  const rc = RISK_CONFIG[a.risk_level as keyof typeof RISK_CONFIG];
                  return (
                    <div key={i} className={cn("rounded-xl border p-3 mb-2", rc?.bg, rc?.border)}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span>{rc?.icon}</span>
                        <span className="text-sm font-semibold text-[var(--txt)]">{a.zone}</span>
                        <Badge className={rc?.badge}>{rc?.label}</Badge>
                        {a.telegram_sent
                          ? <Badge className="bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30 ml-auto"><Send size={9} /> Telegram enviado</Badge>
                          : <Badge className="bg-[var(--surface-2)] text-[var(--txt-3)] border-[var(--border)] ml-auto">No enviado</Badge>}
                      </div>
                      <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3 text-xs text-[var(--txt-2)] font-mono whitespace-pre-wrap">
                        {a.message}
                      </div>
                    </div>
                  );
                })}
                {lastCycle.alerts.length === 0 && <p className="text-sm text-[var(--txt-3)]">Sin alertas activas en este ciclo.</p>}
              </Card>
            )}

            {/* Logs */}
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <CardTitle>Log de Actividad</CardTitle>
                  <CardSubtitle>{logs?.total ?? 0} entradas · actualiza cada 15s</CardSubtitle>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-[var(--txt-3)]">live</span>
                </div>
              </div>
              <div className="overflow-auto max-h-[380px] p-4 space-y-0.5 font-mono text-[11px]">
                {!logs?.logs.length ? (
                  <p className="text-[var(--txt-3)] text-center py-8">Sin actividad. Dispara el agente para ver logs.</p>
                ) : (
                  logs.logs.map((entry, i) => {
                    const tc = LOG_TYPE_CONFIG[entry.type] ?? { color: "text-[var(--txt-3)]", label: entry.type };
                    return (
                      <div key={i} className="flex items-start gap-3 py-1.5 border-b border-[var(--border)]">
                        <span className="text-[var(--txt-3)] shrink-0 w-32">{entry.timestamp ? formatDateTime(entry.timestamp) : "—"}</span>
                        <span className={cn("shrink-0 w-24 font-semibold", tc.color)}>{tc.label}</span>
                        <span className="text-[var(--txt-2)] truncate">
                          {Object.entries(entry).filter(([k]) => !["timestamp","type"].includes(k))
                            .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ")}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Pipeline diagram */}
            <Card>
              <CardHeader>
                <CardTitle>Flujo del Agente</CardTitle>
                <CardSubtitle>Pipeline: Weather → Motor → Gemini → Telegram</CardSubtitle>
              </CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "Open-Meteo",       sub: "14 zonas · gratis",      color: "border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" },
                  { label: "→", sub: "" },
                  { label: "Motor de Alertas", sub: "umbrales calibrados",    color: "border-yellow-300 dark:border-yellow-500/40 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
                  { label: "→", sub: "" },
                  { label: "Gemini Flash",     sub: "prompt estructurado",    color: "border-purple-300 dark:border-purple-500/40 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" },
                  { label: "→", sub: "" },
                  { label: "Telegram Bot",     sub: "mensaje accionable",     color: "border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400" },
                ].map((step, i) =>
                  step.label === "→"
                    ? <span key={i} className="text-[var(--txt-3)] text-xl">→</span>
                    : (
                      <div key={i} className={cn("rounded-xl border px-3 py-2 text-xs", step.color)}>
                        <p className="font-semibold">{step.label}</p>
                        {step.sub && <p className="opacity-70 text-[10px]">{step.sub}</p>}
                      </div>
                    )
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {[
                  { t: "Memoria del agente",  b: `No re-alerta la misma zona en ${status?.cooldown_hours}h. Evita alert fatigue.` },
                  { t: "Falsos positivos",    b: "El mensaje indica nivel de confianza basado en eventos históricos comparables." },
                  { t: "Resumen diario",      b: "Mensaje consolidado a las 21:00h CST con impacto real vs proyectado." },
                ].map((item) => (
                  <div key={item.t} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="font-semibold text-[var(--txt)] mb-1">{item.t}</p>
                    <p className="text-[var(--txt-3)]">{item.b}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
