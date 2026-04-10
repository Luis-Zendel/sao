"""
LLM service: uses Google Gemini Flash to generate operational alert messages.
Prompt is designed for Operations Managers who need actionable info in <10 seconds.
"""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

RISK_EMOJI = {
    "bajo": "🟡",
    "medio": "🟠",
    "alto": "🔴",
    "critico": "🚨",
}

RISK_LABEL = {
    "bajo": "BAJO",
    "medio": "MEDIO",
    "alto": "ALTO",
    "critico": "CRÍTICO",
}


def _build_prompt(alert: dict[str, Any]) -> str:
    zone = alert["zone"]
    risk = alert["risk_level"]
    precip = alert["trigger_precipitation_mm"]
    projected_ratio = alert["projected_ratio"]
    earnings_rec = alert["earnings_recommendation"]
    historical = alert.get("historical_context", [])
    secondary = alert.get("secondary_zones", [])
    window = alert.get("action_window_minutes", 60)
    sensitivity_tier = alert.get("sensitivity_tier", "media")

    hist_summary = ""
    if historical:
        hist_lines = []
        for h in historical[:3]:
            hist_lines.append(
                f"  • {h['date']} {h['hour']}h: {h['precipitation_mm']}mm → ratio {h['ratio']} "
                f"({h['status']}, {h['connected_rt']} RT, {h['orders']} órdenes)"
            )
        hist_summary = "\n".join(hist_lines)
    else:
        hist_summary = "  • Sin eventos históricos comparables disponibles"

    secondary_str = ", ".join(secondary) if secondary else "ninguna"

    prompt = f"""Eres el sistema de alertas operacionales de Rappi Monterrey.
Genera UN mensaje de Telegram para un Operations Manager en campo.
IMPORTANTE: El mensaje va por Telegram (texto plano, fuente proporcional — NO uses espacios para alinear).

DATOS DEL EVENTO:
- Zona: {zone}
- Nivel de riesgo: {RISK_LABEL.get(risk, risk)}
- Sensibilidad histórica de la zona: {sensitivity_tier.upper()} (frecuencia con que lluvia genera saturación)
- Precipitación esperada: {precip} mm/hr en las próximas 2 horas
- Ratio proyectado: ~{projected_ratio} (umbral de saturación: 1.8)
- Earnings actual: {earnings_rec['current_baseline_earnings']:.0f} MXN
- Earnings recomendado: {earnings_rec['recommended_earnings']:.0f} MXN (+{earnings_rec['delta']:.0f} MXN)
- Ventana de acción: {window} minutos

EVENTOS HISTÓRICOS SIMILARES:
{hist_summary}

ZONAS SECUNDARIAS A MONITOREAR: {secondary_str}

REGLAS DEL MENSAJE:
1. Máximo 6 líneas. Legible en 10 segundos.
2. Empieza con el emoji de riesgo y zona en la primera línea.
3. Incluye QUÉ se espera que pase (basado en histórico).
4. Incluye la ACCIÓN CONCRETA con número específico de earnings.
5. Incluye la VENTANA DE TIEMPO para actuar.
6. Termina con las zonas secundarias a monitorear.
7. Usa español. No uses asteriscos para negritas, usa MAYÚSCULAS para énfasis.
8. Tono: operacional, directo, sin adornos.

Escribe SOLO el mensaje de Telegram, sin explicaciones adicionales."""

    return prompt


async def generate_alert_message(alert: dict[str, Any]) -> str:
    """Generate a Telegram-ready alert message using Gemini."""
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        logger.warning("GEMINI_API_KEY not set, using fallback message generator")
        return _fallback_message(alert)

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = _build_prompt(alert)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=300,
                temperature=0.3,
            ),
        )
        message = response.text.strip()
        logger.info(f"Generated Gemini message for zone {alert['zone']} ({len(message)} chars)")
        return message

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return _fallback_message(alert)


