from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import communications as communications_api
from app.models.communication import CommentThread


class FakeQuery:
    def __init__(self, result: Any = None):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def join(self, *args, **kwargs):
        return self

    def outerjoin(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def group_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def first(self):
        if isinstance(self.result, list):
            return self.result[0] if self.result else None
        return self.result

    def all(self):
        if self.result is None:
            return []
        return self.result if isinstance(self.result, list) else [self.result]

    def count(self):
        if self.result is None:
            return 0
        if isinstance(self.result, list):
            return len(self.result)
        return int(self.result)


class SequentialFakeDB:
    def __init__(self, *results: Any):
        self.results = list(results)
        self.added: list[Any] = []
        self.commit_calls = 0
        self.flush_calls = 0
        self.refresh_calls: list[Any] = []

    def query(self, *entities):
        if not self.results:
            raise AssertionError(f"Unexpected extra query for entities: {entities!r}")
        return FakeQuery(self.results.pop(0))

    def add(self, obj: Any):
        self.added.append(obj)

    def flush(self):
        self.flush_calls += 1
        if self.added:
            last = self.added[-1]
            if getattr(last, "id", None) is None:
                last.id = len(self.added)
            if getattr(last, "created_at", None) is None:
                last.created_at = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)

    def commit(self):
        self.commit_calls += 1

    def refresh(self, obj: Any):
        self.refresh_calls.append(obj)


class StaticThreadsQuery:
    def __init__(self, rows: list[Any]):
        self.rows = rows

    def all(self):
        return self.rows


@pytest.fixture()
def student_actor() -> SimpleNamespace:
    return SimpleNamespace(id=101, username="mina", role="student")


@pytest.fixture()
def lecturer_actor() -> SimpleNamespace:
    return SimpleNamespace(id=201, username="lecturer1", role="lecturer")


def test_open_or_create_thread_requires_submission_id(
    monkeypatch: pytest.MonkeyPatch,
    student_actor: SimpleNamespace,
) -> None:
    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: student_actor
    )

    with pytest.raises(HTTPException, match="submission_id is required") as exc_info:
        communications_api.open_or_create_thread(
            "student", "mina", {}, db=SimpleNamespace()
        )

    assert exc_info.value.status_code == 400


def test_open_or_create_thread_returns_serialized_summary(
    monkeypatch: pytest.MonkeyPatch,
    student_actor: SimpleNamespace,
) -> None:
    thread = SimpleNamespace(id=77, submission_id=9001)

    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: student_actor
    )

    def fake_thread_from_context(
        db, *, actor, submission_id, annotation_id=None, annotation_order_no=None
    ):
        assert actor is student_actor
        assert submission_id == 9001
        assert annotation_id is None
        assert annotation_order_no == 3
        return thread

    monkeypatch.setattr(
        communications_api, "_thread_from_context", fake_thread_from_context
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_thread_summary",
        lambda db, actor_role, thread: {
            "id": thread.id,
            "submission_id": thread.submission_id,
            "annotation_order_no": 3,
            "unread_count": 0,
        },
    )

    response = communications_api.open_or_create_thread(
        "student",
        "mina",
        {"submission_id": 9001, "annotation_order_no": 3},
        db=SimpleNamespace(),
    )

    assert response == {
        "id": 77,
        "submission_id": 9001,
        "annotation_order_no": 3,
        "unread_count": 0,
    }


def test_list_threads_applies_submission_class_and_unread_filters(
    monkeypatch: pytest.MonkeyPatch,
    student_actor: SimpleNamespace,
) -> None:
    threads = [SimpleNamespace(id=1), SimpleNamespace(id=2), SimpleNamespace(id=3)]
    summaries = {
        1: {"id": 1, "submission_id": 9001, "class_code": "SE3050", "unread_count": 2},
        2: {"id": 2, "submission_id": 9001, "class_code": "SE3051", "unread_count": 3},
        3: {"id": 3, "submission_id": 9002, "class_code": "SE3050", "unread_count": 0},
    }

    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: student_actor
    )
    monkeypatch.setattr(
        communications_api,
        "_actor_threads_query",
        lambda db, actor: StaticThreadsQuery(threads),
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_thread_summary",
        lambda db, actor_role, thread: summaries[thread.id],
    )

    response = communications_api.list_threads(
        "student",
        "mina",
        submission_id=9001,
        class_code="SE3050",
        status="unread",
        db=SimpleNamespace(),
    )

    assert response == [summaries[1]]


