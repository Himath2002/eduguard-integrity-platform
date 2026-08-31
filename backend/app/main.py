from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy import inspect, text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pathlib import Path
from dotenv import load_dotenv

# Load .env BEFORE importing anything that reads env vars (DB session etc.)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Import models so SQLAlchemy knows them before create_all()
from app import models  # noqa: F401

from app.db.session import engine
from app.db.base import Base

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize the database schema before serving requests."""
    Base.metadata.create_all(bind=engine)
    _ensure_user_columns()
    _ensure_assignment_columns()
    _ensure_submission_columns()
    _ensure_mark_annotation_columns()
    _ensure_performance_indexes()
    yield


app = FastAPI(
    title="EduGuard API",
    summary="Academic integrity, assessment, and feedback workflows",
    version="0.1.0",
    lifespan=lifespan,
)

# Compress larger JSON responses so dashboards/reports/classes load faster over localhost and deployed networks.
app.add_middleware(GZipMiddleware, minimum_size=1024)

configured_origins = [
    value.strip()
    for value in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if value.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _ensure_user_columns() -> None:
    inspector = inspect(engine)
    try:
        existing = {col["name"] for col in inspector.get_columns("users")}
    except Exception:
        return

    statements = []
    if "auth_provider" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'")
    if "google_sub" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN google_sub TEXT")

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

    inspector = inspect(engine)
    try:
        indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    except Exception:
        return

    if "ix_users_google_sub_unique" not in indexes:
        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX ix_users_google_sub_unique ON users (google_sub)"))



def _ensure_assignment_columns() -> None:
    inspector = inspect(engine)
    try:
        existing = {col["name"] for col in inspector.get_columns("assignments")}
    except Exception:
        return

    if "student_report_visible" in existing:
        return

    default_literal = "FALSE" if engine.dialect.name in {"postgresql", "sqlite"} else "0"
    with engine.begin() as conn:
        conn.execute(
            text(
                f"ALTER TABLE assignments ADD COLUMN student_report_visible BOOLEAN NOT NULL DEFAULT {default_literal}"
            )
        )





def _ensure_submission_columns() -> None:
    inspector = inspect(engine)
    try:
        existing = {col["name"] for col in inspector.get_columns("submissions")}
    except Exception:
        return

    statements = []
    if "storage_provider" not in existing:
        statements.append("ALTER TABLE submissions ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'local'")
    if "s3_bucket" not in existing:
        statements.append("ALTER TABLE submissions ADD COLUMN s3_bucket TEXT")
    if "s3_key" not in existing:
        statements.append("ALTER TABLE submissions ADD COLUMN s3_key TEXT")
    if "mime_type" not in existing:
        statements.append("ALTER TABLE submissions ADD COLUMN mime_type TEXT")
    if "sha256_checksum" not in existing:
        statements.append("ALTER TABLE submissions ADD COLUMN sha256_checksum TEXT")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))

def _ensure_mark_annotation_columns() -> None:
    inspector = inspect(engine)
    try:
        existing = {col["name"] for col in inspector.get_columns("mark_annotations")}
    except Exception:
        return

    with engine.begin() as conn:
        if "conversation_key" not in existing:
            conn.execute(text("ALTER TABLE mark_annotations ADD COLUMN conversation_key TEXT"))
        rows = conn.execute(text("SELECT id, conversation_key FROM mark_annotations")).fetchall()
        for row in rows:
            if row[1]:
                continue
            import uuid
            conn.execute(text("UPDATE mark_annotations SET conversation_key = :key WHERE id = :id"), {"key": uuid.uuid4().hex, "id": int(row[0])})


def _ensure_performance_indexes() -> None:
    """Create safe read-path indexes for dashboard, report, assignment and marking views."""
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_submissions_student_assignment_status ON submissions (student_id, assignment_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_submissions_student_updated ON submissions (student_id, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_submissions_assignment_student_updated ON submissions (assignment_id, student_id, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_integrity_results_submission_latest ON integrity_results (submission_id, id)",
        "CREATE INDEX IF NOT EXISTS ix_integrity_jobs_submission_status_updated ON integrity_jobs (submission_id, status, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_submission_mark_reports_submission_published ON submission_mark_reports (submission_id, published_to_student)",
        "CREATE INDEX IF NOT EXISTS ix_assignments_class_due ON assignments (class_id, due_at)",
        "CREATE INDEX IF NOT EXISTS ix_class_enrollments_student_status_class ON class_enrollments (student_id, status, class_id)",
        "CREATE INDEX IF NOT EXISTS ix_class_enrollments_class_status_student ON class_enrollments (class_id, status, student_id)",
        "CREATE INDEX IF NOT EXISTS ix_comment_threads_student_updated ON comment_threads (student_id, updated_at)",
        "CREATE INDEX IF NOT EXISTS ix_comment_messages_thread_read_role ON comment_messages (thread_id, read_at, sender_role)",
        "CREATE INDEX IF NOT EXISTS ix_admin_announcements_audience_active_created ON admin_announcements (audience, is_active, created_at)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                # Some older local DBs may not have every optional table yet.
                # Skipping one index must not stop the app from starting.
                continue

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

@app.exception_handler(OperationalError)
async def handle_db_operational_error(request: Request, exc: OperationalError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database connection is unavailable. Verify the configured PostgreSQL service and retry.",
        },
    )


# Routers (import then include)
from app.api.auth import router as auth_router
from app.api.admin_users import router as admin_users_router
from app.api.admin_dashboard import router as admin_dashboard_router
from app.api.admin_management import router as admin_management_router
from app.api.lecturer import router as lecturer_router
from app.api.student import router as student_router
from app.api.integrity import router as integrity_router
from app.api.communications import router as communications_router

app.include_router(auth_router)
app.include_router(admin_users_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_management_router)
app.include_router(lecturer_router)
app.include_router(student_router)
app.include_router(integrity_router)
app.include_router(communications_router)
