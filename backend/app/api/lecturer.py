from starlette.background import BackgroundTask
from starlette.responses import FileResponse
# backend/app/api/lecturer.py

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime
from pathlib import Path
import shutil
import os

from app.db.deps import get_db
from app.models.user import User
from app.models.class_ import Class
from app.models.class_enrollment import ClassEnrollment
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.marking import SubmissionMarkReport
from app.models.integrity import (
    IntegrityJob,
    IntegrityResult,
    IntegrityReviewOverride,
    IntegrityReviewOverrideVersion,
)
from app.services.integrity_service import get_latest_result, plagiarism_score_to_percent
from app.services.audit import write_audit_event
from app.services.false_detection_service import (
    enforce_false_detection_lock,
    normalize_removed_ranges,
    recalculate_adjusted_plagiarism_percent,
    validate_false_detection_review,
)
from app.services.marking_service import get_mark_annotations, get_mark_report, save_marking, serialize_mark_report
from app.models.audit_event import AuditEvent
from app.schemas.assignment import AssignmentCreate
from app.schemas.lecturer import FalseDetectionReviewSaveIn

from typing import Any, Dict, List
from app.ai.text_extraction import extract_pdf_text
from app.ai.normalization import prepare_text_for_similarity
from app.services.s3_service import build_assignment_material_key, create_presigned_post, get_bucket_name, head_object_safe
from app.services.file_validation import validate_file_signature
from app.services.security_scan import basic_file_scan
from app.services.storage_helpers import cleanup_temp_file, resolve_submission_pdf_to_local, submission_file_response, submission_has_file, reference_file_response, file_reference_exists
from app.services.integrity_report_service import (
    generate_integrity_highlight_pdf_from_local,
    generate_detailed_integrity_highlight_pdf_from_local,
    is_local_existing_path,
)
from app.services.realtime import push_realtime_event
from app.models.platform import AdminAnnouncement
from app.services.dashboard_cache import get_dashboard_cached

router = APIRouter(prefix="/lecturer", tags=["lecturer"])


ATTEMPT_COUNTED_STATUSES = {"processing", "submitted"}

def _collect_integrity_highlights(latest_payload: dict | None):
    phrases: List[str] = []
    ai_spans = []

    if isinstance(latest_payload, dict):
        plag = latest_payload.get("plagiarism") or {}

        for match in plag.get("matches") or []:
            if not isinstance(match, dict):
                continue

            query_text = str(match.get("query_text") or "").strip()
            if len(query_text) >= 10:
                phrases.append(query_text)

            for phrase in match.get("shared_phrases") or []:
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

    cleaned: List[str] = []
    seen = set()
    for p in phrases:
        cleaned_phrase = " ".join(str(p).split()).strip()
        norm = cleaned_phrase.lower()
        if len(cleaned_phrase) < 10 or norm in seen:
            continue
        seen.add(norm)
        cleaned.append(cleaned_phrase)

    cleaned = sorted(cleaned, key=lambda x: (-len(x), x))
    return cleaned[:200], ai_spans[:200]


def _collect_detailed_plagiarism_phrases(latest_payload: dict | None):
    lecture_phrases: List[str] = []
    submission_phrases: List[str] = []
    online_phrases: List[str] = []

    if isinstance(latest_payload, dict):
        plag = latest_payload.get("plagiarism") or {}

        for match in plag.get("matches") or []:
            if not isinstance(match, dict):
                continue

            source_type = str(match.get("source_type") or "").strip().lower()

            phrases: List[str] = []
            query_text = str(match.get("query_text") or "").strip()
            if len(query_text) >= 10:
                phrases.append(query_text)
            for shared in match.get("shared_phrases") or []:
                if isinstance(shared, str) and len(shared.strip()) >= 10:
                    phrases.append(shared.strip())

            if source_type == "lecture_material":
                lecture_phrases.extend(phrases)
            elif source_type == "submission":
                submission_phrases.extend(phrases)
            elif source_type == "online_source":
                online_phrases.extend(phrases)

    def _dedupe(items: List[str]) -> List[str]:
        out: List[str] = []
        seen = set()
        for item in items:
            cleaned = " ".join(str(item).split()).strip()
            key = cleaned.lower()
            if len(cleaned) < 10 or key in seen:
                continue
            seen.add(key)
            out.append(cleaned)
        return sorted(out, key=lambda x: (-len(x), x))[:200]

    return _dedupe(lecture_phrases), _dedupe(submission_phrases), _dedupe(online_phrases)


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "assignment_materials"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_CT = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _collect_detailed_match_details(latest_payload: dict | None):
    details: List[Dict[str, Any]] = []

    if not isinstance(latest_payload, dict):
        return details

    plag = latest_payload.get("plagiarism") or {}
    for match in plag.get("matches") or []:
        if not isinstance(match, dict):
            continue

        source_type = str(match.get("source_type") or "").strip().lower()
        source_name = str(match.get("source_name") or "").strip()
        source_path = str(match.get("source_path") or "").strip()
        score = float(match.get("score") or 0.0)

        phrases: List[str] = []
        query_text = str(match.get("query_text") or "").strip()
        if len(query_text) >= 10:
            phrases.append(query_text)
        for shared in match.get("shared_phrases") or []:
            if isinstance(shared, str) and len(shared.strip()) >= 10:
                phrases.append(shared.strip())

        for phrase in phrases:
            cleaned = " ".join(str(phrase).split()).strip()
            if len(cleaned) < 10:
                continue

            details.append({
                "phrase": cleaned,
                "source_type": source_type,
                "source_name": source_name,
                "source_path": source_path,
                "score": round(score, 4),
                "source_doc_id": str(match.get("source_doc_id") or ""),
                "source_chunk_id": int(match.get("source_chunk_id") or 0),
            })

    deduped: List[Dict[str, Any]] = []
    seen = set()
    for item in details:
        key = (
            item["phrase"].lower(),
            item["source_type"],
            item["source_name"],
            item["source_chunk_id"],
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped[:500]


def get_lecturer(db: Session, ident: str) -> User:
    """
    ident can be:
      - numeric user id ("8")
      - username ("smith")
    Your frontend sometimes sends userId, so we support both.
    """
    q = db.query(User)
    if ident.isdigit():
        u = q.filter(User.id == int(ident)).first()
    else:
        u = q.filter(User.username == ident).first()

    if not u:
        raise HTTPException(status_code=404, detail="Lecturer not found")
    if u.role != "lecturer":
        raise HTTPException(status_code=403, detail="User is not a lecturer")
    return u


def _lecturer_submission(db: Session, *, lecturer_id: int, submission_id: int) -> Submission | None:
    return (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lecturer_id))
        .first()
    )