def test_thread_from_context_refreshes_existing_thread_snapshot(
    student_actor: SimpleNamespace,
) -> None:
    submission = SimpleNamespace(id=9001, student_id=101)
    assignment = SimpleNamespace(id=401)
    class_row = SimpleNamespace(lecturer_id=201)
    report = SimpleNamespace(id=71)
    annotation = SimpleNamespace(
        id=11,
        order_no=4,
        selected_text="Quoted sentence",
        comment="Please justify this evidence.",
    )
    existing_thread = SimpleNamespace(
        id=55,
        submission_id=9001,
        report_id=71,
        annotation_id=11,
        student_id=101,
        lecturer_id=201,
        annotation_order_no=None,
        annotation_selected_text=None,
        annotation_comment_snapshot=None,
    )

    db = SequentialFakeDB(
        (submission, assignment, class_row, report),
        annotation,
        existing_thread,
    )

    returned = communications_api._thread_from_context(
        db,
        actor=student_actor,
        submission_id=9001,
        annotation_order_no=4,
    )

    assert returned is existing_thread
    assert existing_thread.annotation_order_no == 4
    assert existing_thread.annotation_selected_text == "Quoted sentence"
    assert (
        existing_thread.annotation_comment_snapshot == "Please justify this evidence."
    )
    assert db.commit_calls == 1
    assert existing_thread in db.refresh_calls


def test_thread_from_context_creates_new_thread_when_missing(
    lecturer_actor: SimpleNamespace,
) -> None:
    submission = SimpleNamespace(id=9001, student_id=101)
    assignment = SimpleNamespace(id=401)
    class_row = SimpleNamespace(lecturer_id=201)
    report = SimpleNamespace(id=71)
    annotation = SimpleNamespace(
        id=13,
        order_no=2,
        selected_text="This argument is too broad",
        comment="Narrow the scope and add one source.",
    )

    db = SequentialFakeDB(
        (submission, assignment, class_row, report),
        annotation,
        None,
    )

    returned = communications_api._thread_from_context(
        db,
        actor=lecturer_actor,
        submission_id=9001,
        annotation_id=13,
    )

    assert isinstance(returned, CommentThread)
    assert returned.submission_id == 9001
    assert returned.report_id == 71
    assert returned.annotation_id == 13
    assert returned.student_id == 101
    assert returned.lecturer_id == 201
    assert returned.annotation_order_no == 2
    assert returned.annotation_selected_text == "This argument is too broad"
    assert (
        returned.annotation_comment_snapshot == "Narrow the scope and add one source."
    )
    assert returned.thread_status == "open"
    assert db.added and db.added[0] is returned
    assert db.commit_calls == 1
    assert returned in db.refresh_calls


def test_thread_from_context_rejects_missing_annotation(
    lecturer_actor: SimpleNamespace,
) -> None:
    submission = SimpleNamespace(id=9001, student_id=101)
    assignment = SimpleNamespace(id=401)
    class_row = SimpleNamespace(lecturer_id=201)
    report = SimpleNamespace(id=71)

    db = SequentialFakeDB(
        (submission, assignment, class_row, report),
        None,
    )

    with pytest.raises(HTTPException, match="Comment annotation not found") as exc_info:
        communications_api._thread_from_context(
            db,
            actor=lecturer_actor,
            submission_id=9001,
            annotation_order_no=99,
        )

    assert exc_info.value.status_code == 404


