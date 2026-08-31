from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"

load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

import fitz  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.assignment import Assignment  # noqa: E402
from app.models.class_ import Class  # noqa: E402
from app.models.class_enrollment import ClassEnrollment  # noqa: E402
from app.models.integrity import (  # noqa: E402
    IntegrityJob,
    IntegrityResult,
    IntegrityReviewLock,
    IntegrityReviewOverride,
    IntegrityReviewOverrideVersion,
)
from app.models.submission import Submission  # noqa: E402
from app.models.user import User  # noqa: E402


LECTURER_USERNAME = "teach"
STUDENT_USERNAME = "fd_student_501"
SUBMISSION_ID = 501
CLASS_CODE = "FDTEST501"

PHRASE_ONE = "Shared template wording appears here"
PHRASE_TWO = "Approved assignment template wording"

PDF_TEXT = (
    f"{PHRASE_ONE}. {PHRASE_TWO}. "
    "This fixture document is used for local false detection validation testing. "
    "It contains controlled highlighted wording so the regression and performance "
    "tests can save a false detection review against a real integrity report."
)


def write_fixture_pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_textbox(
        fitz.Rect(72, 72, 523, 770),
        PDF_TEXT,
        fontsize=12,
        fontname="helv",
        align=0,
    )
    doc.save(path)
    doc.close()


def get_or_create_user(
    db, *, username: str, role: str, full_name: str, email: str
) -> User:
    user = db.query(User).filter(User.username == username).first()

    if user:
        user.role = role
        user.full_name = full_name
        user.email = email
        if not getattr(user, "password", None):
            user.password = "Password123!"
        if not getattr(user, "auth_provider", None):
            user.auth_provider = "local"
        db.commit()
        db.refresh(user)
        return user

    user = User(
        full_name=full_name,
        username=username,
        email=email,
        password="Password123!",
        role=role,
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        lecturer = get_or_create_user(
            db,
            username=LECTURER_USERNAME,
            role="lecturer",
            full_name="False Detection Lecturer",
            email="teach.false.detection@example.com",
        )

        student = get_or_create_user(
            db,
            username=STUDENT_USERNAME,
            role="student",
            full_name="False Detection Student",
            email="fd.student.501@example.com",
        )

        test_class = (
            db.query(Class)
            .filter(
                Class.class_code == CLASS_CODE,
                Class.lecturer_id == int(lecturer.id),
            )
            .first()
        )

        if not test_class:
            test_class = Class(
                lecturer_id=int(lecturer.id),
                name="False Detection Test Class",
                class_code=CLASS_CODE,
                description="Seeded class for false detection k6 and Postman tests.",
                is_active=True,
            )
            db.add(test_class)
            db.commit()
            db.refresh(test_class)

        enrollment = (
            db.query(ClassEnrollment)
            .filter(
                ClassEnrollment.class_id == int(test_class.id),
                ClassEnrollment.student_id == int(student.id),
            )
            .first()
        )

        if not enrollment:
            enrollment = ClassEnrollment(
                class_id=int(test_class.id),
                student_id=int(student.id),
                status="active",
            )
            db.add(enrollment)
            db.commit()
        else:
            enrollment.status = "active"
            enrollment.removed_at = None
            db.commit()

        assignment = Assignment(
            class_id=int(test_class.id),
            title="False Detection Fixture Assignment",
            description="Seeded assignment for false detection validation tests.",
            due_at=None,
            allow_resubmission=True,
            max_attempts=10,
            student_report_visible=True,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

        db.query(IntegrityReviewOverrideVersion).filter(
            IntegrityReviewOverrideVersion.submission_id == SUBMISSION_ID
        ).delete(synchronize_session=False)

        db.query(IntegrityReviewOverride).filter(
            IntegrityReviewOverride.submission_id == SUBMISSION_ID
        ).delete(synchronize_session=False)

        db.query(IntegrityReviewLock).filter(
            IntegrityReviewLock.submission_id == SUBMISSION_ID
        ).delete(synchronize_session=False)

        db.query(IntegrityResult).filter(
            IntegrityResult.submission_id == SUBMISSION_ID
        ).delete(synchronize_session=False)

        db.query(IntegrityJob).filter(
            IntegrityJob.submission_id == SUBMISSION_ID
        ).delete(synchronize_session=False)

        db.query(Submission).filter(Submission.id == SUBMISSION_ID).delete(
            synchronize_session=False
        )

        db.commit()

        pdf_path = (
            BACKEND_DIR
            / "uploads"
            / "test_fixtures"
            / "false_detection_submission_501.pdf"
        )
        write_fixture_pdf(pdf_path)

        submission = Submission(
            id=SUBMISSION_ID,
            assignment_id=int(assignment.id),
            student_id=int(student.id),
            attempt_no=1,
            status="submitted",
            submitted_at=datetime.now(timezone.utc),
            file_path=str(pdf_path),
            file_name="false-detection-fixture.pdf",
            file_type="application/pdf",
            file_size=pdf_path.stat().st_size,
            storage_provider="local",
            mime_type="application/pdf",
        )
        db.add(submission)

        payload = {
            "plagiarism": {
                "percent": 60,
                "matches": [
                    {
                        "query_text": PHRASE_ONE,
                        "shared_phrases": [PHRASE_ONE],
                        "source_type": "lecture_material",
                        "source_name": "Week 1 slides",
                        "source_path": "seeded/week-1-slides.pdf",
                        "source_doc_id": "lecture-1",
                        "source_chunk_id": 1,
                        "score": 0.92,
                    },
                    {
                        "query_text": PHRASE_TWO,
                        "shared_phrases": [PHRASE_TWO],
                        "source_type": "submission",
                        "source_name": "Previous student submission",
                        "source_path": "seeded/previous-submission.pdf",
                        "source_doc_id": "submission-previous",
                        "source_chunk_id": 2,
                        "score": 0.88,
                    },
                ],
            },
            "ai": {
                "detected": False,
                "risk_percent": 12,
                "risk_level": "low",
                "spans": [],
            },
        }

        result = IntegrityResult(
            submission_id=SUBMISSION_ID,
            ai_score=0.12,
            plagiarism_score=0.60,
            payload=payload,
        )
        db.add(result)

        job = IntegrityJob(
            submission_id=SUBMISSION_ID,
            idempotency_key="seed-false-detection-fixture-501",
            status="done",
            progress=100,
            error=None,
        )
        db.add(job)

        db.commit()

        print("False Detection fixture seeded successfully.")
        print(f"Lecturer ident: {LECTURER_USERNAME}")
        print(f"Submission ID: {SUBMISSION_ID}")
        print("")
        print("Use these commands:")
        print("k6 run tests/performance/false_detection_override.k6.js")
        print("newman run postman/false_detection_validation.postman_collection.json")

    finally:
        db.close()


if __name__ == "__main__":
    main()
