import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: warm up data cache and start scheduler."""
    from .services.data_loader import load_raw_data, load_zone_info, load_zone_polygons
    from .services.alert_engine import get_zone_thresholds
    from .services.agent import set_agent_running

    logger.info("Starting Rappi Ops backend...")

    # Pre-load and cache data
    load_raw_data()
    load_zone_info()
    load_zone_polygons()
    get_zone_thresholds()
    logger.info("Data cache warmed up ✓")

    # Start APScheduler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from .services.agent import run_agent_cycle, send_daily_summary

    scheduler_interval = int(os.getenv("SCHEDULER_INTERVAL_MINUTES", 30))

    scheduler = AsyncIOScheduler(timezone="America/Monterrey")

    # Main alert cycle
    scheduler.add_job(
        run_agent_cycle,
        "interval",
        minutes=scheduler_interval,
        id="alert_cycle",
        name="Alert Engine Cycle",
        max_instances=1,
    )

    # Daily summary at 21:00 Monterrey time
    scheduler.add_job(
        send_daily_summary,
        CronTrigger(hour=21, minute=0, timezone="America/Monterrey"),
        id="daily_summary",
        name="Daily Summary",
    )

    # Bidirectional chat: poll incoming Telegram messages every 10 seconds
    from .services.chat_service import poll_new_messages

    scheduler.add_job(
        poll_new_messages,
        "interval",
        seconds=10,
        id="chat_polling",
        name="Telegram Chat Polling",
        max_instances=1,
    )

    scheduler.start()
    set_agent_running(True)
    logger.info(f"Scheduler started: alert cycle every {scheduler_interval} min ✓")

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    set_agent_running(False)
    logger.info("Scheduler stopped")


app = FastAPI(
    title="Rappi Ops — Sistema de Alertas Operacionales",
    description="Monitoreo proactivo de la operación de delivery en Monterrey",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from .routers import analytics, alerts, agent

app.include_router(analytics.router)
app.include_router(alerts.router)
app.include_router(agent.router)


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/")
def root():
    return {
        "service": "Rappi Ops Alert System",
        "version": "1.0.0",
        "docs": "/docs",
    }
