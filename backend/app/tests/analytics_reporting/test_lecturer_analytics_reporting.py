from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import literal_column

from app.api import lecturer as lecturer_api


class FakeSubquery:
    def __init__(self) -> None:
        self.c = SimpleNamespace(
            submission_id=literal_column("submission_id"),
            job_id=literal_column("job_id"),
            result_id=literal_column("result_id"),
            class_id=literal_column("class_id"),
            enrolled=literal_column("enrolled"),
            activeAssignments=literal_column("activeAssignments"),
        )


class FakeQuery:
    def __init__(self, result: Any = None):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def join(self, *args, **kwargs):
        return self

    def outerjoin(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def group_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def subquery(self):
        return FakeSubquery()

    def scalar(self):
        return self.result

    def count(self):
        return self.result

    def first(self):
        return self.result

    def all(self):
        if self.result is None:
            return []
        return self.result if isinstance(self.result, list) else [self.result]


class SequentialFakeDB:
    def __init__(self, *results: Any):
        self.results = list(results)

    def query(self, *entities):
        if not self.results:
            raise AssertionError(f"Unexpected extra query for entities: {entities!r}")
        return FakeQuery(self.results.pop(0))


@pytest.fixture()
def lecturer_user() -> SimpleNamespace:
    return SimpleNamespace(id=201, username="lecturer1", role="lecturer")


@pytest.fixture()
def lecturer_report_row() -> SimpleNamespace:
    return SimpleNamespace(
        submission_id=7001,
        assignment_id=301,
        assignment_title="Capstone Report",
        class_code="SE3050",
        class_name="Software Engineering",
        student_username="mina",
        submitted_at=SimpleNamespace(
            date=lambda: SimpleNamespace(isoformat=lambda: "2026-04-18")
        ),
        file_path="/tmp/capstone.pdf",
        file_name="capstone.pdf",
        file_type="application/pdf",
        storage_provider="local",
        s3_key=None,
        submission_status="submitted",
        mark_report_id=88,
        mark_score=91,
        mark_max_score=100,
        mark_published_to_student=True,
        mark_updated_at=SimpleNamespace(isoformat=lambda: "2026-04-18T14:20:00"),
    )


def test_lecturer_dashboard_stats_counts_classes_and_reviewable_submissions(
    lecturer_user: SimpleNamespace,
) -> None:
    db = SequentialFakeDB(
        lecturer_user,
        2,
        11,
    )

    response = lecturer_api.lecturer_dashboard_stats("lecturer1", db=db)

    assert response == {
        "submissionsToReview": 11,
        "activeClasses": 2,
    }


def test_lecturer_dashboard_summary_maps_classes_activity_and_upcoming_work(
    lecturer_user: SimpleNamespace,
) -> None:
    class_row = SimpleNamespace(
        id=10,
        name="Software Engineering",
        class_code="SE3050",
        enrolled=24,
        activeAssignments=3,
    )

    activity = SimpleNamespace(
        correlation_id="audit-123",
        event_type="submission.reviewed",
        entity_table="submissions",
        entity_id=7001,
    )

    upcoming = SimpleNamespace(
        id=301,
        title="Capstone Report",
        due_at=SimpleNamespace(
            date=lambda: SimpleNamespace(isoformat=lambda: "2026-04-19")
        ),
        class_id=10,
        class_name="Software Engineering",
        class_code="SE3050",
    )

    db = SequentialFakeDB(
        lecturer_user,
        None,
        None,
        [class_row],
        6,
        [activity],
        [(10, 24)],
        [(301, 4)],
        [upcoming],
    )

    response = lecturer_api.lecturer_dashboard_summary("lecturer1", db=db)

    assert response["stats"] == {
        "submissionsToReview": 6,
        "activeClasses": 1,
    }

    assert response["classes"] == [
        {
            "id": 10,
            "name": "Software Engineering",
            "code": "SE3050",
            "enrolled": 24,
            "activeAssignments": 3,
        }
    ]

    assert response["recent"] == [
        {
            "id": "audit-123",
            "text": "submission.reviewed on submissions:7001",
        }
    ]

    assert response["upcoming"] == [
        {
            "id": 301,
            "title": "Capstone Report",
            "className": "Software Engineering",
            "classCode": "SE3050",
            "due": "2026-04-19",
            "submitted": 4,
            "totalStudents": 24,
        }
    ]


def test_lecturer_reports_maps_integrity_marking_status_and_file_links(
    monkeypatch: pytest.MonkeyPatch,
    lecturer_user: SimpleNamespace,
    lecturer_report_row: SimpleNamespace,
) -> None:
    latest_result = SimpleNamespace(
        submission_id=7001,
        plagiarism_score=0.61,
        payload={
            "ai": {
                "detected": True,
                "risk_percent": 81,
                "risk_level": "high",
            }
        },
    )

    latest_job = SimpleNamespace(
        submission_id=7001,
        status="done",
        error=None,
    )

    review_override = SimpleNamespace(
        submission_id=7001,
        adjusted_plagiarism_score=0.25,
        removed_ranges=[{"start": 10, "end": 25}],
    )

    db = SequentialFakeDB(
        lecturer_user,
        [lecturer_report_row],
        None,
        [latest_result],
        None,
        [latest_job],
        [review_override],
    )

    monkeypatch.setattr(
        lecturer_api,
        "file_reference_exists",
        lambda **kwargs: True,
    )

    monkeypatch.setattr(
        lecturer_api,
        "plagiarism_score_to_percent",
        lambda score: int(float(score) * 100),
    )

    response = lecturer_api.lecturer_reports(
        "lecturer1",
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    assert len(response) == 1

    row = response[0]

    assert row["submission_id"] == 7001
    assert row["assignment_title"] == "Capstone Report"
    assert row["student_username"] == "mina"
    assert row["plagiarism_percent"] == 25
    assert row["false_detection_reviewed"] is True
    assert row["ai_detected"] is True
    assert row["ai_risk_percent"] == 81
    assert row["ai_risk_level"] == "high"
    assert row["mark_status"] == "published"
    assert row["mark_score"] == 91
    assert row["mark_max_score"] == 100
    assert row["mark_published_to_student"] is True
    assert row["integrity_status"] == "done"
    assert row["report_ready"] is True
    assert row["hasFile"] is True
    assert row["fileUrl"] == "/lecturer/lecturer1/submissions/7001/file"


def test_lecturer_reports_shows_failed_integrity_error_and_hides_failed_file(
    monkeypatch: pytest.MonkeyPatch,
    lecturer_user: SimpleNamespace,
    lecturer_report_row: SimpleNamespace,
) -> None:
    lecturer_report_row.submission_status = "failed"
    lecturer_report_row.mark_report_id = None
    lecturer_report_row.mark_published_to_student = False
    lecturer_report_row.mark_score = None
    lecturer_report_row.mark_max_score = None
    lecturer_report_row.mark_updated_at = None

    latest_job = SimpleNamespace(
        submission_id=7001,
        status="failed",
        error="PDF text extraction failed because the document is empty.",
    )

    db = SequentialFakeDB(
        lecturer_user,
        [lecturer_report_row],
        None,
        [],
        None,
        [latest_job],
        [],
    )

    monkeypatch.setattr(
        lecturer_api,
        "file_reference_exists",
        lambda **kwargs: True,
    )

    response = lecturer_api.lecturer_reports(
        "lecturer1",
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    row = response[0]

    assert row["mark_status"] == "new"
    assert row["integrity_status"] == "failed"
    assert row["report_ready"] is False
    assert (
        row["report_error"]
        == "PDF text extraction failed because the document is empty."
    )
    assert row["hasFile"] is False
    assert row["fileUrl"] is None


def test_lecturer_save_marking_rejects_score_greater_than_maximum(
    monkeypatch: pytest.MonkeyPatch,
    lecturer_user: SimpleNamespace,
) -> None:
    monkeypatch.setattr(
        lecturer_api,
        "get_lecturer",
        lambda db, ident: lecturer_user,
    )

    monkeypatch.setattr(
        lecturer_api,
        "_lecturer_submission",
        lambda db, lecturer_id, submission_id: SimpleNamespace(
            id=submission_id,
            assignment_id=301,
            student_id=101,
        ),
    )

    with pytest.raises(
        HTTPException,
        match="score cannot be greater than max_score",
    ) as exc_info:
        lecturer_api.lecturer_save_marking(
            "lecturer1",
            7001,
            {
                "score": 101,
                "max_score": 100,
                "published_to_student": True,
            },
            db=object(),
        )

    assert exc_info.value.status_code == 400