def _lecturer_mark_payload(db: Session, submission_id: int) -> dict | None:
    report = get_mark_report(db, int(submission_id))
    if not report:
        return None
    annotations = get_mark_annotations(db, int(report.id))
    return serialize_mark_report(report, annotations)


# -------------------- DASHBOARD --------------------


@router.get("/{ident}/dashboard/stats")
def lecturer_dashboard_stats(ident: str, db: Session = Depends(get_db)):
    lect = get_lecturer(db, ident)

    active_classes = db.query(Class).filter(Class.lecturer_id == lect.id).count()

    submissions_to_review = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Class.lecturer_id == lect.id, Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES))))
        .count()
    )

    return {
        "submissionsToReview": submissions_to_review,
        "activeClasses": active_classes,
    }


@router.get("/{ident}/dashboard/summary")
def lecturer_dashboard_summary(ident: str, db: Session = Depends(get_db)):
    def build_payload():
        lect = get_lecturer(db, ident)
        return _lecturer_dashboard_summary_payload(db, lect)

    return get_dashboard_cached(("lecturer-dashboard-summary", str(ident)), 5.0, build_payload)


def _lecturer_dashboard_summary_payload(db: Session, lect: User):

    enrolled_sq = (
        db.query(
            ClassEnrollment.class_id.label("class_id"),
            func.count(ClassEnrollment.student_id).label("enrolled"),
        )
        .filter(ClassEnrollment.status == "active")
        .group_by(ClassEnrollment.class_id)
        .subquery()
    )

    asg_sq = (
        db.query(
            Assignment.class_id.label("class_id"),
            func.count(Assignment.id).label("activeAssignments"),
        )
        .group_by(Assignment.class_id)
        .subquery()
    )

    class_rows = (
        db.query(
            Class.id,
            Class.name,
            Class.class_code,
            func.coalesce(enrolled_sq.c.enrolled, 0).label("enrolled"),
            func.coalesce(asg_sq.c.activeAssignments, 0).label("activeAssignments"),
        )
        .outerjoin(enrolled_sq, enrolled_sq.c.class_id == Class.id)
        .outerjoin(asg_sq, asg_sq.c.class_id == Class.id)
        .filter(Class.lecturer_id == lect.id)
        .order_by(Class.id.desc())
        .all()
    )

    submissions_to_review = int(
        db.query(func.count(Submission.id))
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(Class.lecturer_id == lect.id, Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)))
        .scalar()
        or 0
    )

    activity_rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.actor_user_id == lect.id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(8)
        .all()
    )

    total_students_by_class = dict(
        db.query(ClassEnrollment.class_id, func.count(ClassEnrollment.student_id))
        .filter(ClassEnrollment.status == "active")
        .group_by(ClassEnrollment.class_id)
        .all()
    )
    submitted_by_assignment = dict(
        db.query(Submission.assignment_id, func.count(Submission.id))
        .filter(Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)))
        .group_by(Submission.assignment_id)
        .all()
    )
    upcoming_rows = (
        db.query(
            Assignment.id,
            Assignment.title,
            Assignment.due_at,
            Class.id.label("class_id"),
            Class.name.label("class_name"),
            Class.class_code.label("class_code"),
        )
        .join(Class, Assignment.class_id == Class.id)
        .filter(
            Class.lecturer_id == lect.id,
            Assignment.due_at.isnot(None),
            Assignment.due_at >= func.now(),
        )
        .order_by(Assignment.due_at.asc().nullslast(), Assignment.id.desc())
        .limit(8)
        .all()
    )

    return {
        "stats": {
            "submissionsToReview": submissions_to_review,
            "activeClasses": len(class_rows),
        },
        "classes": [
            {
                "id": int(r.id),
                "name": r.name,
                "code": r.class_code,
                "enrolled": int(r.enrolled or 0),
                "activeAssignments": int(r.activeAssignments or 0),
            }
            for r in class_rows
        ],
        "recent": [
            {
                "id": str(r.correlation_id),
                "text": f"{r.event_type} on {r.entity_table}:{r.entity_id}",
            }
            for r in activity_rows
        ],
        "upcoming": [
            {
                "id": int(r.id),
                "title": r.title,
                "className": r.class_name,
                "classCode": r.class_code,
                "due": r.due_at.date().isoformat() if r.due_at else "",
                "submitted": int(submitted_by_assignment.get(r.id, 0)),
                "totalStudents": int(total_students_by_class.get(r.class_id, 0)),
            }
            for r in upcoming_rows
        ],
    }


# -------------------- CLASSES --------------------


