from starlette.background import BackgroundTask
from starlette.responses import FileResponse
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc
from pathlib import Path
import shutil
import os
import uuid
from datetime import datetime

from app.db.deps import get_db
from app.db.session import SessionLocal
from app.models.user import User
from app.models.class_ import Class
from app.models.class_enrollment import ClassEnrollment
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.integrity import IntegrityJob, IntegrityResult, CorpusChunk, IntegrityReviewOverride, IntegrityReviewOverrideVersion, IntegrityReviewLock
from app.models.communication import CommentThread, CommentMessage
from app.models.marking import SubmissionMarkReport, MarkAnnotation
from app.services.integrity_service import get_latest_result, plagiarism_score_to_percent, queue_plagiarism_for_submission
from app.services.marking_service import get_mark_annotations, get_mark_report, serialize_mark_report
from app.ai.text_extraction import extract_pdf_text
from app.ai.normalization import prepare_text_for_similarity
from app.schemas.student import PresignRequest, FinalizeRequest
from app.services.s3_service import build_submission_key, create_presigned_post, get_bucket_name, head_object_safe
from app.services.file_validation import validate_file_signature
from app.services.security_scan import basic_file_scan
from app.services.storage_helpers import cleanup_temp_file, resolve_submission_pdf_to_local, submission_file_response, submission_has_file, reference_file_response
from app.services.integrity_report_service import generate_integrity_highlight_pdf_from_local
from app.services.realtime import push_realtime_event
from app.models.platform import AdminAnnouncement
from app.services.dashboard_cache import get_dashboard_cached

router = APIRouter(prefix="/student", tags=["student"])


def _collect_integrity_highlights(latest_payload: dict | None):
    phrases = []
    ai_spans = []
    if isinstance(latest_payload, dict):
        plag = latest_payload.get("plagiarism") or {}
        for match in plag.get("matches") or []:
            for phrase in (match or {}).get("shared_phrases") or []:
                if isinstance(phrase, str) and len(phrase.strip()) >= 10:
                    phrases.append(phrase.strip())

        ai_payload = latest_payload.get("ai") or {}
        for span in ai_payload.get("spans") or []:
            if not isinstance(span, dict):
                continue
            start = int(span.get("start") or 0)
            end = int(span.get("end") or 0)
            if end <= start and not span.get("text_preview"):
                continue
            ai_spans.append({
                "start": start,
                "end": end,
                "confidence_percent": int(span.get("confidence_percent") or 0),
                "text_preview": span.get("text_preview"),
                "reasons": span.get("reasons") or [],
                "severity": str(span.get("severity") or "low"),
                "coverage_percent": int(span.get("coverage_percent") or 0),
                "contribution_percent": int(span.get("contribution_percent") or 0),
            })

    uniq = sorted(set(phrases), key=lambda x: (-len(x), x))
    return uniq[:200], ai_spans[:200]

SUBMISSIONS_DIR = (
    Path(__file__).resolve().parents[2] / "uploads" / "student_submissions"
)
SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_PDF_CT = {"application/pdf"}


ATTEMPT_COUNTED_STATUSES = {"processing", "submitted"}
ACTIVE_INTEGRITY_JOB_STATUSES = {"queued", "running"}


def _latest_integrity_job_status(db: Session, *, submission_id: int | None) -> str | None:
    if not submission_id:
        return None
    job = (
        db.query(IntegrityJob)
        .filter(IntegrityJob.submission_id == int(submission_id))
        .order_by(desc(IntegrityJob.id))
        .first()
    )
    return str(getattr(job, "status", "") or "").lower() if job else None


def _submission_counts_as_attempt(db: Session, sub: Submission | None) -> bool:
    """Only successful or genuinely active submissions consume attempts.

    A previous server error can leave a row in `processing` without a queued/running
    integrity job. Treating that broken row as a real attempt blocks students from
    retrying. Submitted rows always count. Processing rows count only while the
    integrity job is actually queued/running. Failed/missing-job processing rows do
    not count.
    """
    if sub is None:
        return False
    status = str(getattr(sub, "status", "") or "").lower()
    if status == "submitted":
        return True
    if status != "processing":
        return False
    job_status = _latest_integrity_job_status(db, submission_id=int(sub.id))
    return job_status in ACTIVE_INTEGRITY_JOB_STATUSES


def _max_counted_attempt(db: Session, *, assignment_id: int, student_id: int) -> int:
    rows = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student_id),
                Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
            )
        )
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .all()
    )
    counted_attempts = [int(sub.attempt_no or 0) for sub in rows if _submission_counts_as_attempt(db, sub)]
    return max(counted_attempts) if counted_attempts else 0


def _max_submission_attempt(db: Session, *, assignment_id: int, student_id: int) -> int:
    """Return the highest attempt number ever reserved for this assignment.

    Failed analysis rows are not counted against the student's allowed attempts,
    but their attempt numbers may already exist in the database. Reusing the same
    attempt number can violate real database constraints or confuse old/new
    report rows, so successful retries always receive a fresh attempt number.
    """
    value = (
        db.query(func.max(Submission.attempt_no))
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student_id),
            )
        )
        .scalar()
        or 0
    )
    return int(value)


def _latest_counted_submission(db: Session, *, assignment_id: int, student_id: int) -> Submission | None:
    rows = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student_id),
                Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
            )
        )
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .all()
    )
    for sub in rows:
        if _submission_counts_as_attempt(db, sub):
            return sub
    return None


def _assignment_mark_report(db: Session, *, assignment_id: int, student_id: int) -> SubmissionMarkReport | None:
    """Return any lecturer mark report for this student's assignment.

    Once the lecturer has started/saved marking for an assignment submission, the
    student's upload window must close so feedback and integrity results stay
    attached to the exact file that was marked.
    """
    return (
        db.query(SubmissionMarkReport)
        .join(Submission, SubmissionMarkReport.submission_id == Submission.id)
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student_id),
            )
        )
        .order_by(desc(SubmissionMarkReport.updated_at), desc(SubmissionMarkReport.id))
        .first()
    )