def test_get_thread_detail_blocks_access_for_other_student(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = SimpleNamespace(id=999, username="other", role="student")
    thread = SimpleNamespace(id=55, student_id=101, lecturer_id=201, submission_id=9001)
    db = SequentialFakeDB(thread)

    monkeypatch.setattr(communications_api, "_get_actor", lambda db, role, ident: actor)

    with pytest.raises(
        HTTPException, match="not available to this student"
    ) as exc_info:
        communications_api.get_thread_detail("student", "other", 55, db=db)

    assert exc_info.value.status_code == 403


def test_serialize_thread_detail_marks_incoming_messages_read_and_returns_feedback_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thread = SimpleNamespace(
        id=55,
        student_id=101,
        lecturer_id=201,
        submission_id=9001,
        report_id=71,
        annotation_id=11,
        annotation_order_no=4,
        annotation_selected_text="Old highlighted text",
        annotation_comment_snapshot="Old comment snapshot",
    )
    submission = SimpleNamespace(id=9001)
    report = SimpleNamespace(
        score=88,
        max_score=100,
        generated_pdf_path="/tmp/marked.pdf",
        published_to_student=True,
    )
    assignment = SimpleNamespace(id=401, title="Final Essay")
    class_row = SimpleNamespace(class_code="SE3050", name="Software Engineering")
    annotation = SimpleNamespace(
        id=11,
        order_no=4,
        selected_text="Quoted evidence needs citation",
        comment="Add a page number here.",
        annotation_color="yellow",
    )

    message_1 = SimpleNamespace(
        id=1,
        thread_id=55,
        sender_id=201,
        sender_role="lecturer",
        body="Please look at comment 4.",
        read_at=datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc),
        created_at=datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc),
    )
    message_2 = SimpleNamespace(
        id=2,
        thread_id=55,
        sender_id=101,
        sender_role="student",
        body="Thanks, I will revise it.",
        read_at=None,
        created_at=datetime(2026, 5, 1, 9, 5, tzinfo=timezone.utc),
    )
    messages = [message_1, message_2]
    incoming = [message_2]
    db = SequentialFakeDB(messages, incoming, messages)

    monkeypatch.setattr(
        communications_api,
        "_load_thread_context",
        lambda db, thread_id: (
            None,
            submission,
            report,
            assignment,
            class_row,
            "mina",
            "Mina Student",
            "mina@test.com",
            annotation,
        ),
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_thread_summary",
        lambda db, actor_role, thread: {
            "id": 55,
            "submission_id": 9001,
            "unread_count": 0,
        },
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_message",
        lambda db, message: {
            "id": message.id,
            "sender_role": message.sender_role,
            "body": message.body,
            "read_at": message.read_at.isoformat() if message.read_at else None,
        },
    )
    monkeypatch.setattr(
        communications_api, "submission_has_file", lambda submission: True
    )
    monkeypatch.setattr(
        communications_api,
        "resolve_submission_pdf_to_local",
        lambda submission: (Path("/tmp/submission.pdf"), False),
    )
    monkeypatch.setattr(
        communications_api,
        "extract_pdf_text",
        lambda path: SimpleNamespace(full_text="Full extracted report text"),
    )
    cleanup_calls: list[tuple[str, bool]] = []
    monkeypatch.setattr(
        communications_api,
        "cleanup_temp_file",
        lambda path, flag: cleanup_calls.append((Path(path).as_posix(), flag)),
    )

    response = communications_api._serialize_thread_detail(db, "lecturer", thread)

    assert db.commit_calls == 1
    assert message_2.read_at is not None
    assert response["thread"]["id"] == 55
    assert response["context"]["assignment_title"] == "Final Essay"
    assert response["context"]["annotation"]["id"] == 11
    assert (
        response["context"]["annotation"]["selected_text"]
        == "Quoted evidence needs citation"
    )
    assert response["context"]["annotation"]["comment"] == "Add a page number here."
    assert response["context"]["report_text"] == "Full extracted report text"
    assert (
        response["context"]["submission_file_url"]
        == "/student/mina/submissions/9001/file"
    )
    assert (
        response["context"]["lecturer_file_url"]
        == "/lecturer/201/submissions/9001/file"
    )
    assert (
        response["context"]["marked_pdf_student_url"]
        == "/student/mina/submissions/9001/marked-report/pdf"
    )
    assert (
        response["context"]["marked_pdf_lecturer_url"]
        == "/lecturer/201/submissions/9001/marked-report/pdf"
    )
    assert cleanup_calls == [("/tmp/submission.pdf", False)]