@router.get("/{ident}/classes")
def lecturer_classes(ident: str, db: Session = Depends(get_db)):
    lect = get_lecturer(db, ident)

    enrolled_sq = (
        db.query(
            ClassEnrollment.class_id.label("class_id"),
            func.count(ClassEnrollment.student_id).label("enrolled"),
        )
        .filter(ClassEnrollment.status == "active")
        .group_by(ClassEnrollment.class_id)
        .subquery()
    )

    asg_sq = (
        db.query(
            Assignment.class_id.label("class_id"),
            func.count(Assignment.id).label("activeAssignments"),
        )
        .group_by(Assignment.class_id)
        .subquery()
    )

    rows = (
        db.query(
            Class.id,
            Class.name,
            Class.class_code,
            Class.description,
            Class.created_at,
            func.coalesce(enrolled_sq.c.enrolled, 0).label("enrolled"),
            func.coalesce(asg_sq.c.activeAssignments, 0).label("activeAssignments"),
        )
        .outerjoin(enrolled_sq, enrolled_sq.c.class_id == Class.id)
        .outerjoin(asg_sq, asg_sq.c.class_id == Class.id)
        .filter(Class.lecturer_id == lect.id)
        .order_by(Class.id.desc())
        .all()
    )

    instructor_name = getattr(lect, "full_name", None) or lect.username

    return [
        {
            "id": r.id,
            "name": r.name,
            "code": r.class_code,
            "description": r.description,
            "enrolled": int(r.enrolled),
            "activeAssignments": int(r.activeAssignments),
            "instructor": instructor_name,
            "created_at": getattr(r, "created_at", None).isoformat() if getattr(r, "created_at", None) else None,
        }
        for r in rows
    ]


@router.post("/{ident}/classes")
def create_class(ident: str, payload: dict, db: Session = Depends(get_db)):
    lect = get_lecturer(db, ident)

    name = str(payload.get("name", "")).strip()
    code = str(payload.get("code", "")).strip()
    description = payload.get("description", None)
    description = str(description).strip() if description is not None else None

    if not name or not code:
        raise HTTPException(status_code=400, detail="name and code are required")

    if db.query(Class).filter(Class.class_code == code).first():
        raise HTTPException(status_code=400, detail="Class code already exists")

    c = Class(name=name, class_code=code, description=description, lecturer_id=lect.id)
    db.add(c)
    db.commit()
    db.refresh(c)

    return {
        "id": c.id,
        "name": c.name,
        "code": c.class_code,
        "description": c.description,
        "enrolled": 0,
        "activeAssignments": 0,
        "instructor": getattr(lect, "full_name", None) or lect.username,
        "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None,
    }


