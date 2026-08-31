from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import literal_column

from app.api import student as student_api


class FakeSubquery:
    def __init__(self) -> None:
        self.c = SimpleNamespace(
            submission_id=literal_column("submission_id"),
            result_id=literal_column("result_id"),
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
def student_user() -> SimpleNamespace:
    return SimpleNamespace(id=101, username="mina", role="student")


@pytest.fixture()
def student_report_row() -> SimpleNamespace:
    return SimpleNamespace(
        submission_id=9001,
        assignment_id=401,
        assignment_title="Research Summary",
        class_code="SE3050",
        class_name="Software Engineering",
        submitted_at=SimpleNamespace(
            date=lambda: SimpleNamespace(isoformat=lambda: "2026-04-18")
        ),
        file_path="/tmp/research-summary.pdf",
        file_name="research-summary.pdf",
        file_type="application/pdf",
        storage_provider="local",
        s3_key=None,
        plagiarism_score=0.34,
        payload={
            "ai": {
                "detected": True,
                "risk_percent": 69,
                "risk_level": "medium",
            }
        },
    )


def test_student_reports_maps_visible_integrity_report_rows(
    monkeypatch: pytest.MonkeyPatch,
    student_user: SimpleNamespace,
    student_report_row: SimpleNamespace,
) -> None:
    db = SequentialFakeDB(
        student_user,
        None,
        [student_report_row],
    )

    monkeypatch.setattr(
        student_api,
        "plagiarism_score_to_percent",
        lambda score: int(float(score) * 100),
    )

    response = student_api.student_reports(
        "mina",
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    assert len(response) == 1

    row = response[0]

    assert row["submission_id"] == 9001
    assert row["assignment_id"] == 401
    assert row["assignment_title"] == "Research Summary"
    assert row["class_code"] == "SE3050"
    assert row["plagiarism_percent"] == 34
    assert row["ai_detected"] is True
    assert row["ai_risk_percent"] == 69
    assert row["ai_risk_level"] == "medium"
    assert row["hasFile"] is True
    assert row["fileName"] == "research-summary.pdf"
    assert row["fileUrl"] == "/student/mina/submissions/9001/file"


def test_student_reports_uses_safe_ai_defaults_when_payload_is_empty(
    monkeypatch: pytest.MonkeyPatch,
    student_user: SimpleNamespace,
    student_report_row: SimpleNamespace,
) -> None:
    student_report_row.payload = {}
    student_report_row.file_path = None

    db = SequentialFakeDB(
        student_user,
        None,
        [student_report_row],
    )

    monkeypatch.setattr(
        student_api,
        "plagiarism_score_to_percent",
        lambda score: 0,
    )

    response = student_api.student_reports(
        "mina",
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    row = response[0]

    assert row["ai_detected"] is False
    assert row["ai_risk_percent"] == 0
    assert row["ai_risk_level"] == "low"
    assert row["hasFile"] is False
    assert row["fileName"] is None
    assert row["fileUrl"] is None


def test_student_marked_reports_returns_published_feedback_summary(
    student_user: SimpleNamespace,
) -> None:
    marked_row = SimpleNamespace(
        submission_id=9101,
        assignment_id=402,
        assignment_title="Final Essay",
        class_code="SE3050",
        class_name="Software Engineering",
        submitted_at=SimpleNamespace(
            date=lambda: SimpleNamespace(isoformat=lambda: "2026-04-19")
        ),
        file_name="final-essay.pdf",
        file_type="application/pdf",
        file_path="/tmp/final-essay.pdf",
        storage_provider="local",
        s3_key=None,
        report_id=71,
        score=88,
        max_score=100,
        general_feedback="Strong structure with minor citation issues.",
        generated_pdf_path="/tmp/marked-final-essay.pdf",
        updated_at=SimpleNamespace(isoformat=lambda: "2026-04-19T12:00:00"),
        annotation_count=3,
    )

    db = SequentialFakeDB(
        student_user,
        None,
        [marked_row],
    )

    response = student_api.student_marked_reports(
        "mina",
        class_code=None,
        limit=None,
        offset=0,
        db=db,
    )

    assert len(response) == 1

    row = response[0]

    assert row["submission_id"] == 9101
    assert row["assignment_title"] == "Final Essay"
    assert row["score"] == 88
    assert row["max_score"] == 100
    assert row["general_feedback"] == "Strong structure with minor citation issues."
    assert row["annotation_count"] == 3
    assert row["fileName"] == "final-essay.pdf"
    assert row["fileUrl"] == "/student/mina/submissions/9101/file"
    assert row["marked_pdf_url"] == "/student/mina/submissions/9101/marked-report/pdf"


def test_student_marked_report_detail_hides_unpublished_feedback(
    monkeypatch: pytest.MonkeyPatch,
    student_user: SimpleNamespace,
) -> None:
    submission = SimpleNamespace(
        id=9101,
        student_id=101,
        file_path="/tmp/final-essay.pdf",
    )

    report = SimpleNamespace(
        id=71,
        published_to_student=False,
        generated_pdf_path=None,
    )

    db = SequentialFakeDB(submission)

    monkeypatch.setattr(
        student_api,
        "get_student",
        lambda db, ident: student_user,
    )

    monkeypatch.setattr(
        student_api,
        "get_mark_report",
        lambda db, submission_id: report,
    )

    with pytest.raises(
        HTTPException,
        match="not visible to students",
    ) as exc_info:
        student_api.student_marked_report_detail("mina", 9101, db=db)

    assert exc_info.value.status_code == 403


def test_student_marked_report_pdf_rejects_unpublished_or_missing_pdf(
    monkeypatch: pytest.MonkeyPatch,
    student_user: SimpleNamespace,
) -> None:
    submission = SimpleNamespace(
        id=9101,
        student_id=101,
        file_path="/tmp/final-essay.pdf",
    )

    report = SimpleNamespace(
        id=71,
        published_to_student=True,
        generated_pdf_path=None,
    )

    db = SequentialFakeDB(submission)

    monkeypatch.setattr(
        student_api,
        "get_student",
        lambda db, ident: student_user,
    )

    monkeypatch.setattr(
        student_api,
        "get_mark_report",
        lambda db, submission_id: report,
    )

    with pytest.raises(
        HTTPException,
        match="Marked report PDF not found",
    ) as exc_info:
        student_api.student_marked_report_pdf("mina", 9101, db=db)

    assert exc_info.value.status_code == 404
