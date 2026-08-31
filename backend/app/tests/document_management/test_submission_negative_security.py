from __future__ import annotations

import io
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api import student as student_api
from app.schemas.student import FinalizeRequest, PresignRequest


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

    def all(self):
        if self._result is None:
            return []
        if isinstance(self._result, list):
            return self._result
        return [self._result]

    def scalar(self):
        return self._result


class FakeDB:
    def __init__(
        self, *, assignment_row=None, latest_submission=None, mark_report=None
    ):
        self.assignment_row = assignment_row
        self.latest_submission = latest_submission
        self.mark_report = mark_report
        self.added: list[Any] = []
        self.committed = False
        self.refreshed: list[Any] = []

    def query(self, *entities):
        if entities == (student_api.Assignment, student_api.Class):
            return FakeQuery(self.assignment_row)
        if len(entities) == 1 and entities[0] is student_api.Submission:
            return FakeQuery(self.latest_submission)
        if len(entities) == 1 and entities[0] is student_api.SubmissionMarkReport:
            return FakeQuery(self.mark_report)
        raise AssertionError(f"Unexpected query entities: {entities!r}")

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1234
        if getattr(obj, "correlation_id", None) is None:
            obj.correlation_id = uuid.uuid4()
        self.refreshed.append(obj)


class FakeUploadFile:
    def __init__(self, filename: str, content_type: str, payload: bytes):
        self.filename = filename
        self.content_type = content_type
        self.file = io.BytesIO(payload)


@pytest.fixture()
def fake_student() -> SimpleNamespace:
    return SimpleNamespace(id=77, role="student", username="mina")


@pytest.fixture()
def fake_assignment_row() -> tuple[SimpleNamespace, SimpleNamespace]:
    assignment = SimpleNamespace(
        id=501, class_id=41, max_attempts=2, allow_resubmission=True
    )
    class_row = SimpleNamespace(id=41, is_active=True)
    return assignment, class_row


@pytest.fixture()
def local_submit_common(
    monkeypatch: pytest.MonkeyPatch, fake_student: SimpleNamespace, tmp_path: Path
):
    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student)
    monkeypatch.setattr(student_api, "SUBMISSIONS_DIR", tmp_path)
    monkeypatch.setattr(
        student_api,
        "queue_plagiarism_for_submission",
        lambda *args, **kwargs: SimpleNamespace(status="queued", progress=0),
    )
    monkeypatch.setattr(
        student_api, "push_realtime_event", lambda *args, **kwargs: None
    )
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 0)
    monkeypatch.setattr(
        student_api, "_latest_counted_submission", lambda *args, **kwargs: None
    )


def test_presign_request_rejects_disguised_non_pdf_filename() -> None:
    with pytest.raises(ValueError, match="Only PDF files are allowed"):
        PresignRequest(
            class_id=41,
            assignment_id=501,
            filename="submission.pdf.exe",
            content_type="application/pdf",
        )


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("../../evil.pdf.exe", "application/pdf"),
        ("submission.pdf", "text/html"),
    ],
)
def test_finalize_request_rejects_invalid_document_inputs(
    filename: str, content_type: str
) -> None:
    with pytest.raises(ValueError, match="Only PDF files are allowed"):
        FinalizeRequest(
            class_id=41,
            assignment_id=501,
            filename=filename,
            content_type=content_type,
            file_size=200,
            s3_bucket="test-bucket",
            s3_key="submissions/41/501/77/submission.pdf",
        )


def test_presign_submission_upload_propagates_wrong_role_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = PresignRequest(
        class_id=41,
        assignment_id=501,
        filename="submission.pdf",
        content_type="application/pdf",
    )

    def _raise_wrong_role(_db, _ident):
        raise HTTPException(status_code=403, detail="User is not a student")

    monkeypatch.setattr(student_api, "get_student", _raise_wrong_role)

    with pytest.raises(HTTPException, match="User is not a student") as exc_info:
        student_api.presign_submission_upload("lecturer-1", payload, db=object())

    assert exc_info.value.status_code == 403


@pytest.mark.parametrize(
    ("upload_file", "expected_message"),
    [
        (FakeUploadFile("notes.txt", "text/plain", b"hello"), "Only PDF allowed"),
        (
            FakeUploadFile("notes.exe", "application/pdf", b"%PDF-1.4"),
            "Only PDF allowed",
        ),
    ],
)
def test_student_submit_assignment_rejects_non_pdf_uploads(
    local_submit_common,
    upload_file: FakeUploadFile,
    expected_message: str,
) -> None:
    with pytest.raises(HTTPException, match=expected_message) as exc_info:
        student_api.student_submit_assignment(
            "77",
            501,
            BackgroundTasks(),
            file=upload_file,
            db=FakeDB(),
        )

    assert exc_info.value.status_code == 400


def test_student_submit_assignment_rejects_unknown_assignment(
    local_submit_common,
) -> None:
    upload = FakeUploadFile("submission.pdf", "application/pdf", b"%PDF-1.4\nbody")

    with pytest.raises(HTTPException, match="Assignment not found") as exc_info:
        student_api.student_submit_assignment(
            "77",
            501,
            BackgroundTasks(),
            file=upload,
            db=FakeDB(assignment_row=None),
        )

    assert exc_info.value.status_code == 404


def test_student_submit_assignment_rejects_when_attempts_are_exhausted(
    monkeypatch: pytest.MonkeyPatch,
    local_submit_common,
    fake_assignment_row: tuple[SimpleNamespace, SimpleNamespace],
) -> None:
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 2)
    upload = FakeUploadFile("submission.pdf", "application/pdf", b"%PDF-1.4\nbody")

    with pytest.raises(HTTPException, match="No attempts left") as exc_info:
        student_api.student_submit_assignment(
            "77",
            501,
            BackgroundTasks(),
            file=upload,
            db=FakeDB(assignment_row=fake_assignment_row),
        )

    assert exc_info.value.status_code == 400


def test_student_submit_assignment_rejects_disallowed_resubmission(
    monkeypatch: pytest.MonkeyPatch,
    local_submit_common,
) -> None:
    assignment = SimpleNamespace(
        id=501, class_id=41, max_attempts=3, allow_resubmission=False
    )
    class_row = SimpleNamespace(id=41, is_active=True)
    monkeypatch.setattr(
        student_api,
        "_latest_counted_submission",
        lambda *args, **kwargs: SimpleNamespace(id=88),
    )
    upload = FakeUploadFile("submission.pdf", "application/pdf", b"%PDF-1.4\nbody")

    with pytest.raises(HTTPException, match="Resubmission is not allowed") as exc_info:
        student_api.student_submit_assignment(
            "77",
            501,
            BackgroundTasks(),
            file=upload,
            db=FakeDB(assignment_row=(assignment, class_row)),
        )

    assert exc_info.value.status_code == 400
