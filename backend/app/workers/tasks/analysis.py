from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.integrity_service import run_plagiarism_for_submission


@celery_app.task(name="integrity.analyze_submission")
def analyze_submission(
    submission_id: int,
    idempotency_key: str,
    local_path: Optional[str] = None,
    s3_bucket: Optional[str] = None,
    s3_key: Optional[str] = None,
    correlation_id: Optional[str] = None,
):
    db: Session = SessionLocal()
    try:
        run_plagiarism_for_submission(
            db,
            int(submission_id),
            idempotency_key=idempotency_key,
            local_path=local_path,
            s3_bucket=s3_bucket,
            s3_key=s3_key,
            correlation_id=correlation_id,
        )
    finally:
        db.close()
