from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.integrity import IntegrityAnalyzeRequest, IntegrityJobOut
from app.services import integrity_report_service as reports


@pytest.mark.parametrize("submission_id", [0, -20])
def test_submission_id_must_be_positive_for_integrity_analysis(submission_id: int) -> None:
    with pytest.raises(ValidationError):
        IntegrityAnalyzeRequest(submission_id=submission_id, local_path="file.pdf")


def test_integrity_job_response_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        IntegrityJobOut(submission_id=1, idempotency_key="x", status="mystery", progress=0)  # type: ignore[arg-type]


def test_integrity_job_response_rejects_non_integer_progress() -> None:
    with pytest.raises(ValidationError):
        IntegrityJobOut(submission_id=1, idempotency_key="x", status="queued", progress="halfway")  # type: ignore[arg-type]


def test_highlight_range_builder_rejects_malformed_ai_span_values() -> None:
    ranges = reports._build_ai_ranges(
        "Some report text",
        [
            None,
            "bad",  # type: ignore[list-item]
            {"start": "not-int", "end": 10},
            {"start": 9, "end": 1},
        ],
    )

    assert ranges == []


def test_detailed_segment_builder_ignores_malformed_matches() -> None:
    text = "Valid source phrase appears here."

    segments = reports._build_detailed_segments(
        text,
        detailed_matches=[
            "bad",  # type: ignore[list-item]
            {"phrase": "tiny", "source_type": "online_source"},
            {"source_type": "online_source"},
        ],
    )

    assert segments == []


def test_local_existing_path_helper_is_safe_for_empty_or_invalid_values(tmp_path) -> None:
    existing = tmp_path / "file.pdf"
    existing.write_text("x")

    assert reports.is_local_existing_path(None) is False
    assert reports.is_local_existing_path("") is False
    assert reports.is_local_existing_path(str(existing)) is True
