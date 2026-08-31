from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.deps import get_db
from app.models.assignment import Assignment
from app.models.audit_event import AuditEvent
from app.models.class_ import Class
from app.models.class_enrollment import ClassEnrollment
from app.models.communication import CommentMessage, CommentThread
from app.models.integrity import CorpusChunk, IntegrityJob, IntegrityResult
from app.models.marking import MarkAnnotation, SubmissionMarkReport
from app.models.submission import Submission
from app.models.user import User
from app.schemas.admin_users import AdminUserCreate, AdminUserOut, AdminUserUpdate

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


def _extract_ids(rows) -> list[int]:
    return [int(row[0]) for row in rows]


def _normalize_name(value: str) -> str:
    normalized = " ".join(str(value or "").strip().split())
    if len(normalized) < 2:
        raise HTTPException(
            status_code=400, detail="Name must be at least 2 characters"
        )
    return normalized


def _clean_email(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Email is required")
    return raw


def _email_key(value: str) -> str:
    return _clean_email(value).lower()


@router.get("", response_model=list[AdminUserOut])
def list_users(
    role: str | None = Query(default=None, pattern="^(student|lecturer)$"),
    q: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role != "admin")

    if role:
        query = query.filter(User.role == role)

    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(like),
                User.username.ilike(like),
                User.full_name.ilike(like),
            )
        )

    return query.order_by(User.id.desc()).all()


@router.post("", response_model=AdminUserOut)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db)):
    try:
        password = payload.password.strip()

        if len(password.encode("utf-8")) > 72:
            raise HTTPException(
                status_code=400, detail="Password must be 72 characters or less"
            )

        full_name = _normalize_name(payload.full_name)
        username = payload.username.strip()
        email = _clean_email(payload.email)

        existing_email = (
            db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
        )
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already exists")

        if db.query(User).filter(User.username == username).first():
            raise HTTPException(status_code=400, detail="Username already exists")

        user = User(
            full_name=full_name,
            username=username,
            email=email,
            password=hash_password(password),
            role=payload.role,
        )

        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create user: {exc.__class__.__name__}",
        )


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, payload: AdminUserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot edit admin users")

    try:
        if payload.full_name is not None:
            user.full_name = _normalize_name(payload.full_name)

        if payload.email is not None:
            email = _clean_email(payload.email)
            existing = (
                db.query(User)
                .filter(func.lower(User.email) == _email_key(email), User.id != user_id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Email already exists")
            user.email = email

        if payload.role is not None:
            user.role = payload.role

        db.commit()
        db.refresh(user)
        return user

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update user: {exc.__class__.__name__}",
        )


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete admin users")

    try:
        class_ids = _extract_ids(
            db.query(Class.id).filter(Class.lecturer_id == user_id).all()
        )

        assignment_ids = (
            _extract_ids(
                db.query(Assignment.id).filter(Assignment.class_id.in_(class_ids)).all()
            )
            if class_ids
            else []
        )

        own_submission_ids = _extract_ids(
            db.query(Submission.id).filter(Submission.student_id == user_id).all()
        )

        class_submission_ids = (
            _extract_ids(
                db.query(Submission.id)
                .filter(Submission.assignment_id.in_(assignment_ids))
                .all()
            )
            if assignment_ids
            else []
        )

        submission_ids = sorted({*own_submission_ids, *class_submission_ids})

        report_ids_from_submissions = (
            _extract_ids(
                db.query(SubmissionMarkReport.id)
                .filter(SubmissionMarkReport.submission_id.in_(submission_ids))
                .all()
            )
            if submission_ids
            else []
        )

        lecturer_report_ids = _extract_ids(
            db.query(SubmissionMarkReport.id)
            .filter(SubmissionMarkReport.lecturer_id == user_id)
            .all()
        )

        report_ids = sorted({*report_ids_from_submissions, *lecturer_report_ids})

        thread_ids: set[int] = set(
            _extract_ids(
                db.query(CommentThread.id)
                .filter(CommentThread.student_id == user_id)
                .all()
            )
        )

        thread_ids.update(
            _extract_ids(
                db.query(CommentThread.id)
                .filter(CommentThread.lecturer_id == user_id)
                .all()
            )
        )

        if submission_ids:
            thread_ids.update(
                _extract_ids(
                    db.query(CommentThread.id)
                    .filter(CommentThread.submission_id.in_(submission_ids))
                    .all()
                )
            )

        if report_ids:
            thread_ids.update(
                _extract_ids(
                    db.query(CommentThread.id)
                    .filter(CommentThread.report_id.in_(report_ids))
                    .all()
                )
            )

        db.query(AuditEvent).filter(AuditEvent.actor_user_id == user_id).update(
            {AuditEvent.actor_user_id: None},
            synchronize_session=False,
        )

        db.query(CommentMessage).filter(CommentMessage.sender_id == user_id).delete(
            synchronize_session=False
        )

        if thread_ids:
            db.query(CommentMessage).filter(
                CommentMessage.thread_id.in_(list(thread_ids))
            ).delete(synchronize_session=False)

            db.query(CommentThread).filter(
                CommentThread.id.in_(list(thread_ids))
            ).delete(synchronize_session=False)

        if report_ids:
            db.query(MarkAnnotation).filter(
                MarkAnnotation.report_id.in_(report_ids)
            ).delete(synchronize_session=False)

            db.query(SubmissionMarkReport).filter(
                SubmissionMarkReport.id.in_(report_ids)
            ).delete(synchronize_session=False)

        if submission_ids:
            db.query(IntegrityJob).filter(
                IntegrityJob.submission_id.in_(submission_ids)
            ).delete(synchronize_session=False)

            db.query(IntegrityResult).filter(
                IntegrityResult.submission_id.in_(submission_ids)
            ).delete(synchronize_session=False)

            db.query(CorpusChunk).filter(CorpusChunk.doc_id.in_(submission_ids)).delete(
                synchronize_session=False
            )

            db.query(Submission).filter(Submission.id.in_(submission_ids)).delete(
                synchronize_session=False
            )

        db.query(ClassEnrollment).filter(ClassEnrollment.student_id == user_id).delete(
            synchronize_session=False
        )

        if class_ids:
            db.query(ClassEnrollment).filter(
                ClassEnrollment.class_id.in_(class_ids)
            ).delete(synchronize_session=False)

            db.query(Assignment).filter(Assignment.class_id.in_(class_ids)).delete(
                synchronize_session=False
            )

            db.query(Class).filter(Class.id.in_(class_ids)).delete(
                synchronize_session=False
            )

        deleted = (
            db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
        )

        if not deleted:
            raise HTTPException(status_code=404, detail="User not found")

        db.commit()
        return {"ok": True}

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {exc.__class__.__name__}",
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(exc)}",
        )