def _latest_integrity_job(db: Session, *, submission_id: int | None) -> IntegrityJob | None:
    if not submission_id:
        return None
    return (
        db.query(IntegrityJob)
        .filter(IntegrityJob.submission_id == int(submission_id))
        .order_by(desc(IntegrityJob.id))
        .first()
    )


def _submission_error_message(job: IntegrityJob | None) -> str | None:
    if not job or str(getattr(job, "status", "") or "").lower() != "failed":
        return None
    raw = str(getattr(job, "error", None) or "").strip()
    if not raw:
        return "Integrity analysis failed. Please check the PDF and try uploading again."
    first_line = raw.splitlines()[0].strip()
    return first_line[:240] or "Integrity analysis failed. Please check the PDF and try uploading again."


def _submission_gate(
    db: Session,
    *,
    assignment: Assignment,
    student_id: int,
) -> dict:
    """Centralized upload/resubmission rule used by detail, presign and finalize.

    Failed analysis attempts are intentionally not counted, while marked work is
    locked permanently for that student+assignment to prevent feedback/report
    mismatches.
    """
    max_attempts = int(getattr(assignment, "max_attempts", None) or 1)
    attempts_used = _max_counted_attempt(
        db,
        assignment_id=int(assignment.id),
        student_id=int(student_id),
    )
    attempts_left = max(0, max_attempts - attempts_used)
    counted_sub = _latest_counted_submission(
        db,
        assignment_id=int(assignment.id),
        student_id=int(student_id),
    )
    mark_report = _assignment_mark_report(
        db,
        assignment_id=int(assignment.id),
        student_id=int(student_id),
    )

    locked_by_marking = mark_report is not None
    resubmission_blocked = counted_sub is not None and not bool(getattr(assignment, "allow_resubmission", False))

    reason = None
    if locked_by_marking:
        reason = "This assignment has already been marked by the lecturer. Resubmission is closed to keep the marked report consistent."
    elif attempts_left <= 0:
        reason = "No attempts left for this assignment."
    elif resubmission_blocked:
        reason = "Resubmission is not allowed for this assignment."

    return {
        "max_attempts": max_attempts,
        "attempts_used": attempts_used,
        "attempts_left": attempts_left,
        "counted_submission": counted_sub,
        "locked_by_marking": locked_by_marking,
        "can_submit": reason is None,
        "reason": reason,
    }


def _assert_can_submit(db: Session, *, assignment: Assignment, student_id: int) -> dict:
    gate = _submission_gate(db, assignment=assignment, student_id=int(student_id))
    if not bool(gate["can_submit"]):
        raise HTTPException(status_code=400, detail=str(gate["reason"]))
    return gate


def _run_submission_analysis_task(
    submission_id: int,
    *,
    idempotency_key: str,
    local_path: str | None = None,
    s3_bucket: str | None = None,
    s3_key: str | None = None,
    correlation_id: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        from app.services.integrity_service import run_plagiarism_for_submission

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


def _mark_submission_failed(db: Session, submission_id: int, error: str | None = None) -> None:
    try:
        sub = db.query(Submission).filter(Submission.id == int(submission_id)).first()
        if sub is not None:
            sub.status = "failed"
        db.commit()
    except Exception:
        db.rollback()


def _clear_integrity_artifacts_for_resubmission(db: Session, submission_id: int) -> None:
    """Remove report/analysis rows tied to the previous file for this submission.

    The project database is normally one current submission row per
    student+assignment. Re-uploading therefore refreshes that row in place. The
    old integrity rows must be cleared so the next plagiarism/AI report belongs
    only to the newly uploaded PDF.
    """
    sid = int(submission_id)

    # Review tables were added later in the milestone. Some local databases may
    # not have every optional review table yet, so failures here should not stop
    # a normal student upload/resubmission.
    for model in (IntegrityReviewLock, IntegrityReviewOverrideVersion, IntegrityReviewOverride):
        try:
            db.query(model).filter(model.submission_id == sid).delete(synchronize_session=False)
        except Exception:
            db.rollback()

    db.query(IntegrityResult).filter(IntegrityResult.submission_id == sid).delete(synchronize_session=False)
    db.query(IntegrityJob).filter(IntegrityJob.submission_id == sid).delete(synchronize_session=False)
    db.query(CorpusChunk).filter(
        CorpusChunk.doc_id == sid,
        CorpusChunk.source_type == "submission",
    ).delete(synchronize_session=False)


def _retire_other_assignment_submissions(
    db: Session,
    *,
    assignment_id: int,
    student_id: int,
    keep_submission_id: int,
) -> None:
    """Keep one current row and retire stale duplicate rows if they exist.

    Some earlier development builds could create more than one row for the same
    student+assignment. Retiring the stale rows prevents old reports from showing
    beside the refreshed resubmission.
    """
    rows = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student_id),
                Submission.id != int(keep_submission_id),
            )
        )
        .all()
    )
    for other in rows:
        _clear_integrity_artifacts_for_resubmission(db, int(other.id))
        other.status = "failed"


