from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import lecturer as lecturer_api
from app.models.integrity import IntegrityReviewLock


class FakeQuery:
    def __init__(self, result: Any):
        self._result = result
    def filter(self, *args, **kwargs):
        return self
    def join(self, *args, **kwargs):
        return self
    def first(self):
        return self._result


class FakeDB:
    def __init__(self, user_result: Any = None, submission_result: Any = None):
        self.user_result = user_result
        self.submission_result = submission_result
    def query(self, entity):
        if entity is lecturer_api.User:
            return FakeQuery(self.user_result)
        if entity is lecturer_api.Submission:
            return FakeQuery(self.submission_result)
        if entity is IntegrityReviewLock:
            return FakeQuery(None)
        raise AssertionError(f"Unexpected query entity: {entity!r}")


def test_get_lecturer_rejects_non_lecturer_user() -> None:
    db = FakeDB(user_result=SimpleNamespace(id=3, role="student", username="mina"))
    with pytest.raises(HTTPException, match="not a lecturer") as exc_info:
        lecturer_api.get_lecturer(db, "mina")
    assert exc_info.value.status_code == 403


def test_save_false_detection_review_rejects_submission_outside_lecturer_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeDB(submission_result=None)
    payload = lecturer_api.FalseDetectionReviewSaveIn(removed_ranges=[], adjusted_plagiarism_percent=0, justification_note="Approved phrase.")
    monkeypatch.setattr(lecturer_api, "get_lecturer", lambda db, ident: SimpleNamespace(id=22, role="lecturer", username="teach"))
    with pytest.raises(HTTPException, match="Submission not found") as exc_info:
        lecturer_api.lecturer_save_false_detection_review("teach", 999, payload, db=db, idempotency_key=None)
    assert exc_info.value.status_code == 404