@pytest.mark.asyncio
async def test_send_message_rejects_blank_feedback_reply(
    monkeypatch: pytest.MonkeyPatch,
    student_actor: SimpleNamespace,
) -> None:
    thread = SimpleNamespace(id=55, student_id=101, lecturer_id=201)
    db = SequentialFakeDB(thread)

    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: student_actor
    )

    with pytest.raises(HTTPException, match="Message cannot be empty") as exc_info:
        await communications_api.send_message(
            "student",
            "mina",
            55,
            {"body": "   "},
            db=db,
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_send_message_rejects_too_long_feedback_reply(
    monkeypatch: pytest.MonkeyPatch,
    lecturer_actor: SimpleNamespace,
) -> None:
    thread = SimpleNamespace(id=55, student_id=101, lecturer_id=201)
    db = SequentialFakeDB(thread)

    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: lecturer_actor
    )

    with pytest.raises(HTTPException, match="Message is too long") as exc_info:
        await communications_api.send_message(
            "lecturer",
            "lecturer1",
            55,
            {"body": "x" * 4001},
            db=db,
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_send_message_persists_message_and_broadcasts_updated_thread(
    monkeypatch: pytest.MonkeyPatch,
    lecturer_actor: SimpleNamespace,
) -> None:
    thread = SimpleNamespace(
        id=77, student_id=101, lecturer_id=201, last_message_at=None
    )
    db = SequentialFakeDB(thread)
    broadcast_calls: list[dict[str, Any]] = []

    monkeypatch.setattr(
        communications_api, "_get_actor", lambda db, role, ident: lecturer_actor
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_message",
        lambda db, message: {
            "id": 1,
            "thread_id": 77,
            "sender_role": "lecturer",
            "body": message.body,
        },
    )
    monkeypatch.setattr(
        communications_api,
        "_serialize_thread_summary",
        lambda db, actor_role, thread: {
            "id": thread.id,
            "viewer": actor_role,
            "submission_id": 9001,
        },
    )

    async def fake_broadcast(
        student_id,
        lecturer_id,
        thread_id,
        message_payload,
        student_summary,
        lecturer_summary,
    ):
        broadcast_calls.append(
            {
                "student_id": student_id,
                "lecturer_id": lecturer_id,
                "thread_id": thread_id,
                "message": message_payload,
                "student_summary": student_summary,
                "lecturer_summary": lecturer_summary,
            }
        )

    monkeypatch.setattr(communications_api, "_broadcast_new_message", fake_broadcast)

    response = await communications_api.send_message(
        "lecturer",
        "lecturer1",
        77,
        {"body": "  Please revise paragraph 2 and re-check the citation.  "},
        db=db,
    )

    assert response["ok"] is True
    assert (
        response["message"]["body"]
        == "Please revise paragraph 2 and re-check the citation."
    )
    assert response["thread"] == {"id": 77, "viewer": "lecturer", "submission_id": 9001}
    assert db.flush_calls == 1
    assert db.commit_calls == 1
    assert db.added, "A CommentMessage should be added to the session"
    assert db.added[0].body == "Please revise paragraph 2 and re-check the citation."
    assert broadcast_calls and broadcast_calls[0]["thread_id"] == 77
    assert broadcast_calls[0]["student_summary"]["viewer"] == "student"
    assert broadcast_calls[0]["lecturer_summary"]["viewer"] == "lecturer"
