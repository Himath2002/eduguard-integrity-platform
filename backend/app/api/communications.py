from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

from app.ai.text_extraction import extract_pdf_text
from app.services.storage_helpers import cleanup_temp_file, resolve_submission_pdf_to_local, submission_has_file
from app.db.deps import get_db
from app.db.session import SessionLocal
from app.models.assignment import Assignment
from app.models.class_ import Class
from app.models.communication import CommentMessage, CommentThread
from app.models.marking import MarkAnnotation, SubmissionMarkReport
from app.models.platform import AdminAnnouncement
from app.models.submission import Submission
from app.models.user import User
from app.services.realtime import realtime_manager
from app.schemas.communication import AnnouncementCreate

router = APIRouter(prefix="/communications", tags=["communications"])

VALID_ROLES = {"student", "lecturer"}


def _user_key(role: str, user_id: int) -> str:
    return f"{role}:{int(user_id)}"


def _get_actor(db: Session, *, role: str, ident: str) -> User:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=404, detail="Unsupported communication role")
    q = db.query(User)
    user = q.filter(User.id == int(ident)).first() if ident.isdigit() else q.filter(User.username == ident).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != role:
        raise HTTPException(status_code=403, detail="User role does not match this communication area")
    return user


def _thread_scope_query(db: Session):
    return (
        db.query(
            CommentThread,
            Submission,
            SubmissionMarkReport,
            Assignment,
            Class,
            User.username.label("student_username"),
            User.full_name.label("student_name"),
            User.username.label("student_username_dup"),
        )
    )


def _load_thread_context(db: Session, thread_id: int):
    return (
        db.query(
            CommentThread,
            Submission,
            SubmissionMarkReport,
            Assignment,
            Class,
            User.username.label("student_username"),
            User.full_name.label("student_full_name"),
            User.email.label("student_email"),
            MarkAnnotation,
        )
        .join(Submission, Submission.id == CommentThread.submission_id)
        .join(SubmissionMarkReport, SubmissionMarkReport.id == CommentThread.report_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Class, Class.id == Assignment.class_id)
        .join(User, User.id == CommentThread.student_id)
        .outerjoin(MarkAnnotation, MarkAnnotation.id == CommentThread.annotation_id)
        .filter(CommentThread.id == thread_id)
        .first()
    )


def _thread_access_check(actor: User, thread: CommentThread) -> None:
    if actor.role == "student" and int(thread.student_id) != int(actor.id):
        raise HTTPException(status_code=403, detail="This thread is not available to this student")
    if actor.role == "lecturer" and int(thread.lecturer_id) != int(actor.id):
        raise HTTPException(status_code=403, detail="This thread is not available to this lecturer")


