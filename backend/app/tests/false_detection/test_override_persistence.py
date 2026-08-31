from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.api import lecturer as lecturer_api
from app.models.audit_event import AuditEvent
from app.models.integrity import IntegrityReviewOverride, IntegrityReviewOverrideVersion, IntegrityReviewLock
from app.services.false_detection_service import build_allowed_removed_ranges
from app.services.integrity_service import plagiarism_score_to_percent


class FakeQuery:
    def __init__(self, result: Any):
        self._result = result
    def join(self, *args, **kwargs):
        return self
    def filter(self, *args, **kwargs):
        return self
    def order_by(self, *args, **kwargs):
        return self
    def first(self):
        return self._result


class FakeDB:
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


@pytest.fixture()
def fake_lecturer() -> SimpleNamespace:
    return SimpleNamespace(id=22, role="lecturer", username="teach")


@pytest.fixture()
def fake_submission() -> SimpleNamespace:
    return SimpleNamespace(id=501, assignment_id=77, file_name="submission.pdf", student_id=99)


@pytest.fixture()
def latest_result_payload() -> dict[str, Any]:
    return {"plagiarism": {"matches": [{"source_type": "online_source", "source_name": "Example Article", "source_doc_id": "web-1", "source_chunk_id": 4, "score": 0.92, "query_text": "copied phrase here", "shared_phrases": ["copied phrase here"]}]}, "ai": {"spans": []}}


def test_save_false_detection_review_creates_snapshot_version_and_audit_event(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace, latest_result_payload: dict[str, Any]) -> None:
    latest_result = SimpleNamespace(plagiarism_score=0.8, payload=latest_result_payload)
    plagiarism_text = "intro copied phrase here ending"
    detailed_matches = lecturer_api._collect_detailed_match_details(latest_result_payload)
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    cleaned_range = {k: allowed[0][k] for k in ("occurrenceId", "start", "end", "text")}
    adjusted_percent = lecturer_api.recalculate_adjusted_plagiarism_percent(original_percent=plagiarism_score_to_percent(latest_result.plagiarism_score), detailed_matches=detailed_matches, removed_ranges=[cleaned_range], plagiarism_text=plagiarism_text)
    payload = lecturer_api.FalseDetectionReviewSaveIn(removed_ranges=[cleaned_range], adjusted_plagiarism_percent=adjusted_percent, justification_note="This phrase comes from approved template guidance.")
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None], IntegrityReviewOverride: [None], IntegrityReviewOverrideVersion: [None, None]})
    monkeypatch.setattr(lecturer_api, "get_lecturer", lambda db, ident: fake_lecturer)
    monkeypatch.setattr(lecturer_api, "get_latest_result", lambda db, submission_id: latest_result)
    monkeypatch.setattr(lecturer_api, "resolve_submission_pdf_to_local", lambda sub: ("/tmp/fake.pdf", False))
    monkeypatch.setattr(lecturer_api, "extract_pdf_text", lambda path: SimpleNamespace(full_text=plagiarism_text))
    monkeypatch.setattr(lecturer_api, "cleanup_temp_file", lambda *args, **kwargs: None)
    response = lecturer_api.lecturer_save_false_detection_review("teach", fake_submission.id, payload, db=db, idempotency_key="idem-001")
    assert db.committed is True
    assert response["ok"] is True
    assert response["version_no"] == 1
    assert response["adjusted_plagiarism_percent"] == adjusted_percent
    snapshot = next(obj for obj in db.added if isinstance(obj, IntegrityReviewOverride))
    version = next(obj for obj in db.added if isinstance(obj, IntegrityReviewOverrideVersion))
    audit = next(obj for obj in db.added if isinstance(obj, AuditEvent))
    assert snapshot.submission_id == fake_submission.id
    assert snapshot.created_by == fake_lecturer.id
    assert snapshot.removed_ranges == [cleaned_range]
    assert version.version_no == 1
    assert version.idempotency_key == "idem-001"
    assert version.justification_note == "This phrase comes from approved template guidance."
    assert version.removed_ranges == [cleaned_range]
    assert audit.event_type == "false_detection_review.saved"
    assert audit.entity_table == "submissions"
    assert audit.entity_id == fake_submission.id
    assert audit.meta["version_no"] == 1
    assert audit.meta["removed_range_count"] == 1
