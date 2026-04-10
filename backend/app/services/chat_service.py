"""
Bidirectional Telegram chat service.
Polls incoming messages from the configured Telegram chat, processes them
through Gemini AI with full project context, executes data-fetch actions
the AI requests, and sends the final reply back to Telegram.
"""

import json
import logging
import os
import re
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
_conversation_history: list[dict[str, Any]] = []
_last_update_id: int = 0
MAX_HISTORY_TURNS = 50  # keep last 50 turns to avoid Gemini context overflow


# ---------------------------------------------------------------------------
# Project system context
# ---------------------------------------------------------------------------
def get_project_context() -> str:
    """Build the Gemini system prompt with full project context."""
    from .data_loader import load_zone_info

    zone_info = load_zone_info()
    zone_list = "\n".join(
        f"  • {row['ZONE']} — {row.get('DESCRIPTION', 'sin descripción')}"
        for _, row in zone_info.iterrows()
    )

    return f"""Eres el asistente operacional de Rappi Monterrey. Tu rol es responder preguntas del equipo de operaciones sobre el estado de la plataforma, zonas, earnings y métricas clave.

== CONCEPTOS CLAVE ==

RATIO = ORDERS / CONNECTED_RT (repartidores conectados en tiempo real)
  • < 0.5  → sobre_oferta   (demasiados repartidores, pocos pedidos — earnings puede bajar)
  • 0.5–0.9 → bajo           (demanda baja)
  • 0.9–1.2 → saludable      (operación equilibrada)
  • 1.2–1.8 → elevado        (demanda alta, vigilar)
  • > 1.8   → saturación     (muy pocos repartidores — riesgo de mala experiencia al cliente)

EARNINGS = pago en MXN que recibe el repartidor por entrega. Es la palanca principal para atraer o reducir oferta de repartidores.

MULTIPLICADOR DE EARNINGS POR PRECIPITACIÓN:
  Cuando llueve, la demanda sube y los repartidores tienden a desconectarse → el ratio sube hacia saturación.
  Para contrarrestarlo se sube el earnings, calculado por zona mediante regresión histórica:
    earnings_recomendado = baseline_earnings + earnings_slope × precipitación_mm
  Cada zona tiene sus propios valores de baseline_earnings y earnings_slope derivados de datos históricos.

ZONAS DISPONIBLES EN MONTERREY:
{zone_list}

== ACCIONES DISPONIBLES ==
Si necesitas datos en tiempo real para responder, debes responder ÚNICAMENTE con este JSON (sin texto adicional antes ni después):
  {{"message": "<texto breve de espera para el usuario>", "action": ["accion1(args)", "accion2(args)"]}}

Acciones que puedes solicitar:
  • getEarning("ZONA")   — trae baseline_earnings, slope, precipitación actual del cache y earnings recomendado YA CALCULADO para esa zona
  • getWeather()         — precipitación actual y pronóstico 2h para TODAS las zonas, con nivel de riesgo y earnings recomendado
  • getWeather("ZONA")   — igual pero solo para una zona
  • getZones()           — lista todas las zonas con sus descripciones
  • getSnapshot()        — estado operacional actual de todas las zonas: RATIO, STATUS, EARNINGS, CONNECTED_RT, ORDERS

Reglas de las acciones:
  - Usa el nombre de zona EXACTO como aparece en la lista anterior (respeta mayúsculas y espacios).
  - Puedes solicitar varias acciones al mismo tiempo en el array, por ejemplo: ["getEarning("Centro")", "getWeather("Centro")"].
  - Cuando el sistema te devuelva los datos ([DATOS ...]), usa ÚNICAMENTE esos datos para tu respuesta — NO pidas más información al usuario.
  - NUNCA le pidas al usuario valores numéricos (mm de lluvia, ratio, etc.); siempre obtenlos con las acciones anteriores.

== REGLAS DE RESPUESTA ==
  1. Responde siempre en español, tono operacional y conciso (máx 10 líneas para Telegram).
  2. Si el usuario pregunta algo que no puedes responder ni con las acciones disponibles, díselo claramente.
  3. Si recibes datos del sistema ([DATOS ...]), úsalos para construir tu respuesta final en TEXTO PLANO — NO respondas con JSON en ese caso.
  4. No uses asteriscos para negritas; usa MAYÚSCULAS para énfasis si es necesario.
  5. CRÍTICO: nunca envíes JSON como respuesta final al usuario. El JSON solo es válido como primer mensaje cuando solicitas acciones.
"""


