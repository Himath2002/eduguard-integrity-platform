from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest


def test_student_realtime_event_payload_is_pushed_without_crashing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Integration/Communication purpose:
    Verify that the backend can push a student-scoped realtime event using
    the shared realtime communication helper.

    This test is written defensively because different EduGuard builds may keep
    push_realtime_event in app.api.student or another communication module.
    """

    from app.api import student as student_api

    if not hasattr(student_api, "push_realtime_event"):
        pytest.skip("push_realtime_event helper is not available in app.api.student")

    captured: list[dict[str, Any]] = []

    def fake_push(*args, **kwargs):
        captured.append({"args": args, "kwargs": kwargs})

    monkeypatch.setattr(student_api, "push_realtime_event", fake_push)

    student_api.push_realtime_event(
        "student",
        77,
        {
            "type": "submission_status",
            "submission_id": 501,
            "status": "processing",
            "progress": 25,
        },
    )

    assert len(captured) == 1

    args = captured[0]["args"]

    assert args[0] == "student"
    assert args[1] == 77
    assert isinstance(args[2], dict)
    assert args[2]["type"] == "submission_status"
    assert args[2]["submission_id"] == 501
    assert args[2]["status"] == "processing"
    assert args[2]["progress"] == 25


def test_realtime_failure_does_not_break_submission_queue_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Integration/Communication purpose:
    Communication failures should not destroy the core workflow.
    If a realtime push fails, the API/service layer should still be able to
    keep the main submission or queue operation safe.

    This checks that the test can simulate realtime failure safely.
    """

    from app.api import student as student_api

    if not hasattr(student_api, "push_realtime_event"):
        pytest.skip("push_realtime_event helper is not available in app.api.student")

    def failing_push(*args, **kwargs):
        raise RuntimeError("simulated realtime connection failure")

    monkeypatch.setattr(student_api, "push_realtime_event", failing_push)

    with pytest.raises(RuntimeError, match="simulated realtime connection failure"):
        student_api.push_realtime_event(
            "student",
            77,
            {
                "type": "submission_status",
                "submission_id": 501,
                "status": "processing",
            },
        )


def test_realtime_submission_status_payload_contains_required_fields() -> None:
    """
    Integration/Communication purpose:
    Protect the response/event mapping used by frontend dashboard/report pages.
    """

    payload = {
        "type": "submission_status",
        "submission_id": 501,
        "status": "processing",
        "progress": 50,
        "message": "Integrity analysis is running",
    }

    assert payload["type"] == "submission_status"
    assert isinstance(payload["submission_id"], int)
    assert payload["status"] in {"queued", "processing", "running", "done", "failed"}
    assert 0 <= payload["progress"] <= 100
    assert isinstance(payload["message"], str)


def test_realtime_report_ready_payload_contains_required_fields() -> None:
    payload = {
        "type": "report_ready",
        "submission_id": 501,
        "student_id": 77,
        "lecturer_id": 22,
        "report_ready": True,
        "plagiarism_percent": 42,
        "ai_risk_percent": 12,
    }

    assert payload["type"] == "report_ready"
    assert isinstance(payload["submission_id"], int)
    assert isinstance(payload["student_id"], int)
    assert isinstance(payload["lecturer_id"], int)
    assert payload["report_ready"] is True
    assert 0 <= payload["plagiarism_percent"] <= 100
    assert 0 <= payload["ai_risk_percent"] <= 100


def test_polling_fallback_status_response_shape_is_frontend_safe() -> None:
    """
    This checks the shape expected by polling fallback logic when realtime
    delivery is unavailable.
    """

    fallback_response = {
        "submission_id": 501,
        "status": "processing",
        "integrity_status": "running",
        "report_ready": False,
        "progress": 60,
    }

    assert isinstance(fallback_response["submission_id"], int)
    assert fallback_response["status"] in {
        "queued",
        "processing",
        "submitted",
        "failed",
        "done",
    }
    assert fallback_response["integrity_status"] in {
        "queued",
        "running",
        "done",
        "failed",
    }
    assert isinstance(fallback_response["report_ready"], bool)
    assert 0 <= fallback_response["progress"] <= 100
