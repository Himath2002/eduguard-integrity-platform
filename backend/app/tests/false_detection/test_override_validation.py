from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.false_detection_service import (
    build_allowed_removed_ranges,
    recalculate_adjusted_plagiarism_percent,
    validate_false_detection_review,
)


@pytest.fixture()
def plagiarism_text() -> str:
    return "intro copied phrase here and then some filler copied phrase here ending"


@pytest.fixture()
def detailed_matches() -> list[dict]:
    return [
        {"phrase": "copied phrase here", "source_type": "online_source", "source_name": "example article", "source_doc_id": "doc-1", "source_chunk_id": 1},
        {"phrase": "some filler", "source_type": "submission", "source_name": "other student", "source_doc_id": "doc-2", "source_chunk_id": 2},
    ]


def test_validate_false_detection_review_requires_justification_note(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    with pytest.raises(HTTPException, match="justification note") as exc_info:
        validate_false_detection_review(justification_note="   ", removed_ranges=[allowed[0]], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches)
    assert exc_info.value.status_code == 400


def test_validate_false_detection_review_rejects_out_of_bounds_range(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    with pytest.raises(HTTPException, match="outside the report text") as exc_info:
        validate_false_detection_review(justification_note="Approved template wording.", removed_ranges=[{"occurrenceId": "x::999:1005", "start": 999, "end": 1005, "text": "bad"}], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches)
    assert exc_info.value.status_code == 400


def test_validate_false_detection_review_rejects_duplicate_range_in_request(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    duplicate = {k: allowed[0][k] for k in ("occurrenceId", "start", "end", "text")}
    with pytest.raises(HTTPException, match="Duplicate removed range") as exc_info:
        validate_false_detection_review(justification_note="Approved template wording.", removed_ranges=[duplicate, duplicate], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches)
    assert exc_info.value.status_code == 400


def test_validate_false_detection_review_allows_existing_range_when_reopening_review(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    duplicate = {k: allowed[0][k] for k in ("occurrenceId", "start", "end", "text")}
    cleaned = validate_false_detection_review(justification_note="Previously approved wording.", removed_ranges=[duplicate], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches, existing_removed_ranges=[duplicate])
    assert cleaned == [duplicate]


def test_validate_false_detection_review_rejects_range_that_is_not_a_highlight(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    with pytest.raises(HTTPException, match="does not map to a highlighted plagiarism segment") as exc_info:
        validate_false_detection_review(justification_note="This was not a real highlight.", removed_ranges=[{"occurrenceId": "fake-occurrence", "start": 0, "end": 5, "text": "intro"}], plagiarism_text=plagiarism_text, detailed_matches=detailed_matches)
    assert exc_info.value.status_code == 400


def test_recalculate_adjusted_plagiarism_percent_uses_highlighted_text_coverage(plagiarism_text: str, detailed_matches: list[dict]) -> None:
    allowed = build_allowed_removed_ranges(plagiarism_text, detailed_matches)
    copied_phrase_occurrences = [item for item in allowed if item["text"] == "copied phrase here"]
    adjusted = recalculate_adjusted_plagiarism_percent(original_percent=80, detailed_matches=detailed_matches, removed_ranges=[copied_phrase_occurrences[0]], plagiarism_text=plagiarism_text)
    assert adjusted == 49
