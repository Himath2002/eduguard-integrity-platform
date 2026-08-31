from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import communications as communications_api
from app.schemas.communication import AnnouncementCreate


class FakeQuery:
    def __init__(self, result: Any = None):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        if isinstance(self.result, list):
            return self.result[0] if self.result else None
        return self.result

    def all(self):
        if self.result is None:
            return []
        return self.result if isinstance(self.result, list) else [self.result]


class SequentialFakeDB:
    def __init__(self, *results: Any):
        self.results = list(results)
        self.added: list[Any] = []
        self.commit_calls = 0
        self.refresh_calls: list[Any] = []

    def query(self, *entities):
        if not self.results:
            raise AssertionError(f"Unexpected extra query for entities: {entities!r}")
        return FakeQuery(self.results.pop(0))

    def add(self, obj: Any):
        self.added.append(obj)

    def commit(self):
        self.commit_calls += 1

    def refresh(self, obj: Any):
        self.refresh_calls.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 5, 2, 9, 0, tzinfo=timezone.utc)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime(2026, 5, 2, 9, 0, tzinfo=timezone.utc)


@pytest.fixture()
def admin_user() -> SimpleNamespace:
    return SimpleNamespace(id=301, username="admin1", role="admin")


def test_get_admin_rejects_non_admin_role() -> None:
    db = SequentialFakeDB(SimpleNamespace(id=301, username="admin1", role="lecturer"))

    with pytest.raises(HTTPException, match="User is not an admin") as exc_info:
        communications_api.get_admin(db, "admin1")

    assert exc_info.value.status_code == 403


def test_create_announcement_returns_standard_success_contract(
    monkeypatch: pytest.MonkeyPatch,
    admin_user: SimpleNamespace,
) -> None:
    db = SequentialFakeDB()
    payload = AnnouncementCreate(
        subject="  Feedback released  ", body="  Marked reports are now available.  "
    )

    monkeypatch.setattr(communications_api, "get_admin", lambda db, ident: admin_user)

    response = communications_api.create_announcement("admin1", payload, db=db)

    assert response["ok"] is True
    assert response["message"] == "Announcement posted successfully."
    assert response["announcement"]["audience"] == "students"
    assert response["announcement"]["subject"] == "Feedback released"
    assert response["announcement"]["body"] == "Marked reports are now available."
    assert response["announcement"]["created_by"] == 301
    assert db.commit_calls == 1
    assert db.added, "AdminAnnouncement should be added to the session"


def test_list_admin_announcements_returns_descending_rows(
    monkeypatch: pytest.MonkeyPatch,
    admin_user: SimpleNamespace,
) -> None:
    rows = [
        SimpleNamespace(
            id=2,
            audience="students",
            subject="Feedback published",
            body="Week 8 feedback is now live.",
            is_active=True,
            created_by=301,
            created_at=datetime(2026, 5, 3, 8, 0, tzinfo=timezone.utc),
            updated_at=datetime(2026, 5, 3, 8, 0, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=1,
            audience="students",
            subject="Collaboration reminder",
            body="Reply to annotation comments before Friday.",
            is_active=True,
            created_by=301,
            created_at=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
            updated_at=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        ),
    ]
    db = SequentialFakeDB(rows)

    monkeypatch.setattr(communications_api, "get_admin", lambda db, ident: admin_user)

    response = communications_api.list_admin_announcements(
        "admin1", search="feedback", db=db
    )

    assert len(response) == 2
    assert response[0]["subject"] == "Feedback published"
    assert response[1]["subject"] == "Collaboration reminder"
    assert all(row["audience"] == "students" for row in response)
