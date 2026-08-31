from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.integrity import IntegrityJob
from app.schemas.integrity import IntegrityAnalyzeRequest, IntegrityJobOut, IntegrityResultOut
from app.services.integrity_service import run_plagiarism_for_submission, get_latest_result

router = APIRouter(prefix="/integrity", tags=["integrity"])


def _user_error(error: str | None) -> str | None:
    raw = str(error or "").strip()
    if not raw:
        return None
    return raw.splitlines()[0][:240] or "Integrity analysis failed. Please check the PDF and try uploading again."


@router.post("/analyze", response_model=IntegrityJobOut)
def analyze(payload: IntegrityAnalyzeRequest, db: Session = Depends(get_db)):
    job, _ = run_plagiarism_for_submission(
        db,
        payload.submission_id,
        idempotency_key=payload.idempotency_key,
        correlation_id=payload.correlation_id,
    )

    return IntegrityJobOut(
        submission_id=int(job.submission_id),
        idempotency_key=job.idempotency_key,
        status=job.status,  # type: ignore[arg-type]
        progress=int(job.progress),
        correlation_id=job.correlation_id,
        error=_user_error(job.error),
    )


@router.get("/jobs/{submission_id}", response_model=list[IntegrityJobOut])
def list_jobs(submission_id: int, db: Session = Depends(get_db)):
    jobs = (
        db.query(IntegrityJob)
        .filter(IntegrityJob.submission_id == submission_id)
        .order_by(IntegrityJob.id.desc())
        .all()
    )
    return [
        IntegrityJobOut(
            submission_id=int(j.submission_id),
            idempotency_key=j.idempotency_key,
            status=j.status,  # type: ignore[arg-type]
            progress=int(j.progress),
            correlation_id=j.correlation_id,
            error=_user_error(j.error),
        )
        for j in jobs
    ]


@router.get("/results/{submission_id}", response_model=IntegrityResultOut)
def latest_result(submission_id: int, db: Session = Depends(get_db)):
    res = get_latest_result(db, submission_id)
    if not res:
        raise HTTPException(status_code=404, detail="No result found for this submission_id")

    return IntegrityResultOut(
        submission_id=int(res.submission_id),
        ai_score=float(res.ai_score),
        plagiarism_score=float(res.plagiarism_score),
        payload=res.payload,
    )