@router.delete("/{ident}/classes/{class_id}")
def delete_class(ident: str, class_id: int, db: Session = Depends(get_db)):
    lect = get_lecturer(db, ident)

    c = (
        db.query(Class)
        .filter(and_(Class.id == class_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Class not found")

    # Delete dependent enrollment rows explicitly before deleting the class.
    # Without this, SQLAlchemy can try to null-out class_enrollments.class_id,
    # which is part of the composite primary key and causes a 500 error.
    db.query(ClassEnrollment).filter(ClassEnrollment.class_id == int(c.id)).delete(synchronize_session=False)

    try:
        db.delete(c)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete the class. Please retry.")
    return {"ok": True}


# -------------------- ASSIGNMENTS --------------------


@router.get("/{ident}/assignments/{assignment_id}")
def lecturer_assignment_detail(
    ident: str, assignment_id: int, db: Session = Depends(get_db)
):
    lect = get_lecturer(db, ident)

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
            Assignment.material_name,
            Assignment.material_type,
            Assignment.material_size,
            Assignment.material_path,
        )
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return {
        "id": int(row.id),
        "title": row.title,
        "description": row.description,
        "due_at": row.due_at.isoformat() if row.due_at else None,
        "allow_resubmission": bool(row.allow_resubmission),
        "max_attempts": int(row.max_attempts),
        "student_report_visible": bool(getattr(row, "student_report_visible", False)),
        "class": {
            "id": int(row.class_id),
            "name": row.class_name,
            "code": row.class_code,
        },
        "hasMaterial": bool(row.material_path),
        "materialName": row.material_name,
        "materialUrl": f"/lecturer/{ident}/assignments/{assignment_id}/material"
        if row.material_path
        else None,
    }


@router.post("/{ident}/assignments")
def create_assignment(
    ident: str, payload: AssignmentCreate, db: Session = Depends(get_db)
):
    lect = get_lecturer(db, ident)

    c = (
        db.query(Class)
        .filter(and_(Class.id == int(payload.class_id), Class.lecturer_id == lect.id))
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Class not found")

    a = Assignment(
        class_id=c.id,
        title=payload.title.strip(),
        description=(payload.description.strip() if payload.description else None),
        due_at=payload.due_at,
        allow_resubmission=payload.allow_resubmission,
        max_attempts=payload.max_attempts,
        student_report_visible=payload.student_report_visible,
    )

    db.add(a)
    db.commit()
    db.refresh(a)

    return {"ok": True, "id": int(a.id)}


@router.post("/{ident}/assignments/{assignment_id}/material/presign")
def presign_assignment_material_upload(
    ident: str,
    assignment_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)
    a = (
        db.query(Assignment)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    filename = str(payload.get("filename", "")).strip()
    content_type = str(payload.get("content_type", "")).strip()
    if not filename or not content_type:
        raise HTTPException(status_code=400, detail="filename and content_type are required")
    if content_type not in ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Only PDF/DOC/DOCX allowed")
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in {'pdf', 'doc', 'docx'}:
        raise HTTPException(status_code=400, detail="Only PDF/DOC/DOCX allowed")

    key = build_assignment_material_key(int(a.class_id), int(a.id), filename)
    presigned = create_presigned_post(key=key, content_type=content_type, max_size_bytes=200 * 1024 * 1024)
    return {"bucket": get_bucket_name(), "key": key, "upload": presigned}


@router.post("/{ident}/assignments/{assignment_id}/material/finalize")
def finalize_assignment_material_upload(
    ident: str,
    assignment_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)
    a = (
        db.query(Assignment)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    s3_bucket = str(payload.get("s3_bucket", "")).strip()
    s3_key = str(payload.get("s3_key", "")).strip()
    filename = str(payload.get("filename", "")).strip()
    file_size = payload.get("file_size", None)
    if not s3_bucket or not s3_key or not filename or file_size is None:
        raise HTTPException(status_code=400, detail="s3_bucket, s3_key, filename, and file_size are required")
    if s3_bucket != get_bucket_name():
        raise HTTPException(status_code=400, detail="Invalid storage location. Please retry upload.")
    try:
        file_size = int(file_size)
    except Exception:
        raise HTTPException(status_code=400, detail="file_size must be an integer")

    meta = head_object_safe(s3_key)
    if not meta['exists']:
        raise HTTPException(status_code=400, detail="Upload not found or expired. Please re-upload.")
    if not meta['size'] or int(meta['size']) <= 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if int(meta['size']) != file_size:
        raise HTTPException(status_code=400, detail="Upload incomplete or corrupted. Please retry.")
    if int(meta['size']) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum allowed size is 200MB.")

    detected_type = str(meta.get('content_type') or '').lower()
    if detected_type not in ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF/DOC/DOCX are allowed.")

    tmp_path = None
    try:
        from app.ai.storage import fetch_pdf_to_local
        tmp_path = fetch_pdf_to_local(local_path=None, s3_bucket=s3_bucket, s3_key=s3_key)
        validate_file_signature(tmp_path, {
            'application/pdf',
            'application/zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        basic_file_scan(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File validation failed: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    a.material_path = s3_key
    a.material_name = filename
    a.material_type = detected_type
    a.material_size = int(meta['size'])
    db.commit()
    db.refresh(a)
    return {"ok": True, "assignment_id": int(a.id), "material_name": a.material_name, "material_key": a.material_path}


@router.post("/{ident}/assignments/{assignment_id}/material")
def upload_assignment_material(
    ident: str,
    assignment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    a = (
        db.query(Assignment)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if file.content_type not in ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Only PDF/DOC/DOCX allowed")

    orig_name = file.filename or "material"
    ext = Path(orig_name).suffix.lower()
    if ext not in [".pdf", ".doc", ".docx"]:
        raise HTTPException(status_code=400, detail="Only PDF/DOC/DOCX allowed")

    dest = UPLOAD_DIR / f"assignment_{assignment_id}_material{ext}"

    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    a.material_path = str(dest)
    a.material_name = orig_name
    a.material_type = file.content_type
    a.material_size = os.path.getsize(dest)

    db.commit()
    return {"ok": True}


@router.get("/{ident}/assignments/{assignment_id}/material")
def download_assignment_material_lecturer(
    ident: str,
    assignment_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    a = (
        db.query(Assignment)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not a or not a.material_path:
        raise HTTPException(status_code=404, detail="Material not found")

    try:
        return reference_file_response(a.material_path, filename=a.material_name or "material", content_type=a.material_type or "application/octet-stream")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Material not found")


@router.put("/{ident}/assignments/{assignment_id}")
def update_assignment(
    ident: str, assignment_id: int, payload: dict, db: Session = Depends(get_db)
):
    lect = get_lecturer(db, ident)

    a = (
        db.query(Assignment)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if "title" in payload:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        a.title = title

    if "description" in payload:
        desc = payload.get("description", None)
        a.description = str(desc).strip() if desc else None

    if "due_at" in payload:
        due_at = payload.get("due_at", None)
        if due_at:
            try:
                dt = datetime.fromisoformat(str(due_at).replace("Z", "+00:00"))
                a.due_at = dt
            except Exception:
                raise HTTPException(
                    status_code=400, detail="due_at must be ISO datetime"
                )
        else:
            a.due_at = None

    if "allow_resubmission" in payload:
        a.allow_resubmission = bool(payload.get("allow_resubmission"))

    if "max_attempts" in payload:
        try:
            m = int(payload.get("max_attempts"))
        except Exception:
            raise HTTPException(
                status_code=400, detail="max_attempts must be an integer"
            )
        if m < 1:
            raise HTTPException(status_code=400, detail="max_attempts must be >= 1")
        a.max_attempts = m

    if "student_report_visible" in payload:
        a.student_report_visible = bool(payload.get("student_report_visible"))

    db.commit()
    db.refresh(a)
    return {"ok": True, "id": int(a.id)}


@router.get("/{ident}/assignments")
def lecturer_assignments(
    ident: str,
    class_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    q = (
        db.query(
            Assignment.id,
            Assignment.title,
            Assignment.due_at,
            Class.id.label("class_id"),
            Class.name.label("class_name"),
            Class.class_code.label("class_code"),
        )
        .join(Class, Assignment.class_id == Class.id)
        .filter(Class.lecturer_id == lect.id)
    )

    if class_code:
        q = q.filter(Class.class_code == class_code)

    rows = q.order_by(Assignment.id.desc()).all()

    total_students_by_class = dict(
        db.query(ClassEnrollment.class_id, func.count(ClassEnrollment.student_id))
        .filter(ClassEnrollment.status == "active")
        .group_by(ClassEnrollment.class_id)
        .all()
    )

    submitted_by_assignment = dict(
        db.query(Submission.assignment_id, func.count(Submission.id))
        .filter(Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)))
        .group_by(Submission.assignment_id)
        .all()
    )

    return [
        {
            "id": int(r.id),
            "title": r.title,
            "className": r.class_name,
            "classCode": r.class_code,
            "due": r.due_at.date().isoformat() if r.due_at else "",
            "submitted": int(submitted_by_assignment.get(r.id, 0)),
            "totalStudents": int(total_students_by_class.get(r.class_id, 0)),
        }
        for r in rows
    ]


@router.get("/{ident}/assignments/{assignment_id}/submissions")
def lecturer_assignment_submissions(
    ident: str,
    assignment_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    owned = (
        db.query(Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Assignment.id == assignment_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Assignment not found")

    latest_ids = (
        db.query(func.max(Submission.id).label("id"))
        .filter(Submission.assignment_id == assignment_id)
        .group_by(Submission.student_id)
        .subquery()
    )

    rows = (
        db.query(
            Submission.id,
            Submission.attempt_no,
            Submission.status,
            Submission.submitted_at,
            Submission.file_name,
            User.username.label("student_username"),
            User.email.label("student_email"),
        )
        .join(User, Submission.student_id == User.id)
        .join(latest_ids, Submission.id == latest_ids.c.id)
        .order_by(Submission.submitted_at.desc().nullslast(), Submission.id.desc())
        .all()
    )

    return [
        {
            "id": int(r.id),
            "student_username": r.student_username,
            "student_email": r.student_email,
            "attempt_no": int(r.attempt_no),
            "status": r.status,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "file_name": r.file_name,
            "download_url": f"/lecturer/{ident}/submissions/{int(r.id)}/file",
        }
        for r in rows
    ]


# -------------------- STUDENTS --------------------


@router.get("/{ident}/students")
def lecturer_students(
    ident: str,
    class_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    cq = db.query(Class).filter(Class.lecturer_id == lect.id)
    if class_code:
        cq = cq.filter(Class.class_code == class_code)

    classes = cq.all()
    if not classes:
        return []

    class_ids = [c.id for c in classes]

    total_assignments_by_class = dict(
        db.query(Assignment.class_id, func.count(Assignment.id))
        .filter(Assignment.class_id.in_(class_ids))
        .group_by(Assignment.class_id)
        .all()
    )

    rows = (
        db.query(
            ClassEnrollment.class_id,
            Class.class_code,
            Class.name.label("class_name"),
            User.id.label("student_id"),
            User.username.label("student_username"),
            User.email.label("student_email"),
        )
        .join(Class, ClassEnrollment.class_id == Class.id)
        .join(User, ClassEnrollment.student_id == User.id)
        .filter(
            and_(
                ClassEnrollment.class_id.in_(class_ids),
                ClassEnrollment.status == "active",
            )
        )
        .order_by(ClassEnrollment.enrolled_at.desc())
        .all()
    )

    out = []
    for r in rows:
        submitted_count = (
            db.query(func.count(Submission.id))
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .filter(
                and_(
                    Assignment.class_id == r.class_id,
                    Submission.student_id == r.student_id,
                    Submission.status.in_(tuple(ATTEMPT_COUNTED_STATUSES)),
                )
            )
            .scalar()
        ) or 0

        out.append(
            {
                "student_username": r.student_username,
                "student_email": r.student_email,
                "class_id": r.class_id,
                "class_code": r.class_code,
                "class_name": r.class_name,
                "submitted_count": int(submitted_count),
                "total_assignments": int(total_assignments_by_class.get(r.class_id, 0)),
            }
        )

    return out


@router.get("/{ident}/students/{student_username}/progress")
def lecturer_student_progress(
    ident: str,
    student_username: str,
    class_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    student = db.query(User).filter(and_(User.username == student_username, User.role == "student")).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    classes_q = (
        db.query(Class)
        .join(ClassEnrollment, ClassEnrollment.class_id == Class.id)
        .filter(
            and_(
                Class.lecturer_id == lect.id,
                ClassEnrollment.student_id == student.id,
                ClassEnrollment.status == "active",
            )
        )
    )
    if class_id:
        classes_q = classes_q.filter(Class.id == class_id)
    class_rows = classes_q.order_by(Class.name.asc()).all()

    progress_items = []
    for c in class_rows:
        assignments = (
            db.query(Assignment)
            .filter(Assignment.class_id == c.id)
            .order_by(Assignment.created_at.desc(), Assignment.id.desc())
            .all()
        )
        assignment_items = []
        completed = 0
        for a in assignments:
            latest_submission = (
                db.query(Submission)
                .filter(and_(Submission.assignment_id == a.id, Submission.student_id == student.id))
                .order_by(Submission.attempt_no.desc(), Submission.updated_at.desc(), Submission.id.desc())
                .first()
            )
            if latest_submission and latest_submission.status in ATTEMPT_COUNTED_STATUSES:
                completed += 1
            mark_report = get_mark_report(db, int(latest_submission.id)) if latest_submission else None
            assignment_items.append({
                "assignment_id": int(a.id),
                "title": a.title,
                "due_at": a.due_at.isoformat() if a.due_at else None,
                "submitted": bool(latest_submission and latest_submission.status in ATTEMPT_COUNTED_STATUSES),
                "attempt_no": int(latest_submission.attempt_no) if latest_submission else 0,
                "submitted_at": latest_submission.submitted_at.isoformat() if latest_submission and latest_submission.submitted_at else None,
                "score": getattr(mark_report, "score", None),
                "max_score": getattr(mark_report, "max_score", None),
                "published_feedback": bool(getattr(mark_report, "published_to_student", False)) if mark_report else False,
            })

        progress_items.append({
            "class_id": int(c.id),
            "class_code": c.class_code,
            "class_name": c.name,
            "completed_assignments": int(completed),
            "total_assignments": int(len(assignments)),
            "assignments": assignment_items,
        })

    return {
        "student_id": int(student.id),
        "student_username": student.username,
        "student_name": student.full_name,
        "student_email": student.email,
        "classes": progress_items,
    }


@router.delete("/{ident}/classes/{class_id}/students/{student_username}")
def remove_student_from_class(
    ident: str,
    class_id: int,
    student_username: str,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    c = (
        db.query(Class)
        .filter(and_(Class.id == class_id, Class.lecturer_id == lect.id))
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Class not found")

    student = db.query(User).filter(User.username == student_username).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enr = (
        db.query(ClassEnrollment)
        .filter(
            and_(
                ClassEnrollment.class_id == class_id,
                ClassEnrollment.student_id == student.id,
            )
        )
        .first()
    )
    if not enr:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    enr.status = "removed"
    enr.removed_at = func.now()
    db.commit()

    return {"ok": True}


# -------------------- REPORTS --------------------


def _list_submission_file_reference_exists(row) -> bool:
    provider = str(getattr(row, "storage_provider", None) or "local").lower()
    if provider == "s3":
        return bool(getattr(row, "s3_key", None))
    return file_reference_exists(
        storage_provider=provider,
        file_path=getattr(row, "file_path", None),
        s3_key=getattr(row, "s3_key", None),
    )


@router.get("/{ident}/reports")
def lecturer_reports(
    ident: str,
    class_code: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    q = (
        db.query(
            Submission.id.label("submission_id"),
            Assignment.id.label("assignment_id"),
            Assignment.title.label("assignment_title"),
            Class.class_code,
            Class.name.label("class_name"),
            User.username.label("student_username"),
            Submission.submitted_at,
            Submission.file_path,
            Submission.file_name,
            Submission.file_type,
            Submission.storage_provider,
            Submission.s3_key,
            Submission.status.label("submission_status"),
            SubmissionMarkReport.id.label("mark_report_id"),
            SubmissionMarkReport.score.label("mark_score"),
            SubmissionMarkReport.max_score.label("mark_max_score"),
            SubmissionMarkReport.published_to_student.label("mark_published_to_student"),
            SubmissionMarkReport.updated_at.label("mark_updated_at"),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .join(User, Submission.student_id == User.id)
        .outerjoin(SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id)
        .filter(Class.lecturer_id == lect.id)
    )

    if class_code:
        q = q.filter(Class.class_code == class_code)

    q = q.order_by(Submission.id.desc())
    if limit is not None:
        q = q.offset(int(offset)).limit(int(limit))
    rows = q.all()

    submission_ids = [int(r.submission_id) for r in rows]
    latest_results: Dict[int, IntegrityResult] = {}
    latest_jobs: Dict[int, IntegrityJob] = {}
    review_overrides: Dict[int, IntegrityReviewOverride] = {}

    if submission_ids:
        latest_result_sq = (
            db.query(
                IntegrityResult.submission_id.label("submission_id"),
                func.max(IntegrityResult.id).label("result_id"),
            )
            .filter(IntegrityResult.submission_id.in_(submission_ids))
            .group_by(IntegrityResult.submission_id)
            .subquery()
        )
        latest_results = {
            int(row.submission_id): row
            for row in (
                db.query(IntegrityResult)
                .join(latest_result_sq, IntegrityResult.id == latest_result_sq.c.result_id)
                .all()
            )
        }

        latest_job_sq = (
            db.query(
                IntegrityJob.submission_id.label("submission_id"),
                func.max(IntegrityJob.id).label("job_id"),
            )
            .filter(IntegrityJob.submission_id.in_(submission_ids))
            .group_by(IntegrityJob.submission_id)
            .subquery()
        )
        latest_jobs = {
            int(row.submission_id): row
            for row in (
                db.query(IntegrityJob)
                .join(latest_job_sq, IntegrityJob.id == latest_job_sq.c.job_id)
                .all()
            )
        }

        review_overrides = {
            int(row.submission_id): row
            for row in (
                db.query(IntegrityReviewOverride)
                .filter(IntegrityReviewOverride.submission_id.in_(submission_ids))
                .all()
            )
        }

    out = []
    for r in rows:
        submission_id = int(r.submission_id)
        latest_res = latest_results.get(submission_id)
        latest_job = latest_jobs.get(submission_id)
        review_override = review_overrides.get(submission_id)
        raw_has_file = _list_submission_file_reference_exists(r)
        submission_status = str(getattr(r, "submission_status", None) or "submitted")
        integrity_status = str(getattr(latest_job, "status", None) or ("done" if latest_res else submission_status))
        report_ready = bool(latest_res) and submission_status == "submitted"
        has_file = bool(raw_has_file and submission_status != "failed")
        error_message = str(getattr(latest_job, "error", None) or "").strip() if integrity_status == "failed" else None
        ai_payload = (latest_res.payload.get("ai") or {}) if (latest_res and isinstance(latest_res.payload, dict)) else {}
        out.append(
            {
                "submission_id": submission_id,
                "assignment_id": int(r.assignment_id),
                "assignment_title": r.assignment_title,
                "class_code": r.class_code,
                "class_name": r.class_name,
                "student_username": r.student_username,
                "submitted_at": r.submitted_at.date().isoformat()
                if r.submitted_at
                else "",
                "plagiarism_percent": (
                    plagiarism_score_to_percent(review_override.adjusted_plagiarism_score)
                    if review_override
                    else (plagiarism_score_to_percent(latest_res.plagiarism_score) if latest_res else 0)
                ),
                "false_detection_reviewed": bool(review_override and (review_override.removed_ranges or [])),
                "ai_detected": bool(ai_payload.get("detected")),
                "ai_risk_percent": int(ai_payload.get("risk_percent") or ai_payload.get("percent") or 0),
                "ai_risk_level": str(ai_payload.get("risk_level") or ai_payload.get("level") or "low"),
                "mark_status": "published" if bool(getattr(r, "mark_published_to_student", False)) else ("draft" if getattr(r, "mark_report_id", None) else "new"),
                "mark_score": int(r.mark_score) if getattr(r, "mark_score", None) is not None else None,
                "mark_max_score": int(r.mark_max_score) if getattr(r, "mark_max_score", None) is not None else None,
                "mark_published_to_student": bool(getattr(r, "mark_published_to_student", False)),
                "mark_updated_at": r.mark_updated_at.isoformat() if getattr(r, "mark_updated_at", None) else None,
                "submission_status": submission_status,
                "integrity_status": integrity_status,
                "report_ready": report_ready,
                "report_error": error_message[:400] if error_message else None,
                "hasFile": has_file,
                "fileName": r.file_name if has_file else None,
                "fileUrl": f"/lecturer/{ident}/submissions/{submission_id}/file"
                if has_file
                else None,
            }
        )

    return out


@router.get("/{ident}/submissions/{submission_id}/file")
def lecturer_download_submission(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    sub = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    try:
        return submission_file_response(sub)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Submission file not found")


@router.get("/{ident}/submissions/{submission_id}/marking")
def lecturer_submission_marking(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)
    sub = _lecturer_submission(db, lecturer_id=int(lect.id), submission_id=int(submission_id))
    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)
    return {
        "submission_id": int(sub.id),
        "text": extracted.full_text or "",
        "plagiarism_text": prepare_text_for_similarity(extracted.full_text or ""),
        "original_file_url": f"/lecturer/{ident}/submissions/{int(sub.id)}/file",
        "mark_report": _lecturer_mark_payload(db, int(sub.id)),
    }


@router.put("/{ident}/submissions/{submission_id}/marking")
def lecturer_save_marking(
    ident: str,
    submission_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)
    sub = _lecturer_submission(db, lecturer_id=int(lect.id), submission_id=int(submission_id))
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    score_raw = payload.get("score")
    max_score_raw = payload.get("max_score")
    try:
        score = int(score_raw) if score_raw not in (None, "") else None
    except Exception:
        raise HTTPException(status_code=400, detail="score must be a number")
    try:
        max_score = int(max_score_raw) if max_score_raw not in (None, "") else None
    except Exception:
        raise HTTPException(status_code=400, detail="max_score must be a number")

    if score is not None and score < 0:
        raise HTTPException(status_code=400, detail="score must be >= 0")
    if max_score is not None and max_score < 0:
        raise HTTPException(status_code=400, detail="max_score must be >= 0")
    if score is not None and max_score is not None and score > max_score:
        raise HTTPException(status_code=400, detail="score cannot be greater than max_score")

    report = save_marking(
        db,
        submission=sub,
        lecturer_id=int(lect.id),
        score=score,
        max_score=max_score,
        general_feedback=str(payload.get("general_feedback") or "").strip() or None,
        published_to_student=bool(payload.get("published_to_student", True)),
        annotations_payload=payload.get("annotations") or [],
    )

    annotations = get_mark_annotations(db, int(report.id))

    push_realtime_event("student", int(sub.student_id), {
        "type": "mark_report_updated",
        "submission_id": int(sub.id),
        "assignment_id": int(sub.assignment_id),
        "published": bool(report.published_to_student),
        "annotation_count": len(annotations),
    })

    return {
        "ok": True,
        "mark_report": serialize_mark_report(report, annotations),
        "pdf_url": f"/lecturer/{ident}/submissions/{int(sub.id)}/marked-report/pdf" if report.generated_pdf_path else None,
    }


@router.get("/{ident}/submissions/{submission_id}/marked-report/pdf")
def lecturer_marked_report_pdf(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)
    sub = _lecturer_submission(db, lecturer_id=int(lect.id), submission_id=int(submission_id))
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    report = get_mark_report(db, int(submission_id))
    if not report or not report.generated_pdf_path:
        raise HTTPException(status_code=404, detail="Marked report PDF not found")

    filename = f"marked-report-submission-{submission_id}.pdf"
    try:
        return reference_file_response(report.generated_pdf_path, filename=filename, content_type="application/pdf")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Marked report PDF is missing")


@router.get("/{ident}/submissions/{submission_id}/report-text")
def lecturer_submission_report_text(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    sub = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    latest = get_latest_result(db, int(submission_id))

    review_override = (
        db.query(IntegrityReviewOverride)
        .filter(IntegrityReviewOverride.submission_id == int(submission_id))
        .first()
    )
    latest_version = (
        db.query(IntegrityReviewOverrideVersion)
        .filter(IntegrityReviewOverrideVersion.submission_id == int(submission_id))
        .order_by(IntegrityReviewOverrideVersion.version_no.desc())
        .first()
    )
    uniq, ai_spans = _collect_integrity_highlights(
        latest.payload if latest and isinstance(latest.payload, dict) else None
    )

    lecture_phrases, submission_phrases, online_phrases = _collect_detailed_plagiarism_phrases(
        latest.payload if latest and isinstance(latest.payload, dict) else None
    )

    detailed_matches = _collect_detailed_match_details(
        latest.payload if latest and isinstance(latest.payload, dict) else None
    )

    return {
        "submission_id": int(submission_id),
        "text": extracted.full_text or "",
        "plagiarism_text": prepare_text_for_similarity(extracted.full_text or ""),
        "plagiarised_phrases": uniq,
        "lecture_phrases": lecture_phrases,
        "submission_phrases": submission_phrases,
        "online_phrases": online_phrases,
        "detailed_matches": detailed_matches,
        "ai_spans": ai_spans,
        "original_plagiarism_percent": plagiarism_score_to_percent(latest.plagiarism_score) if latest else 0,
        "saved_removed_ranges": review_override.removed_ranges if review_override else [],
        "saved_adjusted_plagiarism_percent": (
            plagiarism_score_to_percent(review_override.adjusted_plagiarism_score)
            if review_override
            else None
        ),
        "saved_justification_note": latest_version.justification_note if latest_version else None,
        "saved_review_version": int(latest_version.version_no) if latest_version else None,
        "saved_idempotency_key": latest_version.idempotency_key if latest_version else None,
    }

@router.put("/{ident}/submissions/{submission_id}/false-detection-review")
def lecturer_save_false_detection_review(
    ident: str,
    submission_id: int,
    payload: FalseDetectionReviewSaveIn,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    lect = get_lecturer(db, ident)

    sub = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    enforce_false_detection_lock(
        db,
        submission_id=int(submission_id),
        user_id=int(lect.id),
        lock_token=payload.lock_token,
    )

    latest = get_latest_result(db, int(submission_id))
    if not latest or not isinstance(latest.payload, dict):
        raise HTTPException(status_code=409, detail="Integrity report is not ready for false-detection review")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    plagiarism_text = prepare_text_for_similarity(extracted.full_text or "")
    detailed_matches = _collect_detailed_match_details(latest.payload)

    existing = (
        db.query(IntegrityReviewOverride)
        .filter(IntegrityReviewOverride.submission_id == submission_id)
        .first()
    )
    latest_version = (
        db.query(IntegrityReviewOverrideVersion)
        .filter(IntegrityReviewOverrideVersion.submission_id == int(submission_id))
        .order_by(IntegrityReviewOverrideVersion.version_no.desc())
        .first()
    )

    cleaned_ranges = validate_false_detection_review(
        justification_note=payload.justification_note,
        removed_ranges=payload.removed_ranges,
        plagiarism_text=plagiarism_text,
        detailed_matches=detailed_matches,
        existing_removed_ranges=existing.removed_ranges if existing else [],
    )

    recalculated_percent = recalculate_adjusted_plagiarism_percent(
        original_percent=plagiarism_score_to_percent(latest.plagiarism_score),
        detailed_matches=detailed_matches,
        removed_ranges=cleaned_ranges,
        plagiarism_text=plagiarism_text,
    )
    if int(payload.adjusted_plagiarism_percent) != int(recalculated_percent):
        raise HTTPException(status_code=400, detail=f"Adjusted plagiarism percent does not match the recalculated value ({recalculated_percent})")

    adjusted_score = max(0.0, min(1.0, float(recalculated_percent) / 100.0))

    if idempotency_key:
        existing_version = (
            db.query(IntegrityReviewOverrideVersion)
            .filter(
                IntegrityReviewOverrideVersion.submission_id == int(submission_id),
                IntegrityReviewOverrideVersion.idempotency_key == idempotency_key,
            )
            .first()
        )
        if existing_version:
            same_ranges = normalize_removed_ranges(existing_version.removed_ranges or []) == cleaned_ranges
            same_note = str(existing_version.justification_note or "").strip() == str(payload.justification_note or "").strip()
            same_percent = plagiarism_score_to_percent(existing_version.adjusted_plagiarism_score) == int(recalculated_percent)
            if not (same_ranges and same_note and same_percent):
                raise HTTPException(status_code=409, detail="Idempotency-Key has already been used with a different payload")
            return {
                "ok": True,
                "submission_id": submission_id,
                "adjusted_plagiarism_percent": int(recalculated_percent),
                "removed_ranges": normalize_removed_ranges(existing_version.removed_ranges or []),
                "justification_note": existing_version.justification_note,
                "version_no": int(existing_version.version_no),
                "idempotency_key": existing_version.idempotency_key,
                "idempotent_replay": True,
            }

    if existing:
        existing.adjusted_plagiarism_score = adjusted_score
        existing.removed_ranges = cleaned_ranges
        existing.created_by = int(lect.id)
    else:
        existing = IntegrityReviewOverride(
            submission_id=submission_id,
            adjusted_plagiarism_score=adjusted_score,
            removed_ranges=cleaned_ranges,
            created_by=int(lect.id),
        )
        db.add(existing)

    next_version_no = int(getattr(latest_version, "version_no", 0) or 0) + 1
    version = IntegrityReviewOverrideVersion(
        submission_id=int(submission_id),
        version_no=next_version_no,
        adjusted_plagiarism_score=adjusted_score,
        removed_ranges=cleaned_ranges,
        justification_note=str(payload.justification_note).strip(),
        created_by=int(lect.id),
        idempotency_key=idempotency_key,
    )
    db.add(version)

    write_audit_event(
        db,
        actor_user_id=int(lect.id),
        event_type="false_detection_review.saved",
        entity_table="submissions",
        entity_id=int(submission_id),
        metadata={"removed_range_count": len(cleaned_ranges), "version_no": next_version_no, "adjusted_plagiarism_percent": int(recalculated_percent), "idempotency_key": idempotency_key},
    )

    db.commit()

    return {
        "ok": True,
        "submission_id": submission_id,
        "adjusted_plagiarism_percent": int(recalculated_percent),
        "removed_ranges": cleaned_ranges,
        "justification_note": str(payload.justification_note).strip(),
        "version_no": next_version_no,
        "idempotency_key": idempotency_key,
        "idempotent_replay": False,
    }

@router.get("/{ident}/submissions/{submission_id}/integrity-highlighted-pdf")
def lecturer_integrity_highlighted_pdf(
    ident: str,
    submission_id: int,
    mode: str = Query("plagiarism"),
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    sub = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
        phrases, ai_spans = _collect_integrity_highlights(
            latest.payload if isinstance(latest.payload, dict) else None
        )
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
    return FileResponse(
        temp_pdf,
        media_type="application/pdf",
        filename=filename,
        background=BackgroundTask(lambda: cleanup_temp_file(temp_pdf, True)),
    )


@router.get("/{ident}/submissions/{submission_id}/integrity-detailed-pdf")
def lecturer_integrity_detailed_pdf(
    ident: str,
    submission_id: int,
    db: Session = Depends(get_db),
):
    lect = get_lecturer(db, ident)

    sub = (
        db.query(Submission)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Class, Assignment.class_id == Class.id)
        .filter(and_(Submission.id == submission_id, Class.lecturer_id == lect.id))
        .first()
    )

    if not sub or not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    payload = latest.payload if isinstance(latest.payload, dict) else None
    lecture_phrases, submission_phrases, online_phrases = _collect_detailed_plagiarism_phrases(payload)
    detailed_matches = _collect_detailed_match_details(payload)

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
        temp_pdf = generate_detailed_integrity_highlight_pdf_from_local(
            str(local_pdf_path),
            lecture_phrases=lecture_phrases,
            submission_phrases=submission_phrases,
            online_phrases=online_phrases,
            report_text=prepare_text_for_similarity(extracted.full_text or ""),
            detailed_matches=detailed_matches,
        )
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    filename = f"submission-{submission_id}-detailed-integrity-report.pdf"
    return FileResponse(
        temp_pdf,
        media_type="application/pdf",
        filename=filename,
        background=BackgroundTask(lambda: cleanup_temp_file(temp_pdf, True)),
    )


# -------------------- ACTIVITY --------------------


@router.get("/{ident}/activity")
def lecturer_activity(ident: str, db: Session = Depends(get_db)):
    lect = get_lecturer(db, ident)

    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.actor_user_id == lect.id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(15)
        .all()
    )

    return [
        {
            "id": str(r.correlation_id),
            "text": f"{r.event_type} on {r.entity_table}:{r.entity_id}",
        }
        for r in rows
    ]


@router.get("/{ident}/announcements")
def lecturer_announcements(ident: str, db: Session = Depends(get_db)):
    lecturer = get_lecturer(db, ident)

    rows = (
        db.query(AdminAnnouncement)
        .filter(
            AdminAnnouncement.is_active == True,
            AdminAnnouncement.audience.in_(["lecturers", "all"])
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
