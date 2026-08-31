from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv
from celery import Celery

# Load backend/.env so Celery gets DATABASE_URL, broker URLs, etc.
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

def make_celery() -> Celery:
    broker = os.getenv("CELERY_BROKER_URL", "").strip() or "amqp://guest:guest@localhost:5672//"
    backend = os.getenv("CELERY_RESULT_BACKEND", "").strip() or "redis://localhost:6379/0"
    app = Celery("eduguard", broker=broker, backend=backend, include=["app.workers.tasks.analysis"])

    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
    )
    return app

celery_app = make_celery()
