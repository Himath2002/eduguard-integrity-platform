from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.integrity import _user_error, analyze, latest_result, list_jobs
from app.schemas.integrity import IntegrityAnalyzeRequest, IntegrityJobOut, IntegrityResultOut
from app.services import integrity_service
from app.services.integrity_service import plagiarism_score_to_percent


class _FakeQuery:
    def __init__(self, rows=None, first_item=None):
        self.rows = rows or []
        self.first_item = first_item

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.first_item


class _FakeDB:
    def __init__(self, *, jobs=None):
        self.jobs = jobs or []
        self.queried_entities = []

    def query(self, entity):
        self.queried_entities.append(getattr(entity, "__name__", str(entity)))
        return _FakeQuery(rows=self.jobs)


def test_integrity_analyze_request_uses_server_managed_submission_source() -> None:
    payload = IntegrityAnalyzeRequest(submission_id=10, idempotency_key="idem-1")

    assert payload.submission_id == 10
    assert payload.idempotency_key == "idem-1"


def test_integrity_analyze_request_rejects_client_file_locations() -> None:
    with pytest.raises(ValidationError):
        IntegrityAnalyzeRequest(
            submission_id=10,
            local_path="/tmp/untrusted.pdf",  # type: ignore[call-arg]
            s3_bucket="untrusted-bucket",  # type: ignore[call-arg]
            s3_key="untrusted.pdf",  # type: ignore[call-arg]
        )


def test_integrity_analyze_request_keeps_correlation_id_for_traceability() -> None:
    payload = IntegrityAnalyzeRequest(
        submission_id=10,
        idempotency_key="idem-2",
        correlation_id="upload-abc",
    )

    assert payload.correlation_id == "upload-abc"


def test_integrity_analyze_request_defaults_to_submission_record_source() -> None:
    payload = IntegrityAnalyzeRequest(submission_id=10)

    assert payload.submission_id == 10
    assert payload.idempotency_key == "default"


@pytest.mark.parametrize("bad_submission_id", [0, -1])
def test_integrity_analyze_request_requires_positive_submission_id(bad_submission_id: int) -> None:
    with pytest.raises(ValidationError):
        IntegrityAnalyzeRequest(submission_id=bad_submission_id)


def test_integrity_job_out_contract_accepts_all_expected_statuses() -> None:
    statuses = ["queued", "running", "done", "failed"]

    for status in statuses:
        item = IntegrityJobOut(submission_id=1, idempotency_key="k", status=status, progress=10)
        assert item.status == status


def test_integrity_job_out_contract_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        IntegrityJobOut(submission_id=1, idempotency_key="k", status="waiting", progress=10)  # type: ignore[arg-type]


def test_integrity_result_out_contract_contains_scores_and_payload() -> None:
    result = IntegrityResultOut(submission_id=5, ai_score=0.2, plagiarism_score=0.8, payload={"ai": {}, "plagiarism": {}})

    assert result.submission_id == 5
    assert result.payload["ai"] == {}
    assert result.plagiarism_score == pytest.approx(0.8)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("Traceback first line\nsecret stack trace", "Traceback first line"),
        ("x" * 300, "x" * 240),
    ],
)
def test_user_error_is_short_safe_and_single_line(raw: str | None, expected: str | None) -> None:
    assert _user_error(raw) == expected


@pytest.mark.parametrize(
    ("score", "expected"),
    [(-0.5, 0), (0.0, 0), (0.434, 43), (0.995, 100), (1.4, 100), ("bad", 0), (None, 0)],
)
def test_plagiarism_score_to_percent_clamps_for_frontend(score, expected: int) -> None:
    assert plagiarism_score_to_percent(score) == expected


def test_analyze_endpoint_returns_safe_job_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    class Job:
        submission_id = 77
        idempotency_key = "idem-77"
        status = "failed"
        progress = 0
        correlation_id = "corr-77"
        error = "Storage timeout\nprivate stack trace"

    def fake_run(db, submission_id, **kwargs):
        assert submission_id == 77
        assert kwargs["idempotency_key"] == "idem-77"
        return Job(), False

    monkeypatch.setattr("app.api.integrity.run_plagiarism_for_submission", fake_run)

    response = analyze(
        IntegrityAnalyzeRequest(submission_id=77, idempotency_key="idem-77", correlation_id="corr-77"),
        db=object(),
    )

    assert response.submission_id == 77
    assert response.status == "failed"
    assert response.error == "Storage timeout"
    assert response.correlation_id == "corr-77"


def test_list_jobs_endpoint_sanitizes_each_job_error() -> None:
    class Job:
        def __init__(self, status: str, error: str | None):
            self.submission_id = 77
            self.idempotency_key = f"idem-{status}"
            self.status = status
            self.progress = 50
            self.correlation_id = "corr"
            self.error = error

    db = _FakeDB(jobs=[Job("running", None), Job("failed", "Failure line\ntraceback")])

    response = list_jobs(77, db=db)

    assert [item.status for item in response] == ["running", "failed"]
    assert response[1].error == "Failure line"


def test_latest_result_endpoint_returns_expected_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    class Result:
        submission_id = 88
        ai_score = 0.31
        plagiarism_score = 0.64
        payload = {"ai": {"overall": 0.31}, "plagiarism": {"overall": 0.64}}

    monkeypatch.setattr("app.api.integrity.get_latest_result", lambda db, submission_id: Result())

    response = latest_result(88, db=object())

    assert response.submission_id == 88
    assert response.ai_score == pytest.approx(0.31)
    assert response.payload["plagiarism"]["overall"] == pytest.approx(0.64)


def test_latest_result_endpoint_returns_404_when_result_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.integrity.get_latest_result", lambda db, submission_id: None)

    with pytest.raises(HTTPException) as exc:
        latest_result(999, db=object())

    assert exc.value.status_code == 404
    assert "No result" in str(exc.value.detail)
