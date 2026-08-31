from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any
import shutil
import uuid

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api import student as student_api
from app.schemas.student import FinalizeRequest, PresignRequest


@pytest.fixture(scope="module")
def document_test_files(shared_test_data_dir: Path) -> dict[str, Path]:
    return {
        "valid_pdf": shared_test_data_dir / "valid.pdf",
        "invalid_text": shared_test_data_dir / "invalid.txt",
        "corrupt_pdf": shared_test_data_dir / "corrupt.pdf",
    }


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
        self.added = []
        self.committed = False
        self.refreshed = []

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
            obj.id = 9001
        if getattr(obj, "correlation_id", None) is None:
            obj.correlation_id = uuid.uuid4()
        self.refreshed.append(obj)


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
def valid_finalize_payload() -> FinalizeRequest:
    return FinalizeRequest(
        class_id=41,
        assignment_id=501,
        filename="submission.pdf",
        content_type="application/pdf",
        file_size=466,
        s3_bucket="test-bucket",
        s3_key="submissions/41/501/77/submission.pdf",
    )


@pytest.fixture()
def patch_common_finalize_dependencies(
    monkeypatch: pytest.MonkeyPatch, fake_student: SimpleNamespace
):
    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student)
    monkeypatch.setattr(student_api, "get_bucket_name", lambda: "test-bucket")
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


@pytest.fixture()
def fake_storage_file(tmp_path: Path, document_test_files: dict[str, Path]) -> Path:
    target = tmp_path / "uploaded.pdf"
    shutil.copyfile(document_test_files["valid_pdf"], target)
    return target


def test_presign_submission_upload_builds_pdf_upload_response(
    monkeypatch: pytest.MonkeyPatch,
    fake_student: SimpleNamespace,
) -> None:
    payload = PresignRequest(
        class_id=41,
        assignment_id=501,
        filename="submission.pdf",
        content_type="application/pdf",
    )

    monkeypatch.setattr(student_api, "get_student", lambda db, ident: fake_student)
    monkeypatch.setattr(
        student_api,
        "build_submission_key",
        lambda **kwargs: "generated/key/submission.pdf",
    )
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
        "77",
        payload,
        db=FakeDB(assignment_row=(assignment, class_row)),
    )

    assert response == {
        "bucket": "test-bucket",
        "key": "generated/key/submission.pdf",
        "upload": {
            "url": "https://example-upload",
            "fields": {"key": "generated/key/submission.pdf"},
        },
    }


def test_finalize_submission_rejects_invalid_storage_bucket(
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
) -> None:
    payload = valid_finalize_payload.model_copy(update={"s3_bucket": "wrong-bucket"})

    with pytest.raises(HTTPException, match="Invalid storage location") as exc_info:
        student_api.finalize_submission("77", payload, BackgroundTasks(), db=FakeDB())

    assert exc_info.value.status_code == 400


def test_finalize_submission_rejects_missing_or_expired_upload(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
) -> None:
    monkeypatch.setattr(student_api, "head_object_safe", lambda key: {"exists": False})

    with pytest.raises(HTTPException, match="Upload not found or expired") as exc_info:
        student_api.finalize_submission(
            "77", valid_finalize_payload, BackgroundTasks(), db=FakeDB()
        )

    assert exc_info.value.status_code == 400


@pytest.mark.parametrize(
    ("meta", "payload_file_size", "expected_message"),
    [
        (
            {"exists": True, "size": 0, "content_type": "application/pdf"},
            466,
            "Uploaded file is empty",
        ),
        (
            {"exists": True, "size": 999, "content_type": "application/pdf"},
            466,
            "Upload incomplete or corrupted",
        ),
        (
            {
                "exists": True,
                "size": 201 * 1024 * 1024,
                "content_type": "application/pdf",
            },
            201 * 1024 * 1024,
            "File too large",
        ),
        (
            {"exists": True, "size": 466, "content_type": "text/plain"},
            466,
            "Invalid file type",
        ),
    ],
)
def test_finalize_submission_rejects_invalid_uploaded_object_metadata(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
    meta: dict[str, Any],
    payload_file_size: int,
    expected_message: str,
) -> None:
    payload = valid_finalize_payload.model_copy(update={"file_size": payload_file_size})
    monkeypatch.setattr(student_api, "head_object_safe", lambda key: meta)

    with pytest.raises(HTTPException, match=expected_message) as exc_info:
        student_api.finalize_submission("77", payload, BackgroundTasks(), db=FakeDB())

    assert exc_info.value.status_code == 400


def test_finalize_submission_rejects_unknown_assignment(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
) -> None:
    monkeypatch.setattr(
        student_api,
        "head_object_safe",
        lambda key: {"exists": True, "size": 466, "content_type": "application/pdf"},
    )

    with pytest.raises(HTTPException, match="Assignment not found") as exc_info:
        student_api.finalize_submission(
            "77",
            valid_finalize_payload,
            BackgroundTasks(),
            db=FakeDB(assignment_row=None),
        )

    assert exc_info.value.status_code == 404