# ---------------------------------------------------------------------------
# Action executor
# ---------------------------------------------------------------------------
def _parse_action_calls(actions: list[str]) -> list[tuple[str, list[str]]]:
    """Parse action strings like getEarning("Centro") → [("getEarning", ["Centro"])]."""
    parsed = []
    for action in actions:
        match = re.match(r'(\w+)\s*\((.*?)\)$', action.strip(), re.DOTALL)
        if match:
            fn_name = match.group(1)
            raw_args = match.group(2).strip()
            args = [a.strip().strip('"\'') for a in raw_args.split(",") if a.strip()] if raw_args else []
            parsed.append((fn_name, args))
        else:
            parsed.append(("__unknown__", [action]))
    return parsed


def _get_earning_by_zone(zone: str) -> str:
    from .alert_engine import get_zone_thresholds
    from .weather import _forecast_cache

    thresholds = get_zone_thresholds()

    # Case-insensitive zone lookup
    matched_key = next(
        (k for k in thresholds if k.lower() == zone.lower()),
        None,
    )
    if not matched_key:
        available = ", ".join(thresholds.keys())
        return f'[ERROR getEarning]: Zona "{zone}" no encontrada. Zonas disponibles: {available}'

    t = thresholds[matched_key]

    # Pull current precipitation from weather cache if available
    cached = _forecast_cache.get("data") or []
    zone_weather = next((z for z in cached if z.get("zone") == matched_key), None)
    current_mm = zone_weather["current_precipitation_mm"] if zone_weather else 0.0
    max_2h_mm  = zone_weather["max_2h_precipitation_mm"]  if zone_weather else 0.0
    precip_for_calc = max(current_mm, max_2h_mm)
    earnings_rec = round(t["baseline_earnings"] + t["earnings_slope"] * precip_for_calc, 0)

    weather_line = (
        f'  precipitación ACTUAL: {current_mm} mm | máx próximas 2h: {max_2h_mm} mm\n'
        f'  earnings RECOMENDADO ahora: {earnings_rec:.0f} MXN '
        f'(= {t["baseline_earnings"]} + {t["earnings_slope"]} × {precip_for_calc} mm)'
        if zone_weather
        else '  precipitación actual: sin datos de weather cache (usa getWeather() para obtenerlos)'
    )

    return (
        f'[DATOS getEarning("{matched_key}")]:\n'
        f'  baseline_earnings:  {t["baseline_earnings"]} MXN\n'
        f'  earnings_slope:     {t["earnings_slope"]} MXN/mm\n'
        f'  precip_threshold:   {t["precip_threshold"]} mm\n'
        f'  vulnerability:      {t["vulnerability_pct"]}%\n'
        f'  baseline_ratio:     {t["baseline_ratio"]}\n'
        f'{weather_line}'
    )


def _get_zones() -> str:
    from .data_loader import load_zone_info

    zone_info = load_zone_info()
    lines = [f'[DATOS getZones()] — {len(zone_info)} zonas:']
    for _, row in zone_info.iterrows():
        desc = row.get("DESCRIPTION", "sin descripción")
        lines.append(f'  • {row["ZONE"]} — {desc}')
    return "\n".join(lines)


def _get_weather(zone: str | None = None) -> str:
    """Return current precipitation from weather cache for one or all zones."""
    from .weather import _forecast_cache
    from .alert_engine import get_zone_thresholds, _get_risk_level

    cached: list[dict] = _forecast_cache.get("data") or []
    fetched_at = _forecast_cache.get("fetched_at")

    if not cached:
        return "[DATOS getWeather()]: Sin datos en cache. El weather se actualiza cada 15 min."

    age_str = ""
    if fetched_at:
        age_min = int((datetime.now() - fetched_at).total_seconds() / 60)
        age_str = f" (actualizados hace {age_min} min)"

    thresholds = get_zone_thresholds()

    if zone:
        matched = next(
            (z for z in cached if z.get("zone", "").lower() == zone.lower()),
            None,
        )
        if not matched:
            available = ", ".join(z["zone"] for z in cached)
            return f'[ERROR getWeather]: Zona "{zone}" no encontrada. Disponibles: {available}'

        z = matched
        t = thresholds.get(z["zone"], {})
        risk = _get_risk_level(z["zone"], max(z["current_precipitation_mm"], z["max_2h_precipitation_mm"]))
        earnings_rec = round(
            t.get("baseline_earnings", 55.0) + t.get("earnings_slope", 2.0) * max(z["current_precipitation_mm"], z["max_2h_precipitation_mm"]), 0
        )
        hourly = z.get("hourly_forecast", [])[:3]
        hourly_str = " | ".join(f'{h["hours_ahead"]}h:{h["precipitation_mm"]}mm' for h in hourly)
        return (
            f'[DATOS getWeather("{z["zone"]}")]:{age_str}\n'
            f'  Lluvia ahora:       {z["current_precipitation_mm"]} mm\n'
            f'  Máx próximas 2h:    {z["max_2h_precipitation_mm"]} mm\n'
            f'  Máx próximas 3h:    {z["max_3h_precipitation_mm"]} mm\n'
            f'  Pronóstico hora a hora: {hourly_str}\n'
            f'  Nivel de riesgo:    {risk.upper()}\n'
            f'  Earnings recomendado: {earnings_rec:.0f} MXN\n'
            f'  Error de fetch:     {z.get("error") or "ninguno"}'
        )

    # All zones
    lines = [f"[DATOS getWeather()]{age_str} — {len(cached)} zonas:"]
    for z in sorted(cached, key=lambda x: x["max_2h_precipitation_mm"], reverse=True):
        t = thresholds.get(z["zone"], {})
        risk = _get_risk_level(z["zone"], max(z["current_precipitation_mm"], z["max_2h_precipitation_mm"]))
        earnings_rec = round(
            t.get("baseline_earnings", 55.0) + t.get("earnings_slope", 2.0) * max(z["current_precipitation_mm"], z["max_2h_precipitation_mm"]), 0
        )
        rain_flag = " 🌧" if z["max_2h_precipitation_mm"] > 0 else ""
        lines.append(
            f'  {z["zone"]:<22}{rain_flag}  ahora={z["current_precipitation_mm"]}mm | '
            f'2h={z["max_2h_precipitation_mm"]}mm | riesgo={risk} | rec={earnings_rec:.0f}MXN'
        )
    return "\n".join(lines)


