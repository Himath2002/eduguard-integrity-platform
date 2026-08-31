from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import lecturer as lecturer_api
from app.models.integrity import IntegrityReviewLock, IntegrityReviewOverride, IntegrityReviewOverrideVersion
from app.services.false_detection_service import acquire_false_detection_lock, build_allowed_removed_ranges, enforce_false_detection_lock, utc_now
from app.services.integrity_service import plagiarism_score_to_percent


class FakeQuery:
    def __init__(self, result: Any):
        self._result = result
    def filter(self, *args, **kwargs):
        return self
    def join(self, *args, **kwargs):
        return self
    def order_by(self, *args, **kwargs):
        return self
    def first(self):
        return self._result


class QueueDB:
    def __init__(self, plan: dict[Any, list[Any]]):
        self.plan = {entity: list(results) for entity, results in plan.items()}
        self.added: list[Any] = []
        self.committed = False
    def query(self, entity):
        queue = self.plan.get(entity)
        if queue is None:
            raise AssertionError(f"Unexpected query entity: {entity!r}")
        result = queue.pop(0) if queue else None
        return FakeQuery(result)
    def add(self, obj: Any) -> None:
        self.added.append(obj)
    def commit(self) -> None:
        self.committed = True


def test_acquire_false_detection_lock_returns_read_only_for_second_reviewer() -> None:
    db = QueueDB({IntegrityReviewLock: [None, SimpleNamespace(submission_id=501, locked_by=10, lock_token="tok", expires_at=utc_now() + timedelta(minutes=5))]})
    first = acquire_false_detection_lock(db, submission_id=501, user_id=10, ttl_seconds=120)
    second = acquire_false_detection_lock(db, submission_id=501, user_id=11, ttl_seconds=120)
    assert first["acquired"] is True
    assert second["acquired"] is False
    assert second["read_only"] is True
    assert second["locked_by"] == 10


def test_enforce_false_detection_lock_rejects_other_reviewer() -> None:
    active_lock = SimpleNamespace(submission_id=501, locked_by=10, lock_token="tok", expires_at=utc_now() + timedelta(minutes=5))
    db = QueueDB({IntegrityReviewLock: [active_lock]})
    with pytest.raises(HTTPException, match="currently being reviewed by another lecturer") as exc_info:
        enforce_false_detection_lock(db, submission_id=501, user_id=11, lock_token=None)
    assert exc_info.value.status_code == 423


def test_save_false_detection_review_returns_idempotent_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_lecturer = SimpleNamespace(id=22, role="lecturer", username="teach")
    fake_submission = SimpleNamespace(id=501, assignment_id=77, file_name="submission.pdf", student_id=99)
    latest_result_payload = {"plagiarism": {"matches": [{"source_type": "online_source", "source_name": "Example Article", "source_doc_id": "web-1", "source_chunk_id": 4, "score": 0.92, "query_text": "copied phrase here", "shared_phrases": ["copied phrase here"]}]}, "ai": {"spans": []}}
    latest_result = SimpleNamespace(plagiarism_score=0.8, payload=latest_result_payload)
    plagiarism_text = "intro copied phrase here ending"
    detailed_matches = lecturer_api._collect_detailed_match_details(latest_result_payload)
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    cleaned_range = {k: allowed[0][k] for k in ("occurrenceId", "start", "end", "text")}
    adjusted_percent = lecturer_api.recalculate_adjusted_plagiarism_percent(original_percent=plagiarism_score_to_percent(latest_result.plagiarism_score), detailed_matches=detailed_matches, removed_ranges=[cleaned_range], plagiarism_text=plagiarism_text)
    existing_version = SimpleNamespace(submission_id=501, version_no=2, adjusted_plagiarism_score=adjusted_percent / 100, removed_ranges=[cleaned_range], justification_note="Approved template wording.", idempotency_key="idem-123")
    payload = lecturer_api.FalseDetectionReviewSaveIn(removed_ranges=[cleaned_range], adjusted_plagiarism_percent=adjusted_percent, justification_note="Approved template wording.")
    db = QueueDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None], IntegrityReviewOverride: [None], IntegrityReviewOverrideVersion: [existing_version, existing_version]})
    monkeypatch.setattr(lecturer_api, "get_lecturer", lambda db, ident: fake_lecturer)
    monkeypatch.setattr(lecturer_api, "get_latest_result", lambda db, submission_id: latest_result)
    monkeypatch.setattr(lecturer_api, "resolve_submission_pdf_to_local", lambda sub: ("/tmp/fake.pdf", False))
    monkeypatch.setattr(lecturer_api, "extract_pdf_text", lambda path: SimpleNamespace(full_text=plagiarism_text))
    monkeypatch.setattr(lecturer_api, "cleanup_temp_file", lambda *args, **kwargs: None)
    response = lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-123")
    assert response["idempotent_replay"] is True
    assert response["version_no"] == 2
    assert db.committed is False
