from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import lecturer as lecturer_api
from app.models.integrity import IntegrityReviewLock, IntegrityReviewOverride, IntegrityReviewOverrideVersion
from app.services.false_detection_service import build_allowed_removed_ranges, utc_now
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
    return {
        "plagiarism": {
            "matches": [
                {
                    "source_type": "online_source",
                    "source_name": "Example Article",
                    "source_doc_id": "web-1",
                    "source_chunk_id": 4,
                    "score": 0.92,
                    "query_text": "copied phrase here",
                    "shared_phrases": ["copied phrase here"],
                }
            ]
        },
        "ai": {"spans": []},
    }


def _build_valid_payload(plagiarism_text: str, latest_result_payload: dict[str, Any]):
    detailed_matches = lecturer_api._collect_detailed_match_details(latest_result_payload)
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    cleaned_range = {k: allowed[0][k] for k in ("occurrenceId", "start", "end", "text")}
    adjusted_percent = lecturer_api.recalculate_adjusted_plagiarism_percent(
        original_percent=plagiarism_score_to_percent(0.8),
        detailed_matches=detailed_matches,
        removed_ranges=[cleaned_range],
        plagiarism_text=plagiarism_text,
    )
    payload = lecturer_api.FalseDetectionReviewSaveIn(
        removed_ranges=[cleaned_range],
        adjusted_plagiarism_percent=adjusted_percent,
        justification_note="Approved template wording.",
    )
    return payload, cleaned_range, adjusted_percent


def _patch_common(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, latest_result_payload: dict[str, Any], plagiarism_text: str) -> None:
    latest_result = SimpleNamespace(plagiarism_score=0.8, payload=latest_result_payload)
    monkeypatch.setattr(lecturer_api, "get_lecturer", lambda db, ident: fake_lecturer)
    monkeypatch.setattr(lecturer_api, "get_latest_result", lambda db, submission_id: latest_result)
    monkeypatch.setattr(lecturer_api, "resolve_submission_pdf_to_local", lambda sub: ("/tmp/fake.pdf", False))
    monkeypatch.setattr(lecturer_api, "extract_pdf_text", lambda path: SimpleNamespace(full_text=plagiarism_text))
    monkeypatch.setattr(lecturer_api, "cleanup_temp_file", lambda *args, **kwargs: None)


def test_save_false_detection_review_allows_reopening_existing_highlight(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace, latest_result_payload: dict[str, Any]) -> None:
    plagiarism_text = "intro copied phrase here ending"
    payload, cleaned_range, adjusted_percent = _build_valid_payload(plagiarism_text, latest_result_payload)
    _patch_common(monkeypatch, fake_lecturer, latest_result_payload, plagiarism_text)
    existing_override = SimpleNamespace(submission_id=501, removed_ranges=[cleaned_range])
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None], IntegrityReviewOverride: [existing_override], IntegrityReviewOverrideVersion: [None, None]})
    response = lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-repeat")
    assert response["ok"] is True
    assert response["adjusted_plagiarism_percent"] == adjusted_percent
    assert existing_override.removed_ranges == [cleaned_range]
    assert db.committed is True


def test_save_false_detection_review_rejects_adjusted_percent_tampering(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace, latest_result_payload: dict[str, Any]) -> None:
    plagiarism_text = "intro copied phrase here ending"
    payload, _, _ = _build_valid_payload(plagiarism_text, latest_result_payload)
    payload = lecturer_api.FalseDetectionReviewSaveIn(removed_ranges=payload.removed_ranges, adjusted_plagiarism_percent=99, justification_note=payload.justification_note)
    _patch_common(monkeypatch, fake_lecturer, latest_result_payload, plagiarism_text)
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None], IntegrityReviewOverride: [None], IntegrityReviewOverrideVersion: [None]})
    with pytest.raises(HTTPException, match="does not match the recalculated value") as exc_info:
        lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-bad-percent")
    assert exc_info.value.status_code == 400


def test_save_false_detection_review_rejects_lock_owned_by_other_reviewer(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace, latest_result_payload: dict[str, Any]) -> None:
    plagiarism_text = "intro copied phrase here ending"
    payload, _, _ = _build_valid_payload(plagiarism_text, latest_result_payload)
    _patch_common(monkeypatch, fake_lecturer, latest_result_payload, plagiarism_text)
    active_lock = SimpleNamespace(submission_id=501, locked_by=99, lock_token="foreign-lock", expires_at=utc_now() + timedelta(minutes=5))
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [active_lock]})
    with pytest.raises(HTTPException, match="currently being reviewed by another lecturer") as exc_info:
        lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-locked")
    assert exc_info.value.status_code == 423


def test_save_false_detection_review_rejects_idempotency_reuse_with_changed_payload(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace, latest_result_payload: dict[str, Any]) -> None:
    plagiarism_text = "intro copied phrase here ending"
    payload, cleaned_range, adjusted_percent = _build_valid_payload(plagiarism_text, latest_result_payload)
    _patch_common(monkeypatch, fake_lecturer, latest_result_payload, plagiarism_text)
    existing_version = SimpleNamespace(submission_id=501, version_no=2, adjusted_plagiarism_score=adjusted_percent / 100, removed_ranges=[cleaned_range], justification_note="Original note.", idempotency_key="idem-123")
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None], IntegrityReviewOverride: [None], IntegrityReviewOverrideVersion: [None, existing_version]})
    with pytest.raises(HTTPException, match="used with a different payload") as exc_info:
        lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-123")
    assert exc_info.value.status_code == 409


def test_save_false_detection_review_requires_ready_integrity_report(monkeypatch: pytest.MonkeyPatch, fake_lecturer: SimpleNamespace, fake_submission: SimpleNamespace) -> None:
    payload = lecturer_api.FalseDetectionReviewSaveIn(removed_ranges=[{"occurrenceId": "demo", "start": 0, "end": 4, "text": "demo"}], adjusted_plagiarism_percent=0, justification_note="Need a ready integrity report first.")
    monkeypatch.setattr(lecturer_api, "get_lecturer", lambda db, ident: fake_lecturer)
    monkeypatch.setattr(lecturer_api, "get_latest_result", lambda db, submission_id: None)
    db = FakeDB({lecturer_api.Submission: [fake_submission], IntegrityReviewLock: [None]})
    with pytest.raises(HTTPException, match="Integrity report is not ready") as exc_info:
        lecturer_api.lecturer_save_false_detection_review("teach", 501, payload, db=db, idempotency_key="idem-no-report")
    assert exc_info.value.status_code == 409


def test_validate_false_detection_review_rejects_invalid_text_span(latest_result_payload: dict[str, Any]) -> None:
    plagiarism_text = "intro copied phrase here ending"
    detailed_matches = lecturer_api._collect_detailed_match_details(latest_result_payload)
    with pytest.raises(HTTPException, match="Invalid removed range") as exc_info:
        lecturer_api.validate_false_detection_review(justification_note="Invalid span should fail.", removed_ranges=[{"occurrenceId": "bad-span", "start": 8, "end": 8, "text": ""}], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches)
    assert exc_info.value.status_code == 400
