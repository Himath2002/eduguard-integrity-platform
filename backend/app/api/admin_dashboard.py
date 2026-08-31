from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from app.db.deps import get_db
from app.models.user import User
from app.models.submission import Submission
from app.models.integrity import IntegrityJob
from app.models.marking import SubmissionMarkReport
from app.models.platform import AdminAnnouncement
from app.schemas.admin_dashboard import AdminDashboardStatsOut
from app.services.dashboard_cache import get_dashboard_cached

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


def _admin_dashboard_payload(db: Session):
    instructors = int(db.query(func.count(User.id)).filter(User.role == "lecturer").scalar() or 0)
    students = int(db.query(func.count(User.id)).filter(User.role == "student").scalar() or 0)

    latest_job_ids = (
        db.query(
            IntegrityJob.submission_id.label("submission_id"),
            func.max(IntegrityJob.id).label("job_id"),
        )
        .group_by(IntegrityJob.submission_id)
        .subquery()
    )

    pending_submissions = int(
        db.query(func.count(Submission.id))
        .outerjoin(latest_job_ids, latest_job_ids.c.submission_id == Submission.id)
        .outerjoin(IntegrityJob, IntegrityJob.id == latest_job_ids.c.job_id)
        .outerjoin(SubmissionMarkReport, SubmissionMarkReport.submission_id == Submission.id)
        .filter(
            or_(
                IntegrityJob.id.is_(None),
                IntegrityJob.status != "done",
                SubmissionMarkReport.id.is_(None),
            )
        )
        .scalar()
        or 0
    )

    latest_announcement = (
        db.query(AdminAnnouncement)
        .filter(AdminAnnouncement.is_active == True)
        .order_by(AdminAnnouncement.created_at.desc(), AdminAnnouncement.id.desc())
        .first()
    )

    return {
        "instructors": instructors,
        "students": students,
        "pending_submissions": pending_submissions,
        "latest_announcement": {
            "id": int(latest_announcement.id),
            "audience": latest_announcement.audience,
            "subject": latest_announcement.subject,
            "body": latest_announcement.body,
            "created_at": latest_announcement.created_at.isoformat() if latest_announcement.created_at else None,
        } if latest_announcement else None,
    }


@router.get("/stats", response_model=AdminDashboardStatsOut)
def get_admin_dashboard_stats(db: Session = Depends(get_db)):
    payload = _admin_dashboard_payload(db)
    return {
        "instructors": payload["instructors"],
        "students": payload["students"],
        "pending_submissions": payload["pending_submissions"],
    }


@router.get("/summary")
def get_admin_dashboard_summary(db: Session = Depends(get_db)):
    return get_dashboard_cached("admin-dashboard-summary", 5.0, lambda: _admin_dashboard_payload(db))
