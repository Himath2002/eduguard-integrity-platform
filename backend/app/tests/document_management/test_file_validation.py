from __future__ import annotations

import builtins
import sys
import types
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.student import FinalizeRequest, PresignRequest
from app.services.file_validation import validate_file_signature


@pytest.fixture(scope="module")
def document_test_files(shared_test_data_dir: Path) -> dict[str, Path]:
    """Return shared file fixtures used by the document-management validation tests."""
    return {
        "valid_pdf": shared_test_data_dir / "valid.pdf",
        "invalid_text": shared_test_data_dir / "invalid.txt",
        "corrupt_pdf": shared_test_data_dir / "corrupt.pdf",
    }


@pytest.fixture()
def force_magic_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force validate_file_signature() to use the magic-byte fallback path."""
    original_import = builtins.__import__

    def fake_import(name: str, *args, **kwargs):
        if name == "magic":
            raise ImportError("python-magic intentionally disabled for fallback-path test")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)


@pytest.mark.parametrize(
    ("file_key", "allowed_types", "expected_type"),
    [
        ("valid_pdf", {"application/pdf"}, "application/pdf"),
    ],
)
def test_validate_file_signature_accepts_valid_pdf_via_fallback(
    document_test_files: dict[str, Path],
    force_magic_fallback: None,
    file_key: str,
    allowed_types: set[str],
    expected_type: str,
) -> None:
    detected_type = validate_file_signature(str(document_test_files[file_key]), allowed_types)

    assert detected_type == expected_type


@pytest.mark.parametrize("file_key", ["invalid_text", "corrupt_pdf"])
def test_validate_file_signature_rejects_non_pdf_content_via_fallback(
    document_test_files: dict[str, Path],
    force_magic_fallback: None,
    file_key: str,
) -> None:
    with pytest.raises(ValueError, match=r"Invalid file content detected: application/octet-stream"):
        validate_file_signature(str(document_test_files[file_key]), {"application/pdf"})


def test_validate_file_signature_uses_python_magic_when_available(
    monkeypatch: pytest.MonkeyPatch,
    document_test_files: dict[str, Path],
) -> None:
    fake_magic = types.SimpleNamespace(from_file=lambda *args, **kwargs: "application/pdf")
    monkeypatch.setitem(sys.modules, "magic", fake_magic)

    detected_type = validate_file_signature(
        str(document_test_files["valid_pdf"]),
        {"application/pdf"},
    )

    assert detected_type == "application/pdf"


@pytest.mark.parametrize(
    "model_class,payload",
    [
        (
            PresignRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.pdf",
                "content_type": "Application/PDF",
            },
        ),
        (
            FinalizeRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.pdf",
                "content_type": "Application/PDF",
                "file_size": 466,
                "s3_bucket": "test-bucket",
                "s3_key": "student/submission.pdf",
            },
        ),
    ],
)
def test_student_request_models_accept_and_normalize_valid_pdf_inputs(model_class, payload: dict) -> None:
    model = model_class(**payload)

    assert model.filename == "submission.pdf"
    assert model.content_type == "application/pdf"


@pytest.mark.parametrize(
    "model_class,payload",
    [
        (
            PresignRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.txt",
                "content_type": "application/pdf",
            },
        ),
        (
            PresignRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.pdf",
                "content_type": "text/plain",
            },
        ),
        (
            FinalizeRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.docx",
                "content_type": "application/pdf",
                "file_size": 466,
                "s3_bucket": "test-bucket",
                "s3_key": "student/submission.docx",
            },
        ),
        (
            FinalizeRequest,
            {
                "class_id": 101,
                "assignment_id": 202,
                "filename": "submission.pdf",
                "content_type": "application/msword",
                "file_size": 466,
                "s3_bucket": "test-bucket",
                "s3_key": "student/submission.pdf",
            },
        ),
    ],
)
def test_student_request_models_reject_non_pdf_inputs(model_class, payload: dict) -> None:
    with pytest.raises(ValidationError, match=r"Only PDF files are allowed"):
        model_class(**payload)