def _get_snapshot() -> str:
    from .analytics import get_current_snapshot

    snap = get_current_snapshot()
    dt = snap.get("snapshot_datetime", "desconocido")
    summary = snap.get("summary", {})
    lines = [
        f'[DATOS getSnapshot()] — {dt}',
        f'  Resumen: saturación={summary.get("saturacion", 0)} | '
        f'elevado={summary.get("elevado", 0)} | '
        f'saludable={summary.get("saludable", 0)} | '
        f'bajo={summary.get("bajo", 0)} | '
        f'sobre_oferta={summary.get("sobre_oferta", 0)}',
        '',
        '  Detalle por zona:',
    ]
    for z in snap.get("zones", []):
        rain_str = f', lluvia={z["precipitation_mm"]}mm' if z["precipitation_mm"] > 0 else ""
        lines.append(
            f'    {z["zone"]}: ratio={z["ratio"]} ({z["status"]}), '
            f'earnings={z["earnings"]} MXN, '
            f'RT={z["connected_rt"]}, órdenes={z["orders"]}{rain_str}'
        )
    return "\n".join(lines)


def process_actions(actions: list[str]) -> str:
    """Execute all requested actions and return combined result block."""
    results = []
    for fn_name, args in _parse_action_calls(actions):
        if fn_name == "getEarning":
            zone = args[0] if args else ""
            results.append(_get_earning_by_zone(zone))
        elif fn_name == "getZones":
            results.append(_get_zones())
        elif fn_name == "getSnapshot":
            results.append(_get_snapshot())
        elif fn_name == "getWeather":
            zone = args[0] if args else None
            results.append(_get_weather(zone))
        else:
            results.append(
                f'[ERROR]: Acción "{fn_name}" no reconocida. '
                f'Acciones disponibles: getEarning("ZONA"), getZones(), getSnapshot(), getWeather(), getWeather("ZONA")'
            )
    return "\n\n".join(results)