def test_finalize_submission_rejects_when_no_attempts_remain(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
    fake_assignment_row: tuple[SimpleNamespace, SimpleNamespace],
) -> None:
    monkeypatch.setattr(
        student_api,
        "head_object_safe",
        lambda key: {"exists": True, "size": 466, "content_type": "application/pdf"},
    )
    monkeypatch.setattr(student_api, "_max_counted_attempt", lambda *args, **kwargs: 2)

    with pytest.raises(HTTPException, match="No attempts left") as exc_info:
        student_api.finalize_submission(
            "77",
            valid_finalize_payload,
            BackgroundTasks(),
            db=FakeDB(assignment_row=fake_assignment_row),
        )

    assert exc_info.value.status_code == 400


def test_finalize_submission_rejects_disallowed_resubmission(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
) -> None:
    assignment = SimpleNamespace(
        id=501, class_id=41, max_attempts=3, allow_resubmission=False
    )
    class_row = SimpleNamespace(id=41, is_active=True)
    monkeypatch.setattr(
        student_api,
        "head_object_safe",
        lambda key: {"exists": True, "size": 466, "content_type": "application/pdf"},
    )
    monkeypatch.setattr(
        student_api,
        "_latest_counted_submission",
        lambda *args, **kwargs: SimpleNamespace(id=33),
    )

    with pytest.raises(HTTPException, match="Resubmission is not allowed") as exc_info:
        student_api.finalize_submission(
            "77",
            valid_finalize_payload,
            BackgroundTasks(),
            db=FakeDB(assignment_row=(assignment, class_row)),
        )

    assert exc_info.value.status_code == 400


def test_finalize_submission_rejects_failed_file_validation(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
    fake_assignment_row: tuple[SimpleNamespace, SimpleNamespace],
    fake_storage_file: Path,
) -> None:
    import app.ai.storage as storage_mod

    monkeypatch.setattr(
        student_api,
        "head_object_safe",
        lambda key: {"exists": True, "size": 466, "content_type": "application/pdf"},
    )
    monkeypatch.setattr(
        storage_mod, "fetch_pdf_to_local", lambda **kwargs: str(fake_storage_file)
    )
    monkeypatch.setattr(
        student_api,
        "validate_file_signature",
        lambda *args, **kwargs: (_ for _ in ()).throw(ValueError("bad pdf")),
    )
    monkeypatch.setattr(student_api, "basic_file_scan", lambda *args, **kwargs: None)

    with pytest.raises(
        HTTPException, match=r"File validation failed: bad pdf"
    ) as exc_info:
        student_api.finalize_submission(
            "77",
            valid_finalize_payload,
            BackgroundTasks(),
            db=FakeDB(assignment_row=fake_assignment_row),
        )

    assert exc_info.value.status_code == 400
    assert not fake_storage_file.exists()


def test_finalize_submission_creates_submission_and_queues_analysis(
    monkeypatch: pytest.MonkeyPatch,
    patch_common_finalize_dependencies,
    valid_finalize_payload: FinalizeRequest,
    fake_assignment_row: tuple[SimpleNamespace, SimpleNamespace],
    fake_storage_file: Path,
) -> None:
    import app.ai.storage as storage_mod

    fake_db = FakeDB(assignment_row=fake_assignment_row, latest_submission=None)
    background_tasks = BackgroundTasks()
    pushed_events: list[tuple[Any, ...]] = []

    monkeypatch.setattr(
        student_api,
        "head_object_safe",
        lambda key: {"exists": True, "size": 466, "content_type": "application/pdf"},
    )
    monkeypatch.setattr(
        storage_mod, "fetch_pdf_to_local", lambda **kwargs: str(fake_storage_file)
    )
    monkeypatch.setattr(
        student_api,
        "validate_file_signature",
        lambda *args, **kwargs: "application/pdf",
    )
    monkeypatch.setattr(student_api, "basic_file_scan", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        student_api,
        "push_realtime_event",
        lambda *args, **kwargs: pushed_events.append(args),
    )

    response = student_api.finalize_submission(
        "77",
        valid_finalize_payload,
        background_tasks,
        db=fake_db,
    )

    assert response["ok"] is True
    assert response["submission_id"] == 9001
    assert response["attempt_no"] == 1
    assert response["file_name"] == "submission.pdf"
    assert response["integrity_job_status"] == "queued"
    assert response["plagiarism_percent"] == 0
    assert response["idempotency_key"] == "submission:9001:attempt:1"

    assert fake_db.committed is True
    assert len(fake_db.added) == 1
    created_submission = fake_db.added[0]
    assert created_submission.assignment_id == 501
    assert created_submission.student_id == 77
    assert created_submission.status == "processing"
    assert created_submission.storage_provider == "s3"
    assert created_submission.s3_bucket == "test-bucket"
    assert created_submission.s3_key == "submissions/41/501/77/submission.pdf"
    assert created_submission.file_type == "application/pdf"
    assert created_submission.file_size == 466

    assert len(background_tasks.tasks) == 1
    assert background_tasks.tasks[0].func is student_api._run_submission_analysis_task
    assert len(pushed_events) == 1
    assert pushed_events[0][0] == "student"
    assert pushed_events[0][1] == 77
    assert pushed_events[0][2]["status"] == "processing"
    assert not fake_storage_file.exists()
