# Rappi Ops — Sistema de Alertas Operacionales con AI

Sistema de monitoreo proactivo para la operación de Rappi Monterrey. Detecta condiciones de saturación antes de que ocurran y envía alertas accionables al equipo de Operations vía Telegram.

## Arquitectura

```
Open-Meteo (clima) → Motor de Alertas → Gemini AI → Telegram
        ↑                    ↑
   ZONE_INFO.csv        RAW_DATA.csv
   (centroides)         (histórico)
```

**Stack:**
- **Frontend**: Next.js 14 + Tailwind CSS + Recharts
- **Backend**: FastAPI (Python 3.11) + Pandas + Shapely
- **LLM**: Google Gemini Flash
- **Weather**: Open-Meteo (gratuito, sin API key)
- **Notificaciones**: Telegram Bot API
- **Infraestructura**: Docker + docker-compose

## Prerequisitos

- Docker Desktop instalado y corriendo
- Bot de Telegram creado (ver sección de configuración)
- API key de Google Gemini (gratuita en [aistudio.google.com](https://aistudio.google.com))

## Configuración

### 1. Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
GEMINI_API_KEY=tu_gemini_key
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID=tu_chat_id
```

### 2. Configurar bot de Telegram

1. Abre Telegram y busca `@BotFather`
2. Escribe `/newbot` y sigue las instrucciones
3. Copia el token y ponlo en `TELEGRAM_BOT_TOKEN`
4. Para obtener el `TELEGRAM_CHAT_ID`:
   - Añade el bot al canal/grupo donde quieres recibir alertas
   - Envía un mensaje al bot
   - Visita: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
   - Copia el valor de `"chat":{"id":...}`

### 3. Obtener Gemini API Key

1. Ve a [aistudio.google.com](https://aistudio.google.com)
2. Crea una API key (tier gratuito: 1500 req/día con Gemini Flash)
3. Pon la key en `GEMINI_API_KEY`

## Ejecución

### Con Docker (recomendado)

```bash
# Construir y levantar todos los servicios
docker-compose up --build

# Frontend disponible en: http://localhost:3000
# Backend API disponible en: http://localhost:8000
# Documentación API: http://localhost:8000/docs
```

### Sin Docker (desarrollo local)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp ../.env.example ../.env  # edita con tus keys
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

## Módulos

### Módulo 1 — Diagnóstico Operacional (`/diagnostico`)
Análisis histórico de 30 días respondiendo 5 preguntas de negocio:
- P1: Horas y zonas con saturación crítica
- P2: Correlación precipitación → ratio
- P3: Zonas más vulnerables a la lluvia
- P4: Calibración de earnings a lo largo del mes
- P5: Relación earnings ↔ saturación

### Módulo 2 — Motor de Alertas (`/alertas`)
- Integración con Open-Meteo para forecast horario de precipitación
- Umbrales diferenciados por zona (calibrados con datos históricos)
- Recomendaciones de earnings específicas por zona
- Deduplicación: no re-alerta por la misma zona en < 2 horas

### Módulo 3 — Agente AI (`/agente`)
- Gemini Flash genera mensajes accionables en lenguaje natural
- Mensajes enviados automáticamente a Telegram cada 30 min
- Memoria del agente: no reenvía alertas duplicadas
- Resumen diario opcional al final del día

## Costo Estimado de APIs

| API | Uso estimado | Costo |
|-----|-------------|-------|
| Open-Meteo | 14 zonas × 48 req/día = 672 req/día | **Gratuito** |
| Gemini Flash | ~5-10 alertas/día × $0.00015/1K tokens | ~$0.001/día |
| Telegram Bot API | Ilimitado en uso normal | **Gratuito** |

**Costo total estimado**: < $0.03/día en operación normal.

## Estructura del Proyecto

```
rappi-ops/
├── frontend/          # Next.js 14 + Tailwind
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/   # analytics, alerts, agent
│   │   └── services/  # data_loader, weather, alert_engine, llm, telegram
│   └── data/          # RAW_DATA.csv, ZONE_INFO.csv, ZONE_POLYGONS.csv
├── docker-compose.yml
├── .env.example
└── README.md
```

## Preguntas de Arquitectura (Q&A)

**¿Cómo maneja falsos positivos?**
El motor usa un umbral de precipitación calibrado con el percentil 75 de eventos históricos de saturación, no el mínimo. Además, el mensaje de Telegram indica explícitamente el nivel de confianza basado en cuántos eventos históricos similares confirmaron saturación.

**¿Cómo evitas alert fatigue?**
- Cooldown de 2h por zona (configurable)
- Niveles diferenciados: bajo/medio/alto/crítico (solo alto/crítico envía Telegram)
- Resumen diario en lugar de alertas individuales para eventos de baja intensidad

**¿Cómo escalarías a otras ciudades?**
1. `ZONE_INFO.csv` y `ZONE_POLYGONS.csv` son el único cambio de datos necesario
2. Los umbrales del motor se recalibran automáticamente con el histórico de la nueva ciudad
3. El scheduler corre una instancia por ciudad; con Kubernetes se puede escalar horizontalmente
4. Open-Meteo cubre globalmente sin límites de ciudad