# ---------------------------------------------------------------------------
# Main chat orchestrator
# ---------------------------------------------------------------------------
async def handle_user_message(
    text: str,
    from_user: str = "Usuario",
    reply_chat_id: str | None = None,
) -> None:
    """
    Full pipeline:
    1. Append user message to history
    2. Call Gemini with project context
    3. If Gemini requests actions → execute them, append results, call Gemini again
    4. Send final response via Telegram (to reply_chat_id or configured TELEGRAM_CHAT_ID)
    """
    global _conversation_history

    from .llm import chat_with_context
    from .telegram_bot import send_message

    logger.info(f"Chat message from {from_user}: {text[:80]}")

    # Append user message to history
    _conversation_history.append({
        "role": "user",
        "parts": [text],
        "from_user": from_user,
        "timestamp": datetime.now().isoformat(),
    })

    system_ctx = get_project_context()

    async def _reply(text_to_send: str) -> None:
        """Send a reply to the originating chat or the configured chat."""
        await send_message(text_to_send, chat_id_override=reply_chat_id)

    try:
        # First Gemini call
        raw_response = await chat_with_context(_conversation_history, system_ctx)

        # Try to detect if Gemini returned an action JSON
        action_data = _try_parse_action(raw_response)

        if action_data and action_data.get("action"):
            # Acknowledge the user while we fetch data (only send if it's a plain text message)
            ack_msg = action_data.get("message", "")
            if ack_msg and not _looks_like_raw_action_json(ack_msg):
                await _reply(ack_msg)

            # Execute actions
            tool_result = process_actions(action_data["action"])
            logger.info(f"Action results: {tool_result[:200]}")

            # Inject tool results into history and call Gemini again
            _conversation_history.append({
                "role": "user",
                "parts": [tool_result],
                "timestamp": datetime.now().isoformat(),
                "_is_tool_result": True,
            })

            final_response = await chat_with_context(_conversation_history, system_ctx)
        else:
            final_response = raw_response

        # Safety guard: if final_response still looks like a raw action JSON,
        # execute its actions and try once more rather than sending JSON to the user.
        if _looks_like_raw_action_json(final_response):
            logger.warning("Final response looks like raw JSON action — attempting recovery")
            recovered_action = _try_parse_action(final_response)
            if recovered_action and recovered_action.get("action"):
                tool_result = process_actions(recovered_action["action"])
                _conversation_history.append({
                    "role": "user",
                    "parts": [tool_result],
                    "timestamp": datetime.now().isoformat(),
                    "_is_tool_result": True,
                })
                final_response = await chat_with_context(_conversation_history, system_ctx)
            else:
                final_response = "Lo siento, no pude procesar tu solicitud en este momento. Intenta de nuevo."

        # Send final response to Telegram
        await _reply(final_response)

        # Append assistant response to history
        _conversation_history.append({
            "role": "model",
            "parts": [final_response],
            "timestamp": datetime.now().isoformat(),
        })

    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        await _reply("Lo siento, ocurrió un error procesando tu mensaje. Intenta de nuevo.")

    # Trim history to avoid Gemini context overflow (keep last N turns)
    if len(_conversation_history) > MAX_HISTORY_TURNS * 2:
        _conversation_history = _conversation_history[-(MAX_HISTORY_TURNS * 2):]


def _try_parse_action(text: str) -> dict | None:
    """
    Try to extract a JSON action block from Gemini response.
    Handles: plain JSON, markdown code-fenced JSON, and JSON embedded in surrounding text.
    """
    text = text.strip()

    # 1. Strip markdown code fences
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()

    # 2. Try direct parse
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "action" in data:
            return data
    except (json.JSONDecodeError, ValueError):
        pass

    # 3. Try to find a JSON object embedded anywhere in the text
    match = re.search(r'\{[^{}]*"action"\s*:\s*\[.*?\][^{}]*\}', text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, dict) and "action" in data:
                return data
        except (json.JSONDecodeError, ValueError):
            pass

    return None


def _looks_like_raw_action_json(text: str) -> bool:
    """Return True if the text looks like an unsent JSON action block (should not reach user)."""
    stripped = text.strip()
    return bool(
        re.match(r'^\{.*"action"\s*:', stripped, re.DOTALL)
        or re.match(r'^```[a-z]*\s*\{.*"action"\s*:', stripped, re.DOTALL)
    )


# ---------------------------------------------------------------------------
# Telegram polling
# ---------------------------------------------------------------------------
async def poll_new_messages() -> None:
    """
    Poll Telegram getUpdates for new messages.
    If TELEGRAM_CHAT_ID is set, only handles messages from that chat.
    Otherwise handles messages from any chat (useful for first-time setup).
    Called by the APScheduler every 10 seconds.
    """
    global _last_update_id

    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return

    # Optional filter — if not set, accept messages from any chat
    allowed_chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip() or None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.telegram.org/bot{token}/getUpdates",
                params={
                    "offset": _last_update_id + 1,
                    "limit": 50,
                    "timeout": 0,
                    "allowed_updates": ["message"],
                },
            )
            data = resp.json()

        if not data.get("ok"):
            logger.warning(f"Telegram getUpdates error: {data.get('description')}")
            return

        updates = data.get("result", [])
        if not updates:
            return

        # Advance offset regardless of processing outcome
        _last_update_id = updates[-1]["update_id"]

        for update in updates:
            msg = update.get("message")
            if not msg:
                continue

            msg_chat_id = str(msg["chat"]["id"])

            # Filter by configured chat if set
            if allowed_chat_id and msg_chat_id != str(allowed_chat_id):
                continue

            # Ignore bot's own messages
            if msg.get("from", {}).get("is_bot"):
                continue

            text = msg.get("text", "").strip()
            if not text:
                continue

            from_user = (
                msg.get("from", {}).get("first_name")
                or msg.get("from", {}).get("username")
                or "Usuario"
            )

            # Reply directly to the chat the message came from
            await handle_user_message(text, from_user, reply_chat_id=msg_chat_id)

    except Exception as e:
        logger.error(f"Error polling Telegram messages: {e}")


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------
def get_chat_history() -> list[dict[str, Any]]:
    return list(_conversation_history)


def clear_chat_history() -> None:
    global _conversation_history
    _conversation_history = []
    logger.info("Chat history cleared")