def _fallback_message(alert: dict[str, Any]) -> str:
    """Template-based fallback when Gemini is unavailable."""
    zone = alert["zone"]
    risk = alert["risk_level"]
    precip = alert["trigger_precipitation_mm"]
    projected_ratio = alert["projected_ratio"]
    earnings_rec = alert["earnings_recommendation"]
    secondary = alert.get("secondary_zones", [])
    window = alert.get("action_window_minutes", 60)
    sensitivity_tier = alert.get("sensitivity_tier", "media")
    emoji = RISK_EMOJI.get(risk, "⚠️")
    label = RISK_LABEL.get(risk, risk)

    secondary_str = ", ".join(secondary) if secondary else "ninguna"

    return (
        f"{emoji} ALERTA {label} — {zone}\n"
        f"Sensibilidad de zona: {sensitivity_tier.upper()} | "
        f"Lluvia esperada: {precip:.1f} mm/hr en las próximas 2h\n"
        f"Ratio proyectado: ~{projected_ratio} (SATURACIÓN si supera 1.8)\n"
        f"ACCIÓN: Subir earnings de {earnings_rec['current_baseline_earnings']:.0f} "
        f"a {earnings_rec['recommended_earnings']:.0f} MXN en los próximos {window} min\n"
        f"Zonas secundarias a monitorear: {secondary_str}"
    )


async def chat_with_context(
    messages: list[dict],
    system_context: str,
    max_tokens: int = 600,
) -> str:
    """
    Multi-turn chat with Gemini using a project system context.
    messages: list of {role: "user"|"model", parts: [str], ...}
    Returns the model's text response.
    """
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        logger.warning("GEMINI_API_KEY not set, chat unavailable")
        return "El servicio de IA no está configurado. Contacta al administrador del sistema."

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            system_instruction=system_context,
        )

        # Build history for start_chat (all turns except the last one)
        history_for_chat = []
        for m in messages[:-1]:
            role = m.get("role", "user")
            if role not in ("user", "model"):
                role = "user"
            history_for_chat.append({"role": role, "parts": m["parts"]})

        # Last message is the one we send
        last_message = messages[-1]["parts"][0] if messages else ""

        chat = model.start_chat(history=history_for_chat)
        response = chat.send_message(
            last_message,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=0.4,
            ),
        )
        return response.text.strip()

    except Exception as e:
        logger.error(f"Gemini chat error: {e}")
        return "Ocurrió un error al procesar tu mensaje. Intenta de nuevo en unos momentos."


def _build_zones_snapshot_text(zones_snapshot: list[dict[str, Any]]) -> str:
    """
    Build a Telegram-friendly zone snapshot grouped by risk level.
    Zones with no rain are collapsed into a single count line.
    No fixed-width padding — Telegram renders proportional fonts.
    """
    if not zones_snapshot:
        return "(datos de zona no disponibles)"

    risk_order = {"critico": 0, "alto": 1, "medio": 2, "bajo": 3, "ninguno": 4}
    sorted_zones = sorted(zones_snapshot, key=lambda z: risk_order.get(z["risk_level"], 5))

    sections: list[str] = []
    active_zones = [z for z in sorted_zones if z["risk_level"] != "ninguno"]
    silent_zones  = [z for z in sorted_zones if z["risk_level"] == "ninguno"]

    for z in active_zones:
        emoji = RISK_EMOJI.get(z["risk_level"], "⚪")
        label = RISK_LABEL.get(z["risk_level"], z["risk_level"])
        now_mm = z["current_precipitation_mm"]
        h2_mm  = z["max_2h_precipitation_mm"]
        now_part = f"{now_mm:.1f}mm ahora" if now_mm > 0 else "sin lluvia ahora"
        sections.append(f"{emoji} {z['zone']} — {now_part}, {h2_mm:.1f}mm máx 2h [{label}]")

    if silent_zones:
        names = ", ".join(z["zone"] for z in silent_zones)
        sections.append(f"⚪ Sin lluvia ({len(silent_zones)}): {names}")

    return "\n".join(sections)


async def generate_daily_summary(
    events: list[dict[str, Any]],
    date_str: str,
    confirmed_count: int = 0,
    preventive_count: int = 0,
    zones_snapshot: list[dict[str, Any]] | None = None,
) -> str:
    """
    Generate an end-of-day summary message.
    Always includes a live zone snapshot with current precipitation, even when there are no alerts.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    zones_snapshot = zones_snapshot or []

    zones_text = _build_zones_snapshot_text(zones_snapshot)
    zones_with_rain = [z for z in zones_snapshot if z.get("current_precipitation_mm", 0) > 0]
    zones_at_risk   = [z for z in zones_snapshot if z.get("risk_level") not in ("ninguno", "bajo")]

    critical = [e for e in events if e["risk_level"] == "critico"]
    high     = [e for e in events if e["risk_level"] == "alto"]
    zones_affected = list({e["zone"] for e in events})

    if not api_key:
        return _fallback_daily_summary(
            date_str, events, critical, high, zones_affected,
            confirmed_count, preventive_count, zones_text,
            len(zones_with_rain), len(zones_at_risk),
        )

    events_text = (
        "\n".join(
            f"• {e['alert_time'][11:16]} {e['zone']}: {e['risk_level'].upper()}, "
            f"{e['trigger_precipitation_mm']}mm pron, "
            f"{e.get('current_precipitation_mm', 0):.1f}mm presentes"
            for e in events
        )
        if events
        else "Sin alertas disparadas hoy"
    )

    prompt = f"""Eres el sistema de alertas de Rappi Monterrey. Genera el resumen diario para el equipo de operaciones.

