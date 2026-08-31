from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

from fastapi.responses import FileResponse, RedirectResponse

from app.ai.storage import fetch_pdf_to_local
from app.models.submission import Submission
from app.services.s3_service import create_download_url, has_s3_storage, head_object_safe


def is_local_existing_path(value: str | None) -> bool:
    if not value:
        return False
    try:
        return Path(str(value)).expanduser().exists()
    except Exception:
        return False




def file_reference_exists(*, storage_provider: str | None, file_path: str | None, s3_key: str | None) -> bool:
    provider = (storage_provider or "local").lower()
    if provider == "s3":
        if not s3_key:
            return False
        try:
            return bool(head_object_safe(str(s3_key)).get("exists"))
        except Exception:
            return False
    return is_local_existing_path(file_path)

def submission_has_file(submission: Submission | None) -> bool:
    if not submission:
        return False
    return file_reference_exists(
        storage_provider=getattr(submission, "storage_provider", "local"),
        file_path=getattr(submission, "file_path", None),
        s3_key=getattr(submission, "s3_key", None),
    )


def resolve_submission_pdf_to_local(submission: Submission) -> Tuple[str, bool]:
    provider = (getattr(submission, "storage_provider", "local") or "local").lower()
    if provider == "s3":
        local_path = fetch_pdf_to_local(
            local_path=None,
            s3_bucket=getattr(submission, "s3_bucket", None),
            s3_key=getattr(submission, "s3_key", None),
        )
        return local_path, True

    local_path = fetch_pdf_to_local(local_path=getattr(submission, "file_path", None))
    return local_path, False


def cleanup_temp_file(local_path: str | None, should_cleanup: bool) -> None:
    if not should_cleanup or not local_path:
        return
    try:
        if os.path.exists(local_path):
            os.remove(local_path)
    except Exception:
        pass


def submission_file_response(submission: Submission, *, filename: str | None = None):
    provider = (getattr(submission, "storage_provider", "local") or "local").lower()
    if provider == "s3" and getattr(submission, "s3_key", None):
        url = create_download_url(
            key=str(submission.s3_key),
            filename=filename or submission.file_name or "submission.pdf",
            content_type=submission.mime_type or submission.file_type or "application/pdf",
        )
        return RedirectResponse(url=url, status_code=307)

    file_path = Path(str(submission.file_path or "")).expanduser()
    if not file_path.exists():
        raise FileNotFoundError("Submission file missing on disk")
    return FileResponse(
        str(file_path),
        media_type=submission.file_type or "application/pdf",
        filename=filename or submission.file_name or "submission.pdf",
    )


def reference_file_response(path_or_key: str | None, *, filename: str, content_type: str = "application/pdf"):
    if not path_or_key:
        raise FileNotFoundError("File reference not found")

    if is_local_existing_path(path_or_key):
        return FileResponse(str(Path(str(path_or_key)).expanduser()), media_type=content_type, filename=filename)

    if not has_s3_storage():
        raise FileNotFoundError("Referenced file is not available")

    url = create_download_url(key=str(path_or_key), filename=filename, content_type=content_type)
    return RedirectResponse(url=url, status_code=307)
