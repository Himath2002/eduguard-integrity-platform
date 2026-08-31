from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import student as student_api


class RecordingQuery:
    def __init__(self, db: "RecordingDB", entity):
        self.db = db
        self.entity = entity
        self.filters = []

    def filter(self, *args, **kwargs):
        self.filters.extend(args)
        return self

    def delete(self, synchronize_session=False):
        self.db.deleted_entities.append(getattr(self.entity, "__name__", str(self.entity)))
        return 1

    def all(self):
        return list(self.db.rows.get(getattr(self.entity, "__name__", str(self.entity)), []))

    def first(self):
        if self.entity is student_api.Submission:
            return self.db.submission
        return None

    def order_by(self, *args, **kwargs):
        return self

    def scalar(self):
        return self.db.scalar_value


class RecordingDB:
    def __init__(self, submission=None):
        self.deleted_entities: list[str] = []
        self.commits = 0
        self.rollbacks = 0
        self.submission = submission
        self.rows: dict[str, list] = {}
        self.scalar_value = 0

    def query(self, entity):
        return RecordingQuery(self, entity)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_resubmission_cleanup_removes_old_integrity_artifacts_without_deleting_submission() -> None:
    db = RecordingDB()

    student_api._clear_integrity_artifacts_for_resubmission(db, 44)

    assert "IntegrityResult" in db.deleted_entities
    assert "IntegrityJob" in db.deleted_entities
    assert "CorpusChunk" in db.deleted_entities
    assert "IntegrityReviewOverride" in db.deleted_entities
    assert "IntegrityReviewOverrideVersion" in db.deleted_entities
    assert "IntegrityReviewLock" in db.deleted_entities
    assert "Submission" not in db.deleted_entities


def test_mark_submission_failed_sets_retryable_status() -> None:
    submission = SimpleNamespace(id=44, status="processing")
    db = RecordingDB(submission=submission)

    student_api._mark_submission_failed(db, 44, "Finalization failed because the integrity job could not start")

    assert submission.status == "failed"
    assert db.commits == 1
    assert db.rollbacks == 0


def test_mark_submission_failed_rolls_back_when_database_update_crashes() -> None:
    class BrokenDB(RecordingDB):
        def commit(self):
            raise RuntimeError("database unavailable")

    submission = SimpleNamespace(id=45, status="processing")
    db = BrokenDB(submission=submission)

    student_api._mark_submission_failed(db, 45, "boom")

    assert db.rollbacks == 1


def test_failed_or_draft_statuses_are_not_counted_as_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(student_api, "_latest_integrity_job_status", lambda *args, **kwargs: None)

    assert student_api._submission_counts_as_attempt(object(), SimpleNamespace(id=1, status="failed")) is False
    assert student_api._submission_counts_as_attempt(object(), SimpleNamespace(id=1, status="draft")) is False
    assert student_api._submission_counts_as_attempt(object(), SimpleNamespace(id=1, status="submitted")) is True


def test_processing_submission_counts_only_when_integrity_job_is_really_active(monkeypatch: pytest.MonkeyPatch) -> None:
    processing = SimpleNamespace(id=22, status="processing")

    monkeypatch.setattr(student_api, "_latest_integrity_job_status", lambda *args, **kwargs: "queued")
    assert student_api._submission_counts_as_attempt(object(), processing) is True

    monkeypatch.setattr(student_api, "_latest_integrity_job_status", lambda *args, **kwargs: "running")
    assert student_api._submission_counts_as_attempt(object(), processing) is True

    monkeypatch.setattr(student_api, "_latest_integrity_job_status", lambda *args, **kwargs: "failed")
    assert student_api._submission_counts_as_attempt(object(), processing) is False

    monkeypatch.setattr(student_api, "_latest_integrity_job_status", lambda *args, **kwargs: None)
    assert student_api._submission_counts_as_attempt(object(), processing) is False


def test_submission_gate_blocks_when_lecturer_mark_report_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    assignment = SimpleNamespace(id=42, max_attempts=3, allow_resubmission=True)
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 1)
    monkeypatch.setattr(student_api, "_latest_counted_submission", lambda *args, **kwargs: SimpleNamespace(id=77, status="submitted"))
    monkeypatch.setattr(student_api, "_assignment_mark_report", lambda *args, **kwargs: SimpleNamespace(id=9))

    gate = student_api._submission_gate(object(), assignment=assignment, student_id=60)

    assert gate["can_submit"] is False
    assert gate["locked_by_marking"] is True
    assert "already been marked" in gate["reason"]


def test_submission_gate_blocks_when_no_attempts_left(monkeypatch: pytest.MonkeyPatch) -> None:
    assignment = SimpleNamespace(id=42, max_attempts=1, allow_resubmission=True)
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 1)
    monkeypatch.setattr(student_api, "_latest_counted_submission", lambda *args, **kwargs: SimpleNamespace(id=77, status="submitted"))
    monkeypatch.setattr(student_api, "_assignment_mark_report", lambda *args, **kwargs: None)

    gate = student_api._submission_gate(object(), assignment=assignment, student_id=60)

    assert gate["can_submit"] is False
    assert gate["attempts_left"] == 0
    assert gate["reason"] == "No attempts left for this assignment."


def test_submission_gate_blocks_resubmission_when_assignment_disallows_it(monkeypatch: pytest.MonkeyPatch) -> None:
    assignment = SimpleNamespace(id=42, max_attempts=3, allow_resubmission=False)
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 1)
    monkeypatch.setattr(student_api, "_latest_counted_submission", lambda *args, **kwargs: SimpleNamespace(id=77, status="submitted"))
    monkeypatch.setattr(student_api, "_assignment_mark_report", lambda *args, **kwargs: None)

    gate = student_api._submission_gate(object(), assignment=assignment, student_id=60)

    assert gate["can_submit"] is False
    assert "Resubmission is not allowed" in gate["reason"]


def test_submission_gate_allows_retry_after_failed_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    assignment = SimpleNamespace(id=42, max_attempts=2, allow_resubmission=True)
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 0)
    monkeypatch.setattr(student_api, "_latest_counted_submission", lambda *args, **kwargs: None)
    monkeypatch.setattr(student_api, "_assignment_mark_report", lambda *args, **kwargs: None)

    gate = student_api._submission_gate(object(), assignment=assignment, student_id=60)

    assert gate["can_submit"] is True
    assert gate["attempts_left"] == 2
    assert gate["reason"] is None


def test_assert_can_submit_raises_friendly_error_for_locked_work(monkeypatch: pytest.MonkeyPatch) -> None:
    assignment = SimpleNamespace(id=42, max_attempts=1, allow_resubmission=True)
    monkeypatch.setattr(
        student_api,
        "_submission_gate",
        lambda *args, **kwargs: {"can_submit": False, "reason": "This assignment has already been marked by the lecturer."},
    )

    with pytest.raises(HTTPException) as exc:
        student_api._assert_can_submit(object(), assignment=assignment, student_id=60)

    assert exc.value.status_code == 400
    assert "already been marked" in str(exc.value.detail)


def test_submission_error_message_returns_first_safe_failed_job_line() -> None:
    job = SimpleNamespace(status="failed", error="Finalization failed\nprivate traceback")

    assert student_api._submission_error_message(job) == "Finalization failed"


def test_submission_error_message_uses_default_for_failed_job_without_error() -> None:
    job = SimpleNamespace(status="failed", error="")

    assert "Integrity analysis failed" in student_api._submission_error_message(job)


def test_submission_error_message_is_hidden_for_non_failed_job() -> None:
    assert student_api._submission_error_message(SimpleNamespace(status="running", error="still running")) is None
