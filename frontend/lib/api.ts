const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Analytics
export const getSnapshot = () => apiFetch<SnapshotResponse>("/api/analytics/snapshot");
export const getZonesGeoJSON = () => apiFetch<GeoJSONCollection>("/api/analytics/zones-geojson");
export const getP1 = () => apiFetch<unknown>("/api/analytics/p1-saturation-heatmap");
export const getP2 = () => apiFetch<unknown>("/api/analytics/p2-precipitation-correlation");
export const getP3 = () => apiFetch<unknown>("/api/analytics/p3-zone-vulnerability");
export const getP4 = () => apiFetch<unknown>("/api/analytics/p4-earnings-calibration");
export const getP5 = () => apiFetch<unknown>("/api/analytics/p5-earnings-saturation");

// Alerts
export const getAlertForecast = (forceRefresh = false) =>
  apiFetch<ForecastResponse>(`/api/alerts/current-forecast?force_refresh=${forceRefresh}`);
export const evaluateAlerts = (forceRefresh = false) =>
  apiFetch<AlertEvalResponse>(`/api/alerts/evaluate?force_refresh=${forceRefresh}`);
export const getAlertHistory = (limit = 50) =>
  apiFetch<AlertHistoryResponse>(`/api/alerts/history?limit=${limit}`);
export const getZoneThresholds = () =>
  apiFetch<ZoneThresholdsResponse>("/api/alerts/zone-thresholds");
export const getAlertMemory = () => apiFetch<unknown>("/api/alerts/memory");
export const clearAlertMemory = (zone?: string) =>
  apiFetch<unknown>(`/api/alerts/memory${zone ? `?zone=${encodeURIComponent(zone)}` : ""}`, {
    method: "DELETE",
  });

// Agent
export const triggerAgent = (forceRefresh = false) =>
  apiFetch<AgentCycleResult>(`/api/agent/trigger?force_refresh=${forceRefresh}`, { method: "POST" });
export const getAgentStatus = () => apiFetch<AgentStatus>("/api/agent/status");
export const getAgentLogs = (limit = 100) =>
  apiFetch<AgentLogsResponse>(`/api/agent/logs?limit=${limit}`);
export const sendDailySummary = () =>
  apiFetch<unknown>("/api/agent/daily-summary", { method: "POST" });
export const testTelegram = () =>
  apiFetch<unknown>("/api/agent/test-telegram", { method: "POST" });
export const detectChatId = (token?: string) =>
  apiFetch<DetectChatIdResponse>(
    `/api/agent/detect-chat-id${token ? `?token=${encodeURIComponent(token)}` : ""}`
  );
export const updateAgentConfig = (config: Partial<AgentConfigPayload>) =>
  apiFetch<unknown>("/api/agent/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });

// GeoJSON types
export interface ZoneGeoJSONProperties {
  zone: string;
  status: string;
  ratio: number;
  orders: number;
  connected_rt: number;
  earnings: number;
  precipitation_mm: number;
  centroid_lat: number;
  centroid_lon: number;
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: object | null;
  properties: ZoneGeoJSONProperties;
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Types
export interface ZoneStatus {
  zone: string;
  connected_rt: number;
  orders: number;
  ratio: number;
  status: "saturacion" | "elevado" | "saludable" | "bajo" | "sobre_oferta" | "sin_datos";
  earnings: number;
  precipitation_mm: number;
}

export interface SnapshotResponse {
  snapshot_datetime: string | null;
  zones: ZoneStatus[];
  summary: Record<string, number>;
  total_zones: number;
}

export interface ForecastResponse {
  zones: ZoneForecast[];
  count: number;
}

export interface ZoneForecast {
  zone: string;
  lat: number;
  lon: number;
  current_precipitation_mm: number;
  max_2h_precipitation_mm: number;
  max_3h_precipitation_mm: number;
  hourly_forecast: { time: string; precipitation_mm: number; hours_ahead: number }[];
  fetch_time: string;
  source: string;
  error: string | null;
}

export interface AlertEvalResponse {
  alerts: Alert[];
  alert_count: number;
  evaluated_zones: number;
}

export interface Alert {
  zone: string;
  risk_level: "bajo" | "medio" | "alto" | "critico";
  trigger_precipitation_mm: number;
  current_precipitation_mm: number;
  forecast_2h_precipitation_mm: number;
  projected_ratio: number;
  zone_threshold_mm: number;
  vulnerability_pct: number;
  earnings_recommendation: {
    current_baseline_earnings: number;
    recommended_earnings: number;
    delta: number;
    formula: string;
  };
  historical_context: unknown[];
  secondary_zones: string[];
  alert_time: string;
  action_window_minutes: number;
}

export interface AlertHistoryResponse {
  history: Alert[];
  total: number;
}

export interface ZoneThresholdsResponse {
  thresholds: Array<{
    zone: string;
    precip_threshold: number;
    earnings_slope: number;
    baseline_earnings: number;
    baseline_ratio: number;
    vulnerability_pct: number;
  }>;
}

export interface AgentStatus {
  running: boolean;
  last_run: string | null;
  total_log_entries: number;
  pending_daily_events: number;
  scheduler_interval_minutes: number;
  cooldown_hours: number;
  gemini_configured: boolean;
  telegram_configured: boolean;
}

export interface AgentCycleResult {
  status: string;
  alerts_sent: number;
  alerts: Array<{
    zone: string;
    risk_level: string;
    message: string;
    telegram_sent: boolean;
    timestamp: string;
  }>;
  error?: string;
}

export interface AgentLogsResponse {
  logs: Array<{
    timestamp: string;
    type: string;
    [key: string]: unknown;
  }>;
  total: number;
}

export interface DetectChatIdResponse {
  ok: boolean;
  chats?: Array<{ chat_id: number; type: string; title: string; username?: string }>;
  total?: number;
  error?: string;
  bot_username?: string;
  bot_name?: string;
  bot_url?: string;
}

export interface AgentConfigPayload {
  gemini_api_key: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  alert_cooldown_hours: number;
  scheduler_interval_minutes: number;
}