IMPORTANTE: Este mensaje se enviará por TELEGRAM (texto plano, fuente proporcional).
- NO uses espacios para alinear columnas — no se verá bien.
- Usa saltos de línea y emojis para estructurar el contenido.
- Agrupa la información en secciones cortas separadas por una línea en blanco.
- Máximo 25 líneas en total.

DATOS DEL DÍA — {date_str}
Alertas disparadas: {len(events)} ({len(critical)} críticas, {len(high)} altas)
Lluvia confirmada al dispararse: {confirmed_count} | Solo por pronóstico: {preventive_count}
Zonas afectadas: {', '.join(zones_affected) if zones_affected else 'ninguna'}

DETALLE DE ALERTAS:
{events_text}

ESTADO DE ZONAS AHORA (agrupado por riesgo, zonas sin lluvia al final en una sola línea):
{zones_text}

Zonas con lluvia activa: {len(zones_with_rain)} | En riesgo medio/alto/crítico: {len(zones_at_risk)}

ESTRUCTURA PEDIDA:
1. Primera línea: 📊 RESUMEN DIARIO — [fecha] — [valoración breve del día en 3-4 palabras]
2. Sección ALERTAS DEL DÍA (si hubo alertas; si no, una sola línea indicando operación limpia)
3. Sección ESTADO DE ZONAS con las zonas con lluvia o en riesgo; las sin lluvia en 1 línea
4. Sección IMPACTO con lluvia confirmada vs pronóstico e interpretación en 1 oración
5. Línea de cierre con valoración ejecutiva del día

Escribe SOLO el mensaje, sin explicaciones."""

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=700,
                temperature=0.3,
            ),
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Error generating daily summary: {e}")
        return _fallback_daily_summary(
            date_str, events, critical, high, zones_affected,
            confirmed_count, preventive_count, zones_text,
            len(zones_with_rain), len(zones_at_risk),
        )


def _fallback_daily_summary(
    date_str: str,
    events: list[dict],
    critical: list[dict],
    high: list[dict],
    zones_affected: list[str],
    confirmed_count: int,
    preventive_count: int,
    zones_text: str,
    zones_with_rain_count: int,
    zones_at_risk_count: int,
) -> str:
    alert_section = (
        "\n".join(
            f"• {e['alert_time'][11:16]} {e['zone']}: {RISK_LABEL.get(e['risk_level'], e['risk_level'])}, "
            f"{e['trigger_precipitation_mm']}mm pronosticados"
            for e in events
        )
        if events
        else "Sin alertas disparadas hoy ✅"
    )

    parts = [
        f"📊 RESUMEN DIARIO — {date_str}",
        "",
        "ALERTAS DEL DÍA",
        f"Total: {len(events)} | Críticas: {len(critical)} | Altas: {len(high)}",
        alert_section,
        "",
        "ESTADO DE ZONAS",
        zones_text,
        "",
        "IMPACTO",
        f"Lluvia confirmada al disparar: {confirmed_count} | Solo pronóstico: {preventive_count}",
        f"Zonas con lluvia activa: {zones_with_rain_count} | En riesgo: {zones_at_risk_count}",
        "",
        "Sistema de alertas Rappi Ops operativo ✅",
    ]
    return "\n".join(parts)


async def generate_evaluation_summary(zones_data: list[dict[str, Any]], timestamp: str) -> str:
    """
    Generate a single holistic Telegram summary for all zones.
    Covers current hour + next 2h precipitation, risk level per zone,
    and key analysis points.
    """
    api_key = os.getenv("GEMINI_API_KEY")

    risk_order = {"critico": 0, "alto": 1, "medio": 2, "bajo": 3, "ninguno": 4}
    sorted_zones = sorted(zones_data, key=lambda z: risk_order.get(z["risk_level"], 5))

    risk_counts = {"critico": 0, "alto": 0, "medio": 0, "bajo": 0, "ninguno": 0}
    for z in zones_data:
        risk_counts[z["risk_level"]] = risk_counts.get(z["risk_level"], 0) + 1

    # Build a rich data block for Gemini (internal use, not shown to user)
    zones_data_text = "\n".join([
        f"• {z['zone']}: {RISK_LABEL.get(z['risk_level'], z['risk_level'])} | "
        f"{z['current_precipitation_mm']}mm ahora / {z['max_2h_precipitation_mm']}mm máx 2h | "
        f"umbral {z['zone_threshold_mm']}mm | rec {z['recommended_earnings']:.0f}MXN (+{z['earnings_delta']:.0f})"
        for z in sorted_zones
    ])

    if not api_key:
        return _fallback_evaluation_summary(zones_data, timestamp, risk_counts)

    prompt = f"""Eres el sistema de alertas operacionales de Rappi Monterrey.
