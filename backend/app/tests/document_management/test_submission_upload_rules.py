from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import student as student_api


class FakeUserQuery:
    def __init__(self, result: Any):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class FakeStudentLookupDB:
    def __init__(self, result: Any):
        self._result = result

    def query(self, entity):
        if entity is not student_api.User:
            raise AssertionError(f"Unexpected query entity: {entity!r}")
        return FakeUserQuery(self._result)


class FakeSubmissionQuery:
    def __init__(self, result: Any):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class FakeSubmissionDB:
    def __init__(self, submission: Any):
        self._submission = submission

    def query(self, entity):
        if entity is not student_api.Submission:
            raise AssertionError(f"Unexpected query entity: {entity!r}")
        return FakeSubmissionQuery(self._submission)


class FakePresignQuery:
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

    def all(self):
        if self._result is None:
            return []
        if isinstance(self._result, list):
            return self._result
        return [self._result]


class FakePresignDB:
    def __init__(
        self, *, assignment_row=None, latest_submission=None, mark_report=None
    ):
        self.assignment_row = assignment_row
        self.latest_submission = latest_submission
        self.mark_report = mark_report

    def query(self, *entities):
        if entities == (student_api.Assignment, student_api.Class):
            return FakePresignQuery(self.assignment_row)
        if len(entities) == 1 and entities[0] is student_api.Submission:
            return FakePresignQuery(self.latest_submission)
        if len(entities) == 1 and entities[0] is student_api.SubmissionMarkReport:
            return FakePresignQuery(self.mark_report)
        raise AssertionError(f"Unexpected query entities: {entities!r}")


@pytest.fixture()
def fake_student_user() -> SimpleNamespace:
    return SimpleNamespace(id=77, role="student", username="mina")


@pytest.fixture()
def fake_submission_record() -> SimpleNamespace:
    return SimpleNamespace(id=501, student_id=77, file_name="submission.pdf")


def test_get_student_returns_student_by_numeric_identifier(
    fake_student_user: SimpleNamespace,
) -> None:
    db = FakeStudentLookupDB(fake_student_user)

    student = student_api.get_student(db, "77")

    assert student is fake_student_user


def test_get_student_returns_student_by_username_identifier(
    fake_student_user: SimpleNamespace,
) -> None:
    db = FakeStudentLookupDB(fake_student_user)

    student = student_api.get_student(db, "mina")

    assert student is fake_student_user


def test_get_student_rejects_missing_user() -> None:
    db = FakeStudentLookupDB(None)

    with pytest.raises(HTTPException, match="Student not found") as exc_info:
        student_api.get_student(db, "404")

    assert exc_info.value.status_code == 404


def test_get_student_rejects_non_student_user() -> None:
    db = FakeStudentLookupDB(SimpleNamespace(id=12, role="lecturer", username="teach"))

    with pytest.raises(HTTPException, match="User is not a student") as exc_info:
        student_api.get_student(db, "teach")

    assert exc_info.value.status_code == 403


def test_student_download_submission_returns_file_response_for_owned_submission(
    monkeypatch: pytest.MonkeyPatch,
    fake_student_user: SimpleNamespace,
    fake_submission_record: SimpleNamespace,
) -> None:
    db = FakeSubmissionDB(fake_submission_record)
    expected_response = {"ok": True, "submission_id": fake_submission_record.id}

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student_user)
    monkeypatch.setattr(student_api, "submission_has_file", lambda sub: True)
    monkeypatch.setattr(
        student_api, "submission_file_response", lambda sub: expected_response
    )

    response = student_api.student_download_submission(
        "77", fake_submission_record.id, db=db
    )

    assert response == expected_response


def test_student_download_submission_rejects_submission_for_other_student(
    monkeypatch: pytest.MonkeyPatch,
    fake_student_user: SimpleNamespace,
) -> None:
    db = FakeSubmissionDB(None)

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student_user)
    monkeypatch.setattr(student_api, "submission_has_file", lambda sub: True)

    with pytest.raises(HTTPException, match="Submission file not found") as exc_info:
        student_api.student_download_submission("77", 999, db=db)

    assert exc_info.value.status_code == 404


def test_student_download_submission_rejects_submission_without_attached_file(
    monkeypatch: pytest.MonkeyPatch,
    fake_student_user: SimpleNamespace,
    fake_submission_record: SimpleNamespace,
) -> None:
    db = FakeSubmissionDB(fake_submission_record)

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student_user)
    monkeypatch.setattr(student_api, "submission_has_file", lambda sub: False)

    with pytest.raises(HTTPException, match="Submission file not found") as exc_info:
        student_api.student_download_submission("77", fake_submission_record.id, db=db)

    assert exc_info.value.status_code == 404


def test_student_download_submission_rejects_when_storage_file_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    fake_student_user: SimpleNamespace,
    fake_submission_record: SimpleNamespace,
) -> None:
    db = FakeSubmissionDB(fake_submission_record)

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student_user)
    monkeypatch.setattr(student_api, "submission_has_file", lambda sub: True)

    def _raise_missing(_submission):
        raise FileNotFoundError("missing")

    monkeypatch.setattr(student_api, "submission_file_response", _raise_missing)

    with pytest.raises(HTTPException, match="Submission file not found") as exc_info:
        student_api.student_download_submission("77", fake_submission_record.id, db=db)

    assert exc_info.value.status_code == 404


def test_presign_submission_upload_builds_key_using_resolved_student_identity(
    monkeypatch: pytest.MonkeyPatch,
    fake_student_user: SimpleNamespace,
) -> None:
    captured: dict[str, Any] = {}
    payload = student_api.PresignRequest(
        class_id=41,
        assignment_id=501,
        filename="submission.pdf",
        content_type="application/pdf",
    )

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student_user)

    def _build_submission_key(**kwargs):
        captured.update(kwargs)
        return "submissions/generated-key.pdf"

    monkeypatch.setattr(student_api, "build_submission_key", _build_submission_key)
    monkeypatch.setattr(
        student_api,
        "create_presigned_post",
        lambda **kwargs: {
            "url": "https://example-upload",
            "fields": {"key": kwargs["key"]},
        },
    )
    monkeypatch.setattr(student_api, "get_bucket_name", lambda: "test-bucket")

    assignment = SimpleNamespace(
        id=501, class_id=41, max_attempts=2, allow_resubmission=True
    )
    class_row = SimpleNamespace(id=41, is_active=True)

    response = student_api.presign_submission_upload(
        "mina",
        payload,
        db=FakePresignDB(assignment_row=(assignment, class_row)),
    )

    assert captured == {
        "class_id": 41,
        "assignment_id": 501,
        "student_id": 77,
        "filename": "submission.pdf",
    }
    assert response["bucket"] == "test-bucket"
    assert response["key"] == "submissions/generated-key.pdf"
