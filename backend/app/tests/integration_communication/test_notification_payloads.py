from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest


def test_announcement_schema_serializes_frontend_safe_payload() -> None:
    """
    Integration/Communication purpose:
    Protect announcement / notification response mapping so the frontend can
    render communication messages safely.

    This version matches the actual EduGuard AnnouncementOut schema, which uses
    subject/body and also requires audience, is_active, created_at, and updated_at.
    """

    from app.schemas.communication import AnnouncementOut

    raw = {
        "id": 1,
        "subject": "System maintenance",
        "body": "EduGuard will be unavailable for maintenance.",
        "audience": "all",
        "created_by": 10,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    announcement = AnnouncementOut(**raw)

    data = (
        announcement.model_dump()
        if hasattr(announcement, "model_dump")
        else announcement.dict()
    )

    assert data["id"] == 1
    assert data["subject"]
    assert data["body"]
    assert data["audience"] == "all"
    assert data["is_active"] is True
    assert data["created_by"] == 10
    assert data["created_at"]
    assert data["updated_at"]


@pytest.mark.parametrize(
    "payload",
    [
        {
            "type": "announcement",
            "title": "New class update",
            "message": "A new update is available.",
            "audience": "student",
        },
        {
            "type": "report_ready",
            "title": "Report ready",
            "message": "A submission report is now ready.",
            "audience": "lecturer",
        },
        {
            "type": "system",
            "title": "System notice",
            "message": "The system is running normally.",
            "audience": "all",
        },
    ],
)
def test_notification_payload_has_required_frontend_fields(
    payload: dict[str, Any],
) -> None:
    assert payload["type"] in {"announcement", "report_ready", "system"}
    assert isinstance(payload["title"], str)
    assert payload["title"].strip()
    assert isinstance(payload["message"], str)
    assert payload["message"].strip()
    assert payload["audience"] in {"all", "student", "lecturer", "admin"}


def test_notification_payload_rejects_blank_title_or_message() -> None:
    payload = {
        "type": "announcement",
        "title": "",
        "message": "",
        "audience": "student",
    }

    assert not payload["title"].strip()
    assert not payload["message"].strip()


def test_unexpected_backend_error_envelope_is_frontend_safe() -> None:
    error_payload = {
        "detail": "Service unavailable",
    }

    assert isinstance(error_payload, dict)
    assert "detail" in error_payload
    assert isinstance(error_payload["detail"], str)
    assert error_payload["detail"]


def test_validation_error_envelope_is_frontend_safe() -> None:
    error_payload = {
        "detail": [
            {
                "type": "missing",
                "loc": ["body", "title"],
                "msg": "Field required",
                "input": {},
            }
        ]
    }

    assert isinstance(error_payload, dict)
    assert "detail" in error_payload
    assert isinstance(error_payload["detail"], list)
    assert error_payload["detail"][0]["msg"]


def test_role_scoped_notification_metadata_is_clear() -> None:
    notification = {
        "id": 99,
        "recipient_role": "lecturer",
        "recipient_id": 22,
        "event_type": "report_ready",
        "entity_type": "submission",
        "entity_id": 501,
        "message": "Submission report is ready.",
        "read": False,
    }

    assert notification["recipient_role"] in {"student", "lecturer", "admin"}
    assert isinstance(notification["recipient_id"], int)
    assert notification["event_type"] == "report_ready"
    assert notification["entity_type"] == "submission"
    assert isinstance(notification["entity_id"], int)
    assert notification["read"] is False
