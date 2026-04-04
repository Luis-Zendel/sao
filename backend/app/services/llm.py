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


async def generate_daily_summary(
    events: list[dict[str, Any]],
    date_str: str,
    confirmed_count: int = 0,
    preventive_count: int = 0,
) -> str:
    """Generate an end-of-day summary message with real vs projected breakdown."""
    api_key = os.getenv("GEMINI_API_KEY")

    if not events:
        return f"📊 Resumen {date_str}: Sin eventos de alerta registrados hoy. Operación estable."

    zones_affected = list({e["zone"] for e in events})
    critical = [e for e in events if e["risk_level"] == "critico"]
    high = [e for e in events if e["risk_level"] == "alto"]

    if not api_key:
        return (
            f"📊 RESUMEN DIARIO — {date_str}\n"
            f"Eventos totales: {len(events)} | Críticos: {len(critical)} | Altos: {len(high)}\n"
            f"Zonas afectadas: {', '.join(zones_affected)}\n"
            f"Lluvia confirmada al momento de alerta: {confirmed_count} evento(s)\n"
            f"Alertas preventivas (solo pronóstico): {preventive_count} evento(s)\n"
            f"Sistema de alertas operativo ✓"
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        events_text = "\n".join(
            [
                f"  • {e['alert_time'][:16]} — {e['zone']}: riesgo {e['risk_level']}, "
                f"{e['trigger_precipitation_mm']}mm pronosticados, "
                f"{e.get('current_precipitation_mm', 0):.1f}mm presentes al disparar, "
                f"ratio proyectado {e['projected_ratio']}"
                for e in events
            ]
        )

        prompt = f"""Genera un resumen diario operacional conciso para el equipo de Rappi Monterrey.

Fecha: {date_str}
Eventos registrados:
{events_text}

Métricas de impacto real vs proyectado:
- Alertas con lluvia confirmada al momento de dispararse: {confirmed_count}
- Alertas solo por pronóstico (lluvia aún no presente): {preventive_count}

El resumen debe:
- Máximo 8 líneas
- Incluir número de alertas por nivel de riesgo
- Mencionar las zonas más afectadas
- Incluir la sección "IMPACTO REAL VS PROYECTADO" con los conteos anteriores e interpretación breve
- Dar una valoración del día operacional
- Ser en español, tono ejecutivo

Escribe SOLO el mensaje, sin explicaciones."""

        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Error generating daily summary: {e}")
        return (
            f"📊 RESUMEN DIARIO — {date_str}\n"
            f"Eventos totales: {len(events)} | Críticos: {len(critical)} | Altos: {len(high)}\n"
            f"Zonas: {', '.join(zones_affected)}\n"
            f"Lluvia confirmada: {confirmed_count} | Solo pronóstico: {preventive_count}"
        )