def _queue_integrity_job_for_submission(
    submission_id: int,
    *,
    idempotency_key: str,
    correlation_id: str | None = None,
) -> dict | None:
    """Create/reset the integrity job using an isolated DB session.

    The upload finalize endpoint has already committed the submission before this
    runs. Keeping the job queue write in its own session prevents a transient
    IntegrityJob/realtime failure from rolling back or corrupting the submission
    transaction, and lets the endpoint return a clear retryable state instead of
    a raw 500.
    """
    job_db = SessionLocal()
    try:
        job = queue_plagiarism_for_submission(
            job_db,
            int(submission_id),
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
        if not job:
            return None
        return {
            "status": str(getattr(job, "status", None) or "queued"),
            "progress": int(getattr(job, "progress", None) or 0),
        }
    finally:
        job_db.close()


def get_student(db: Session, ident: str) -> User:
    q = db.query(User)
    if ident.isdigit():
        u = q.filter(User.id == int(ident)).first()
    else:
        u = q.filter(User.username == ident).first()

    if not u:
        raise HTTPException(status_code=404, detail="Student not found")
    if u.role != "student":
        raise HTTPException(status_code=403, detail="User is not a student")
    return u



def _student_mark_summary(db: Session, *, submission_id: int, student_id: int) -> dict | None:
    sub = (
        db.query(Submission)
        .filter(and_(Submission.id == submission_id, Submission.student_id == student_id))
        .first()
    )
    if not sub:
        return None

    report = get_mark_report(db, int(submission_id))
    if not report or not bool(report.published_to_student):
        return None

    annotations = get_mark_annotations(db, int(report.id))
    return {
        "submission_id": int(sub.id),
        "score": report.score,
        "max_score": report.max_score,
        "general_feedback": report.general_feedback,
        "annotation_count": len(annotations),
        "has_pdf": bool(report.generated_pdf_path),
    }


def _latest_student_submission(db: Session, *, assignment_id: int, student_id: int) -> Submission | None:
    return (
        db.query(Submission)
        .filter(and_(Submission.assignment_id == assignment_id, Submission.student_id == student_id))
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .first()
    )


def _pending_assignments_for_class(db: Session, *, class_id: int, student_id: int) -> int:
    assignments = db.query(Assignment).filter(Assignment.class_id == class_id).all()
    pending = 0
    for assignment in assignments:
        latest = _latest_counted_submission(db, assignment_id=int(assignment.id), student_id=int(student_id))
        if not latest:
            pending += 1
    return pending


def _joined_class_rows(db: Session, *, student_id: int):
    enrollment_sq = (
        db.query(
            ClassEnrollment.class_id.label("class_id"),
            func.max(ClassEnrollment.enrolled_at).label("joined_at"),
        )
        .filter(
            ClassEnrollment.student_id == int(student_id),
            ClassEnrollment.status == "active",
        )
        .group_by(ClassEnrollment.class_id)
        .subquery()
    )

    assignment_sq = (
        db.query(
            Assignment.class_id.label("class_id"),
            func.count(Assignment.id).label("assignment_count"),
        )
        .group_by(Assignment.class_id)
        .subquery()
    )

    submitted_sq = (
        db.query(
            Assignment.class_id.label("class_id"),
            func.count(func.distinct(Submission.assignment_id)).label("submitted_count"),
        )
        .join(Submission, Submission.assignment_id == Assignment.id)
        .filter(
            Submission.student_id == int(student_id),
            Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
        )
        .group_by(Assignment.class_id)
        .subquery()
    )

    return (
        db.query(
            Class.id,
            Class.name,
            Class.class_code,
            Class.created_at,
            enrollment_sq.c.joined_at,
            User.full_name.label("instructor_name"),
            User.username.label("instructor_username"),
            func.coalesce(assignment_sq.c.assignment_count, 0).label("assignment_count"),
            func.coalesce(submitted_sq.c.submitted_count, 0).label("submitted_count"),
        )
        .join(enrollment_sq, enrollment_sq.c.class_id == Class.id)
        .join(User, User.id == Class.lecturer_id)
        .outerjoin(assignment_sq, assignment_sq.c.class_id == Class.id)
        .outerjoin(submitted_sq, submitted_sq.c.class_id == Class.id)
        .filter(Class.is_active == True)
        .order_by(Class.id.desc())
        .all()
    )


def _serialize_joined_class_row(row) -> dict:
    assignment_count = int(getattr(row, "assignment_count", 0) or 0)
    submitted_count = int(getattr(row, "submitted_count", 0) or 0)
    assignments_due = max(0, assignment_count - submitted_count)
    instructor = getattr(row, "instructor_name", None) or getattr(row, "instructor_username", None) or "Lecturer"
    return {
        "id": int(row.id),
        "title": row.name,
        "name": row.name,
        "instructor": instructor,
        "code": row.class_code,
        "assignmentsDue": assignments_due,
        "joined_at": row.joined_at.isoformat() if getattr(row, "joined_at", None) else None,
        "created_at": row.created_at.isoformat() if getattr(row, "created_at", None) else None,
    }


@router.get("/{ident}/classes")
def list_joined_classes(ident: str, db: Session = Depends(get_db)):
    student = get_student(db, ident)
    rows = _joined_class_rows(db, student_id=int(student.id))
    return [_serialize_joined_class_row(row) for row in rows]


@router.get("/{ident}/dashboard/summary")
def student_dashboard_summary(ident: str, db: Session = Depends(get_db)):
    def build_payload():
        student = get_student(db, ident)
        return _student_dashboard_summary_payload(db, student)

    return get_dashboard_cached(("student-dashboard-summary", str(ident)), 5.0, build_payload)


def _student_dashboard_summary_payload(db: Session, student: User):
    joined_rows = _joined_class_rows(db, student_id=int(student.id))
    joined_classes = [_serialize_joined_class_row(row) for row in joined_rows]

    latest_submission_ids = (
        db.query(
            Submission.assignment_id.label("assignment_id"),
            func.max(Submission.id).label("submission_id"),
        )
        .filter(
            Submission.student_id == int(student.id),
            Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
        )
        .group_by(Submission.assignment_id)
        .subquery()
    )

    pending_assignments = int(
        db.query(func.count(Assignment.id))
        .join(ClassEnrollment, ClassEnrollment.class_id == Assignment.class_id)
        .join(Class, Assignment.class_id == Class.id)
        .outerjoin(latest_submission_ids, latest_submission_ids.c.assignment_id == Assignment.id)
        .outerjoin(Submission, Submission.id == latest_submission_ids.c.submission_id)
        .filter(
            ClassEnrollment.student_id == int(student.id),
            ClassEnrollment.status == "active",
            Class.is_active == True,
            or_(Submission.id.is_(None), ~Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES))),
        )
        .scalar()
        or 0
    )

    unread_feedback = int(
        db.query(func.count(CommentMessage.id))
        .join(CommentThread, CommentMessage.thread_id == CommentThread.id)
        .filter(
            CommentThread.student_id == int(student.id),
            CommentMessage.sender_role != "student",
            CommentMessage.read_at.is_(None),
        )
        .scalar()
        or 0
    )

    published_feedback = int(
        db.query(func.count(SubmissionMarkReport.id))
        .join(Submission, SubmissionMarkReport.submission_id == Submission.id)
        .filter(
            Submission.student_id == int(student.id),
            SubmissionMarkReport.published_to_student == True,
        )
        .scalar()
        or 0
    )

    recent_activity = []
    submission_rows = (
        db.query(
            Submission.id.label("submission_id"),
            Submission.submitted_at,
            Assignment.title.label("assignment_title"),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .filter(Submission.student_id == int(student.id))
        .order_by(Submission.submitted_at.desc().nullslast(), Submission.id.desc())
        .limit(8)
        .all()
    )
    for row in submission_rows:
        recent_activity.append({
            "at": row.submitted_at.isoformat() if row.submitted_at else None,
            "id": f"submission-{int(row.submission_id)}",
            "tone": "emerald",
            "icon": "✓",
            "text": f"Submitted: {row.assignment_title}",
        })

    feedback_rows = (
        db.query(
            Submission.id.label("submission_id"),
            SubmissionMarkReport.updated_at,
            Assignment.title.label("assignment_title"),
        )
        .join(Submission, SubmissionMarkReport.submission_id == Submission.id)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .filter(
            Submission.student_id == int(student.id),
            SubmissionMarkReport.published_to_student == True,
        )
        .order_by(SubmissionMarkReport.updated_at.desc().nullslast(), SubmissionMarkReport.id.desc())
        .limit(8)
        .all()
    )
    for row in feedback_rows:
        recent_activity.append({
            "at": row.updated_at.isoformat() if row.updated_at else None,
            "id": f"feedback-{int(row.submission_id)}",
            "tone": "indigo",
            "icon": "💭",
            "text": f"Received marked feedback: {row.assignment_title}",
        })

    for item in joined_classes[:8]:
        recent_activity.append({
            "at": item.get("joined_at") or item.get("created_at"),
            "id": f"class-{item['code']}",
            "tone": "amber",
            "icon": "👥",
            "text": f"Joined class: {item['code']} - {item['name']}",
        })

    def _activity_sort_key(item):
        raw = item.get("at")
        if not raw:
            return 0.0
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0

    recent_activity.sort(key=_activity_sort_key, reverse=True)

    return {
        "stats": {
            "assignments_due": pending_assignments,
            "new_feedback": unread_feedback or published_feedback,
            "joined_classes": len(joined_classes),
        },
        "classes": joined_classes,
        "recent_activity": recent_activity[:6],
    }


@router.post("/{ident}/classes/join")
def join_class(ident: str, payload: dict, db: Session = Depends(get_db)):
    student = get_student(db, ident)

    class_code = str(payload.get("classCode", "")).strip()
    if not class_code:
        raise HTTPException(status_code=400, detail="classCode is required")

    c = (
        db.query(Class)
        .filter(func.lower(Class.class_code) == class_code.lower())
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Class not found")
    if not c.is_active:
        raise HTTPException(status_code=400, detail="Class is not active")

    enr = (
        db.query(ClassEnrollment)
        .filter(
            and_(
                ClassEnrollment.class_id == c.id,
                ClassEnrollment.student_id == student.id,
            )
        )
        .first()
    )

    if enr:
        enr.status = "active"
        enr.removed_at = None
    else:
        db.add(ClassEnrollment(class_id=c.id, student_id=student.id, status="active"))

    db.commit()

    push_realtime_event("student", int(student.id), {"type": "class_membership_changed", "class_code": c.class_code, "class_id": int(c.id)})

    instructor = (
        (c.lecturer.full_name or c.lecturer.username)
        if getattr(c, "lecturer", None)
        else "Lecturer"
    )

    return {
        "id": int(c.id),
        "title": c.name,
        "name": c.name,
        "instructor": instructor,
        "code": c.class_code,
        "assignmentsDue": _pending_assignments_for_class(db, class_id=int(c.id), student_id=int(student.id)),
        "joined_at": datetime.utcnow().isoformat(),
        "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None,
    }


@router.get("/{ident}/assignments")
def student_assignments(
    ident: str,
    class_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    active_class_ids = [
        int(r[0])
        for r in (
            db.query(ClassEnrollment.class_id)
            .join(Class, ClassEnrollment.class_id == Class.id)
            .filter(
                ClassEnrollment.student_id == int(student.id),
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
            .all()
        )
    ]

    if not active_class_ids:
        return []

    latest_submission_ids = (
        db.query(
            Submission.assignment_id.label("assignment_id"),
            func.max(Submission.id).label("submission_id"),
        )
        .filter(
            Submission.student_id == int(student.id),
            Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
        )
        .group_by(Submission.assignment_id)
        .subquery()
    )

    q = (
        db.query(
            Assignment.id,
            Assignment.title,
            Assignment.description,
            Assignment.due_at,
            Class.name.label("class_name"),
            Class.class_code.label("class_code"),
            User.full_name.label("instructor_name"),
            User.username.label("instructor_username"),
            Submission.id.label("submission_id"),
            Submission.status.label("submission_status"),
            SubmissionMarkReport.score.label("mark_score"),
            SubmissionMarkReport.max_score.label("mark_max_score"),
            SubmissionMarkReport.published_to_student.label("mark_published"),
        )
        .join(Class, Assignment.class_id == Class.id)
        .join(User, User.id == Class.lecturer_id)
        .outerjoin(latest_submission_ids, latest_submission_ids.c.assignment_id == Assignment.id)
        .outerjoin(Submission, Submission.id == latest_submission_ids.c.submission_id)
        .outerjoin(SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id)
        .filter(Assignment.class_id.in_(active_class_ids))
    )

    if class_code:
        q = q.filter(Class.class_code == class_code)

    rows = q.order_by(Assignment.id.desc()).all()
    out = []
    for r in rows:
        has_marked_report = bool(getattr(r, "mark_published", False))
        out.append(
            {
                "id": int(r.id),
                "title": r.title,
                "description": r.description,
                "className": r.class_name,
                "classCode": r.class_code,
                "instructor": r.instructor_name or r.instructor_username or "Lecturer",
                "due": r.due_at.date().isoformat() if r.due_at else "",
                "status": "submitted" if (r.submission_id and (r.submission_status or "").lower() in ATTEMPT_COUNTED_STATUSES) else "pending",
                "mark_score": r.mark_score if has_marked_report else None,
                "mark_max_score": r.mark_max_score if has_marked_report else None,
                "marked_submission_id": int(r.submission_id) if (has_marked_report and r.submission_id) else None,
                "has_marked_report": has_marked_report,
            }
        )
    return out


@router.get("/{ident}/assignments/{assignment_id}")
def student_assignment_detail(
    ident: str, assignment_id: int, db: Session = Depends(get_db)
):
    student = get_student(db, ident)

    row = (
        db.query(
            Assignment.id,
            Assignment.title,
            Assignment.description,
            Assignment.due_at,
            Assignment.allow_resubmission,
            Assignment.max_attempts,
            Assignment.student_report_visible,
            Class.id.label("class_id"),
            Class.name.label("class_name"),
            Class.class_code.label("class_code"),
        )
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Assignment.id == assignment_id,
                ClassEnrollment.student_id == student.id,
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    latest_sub = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == assignment_id,
                Submission.student_id == student.id,
            )
        )
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .first()
    )

    gate = _submission_gate(db, assignment=row, student_id=int(student.id))
    latest_job = _latest_integrity_job(db, submission_id=int(latest_sub.id) if latest_sub else None)

    latest_submission = {
        "id": int(latest_sub.id) if latest_sub else None,
        "attempt_no": int(latest_sub.attempt_no) if latest_sub else 0,
        "status": latest_sub.status if latest_sub else "pending",
        "submitted_at": latest_sub.submitted_at.isoformat()
        if (latest_sub and latest_sub.submitted_at)
        else None,
        "file_name": latest_sub.file_name if latest_sub else None,
        "download_url": f"/student/{ident}/submissions/{latest_sub.id}/file"
        if (latest_sub and submission_has_file(latest_sub) and str(latest_sub.status or "") != "failed")
        else None,
        "integrity_status": str(getattr(latest_job, "status", None) or latest_sub.status) if latest_sub else "pending",
        "error": _submission_error_message(latest_job),
    }
    mark_report_summary = _student_mark_summary(db, submission_id=int(latest_sub.id), student_id=int(student.id)) if latest_sub else None

    return {
        "id": int(row.id),
        "title": row.title,
        "description": row.description,
        "due_at": row.due_at.isoformat() if row.due_at else None,
        "allow_resubmission": bool(row.allow_resubmission),
        "max_attempts": int(gate["max_attempts"]),
        "student_report_visible": bool(getattr(row, "student_report_visible", False)),
        "attempts_used": int(gate["attempts_used"]),
        "attempts_left": int(gate["attempts_left"]),
        "can_submit": bool(gate["can_submit"]),
        "submission_closed_reason": gate["reason"],
        "locked_by_marking": bool(gate["locked_by_marking"]),
        "class": {
            "id": int(row.class_id),
            "name": row.class_name,
            "code": row.class_code,
        },
        "latest_submission": latest_submission,
        "submission": latest_submission,
        "mark_report": mark_report_summary,
    }


@router.post("/{ident}/submissions/presign")
def presign_submission_upload(
    ident: str, payload: PresignRequest, db: Session = Depends(get_db)
):
    student = get_student(db, ident)

    row = (
        db.query(Assignment, Class)
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Assignment.id == int(payload.assignment_id),
                Class.id == int(payload.class_id),
                ClassEnrollment.student_id == int(student.id),
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = row[0]
    _assert_can_submit(db, assignment=assignment, student_id=int(student.id))

    key = build_submission_key(
        class_id=payload.class_id,
        assignment_id=payload.assignment_id,
        student_id=int(student.id),
        filename=payload.filename,
    )
    presigned = create_presigned_post(
        key=key,
        content_type="application/pdf",
        max_size_bytes=200 * 1024 * 1024,
    )
    return {
        "bucket": get_bucket_name(),
        "key": key,
        "upload": presigned,
    }


@router.post("/{ident}/submissions/finalize")
def finalize_submission(
    ident: str,
    payload: FinalizeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    if payload.s3_bucket != get_bucket_name():
        raise HTTPException(status_code=400, detail="Invalid storage location. Please retry upload.")

    meta = head_object_safe(payload.s3_key)
    if not meta["exists"]:
        raise HTTPException(status_code=400, detail="Upload not found or expired. Please upload again.")

    actual_size = int(meta.get("size") or 0)
    actual_type = str(meta.get("content_type") or "").lower()
    max_size = 200 * 1024 * 1024

    if actual_size <= 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if actual_size != payload.file_size:
        raise HTTPException(status_code=400, detail="Upload incomplete or corrupted.")
    if actual_size > max_size:
        raise HTTPException(status_code=400, detail="File too large. Maximum allowed size is 200MB.")
    if actual_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF files are allowed.")

    row = (
        db.query(Assignment, Class)
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Assignment.id == int(payload.assignment_id),
                Class.id == int(payload.class_id),
                ClassEnrollment.student_id == int(student.id),
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment, _class_row = row[0], row[1]
    gate = _assert_can_submit(db, assignment=assignment, student_id=int(student.id))

    tmp_path = None
    try:
        from app.ai.storage import fetch_pdf_to_local

        tmp_path = fetch_pdf_to_local(local_path=None, s3_bucket=payload.s3_bucket, s3_key=payload.s3_key)
        validate_file_signature(tmp_path, {"application/pdf"})
        basic_file_scan(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File validation failed: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    new_attempt = int(gate.get("attempts_used") or 0) + 1
    sub = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == int(payload.assignment_id),
                Submission.student_id == int(student.id),
            )
        )
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .first()
    )

    if sub is not None:
        _clear_integrity_artifacts_for_resubmission(db, int(sub.id))
        _retire_other_assignment_submissions(
            db,
            assignment_id=int(payload.assignment_id),
            student_id=int(student.id),
            keep_submission_id=int(sub.id),
        )
        sub.attempt_no = new_attempt
        sub.status = "processing"
        sub.submitted_at = func.now()
        sub.correlation_id = uuid.uuid4()
        sub.file_path = None
        sub.file_name = payload.filename
        sub.file_type = actual_type
        sub.file_size = actual_size
        sub.storage_provider = "s3"
        sub.s3_bucket = payload.s3_bucket
        sub.s3_key = payload.s3_key
        sub.mime_type = actual_type
    else:
        sub = Submission(
            assignment_id=payload.assignment_id,
            student_id=student.id,
            attempt_no=new_attempt,
            status="processing",
            submitted_at=func.now(),
            correlation_id=uuid.uuid4(),
            file_path=None,
            file_name=payload.filename,
            file_type=actual_type,
            file_size=actual_size,
            storage_provider="s3",
            s3_bucket=payload.s3_bucket,
            s3_key=payload.s3_key,
            mime_type=actual_type,
        )
        db.add(sub)

    try:
        db.commit()
        db.refresh(sub)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not finalize the submission. Please retry.")

    idem_key = f"submission:{int(sub.id)}:attempt:{int(sub.attempt_no)}"
    try:
        job = _queue_integrity_job_for_submission(
            int(sub.id),
            idempotency_key=idem_key,
            correlation_id=str(sub.correlation_id) if sub.correlation_id else None,
        )
    except Exception as e:
        _mark_submission_failed(db, int(sub.id), str(e))
        return {
            "ok": False,
            "submission_id": int(sub.id),
            "attempt_no": int(sub.attempt_no),
            "file_name": sub.file_name,
            "download_url": None,
            "integrity_job_status": "failed",
            "integrity_job_progress": 100,
            "idempotency_key": idem_key,
            "plagiarism_percent": 0,
            "error": "Submission was uploaded, but integrity analysis could not start. Please retry the submission.",
        }

    background_tasks.add_task(
        _run_submission_analysis_task,
        int(sub.id),
        idempotency_key=idem_key,
        s3_bucket=payload.s3_bucket,
        s3_key=payload.s3_key,
        correlation_id=str(sub.correlation_id) if sub.correlation_id else None,
    )

    try:
        push_realtime_event("student", int(student.id), {
            "type": "submission_updated",
            "submission_id": int(sub.id),
            "assignment_id": int(payload.assignment_id),
            "status": "processing",
            "attempt_no": int(sub.attempt_no),
        })
    except Exception:
        pass

    return {
        "ok": True,
        "submission_id": int(sub.id),
        "attempt_no": int(sub.attempt_no),
        "file_name": sub.file_name,
        "download_url": f"/student/{ident}/submissions/{sub.id}/file",
        "integrity_job_status": str(job.get("status") or "queued") if job else "queued",
        "integrity_job_progress": int(job.get("progress") or 0) if job else 0,
        "idempotency_key": idem_key,
        "plagiarism_percent": 0,
    }


@router.post("/{ident}/assignments/{assignment_id}/submit")
def student_submit_assignment(
    ident: str,
    assignment_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    if file.content_type not in ALLOWED_PDF_CT:
        raise HTTPException(status_code=400, detail="Only PDF allowed")

    orig_name = file.filename or "submission.pdf"
    ext = Path(orig_name).suffix.lower()
    if ext != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF allowed")

    # Ensure assignment exists and student is enrolled in its class
    row = (
        db.query(
            Assignment,
            Class,
        )
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Assignment.id == assignment_id,
                ClassEnrollment.student_id == student.id,
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    a, _class_row = row[0], row[1]
    gate = _assert_can_submit(db, assignment=a, student_id=int(student.id))
    new_attempt = int(gate.get("attempts_used") or 0) + 1

    dest = SUBMISSIONS_DIR / (
        f"assignment_{assignment_id}_student_{student.id}_attempt_{new_attempt}_{uuid.uuid4().hex}.pdf"
    )

    try:
        with dest.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        validate_file_signature(str(dest), {"application/pdf"})
        basic_file_scan(str(dest))
    except Exception as e:
        try:
            if dest.exists():
                dest.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"File validation failed: {str(e)}")

    size = os.path.getsize(dest)

    sub = (
        db.query(Submission)
        .filter(
            and_(
                Submission.assignment_id == int(assignment_id),
                Submission.student_id == int(student.id),
            )
        )
        .order_by(desc(Submission.attempt_no), desc(Submission.updated_at), desc(Submission.id))
        .first()
    )

    if sub is not None:
        _clear_integrity_artifacts_for_resubmission(db, int(sub.id))
        _retire_other_assignment_submissions(
            db,
            assignment_id=int(assignment_id),
            student_id=int(student.id),
            keep_submission_id=int(sub.id),
        )
        old_file_path = str(getattr(sub, "file_path", None) or "")
        sub.attempt_no = new_attempt
        sub.status = "processing"
        sub.submitted_at = func.now()
        sub.correlation_id = uuid.uuid4()
        sub.file_path = str(dest)
        sub.file_name = orig_name
        sub.file_type = file.content_type
        sub.file_size = size
        sub.storage_provider = "local"
        sub.s3_bucket = None
        sub.s3_key = None
        sub.mime_type = file.content_type
    else:
        old_file_path = ""
        sub = Submission(
            assignment_id=assignment_id,
            student_id=student.id,
            attempt_no=new_attempt,
            status="processing",
            submitted_at=func.now(),
            correlation_id=uuid.uuid4(),
            file_path=str(dest),
            file_name=orig_name,
            file_type=file.content_type,
            file_size=size,
            storage_provider="local",
            s3_bucket=None,
            s3_key=None,
            mime_type=file.content_type,
        )
        db.add(sub)

    try:
        db.commit()
        db.refresh(sub)
        if old_file_path and old_file_path != str(dest):
            try:
                old_path = Path(old_file_path)
                if old_path.exists() and old_path.is_file():
                    old_path.unlink()
            except Exception:
                pass
    except Exception:
        db.rollback()
        try:
            if dest.exists():
                dest.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not finalize the submission. Please retry.")

    # Queue server-side analysis so the upload request can return immediately.
    idem_key = f"submission:{int(sub.id)}:attempt:{int(sub.attempt_no)}"
    try:
        job = _queue_integrity_job_for_submission(
            int(sub.id),
            idempotency_key=idem_key,
            correlation_id=str(sub.correlation_id) if sub.correlation_id else None,
        )
    except Exception as e:
        _mark_submission_failed(db, int(sub.id), str(e))
        return {
            "ok": False,
            "submission_id": int(sub.id),
            "attempt_no": int(sub.attempt_no),
            "file_name": sub.file_name,
            "download_url": None,
            "integrity_job_status": "failed",
            "integrity_job_progress": 100,
            "idempotency_key": idem_key,
            "plagiarism_percent": 0,
            "error": "Submission was uploaded, but integrity analysis could not start. Please retry the submission.",
        }

    background_tasks.add_task(
        _run_submission_analysis_task,
        int(sub.id),
        idempotency_key=idem_key,
        local_path=str(dest),
        correlation_id=str(sub.correlation_id) if sub.correlation_id else None,
    )

    try:
        push_realtime_event("student", int(student.id), {
            "type": "submission_updated",
            "submission_id": int(sub.id),
            "assignment_id": int(assignment_id),
            "status": "processing",
            "attempt_no": int(sub.attempt_no),
        })
    except Exception:
        pass

    return {
        "ok": True,
        "submission_id": int(sub.id),
        "attempt_no": int(sub.attempt_no),
        "file_name": sub.file_name,
        "download_url": f"/student/{ident}/submissions/{sub.id}/file",
        "integrity_job_status": str(job.get("status") or "queued") if job else "queued",
        "integrity_job_progress": int(job.get("progress") or 0) if job else 0,
        "idempotency_key": idem_key,
        "plagiarism_percent": 0,
    }


@router.get("/{ident}/submissions/{submission_id}/file")
def student_download_submission(
    ident: str, submission_id: int, db: Session = Depends(get_db)
):
    student = get_student(db, ident)

    sub = (
        db.query(Submission)
        .filter(and_(Submission.id == submission_id, Submission.student_id == student.id))
        .first()
    )
    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    try:
        return submission_file_response(sub)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Submission file not found")


@router.get("/{ident}/reports")
def student_reports(
    ident: str,
    class_code: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    latest_result_ids = (
        db.query(
            IntegrityResult.submission_id.label("submission_id"),
            func.max(IntegrityResult.id).label("result_id"),
        )
        .group_by(IntegrityResult.submission_id)
        .subquery()
    )

    q = (
        db.query(
            Submission.id.label("submission_id"),
            Submission.assignment_id.label("assignment_id"),
            Assignment.title.label("assignment_title"),
            Class.class_code,
            Class.name.label("class_name"),
            Submission.submitted_at,
            Submission.file_path,
            Submission.file_name,
            Submission.file_type,
            Submission.storage_provider,
            Submission.s3_key,
            IntegrityResult.plagiarism_score,
            IntegrityResult.payload,
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .join(latest_result_ids, latest_result_ids.c.submission_id == Submission.id)
        .join(IntegrityResult, IntegrityResult.id == latest_result_ids.c.result_id)
        .filter(
            Submission.student_id == int(student.id),
            Assignment.student_report_visible == True,
        )
    )

    if class_code:
        q = q.filter(Class.class_code == class_code)

    q = q.order_by(Submission.id.desc())
    if limit is not None:
        q = q.offset(int(offset)).limit(int(limit))
    rows = q.all()

    out = []
    for r in rows:
        payload = r.payload or {}
        ai_payload = payload.get("ai") or {}
        has_file = bool((getattr(r, "storage_provider", None) == "s3" and getattr(r, "s3_key", None)) or getattr(r, "file_path", None))
        out.append(
            {
                "submission_id": int(r.submission_id),
                "assignment_id": int(r.assignment_id),
                "assignment_title": r.assignment_title,
                "class_code": r.class_code,
                "class_name": r.class_name,
                "submitted_at": r.submitted_at.date().isoformat() if r.submitted_at else "",
                "plagiarism_percent": plagiarism_score_to_percent(r.plagiarism_score),
                "ai_detected": bool(ai_payload.get("detected")),
                "ai_risk_percent": int(ai_payload.get("risk_percent") or ai_payload.get("percent") or 0),
                "ai_risk_level": str(ai_payload.get("risk_level") or ai_payload.get("level") or "low"),
                "hasFile": has_file,
                "fileName": r.file_name if has_file else None,
                "fileUrl": f"/student/{ident}/submissions/{int(r.submission_id)}/file" if has_file else None,
            }
        )

    return out


@router.get("/{ident}/marked-reports")
def student_marked_reports(
    ident: str,
    class_code: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    annotation_counts = (
        db.query(
            MarkAnnotation.report_id.label("report_id"),
            func.count(MarkAnnotation.id).label("annotation_count"),
        )
        .group_by(MarkAnnotation.report_id)
        .subquery()
    )

    q = (
        db.query(
            Submission.id.label("submission_id"),
            Submission.assignment_id.label("assignment_id"),
            Assignment.title.label("assignment_title"),
            Class.class_code,
            Class.name.label("class_name"),
            Submission.submitted_at,
            Submission.file_name,
            Submission.file_type,
            Submission.file_path,
            Submission.storage_provider,
            Submission.s3_key,
            SubmissionMarkReport.id.label("report_id"),
            SubmissionMarkReport.score,
            SubmissionMarkReport.max_score,
            SubmissionMarkReport.general_feedback,
            SubmissionMarkReport.generated_pdf_path,
            SubmissionMarkReport.updated_at,
            func.coalesce(annotation_counts.c.annotation_count, 0).label("annotation_count"),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .join(SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id)
        .outerjoin(annotation_counts, annotation_counts.c.report_id == SubmissionMarkReport.id)
        .filter(
            Submission.student_id == int(student.id),
            SubmissionMarkReport.published_to_student == True,
        )
    )

    if class_code:
        q = q.filter(Class.class_code == class_code)

    q = q.order_by(SubmissionMarkReport.updated_at.desc().nullslast(), Submission.id.desc())
    if limit is not None:
        q = q.offset(int(offset)).limit(int(limit))
    rows = q.all()
    out = []
    for r in rows:
        has_file = bool((getattr(r, "storage_provider", None) == "s3" and getattr(r, "s3_key", None)) or r.file_path)
        out.append(
            {
                "submission_id": int(r.submission_id),
                "assignment_id": int(r.assignment_id),
                "assignment_title": r.assignment_title,
                "class_code": r.class_code,
                "class_name": r.class_name,
                "submitted_at": r.submitted_at.date().isoformat() if r.submitted_at else "",
                "score": r.score,
                "max_score": r.max_score,
                "general_feedback": r.general_feedback,
                "annotation_count": int(r.annotation_count or 0),
                "fileName": r.file_name if has_file else None,
                "fileUrl": f"/student/{ident}/submissions/{int(r.submission_id)}/file" if has_file else None,
                "marked_pdf_url": f"/student/{ident}/submissions/{int(r.submission_id)}/marked-report/pdf" if r.generated_pdf_path else None,
            }
        )
    return out


@router.get("/{ident}/submissions/{submission_id}/marked-report")
def student_marked_report_detail(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    sub = (
        db.query(Submission)
        .filter(and_(Submission.id == submission_id, Submission.student_id == student.id))
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Marked report not found")

    report = get_mark_report(db, int(submission_id))
    if not report or not bool(report.published_to_student):
        raise HTTPException(status_code=403, detail="This marked report is not visible to students yet")

    if not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)
    annotations = get_mark_annotations(db, int(report.id))

    return {
        "submission_id": int(submission_id),
        "text": extracted.full_text or "",
        "plagiarism_text": prepare_text_for_similarity(extracted.full_text or ""),
        "mark_report": serialize_mark_report(report, annotations),
        "pdf_url": f"/student/{ident}/submissions/{int(submission_id)}/marked-report/pdf" if report.generated_pdf_path else None,
        "original_file_url": f"/student/{ident}/submissions/{int(submission_id)}/file" if submission_has_file(sub) else None,
    }


@router.get("/{ident}/submissions/{submission_id}/marked-report/pdf")
def student_marked_report_pdf(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    sub = (
        db.query(Submission)
        .filter(and_(Submission.id == submission_id, Submission.student_id == student.id))
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Marked report not found")

    report = get_mark_report(db, int(submission_id))
    if not report or not bool(report.published_to_student) or not report.generated_pdf_path:
        raise HTTPException(status_code=404, detail="Marked report PDF not found")

    filename = f"marked-report-submission-{submission_id}.pdf"
    try:
        return reference_file_response(report.generated_pdf_path, filename=filename, content_type="application/pdf")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Marked report PDF is missing")


@router.get("/{ident}/submissions/{submission_id}/report-text")
def student_submission_report_text(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    sub = (
        db.query(Submission, Assignment)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Submission.id == submission_id,
                Submission.student_id == student.id,
                ClassEnrollment.student_id == student.id,
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )

    if not sub:
        raise HTTPException(status_code=404, detail="Submission report not found")

    submission, assignment = sub[0], sub[1]
    if not bool(getattr(assignment, "student_report_visible", False)):
        raise HTTPException(status_code=403, detail="This report is not visible to students yet")

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    if not submission_has_file(submission):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(submission)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    uniq, ai_spans = _collect_integrity_highlights(latest.payload if isinstance(latest.payload, dict) else None)

    return {
        "submission_id": int(submission_id),
        "text": extracted.full_text or "",
        "plagiarism_text": prepare_text_for_similarity(extracted.full_text or ""),
        "plagiarised_phrases": uniq,
        "ai_spans": ai_spans,
    }


@router.get("/{ident}/submissions/{submission_id}/integrity-highlighted-pdf")
def student_integrity_highlighted_pdf(
    ident: str,
    submission_id: int,
    mode: str = Query("plagiarism"),
    db: Session = Depends(get_db),
):
    student = get_student(db, ident)

    sub = (
        db.query(Submission, Assignment)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Submission.id == submission_id,
                Submission.student_id == student.id,
                ClassEnrollment.student_id == student.id,
                ClassEnrollment.status == "active",
                Class.is_active == True,
            )
        )
        .first()
    )

    if not sub:
        raise HTTPException(status_code=404, detail="Submission report not found")

    submission, assignment = sub[0], sub[1]
    if not bool(getattr(assignment, "student_report_visible", False)):
        raise HTTPException(status_code=403, detail="This report is not visible to students yet")

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    if not submission_has_file(submission):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(submission)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
        phrases, ai_spans = _collect_integrity_highlights(latest.payload if isinstance(latest.payload, dict) else None)
        temp_pdf = generate_integrity_highlight_pdf_from_local(
            str(local_pdf_path),
            extracted_text=extracted.full_text or "",
            plagiarised_phrases=phrases,
            ai_spans=ai_spans,
            mode=mode,
            report_text=prepare_text_for_similarity(extracted.full_text or ""),
        )
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    filename = f"submission-{submission_id}-{'ai' if (mode or '').lower() == 'ai' else 'plagiarism'}-report.pdf"
    return FileResponse(temp_pdf, media_type="application/pdf", filename=filename, background=BackgroundTask(lambda: cleanup_temp_file(temp_pdf, True)))

@router.get("/{ident}/announcements")
def student_announcements(ident: str, db: Session = Depends(get_db)):
    student = get_student(db, ident)

    rows = (
        db.query(AdminAnnouncement)
        .filter(
            and_(
                AdminAnnouncement.audience.in_(["students", "all"]),
                AdminAnnouncement.is_active == True,
            )
        )
        .order_by(AdminAnnouncement.created_at.desc())
        .all()
    )

    return [
        {
            "id": row.id,
            "subject": row.subject,
            "body": row.body,
            "audience": row.audience,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