Genera UN mensaje de Telegram con la evaluación completa de todas las zonas operativas.

IMPORTANTE: El mensaje va por TELEGRAM (texto plano, fuente proporcional).
- NO uses espacios para alinear columnas.
- Usa saltos de línea y emojis para estructurar.
- Agrupa zonas sin lluvia en UNA SOLA línea al final ("⚪ Sin actividad: Zona1, Zona2...").
- Máximo 22 líneas.

MOMENTO DE EVALUACIÓN: {timestamp}

DATOS POR ZONA (mayor a menor riesgo):
{zones_data_text}

RIESGO GLOBAL:
🚨 Crítico: {risk_counts['critico']} | 🔴 Alto: {risk_counts['alto']} | 🟠 Medio: {risk_counts['medio']} | 🟡 Bajo: {risk_counts['bajo']} | ⚪ Sin lluvia: {risk_counts['ninguno']}

ESTRUCTURA PEDIDA:
1. Primera línea: 📋 EVALUACIÓN — [timestamp] — [estado general en 3 palabras]
2. Sección ZONAS EN RIESGO: una línea por zona con emoji + nombre + lluvia + earnings recomendado
3. Zonas con riesgo BAJO en una línea resumida
4. Zonas SIN lluvia en una sola línea al final
5. Sección PUNTOS CLAVE: 2-3 observaciones relevantes (no más)
6. No uses asteriscos; usa MAYÚSCULAS para énfasis

Escribe SOLO el mensaje, sin explicaciones."""

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=600,
                temperature=0.3,
            ),
        )
        message = response.text.strip()
        logger.info(f"Generated evaluation summary ({len(message)} chars, {len(zones_data)} zones)")
        return message

    except Exception as e:
        logger.error(f"Gemini evaluation summary error: {e}")
        return _fallback_evaluation_summary(zones_data, timestamp, risk_counts)


def _fallback_evaluation_summary(
    zones_data: list[dict[str, Any]],
    timestamp: str,
    risk_counts: dict[str, int],
) -> str:
    """Template-based fallback for evaluation summary when Gemini is unavailable."""
    risk_order = {"critico": 0, "alto": 1, "medio": 2, "bajo": 3, "ninguno": 4}
    sorted_zones = sorted(zones_data, key=lambda x: risk_order.get(x["risk_level"], 5))

    lines = [
        f"📋 EVALUACIÓN — {timestamp}",
        f"🚨 {risk_counts['critico']} crítico  🔴 {risk_counts['alto']} alto  "
        f"🟠 {risk_counts['medio']} medio  🟡 {risk_counts['bajo']} bajo  ⚪ {risk_counts['ninguno']} sin lluvia",
        "",
    ]

    at_risk = [z for z in sorted_zones if z["risk_level"] not in ("ninguno", "bajo")]
    low_risk = [z for z in sorted_zones if z["risk_level"] == "bajo"]
    silent   = [z for z in sorted_zones if z["risk_level"] == "ninguno"]

    if at_risk:
        lines.append("ZONAS EN RIESGO")
        for z in at_risk:
            emoji = RISK_EMOJI.get(z["risk_level"], "⚪")
            lines.append(
                f"{emoji} {z['zone']} — {z['max_2h_precipitation_mm']:.1f}mm máx 2h"
                f" → {z['recommended_earnings']:.0f} MXN (+{z['earnings_delta']:.0f})"
            )
        lines.append("")

    if low_risk:
        names = ", ".join(z["zone"] for z in low_risk)
        lines.append(f"🟡 Bajo riesgo: {names}")

    if silent:
        names = ", ".join(z["zone"] for z in silent)
        lines.append(f"⚪ Sin actividad: {names}")

    lines.append("")
    lines.append("Sistema de alertas Rappi Ops activo ✅")
    return "\n".join(lines)