def _serialize_message(db: Session, message: CommentMessage) -> dict:
    sender = db.query(User).filter(User.id == message.sender_id).first()
    sender_name = (sender.full_name if sender and sender.full_name else sender.username if sender else None) or "User"
    sender_username = sender.username if sender else None
    return {
        "id": int(message.id),
        "thread_id": int(message.thread_id),
        "sender_id": int(message.sender_id),
        "sender_role": message.sender_role,
        "sender_name": sender_name,
        "sender_username": sender_username,
        "body": message.body,
        "read_at": message.read_at.isoformat() if message.read_at else None,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def _serialize_thread_summary(db: Session, actor_role: str, thread: CommentThread) -> dict:
    row = _load_thread_context(db, int(thread.id))
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    _, submission, report, assignment, class_row, student_username, student_full_name, _, annotation = row
    latest_message = (
        db.query(CommentMessage)
        .filter(CommentMessage.thread_id == thread.id)
        .order_by(CommentMessage.created_at.desc(), CommentMessage.id.desc())
        .first()
    )
    unread_count = (
        db.query(CommentMessage)
        .filter(
            CommentMessage.thread_id == thread.id,
            CommentMessage.sender_role != actor_role,
            CommentMessage.read_at.is_(None),
        )
        .count()
    )

    annotation_order_no = thread.annotation_order_no or (annotation.order_no if annotation else None)
    annotation_text = (annotation.selected_text if annotation else None) or thread.annotation_selected_text
    annotation_comment = (annotation.comment if annotation else None) or thread.annotation_comment_snapshot

    return {
        "id": int(thread.id),
        "submission_id": int(thread.submission_id),
        "report_id": int(thread.report_id),
        "annotation_id": int(thread.annotation_id) if thread.annotation_id else (int(annotation.id) if annotation else None),
        "annotation_order_no": annotation_order_no,
        "annotation_selected_text": annotation_text,
        "annotation_comment": annotation_comment,
        "thread_status": thread.thread_status,
        "assignment_title": assignment.title,
        "class_code": class_row.class_code,
        "class_name": class_row.name,
        "student_username": student_username,
        "student_name": student_full_name or student_username,
        "score": report.score,
        "max_score": report.max_score,
        "latest_message": latest_message.body if latest_message else None,
        "latest_message_at": latest_message.created_at.isoformat() if latest_message and latest_message.created_at else (thread.last_message_at.isoformat() if thread.last_message_at else None),
        "latest_message_sender_role": latest_message.sender_role if latest_message else None,
        "unread_count": int(unread_count),
    }


def _serialize_thread_detail(db: Session, actor_role: str, thread: CommentThread) -> dict:
    row = _load_thread_context(db, int(thread.id))
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    _, submission, report, assignment, class_row, student_username, student_full_name, _, annotation = row
    messages = (
        db.query(CommentMessage)
        .filter(CommentMessage.thread_id == thread.id)
        .order_by(CommentMessage.created_at.asc(), CommentMessage.id.asc())
        .all()
    )

    incoming = (
        db.query(CommentMessage)
        .filter(
            CommentMessage.thread_id == thread.id,
            CommentMessage.sender_role != actor_role,
            CommentMessage.read_at.is_(None),
        )
        .all()
    )
    changed = False
    now = datetime.now(timezone.utc)
    for item in incoming:
        if item.read_at is None:
            item.read_at = now
            changed = True
    if changed:
        db.commit()
        db.refresh(thread)
        messages = (
            db.query(CommentMessage)
            .filter(CommentMessage.thread_id == thread.id)
            .order_by(CommentMessage.created_at.asc(), CommentMessage.id.asc())
            .all()
        )

    report_text = ""
    if submission_has_file(submission):
        local_pdf_path, should_cleanup = resolve_submission_pdf_to_local(submission)
        try:
            report_text = extract_pdf_text(str(local_pdf_path)).full_text or ""
        finally:
            cleanup_temp_file(local_pdf_path, should_cleanup)

    selected_text = (annotation.selected_text if annotation else None) or thread.annotation_selected_text or ""
    comment_text = (annotation.comment if annotation else None) or thread.annotation_comment_snapshot or ""
    annotation_id = int(annotation.id) if annotation else (int(thread.annotation_id) if thread.annotation_id else None)
    annotation_order_no = (int(annotation.order_no) if annotation and annotation.order_no is not None else thread.annotation_order_no)

    return {
        "thread": _serialize_thread_summary(db, actor_role, thread),
        "messages": [_serialize_message(db, message) for message in messages],
        "context": {
            "submission_id": int(submission.id),
            "assignment_id": int(assignment.id),
            "assignment_title": assignment.title,
            "class_code": class_row.class_code,
            "class_name": class_row.name,
            "student_username": student_username,
            "student_name": student_full_name or student_username,
            "score": report.score,
            "max_score": report.max_score,
            "annotation": {
                "id": annotation_id,
                "order_no": annotation_order_no,
                "selected_text": selected_text,
                "comment": comment_text,
                "annotation_color": (annotation.annotation_color if annotation else None) or "blue",
            },
            "report_text": report_text,
            "original_file_url": None,
            "submission_file_url": f"/student/{student_username}/submissions/{int(submission.id)}/file",
            "lecturer_file_url": f"/lecturer/{thread.lecturer_id}/submissions/{int(submission.id)}/file",
            "marked_pdf_student_url": f"/student/{student_username}/submissions/{int(submission.id)}/marked-report/pdf" if report.generated_pdf_path and report.published_to_student else None,
            "marked_pdf_lecturer_url": f"/lecturer/{thread.lecturer_id}/submissions/{int(submission.id)}/marked-report/pdf" if report.generated_pdf_path else None,
        },
    }


def _resolve_file_urls(db: Session, actor: User, detail: dict) -> dict:
    # Replace ident placeholders with stable usernames for both actors.
    lecturer = db.query(User).filter(User.id == detail["thread"]["id"] * 0 + actor.id).first()
    return detail


def _thread_from_context(db: Session, *, actor: User, submission_id: int, annotation_id: int | None = None, annotation_order_no: int | None = None) -> CommentThread:
    base = (
        db.query(Submission, Assignment, Class, SubmissionMarkReport)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Class, Class.id == Assignment.class_id)
        .join(SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id)
        .filter(Submission.id == submission_id)
    )

    if actor.role == "student":
        row = base.filter(Submission.student_id == actor.id, SubmissionMarkReport.published_to_student == True).first()
    else:
        row = base.filter(Class.lecturer_id == actor.id).first()

    if not row:
        raise HTTPException(status_code=404, detail="Marked comment context not found")

    submission, _, class_row, report = row
    student_id = int(submission.student_id)
    lecturer_id = int(class_row.lecturer_id)

    annotation = None
    if annotation_id:
        annotation = (
            db.query(MarkAnnotation)
            .filter(and_(MarkAnnotation.id == int(annotation_id), MarkAnnotation.report_id == report.id))
            .first()
        )
    elif annotation_order_no:
        annotation = (
            db.query(MarkAnnotation)
            .filter(and_(MarkAnnotation.report_id == report.id, MarkAnnotation.order_no == int(annotation_order_no)))
            .first()
        )

    if not annotation:
        raise HTTPException(status_code=404, detail="Comment annotation not found")

    thread = (
        db.query(CommentThread)
        .filter(
            CommentThread.submission_id == submission.id,
            CommentThread.report_id == report.id,
            CommentThread.student_id == student_id,
            CommentThread.lecturer_id == lecturer_id,
            CommentThread.annotation_id == annotation.id,
        )
        .first()
    )
    if thread:
        thread.annotation_order_no = int(annotation.order_no) if annotation.order_no is not None else None
        thread.annotation_selected_text = annotation.selected_text
        thread.annotation_comment_snapshot = annotation.comment
        db.commit()
        db.refresh(thread)
        return thread

    thread = CommentThread(
        submission_id=int(submission.id),
        report_id=int(report.id),
        annotation_id=int(annotation.id),
        student_id=student_id,
        lecturer_id=lecturer_id,
        annotation_order_no=int(annotation.order_no) if annotation.order_no is not None else None,
        annotation_selected_text=annotation.selected_text,
        annotation_comment_snapshot=annotation.comment,
        thread_status="open",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _actor_threads_query(db: Session, actor: User):
    q = (
        db.query(CommentThread)
        .order_by(CommentThread.last_message_at.desc(), CommentThread.updated_at.desc(), CommentThread.id.desc())
    )
    if actor.role == "student":
        return q.filter(CommentThread.student_id == actor.id)
    return q.filter(CommentThread.lecturer_id == actor.id)

def get_admin(db: Session, ident: str) -> User:
    q = db.query(User)

    if ident.isdigit():
        user = q.filter(User.id == int(ident)).first()
    else:
        user = q.filter(func.lower(User.username) == ident.lower()).first()

    if not user:
        raise HTTPException(status_code=404, detail="Admin not found")

    if user.role != "admin":
        raise HTTPException(status_code=403, detail="User is not an admin")

    return user

@router.get("/{role}/{ident}/threads")
def list_threads(
    role: str,
    ident: str,
    submission_id: int | None = Query(default=None),
    class_code: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    actor = _get_actor(db, role=role, ident=ident)
    threads = _actor_threads_query(db, actor).all()
    out: list[dict] = []
    for thread in threads:
        summary = _serialize_thread_summary(db, actor.role, thread)
        if submission_id and int(summary["submission_id"]) != int(submission_id):
            continue
        if class_code and summary["class_code"] != class_code:
            continue
        if status == "unread" and int(summary["unread_count"]) <= 0:
            continue
        out.append(summary)
    return out


@router.post("/{role}/{ident}/threads/open")
def open_or_create_thread(
    role: str,
    ident: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    actor = _get_actor(db, role=role, ident=ident)
    submission_id = int(payload.get("submission_id") or 0)
    annotation_id = payload.get("annotation_id")
    annotation_order_no = payload.get("annotation_order_no")
    if submission_id <= 0:
        raise HTTPException(status_code=400, detail="submission_id is required")
    thread = _thread_from_context(
        db,
        actor=actor,
        submission_id=submission_id,
        annotation_id=int(annotation_id) if annotation_id not in (None, "") else None,
        annotation_order_no=int(annotation_order_no) if annotation_order_no not in (None, "") else None,
    )
    return _serialize_thread_summary(db, actor.role, thread)


@router.get("/{role}/{ident}/threads/{thread_id}")
def get_thread_detail(
    role: str,
    ident: str,
    thread_id: int,
    db: Session = Depends(get_db),
):
    actor = _get_actor(db, role=role, ident=ident)
    thread = db.query(CommentThread).filter(CommentThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    _thread_access_check(actor, thread)

    detail = _serialize_thread_detail(db, actor.role, thread)
    lecturer = db.query(User).filter(User.id == thread.lecturer_id).first()
    student = db.query(User).filter(User.id == thread.student_id).first()
    lecturer_ident = lecturer.username if lecturer else str(thread.lecturer_id)
    student_ident = student.username if student else str(thread.student_id)
    detail["context"]["submission_file_url"] = f"/student/{student_ident}/submissions/{int(thread.submission_id)}/file"
    detail["context"]["lecturer_file_url"] = f"/lecturer/{lecturer_ident}/submissions/{int(thread.submission_id)}/file"
    detail["context"]["marked_pdf_student_url"] = f"/student/{student_ident}/submissions/{int(thread.submission_id)}/marked-report/pdf" if detail["context"].get("marked_pdf_student_url") else None
    detail["context"]["marked_pdf_lecturer_url"] = f"/lecturer/{lecturer_ident}/submissions/{int(thread.submission_id)}/marked-report/pdf" if detail["context"].get("marked_pdf_lecturer_url") else None
    return detail


async def _broadcast_new_message(student_id: int, lecturer_id: int, thread_id: int, message_payload: dict, student_summary: dict, lecturer_summary: dict) -> None:
    await realtime_manager.send_to_user(_user_key("student", int(student_id)), {
        "type": "message_created",
        "thread_id": int(thread_id),
        "message": message_payload,
        "thread": student_summary,
    })
    await realtime_manager.send_to_user(_user_key("lecturer", int(lecturer_id)), {
        "type": "message_created",
        "thread_id": int(thread_id),
        "message": message_payload,
        "thread": lecturer_summary,
    })


@router.post("/{role}/{ident}/threads/{thread_id}/messages")
async def send_message(
    role: str,
    ident: str,
    thread_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    actor = _get_actor(db, role=role, ident=ident)
    thread = db.query(CommentThread).filter(CommentThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    _thread_access_check(actor, thread)

    body = str(payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Message is too long")

    message = CommentMessage(
        thread_id=int(thread.id),
        sender_id=int(actor.id),
        sender_role=actor.role,
        body=body,
    )
    db.add(message)
    db.flush()
    thread.last_message_at = func.now()
    db.commit()
    db.refresh(thread)
    db.refresh(message)

    message_payload = _serialize_message(db, message)
    student_summary = _serialize_thread_summary(db, "student", thread)
    lecturer_summary = _serialize_thread_summary(db, "lecturer", thread)
    await _broadcast_new_message(int(thread.student_id), int(thread.lecturer_id), int(thread.id), message_payload, student_summary, lecturer_summary)
    return {
        "ok": True,
        "message": message_payload,
        "thread": student_summary if actor.role == "student" else lecturer_summary,
    }


@router.websocket("/ws/{role}/{ident}")
async def communications_ws(websocket: WebSocket, role: str, ident: str):
    db = SessionLocal()
    actor = None
    key = None
    try:
        actor = _get_actor(db, role=role, ident=ident)
        key = _user_key(actor.role, int(actor.id))
    except HTTPException:
        await websocket.close(code=4403)
        try:
            db.close()
        except Exception:
            pass
        return
    except Exception:
        await websocket.close(code=1011)
        try:
            db.close()
        except Exception:
            pass
        return

    try:
        await realtime_manager.connect(key, websocket)
        try:
            await websocket.send_json({"type": "connected", "role": actor.role, "username": actor.username})
        except WebSocketDisconnect:
            return
        except Exception:
            return
        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            if (data or "").strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    finally:
        if key is not None:
            await realtime_manager.disconnect(key, websocket)
        try:
            db.close()
        except Exception:
            pass

@router.post("/admin/{ident}/announcements")
def create_announcement(
    ident: str,
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
):
    admin = get_admin(db, ident)

    announcement = AdminAnnouncement(
        audience="students",
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        is_active=True,
        created_by=admin.id,
    )

    db.add(announcement)
    db.commit()
    db.refresh(announcement)

    return {
        "ok": True,
        "message": "Announcement posted successfully.",
        "announcement": {
            "id": announcement.id,
            "audience": announcement.audience,
            "subject": announcement.subject,
            "body": announcement.body,
            "is_active": announcement.is_active,
            "created_by": announcement.created_by,
            "created_at": announcement.created_at,
            "updated_at": announcement.updated_at,
        },
    }


@router.get("/admin/{ident}/announcements")
def list_admin_announcements(
    ident: str,
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    _admin = get_admin(db, ident)

    q = db.query(AdminAnnouncement).filter(AdminAnnouncement.audience == "students")

    if search:
        term = f"%{search.strip()}%"
        q = q.filter(
            (AdminAnnouncement.subject.ilike(term))
            | (AdminAnnouncement.body.ilike(term))
        )

    rows = q.order_by(AdminAnnouncement.created_at.desc()).all()

    return [
        {
            "id": row.id,
            "audience": row.audience,
            "subject": row.subject,
            "body": row.body,
            "is_active": row.is_active,
            "created_by": row.created_by,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]