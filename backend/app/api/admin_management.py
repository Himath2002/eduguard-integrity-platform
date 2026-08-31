from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.background import BackgroundTask
from starlette.responses import FileResponse
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, aliased
from typing import Any, Dict, List

from app.ai.text_extraction import extract_pdf_text
from app.ai.normalization import prepare_text_for_similarity
from app.db.deps import get_db
from app.models.assignment import Assignment
from app.models.class_ import Class
from app.models.class_enrollment import ClassEnrollment
from app.models.integrity import IntegrityJob, IntegrityResult
from app.models.marking import SubmissionMarkReport
from app.models.platform import AdminAnnouncement, PlatformSetting
from app.models.submission import Submission
from app.models.user import User
from app.services.integrity_report_service import (
    generate_integrity_highlight_pdf_from_local,
    generate_detailed_integrity_highlight_pdf_from_local,
)
from app.services.integrity_service import (
    get_latest_result,
    plagiarism_score_to_percent,
)
from app.services.storage_helpers import (
    cleanup_temp_file,
    resolve_submission_pdf_to_local,
    submission_file_response,
    submission_has_file,
)

router = APIRouter(prefix="/admin", tags=["admin-management"])


def _settings_row(db: Session) -> PlatformSetting:
    row = db.query(PlatformSetting).filter(PlatformSetting.id == 1).first()
    if row:
        return row
    row = PlatformSetting(id=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _clean_email(value: str | None) -> str:
    return str(value or "").strip()


def _email_key(value: str | None) -> str:
    return _clean_email(value).lower()


def _collect_integrity_highlights(latest_payload: dict | None):
    phrases: List[str] = []
    ai_spans: List[dict] = []

    if isinstance(latest_payload, dict):
        plag = latest_payload.get("plagiarism") or {}

        for match in plag.get("matches") or []:
            if not isinstance(match, dict):
                continue

            query_text = str(match.get("query_text") or "").strip()
            if len(query_text) >= 10:
                phrases.append(query_text)

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

            ai_spans.append(
                {
                    "start": start,
                    "end": end,
                    "confidence_percent": int(span.get("confidence_percent") or 0),
                    "text_preview": span.get("text_preview"),
                    "reasons": span.get("reasons") or [],
                    "severity": str(span.get("severity") or "low"),
                    "coverage_percent": int(span.get("coverage_percent") or 0),
                    "contribution_percent": int(span.get("contribution_percent") or 0),
                }
            )

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

            details.append(
                {
                    "phrase": cleaned,
                    "source_type": source_type,
                    "source_name": source_name,
                    "source_path": source_path,
                    "score": round(score, 4),
                    "source_doc_id": str(match.get("source_doc_id") or ""),
                    "source_chunk_id": int(match.get("source_chunk_id") or 0),
                }
            )

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


def _admin_submission(db: Session, submission_id: int) -> Submission:
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub


@router.get("/classes")
def admin_classes(db: Session = Depends(get_db)):
    lecturer = aliased(User)

    enrolled_sq = (
        db.query(
            ClassEnrollment.class_id.label("class_id"),
            func.count(ClassEnrollment.student_id).label("enrolled_count"),
        )
        .filter(ClassEnrollment.status == "active")
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

    submission_sq = (
        db.query(
            Assignment.class_id.label("class_id"),
            func.count(Submission.id).label("submission_count"),
        )
        .join(Submission, Submission.assignment_id == Assignment.id)
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
            Class.is_active,
            lecturer.full_name.label("lecturer_name"),
            lecturer.username.label("lecturer_username"),
            func.coalesce(enrolled_sq.c.enrolled_count, 0).label("enrolled_count"),
            func.coalesce(assignment_sq.c.assignment_count, 0).label(
                "assignment_count"
            ),
            func.coalesce(submission_sq.c.submission_count, 0).label(
                "submission_count"
            ),
        )
        .join(lecturer, lecturer.id == Class.lecturer_id)
        .outerjoin(enrolled_sq, enrolled_sq.c.class_id == Class.id)
        .outerjoin(assignment_sq, assignment_sq.c.class_id == Class.id)
        .outerjoin(submission_sq, submission_sq.c.class_id == Class.id)
        .order_by(Class.created_at.desc(), Class.id.desc())
        .all()
    )

    return [
        {
            "id": int(r.id),
            "name": r.name,
            "code": r.class_code,
            "description": r.description,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "is_active": bool(r.is_active),
            "lecturer_name": r.lecturer_name or r.lecturer_username,
            "lecturer_username": r.lecturer_username,
            "enrolled_count": int(r.enrolled_count or 0),
            "assignment_count": int(r.assignment_count or 0),
            "submission_count": int(r.submission_count or 0),
        }
        for r in rows
    ]


@router.get("/classes/{class_id}")
def admin_class_detail(class_id: int, db: Session = Depends(get_db)):
    c = (
        db.query(Class, User)
        .join(User, User.id == Class.lecturer_id)
        .filter(Class.id == class_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Class not found")

    class_row, lecturer = c

    students = (
        db.query(User, ClassEnrollment)
        .join(ClassEnrollment, ClassEnrollment.student_id == User.id)
        .filter(
            and_(
                ClassEnrollment.class_id == class_id,
                ClassEnrollment.status == "active",
                User.role == "student",
            )
        )
        .order_by(User.full_name.asc(), User.username.asc())
        .all()
    )

    assignments = (
        db.query(Assignment)
        .filter(Assignment.class_id == class_id)
        .order_by(Assignment.created_at.desc(), Assignment.id.desc())
        .all()
    )

    return {
        "id": int(class_row.id),
        "name": class_row.name,
        "code": class_row.class_code,
        "description": class_row.description,
        "lecturer_name": lecturer.full_name or lecturer.username,
        "lecturer_username": lecturer.username,
        "students": [
            {
                "id": int(user.id),
                "name": user.full_name,
                "username": user.username,
                "email": user.email,
                "enrolled_at": enr.enrolled_at.isoformat() if enr.enrolled_at else None,
            }
            for user, enr in students
        ],
        "assignments": [
            {
                "id": int(a.id),
                "title": a.title,
                "due_at": a.due_at.isoformat() if a.due_at else None,
                "max_attempts": int(a.max_attempts or 1),
            }
            for a in assignments
        ],
    }


@router.post("/classes/{class_id}/students")
def admin_add_student_to_class(
    class_id: int, payload: dict, db: Session = Depends(get_db)
):
    class_row = db.query(Class).filter(Class.id == class_id).first()
    if not class_row:
        raise HTTPException(status_code=404, detail="Class not found")

    student_id = payload.get("student_id")
    username = str(payload.get("username") or "").strip()
    email = _clean_email(payload.get("email"))

    q = db.query(User).filter(User.role == "student")
    student = None

    if student_id is not None:
        try:
            student = q.filter(User.id == int(student_id)).first()
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid student_id") from None
    elif username:
        student = q.filter(User.username == username).first()
    elif email:
        student = q.filter(func.lower(User.email) == _email_key(email)).first()
    else:
        raise HTTPException(
            status_code=400, detail="student_id, username or email is required"
        )

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    existing = (
        db.query(ClassEnrollment)
        .filter(
            and_(
                ClassEnrollment.class_id == class_id,
                ClassEnrollment.student_id == student.id,
            )
        )
        .first()
    )

    if existing and existing.status == "active":
        raise HTTPException(
            status_code=400, detail="Student is already enrolled in this class"
        )

    try:
        if existing:
            existing.status = "active"
            existing.removed_at = None
        else:
            db.add(
                ClassEnrollment(
                    class_id=class_id,
                    student_id=student.id,
                    status="active",
                )
            )

        db.commit()
        return {"ok": True}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add student to class: {exc.__class__.__name__}",
        )


@router.delete("/classes/{class_id}/students/{student_id}")
def admin_remove_student_from_class(
    class_id: int, student_id: int, db: Session = Depends(get_db)
):
    class_row = db.query(Class).filter(Class.id == class_id).first()
    if not class_row:
        raise HTTPException(status_code=404, detail="Class not found")

    student = (
        db.query(User).filter(User.id == student_id, User.role == "student").first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enrollment = (
        db.query(ClassEnrollment)
        .filter(
            and_(
                ClassEnrollment.class_id == class_id,
                ClassEnrollment.student_id == student_id,
            )
        )
        .first()
    )

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    try:
        db.delete(enrollment)
        db.commit()
        return {"ok": True}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove student from class: {exc.__class__.__name__}",
        )


@router.get("/reports")
def admin_reports(
    q: str | None = Query(default=None),
    class_code: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    student = aliased(User)
    lecturer = aliased(User)

    latest_job_sq = (
        db.query(
            IntegrityJob.submission_id.label("submission_id"),
            func.max(IntegrityJob.id).label("latest_job_id"),
        )
        .group_by(IntegrityJob.submission_id)
        .subquery()
    )

    rows = (
        db.query(
            Submission.id.label("submission_id"),
            Submission.submitted_at,
            Submission.attempt_no,
            Submission.file_name,
            Submission.file_path,
            Submission.s3_key,
            Submission.storage_provider,
            Assignment.id.label("assignment_id"),
            Assignment.title.label("assignment_title"),
            Class.class_code,
            Class.name.label("class_name"),
            lecturer.full_name.label("lecturer_name"),
            lecturer.username.label("lecturer_username"),
            student.full_name.label("student_name"),
            student.username.label("student_username"),
            IntegrityJob.status.label("integrity_status"),
            SubmissionMarkReport.score,
            SubmissionMarkReport.max_score,
            SubmissionMarkReport.published_to_student,
        )
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Class, Class.id == Assignment.class_id)
        .join(student, student.id == Submission.student_id)
        .join(lecturer, lecturer.id == Class.lecturer_id)
        .outerjoin(latest_job_sq, latest_job_sq.c.submission_id == Submission.id)
        .outerjoin(IntegrityJob, IntegrityJob.id == latest_job_sq.c.latest_job_id)
        .outerjoin(
            SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id
        )
    )

    if class_code and class_code.strip():
        rows = rows.filter(Class.class_code == class_code.strip())

    if q and q.strip():
        like = f"%{q.strip()}%"
        rows = rows.filter(
            or_(
                student.full_name.ilike(like),
                student.username.ilike(like),
                Assignment.title.ilike(like),
                Class.class_code.ilike(like),
                Class.name.ilike(like),
                lecturer.full_name.ilike(like),
                lecturer.username.ilike(like),
            )
        )

    rows_query = rows.order_by(Submission.id.desc())
    if limit is not None:
        rows_query = rows_query.offset(int(offset)).limit(int(limit))
    rows = rows_query.all()

    submission_ids = [int(r.submission_id) for r in rows]
    latest_results: Dict[int, IntegrityResult] = {}
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

    out = []
    for r in rows:
        submission_id = int(r.submission_id)
        latest_res = latest_results.get(submission_id)
        ai_payload = (
            (latest_res.payload.get("ai") or {})
            if (latest_res and isinstance(latest_res.payload, dict))
            else {}
        )
        has_file = bool(
            (
                (getattr(r, "storage_provider", None) == "s3")
                and getattr(r, "s3_key", None)
            )
            or getattr(r, "file_path", None)
        )

        out.append(
            {
                "submission_id": submission_id,
                "assignment_id": int(r.assignment_id),
                "assignment_title": r.assignment_title,
                "class_code": r.class_code,
                "class_name": r.class_name,
                "lecturer_name": r.lecturer_name or r.lecturer_username,
                "student_name": r.student_name,
                "student_username": r.student_username,
                "submitted_at": r.submitted_at.date().isoformat()
                if r.submitted_at
                else "",
                "plagiarism_percent": plagiarism_score_to_percent(
                    latest_res.plagiarism_score
                )
                if latest_res
                else 0,
                "ai_detected": bool(ai_payload.get("detected"))
                if latest_res
                else False,
                "ai_risk_percent": int(
                    ai_payload.get("risk_percent") or ai_payload.get("percent") or 0
                )
                if latest_res
                else 0,
                "ai_risk_level": str(
                    ai_payload.get("risk_level") or ai_payload.get("level") or "low"
                )
                if latest_res
                else "low",
                "attempt_no": int(r.attempt_no or 1),
                "file_name": r.file_name,
                "storage_provider": r.storage_provider,
                "integrity_status": r.integrity_status or "pending",
                "marked_score": int(r.score) if r.score is not None else None,
                "marked_max_score": int(r.max_score)
                if r.max_score is not None
                else None,
                "mark_published": bool(r.published_to_student)
                if r.published_to_student is not None
                else False,
                "has_original_file": has_file,
                "original_file_url": f"/admin/submissions/{submission_id}/file"
                if has_file
                else None,
            }
        )

    return out


@router.get("/submissions/{submission_id}/file")
def admin_download_submission(
    submission_id: int,
    db: Session = Depends(get_db),
):
    sub = _admin_submission(db, submission_id)

    if not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    try:
        return submission_file_response(sub)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Submission file not found")


@router.get("/submissions/{submission_id}/report-text")
def admin_submission_report_text(
    submission_id: int,
    db: Session = Depends(get_db),
):
    sub = _admin_submission(db, submission_id)

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    if not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

    local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(sub)
    try:
        extracted = extract_pdf_text(str(local_pdf_path))
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup)

    payload = latest.payload if isinstance(latest.payload, dict) else None
    phrases, ai_spans = _collect_integrity_highlights(payload)
    lecture_phrases, submission_phrases, online_phrases = _collect_detailed_plagiarism_phrases(payload)
    detailed_matches = _collect_detailed_match_details(payload)

    return {
        "submission_id": int(submission_id),
        "text": extracted.full_text or "",
        "plagiarism_text": prepare_text_for_similarity(extracted.full_text or ""),
        "plagiarised_phrases": phrases,
        "lecture_phrases": lecture_phrases,
        "submission_phrases": submission_phrases,
        "online_phrases": online_phrases,
        "detailed_matches": detailed_matches,
        "ai_spans": ai_spans,
        "original_file_url": f"/admin/submissions/{int(submission_id)}/file"
        if submission_has_file(sub)
        else None,
    }


@router.get("/submissions/{submission_id}/integrity-highlighted-pdf")
def admin_integrity_highlighted_pdf(
    submission_id: int,
    mode: str = Query("plagiarism"),
    db: Session = Depends(get_db),
):
    sub = _admin_submission(db, submission_id)

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    if not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

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


@router.get("/submissions/{submission_id}/integrity-detailed-pdf")
def admin_integrity_detailed_pdf(
    submission_id: int,
    db: Session = Depends(get_db),
):
    sub = _admin_submission(db, submission_id)

    latest = get_latest_result(db, int(submission_id))
    if not latest:
        raise HTTPException(status_code=409, detail="Report is not ready yet")

    if not submission_has_file(sub):
        raise HTTPException(status_code=404, detail="Submission file not found")

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


@router.get("/settings")
def admin_settings(db: Session = Depends(get_db)):
    row = _settings_row(db)
    return {
        "plagiarism_threshold": int(row.plagiarism_threshold),
        "ai_threshold": int(row.ai_threshold),
        "allowed_types": {
            "pdf": bool(row.allow_pdf),
            "word": bool(row.allow_word),
            "text": bool(row.allow_text),
            "markdown": bool(row.allow_markdown),
            "html": bool(row.allow_html),
        },
        "two_factor_mode": row.two_factor_mode,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.put("/settings")
def save_admin_settings(payload: dict, db: Session = Depends(get_db)):
    row = _settings_row(db)
    row.plagiarism_threshold = max(
        0,
        min(100, int(payload.get("plagiarism_threshold") or row.plagiarism_threshold)),
    )
    row.ai_threshold = max(
        0, min(100, int(payload.get("ai_threshold") or row.ai_threshold))
    )

    allowed = payload.get("allowed_types") or {}
    row.allow_pdf = bool(allowed.get("pdf", row.allow_pdf))
    row.allow_word = bool(allowed.get("word", row.allow_word))
    row.allow_text = bool(allowed.get("text", row.allow_text))
    row.allow_markdown = bool(allowed.get("markdown", row.allow_markdown))
    row.allow_html = bool(allowed.get("html", row.allow_html))

    mode = str(payload.get("two_factor_mode") or row.two_factor_mode).strip().lower()
    if mode not in {"optional", "required", "disabled"}:
        raise HTTPException(status_code=400, detail="Unsupported two_factor_mode")

    row.two_factor_mode = mode
    db.commit()
    db.refresh(row)

    return {
        "ok": True,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/announcements")
def list_announcements(db: Session = Depends(get_db)):
    rows = (
        db.query(AdminAnnouncement)
        .order_by(AdminAnnouncement.created_at.desc(), AdminAnnouncement.id.desc())
        .all()
    )

    return [
        {
            "id": int(r.id),
            "audience": r.audience,
            "subject": r.subject,
            "body": r.body,
            "is_active": bool(r.is_active),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.post("/announcements")
def create_announcement(payload: dict, db: Session = Depends(get_db)):
    subject = str(payload.get("subject") or "").strip()
    body = str(payload.get("body") or "").strip()
    audience = str(payload.get("audience") or "all").strip().lower()

    if audience not in {"all", "students", "lecturers", "admins"}:
        raise HTTPException(status_code=400, detail="Invalid audience")
    if not subject:
        raise HTTPException(status_code=400, detail="Subject is required")
    if not body:
        raise HTTPException(status_code=400, detail="Message is required")

    row = AdminAnnouncement(
        audience=audience,
        subject=subject,
        body=body,
        is_active=bool(payload.get("is_active", True)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": int(row.id),
        "audience": row.audience,
        "subject": row.subject,
        "body": row.body,
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/announcements/{announcement_id}")
def delete_announcement(announcement_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(AdminAnnouncement)
        .filter(AdminAnnouncement.id == announcement_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(row)
    db.commit()
    return {"ok": True}
