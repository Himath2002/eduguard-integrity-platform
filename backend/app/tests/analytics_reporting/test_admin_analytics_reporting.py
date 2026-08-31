from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import literal_column

from app.api import admin_dashboard as admin_dashboard_api
from app.api import admin_management as admin_management_api


class FakeSubquery:
    def __init__(self) -> None:
        self.c = SimpleNamespace(
            submission_id=literal_column("submission_id"),
            job_id=literal_column("job_id"),
            latest_job_id=literal_column("latest_job_id"),
            result_id=literal_column("result_id"),
            class_id=literal_column("class_id"),
            enrolled=literal_column("enrolled"),
            activeAssignments=literal_column("activeAssignments"),
            report_id=literal_column("report_id"),
            annotation_count=literal_column("annotation_count"),
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
def admin_report_row() -> SimpleNamespace:
    return SimpleNamespace(
        submission_id=501,
        submitted_at=SimpleNamespace(
            date=lambda: SimpleNamespace(isoformat=lambda: "2026-04-18")
        ),
        attempt_no=2,
        file_name="research-report.pdf",
        file_path="/tmp/research-report.pdf",
        s3_key=None,
        storage_provider="local",
        assignment_id=44,
        assignment_title="AI Ethics Report",
        class_code="SE3050",
        class_name="Software Engineering",
        lecturer_name="Dr Lecturer",
        lecturer_username="lecturer1",
        student_name="Mina Student",
        student_username="mina",
        integrity_status="done",
        score=86,
        max_score=100,
        published_to_student=True,
    )


def test_admin_dashboard_summary_counts_users_pending_submissions_and_latest_announcement() -> (
    None
):
    announcement = SimpleNamespace(
        id=9,
        audience="all",
        subject="Sprint 03 reports ready",
        body="Reports are now available.",
        created_at=SimpleNamespace(isoformat=lambda: "2026-04-19T09:30:00"),
    )

    db = SequentialFakeDB(
        3,
        27,
        None,
        5,
        announcement,
    )

    payload = admin_dashboard_api._admin_dashboard_payload(db)

    assert payload["instructors"] == 3
    assert payload["students"] == 27
    assert payload["pending_submissions"] == 5
    assert payload["latest_announcement"] == {
        "id": 9,
        "audience": "all",
        "subject": "Sprint 03 reports ready",
        "body": "Reports are now available.",
        "created_at": "2026-04-19T09:30:00",
    }


def test_admin_dashboard_stats_exposes_only_metric_fields() -> None:
    db = SequentialFakeDB(
        2,
        14,
        None,
        4,
        None,
    )

    response = admin_dashboard_api.get_admin_dashboard_stats(db=db)

    assert response == {
        "instructors": 2,
        "students": 14,
        "pending_submissions": 4,
    }


def test_admin_reports_maps_integrity_marking_and_file_fields(
    monkeypatch: pytest.MonkeyPatch,
    admin_report_row: SimpleNamespace,
) -> None:
    latest_result = SimpleNamespace(
        submission_id=501,
        plagiarism_score=0.42,
        payload={
            "ai": {
                "detected": True,
                "risk_percent": 76,
                "risk_level": "high",
            }
        },
    )

    db = SequentialFakeDB(
        None,
        [admin_report_row],
        None,
        [latest_result],
    )

    monkeypatch.setattr(
        admin_management_api,
        "plagiarism_score_to_percent",
        lambda score: int(float(score) * 100),
    )

    response = admin_management_api.admin_reports(
        q=None,
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    assert len(response) == 1

    row = response[0]
    assert row["submission_id"] == 501
    assert row["assignment_title"] == "AI Ethics Report"
    assert row["class_code"] == "SE3050"
    assert row["lecturer_name"] == "Dr Lecturer"
    assert row["student_username"] == "mina"
    assert row["plagiarism_percent"] == 42
    assert row["ai_detected"] is True
    assert row["ai_risk_percent"] == 76
    assert row["ai_risk_level"] == "high"
    assert row["marked_score"] == 86
    assert row["marked_max_score"] == 100
    assert row["mark_published"] is True
    assert row["has_original_file"] is True
    assert row["original_file_url"] == "/admin/submissions/501/file"


def test_admin_reports_returns_safe_defaults_when_integrity_result_is_missing(
    admin_report_row: SimpleNamespace,
) -> None:
    admin_report_row.file_path = None
    admin_report_row.score = None
    admin_report_row.max_score = None
    admin_report_row.published_to_student = None

    db = SequentialFakeDB(
        None,
        [admin_report_row],
        None,
        [],
    )

    response = admin_management_api.admin_reports(
        q=None,
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    row = response[0]

    assert row["plagiarism_percent"] == 0
    assert row["ai_detected"] is False
    assert row["ai_risk_percent"] == 0
    assert row["ai_risk_level"] == "low"
    assert row["marked_score"] is None
    assert row["marked_max_score"] is None
    assert row["mark_published"] is False
    assert row["has_original_file"] is False
    assert row["original_file_url"] is None
