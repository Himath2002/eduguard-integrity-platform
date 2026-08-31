from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_UPLOAD_ROOT = (BACKEND_ROOT / "uploads").resolve()
TEMP_ROOT = Path(tempfile.gettempdir()).resolve()
TEMP_PDF_NAME = re.compile(r"^eduguard_[A-Za-z0-9_-]+\.pdf$")


def _allowed_pdf_roots() -> tuple[Path, ...]:
    configured_root = os.getenv("EDUGUARD_LOCAL_STORAGE_ROOT", "").strip()
    roots = [DEFAULT_UPLOAD_ROOT, TEMP_ROOT]
    if configured_root:
        roots.append(Path(configured_root).expanduser().resolve())
    return tuple(dict.fromkeys(roots))


def resolve_safe_pdf_path(path: str | Path) -> Path:
    """Resolve a PDF only inside EduGuard-managed upload or temporary storage."""
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = BACKEND_ROOT / candidate
    candidate = candidate.resolve()

    if candidate.suffix.lower() != ".pdf":
        raise ValueError("Only PDF files can be processed")
    if not any(candidate.is_relative_to(root) for root in _allowed_pdf_roots()):
        raise ValueError("PDF path is outside EduGuard-managed storage")
    if not candidate.is_file():
        raise FileNotFoundError(f"PDF not found: {candidate}")
    return candidate


def cleanup_downloaded_pdf(path: str | Path | None) -> bool:
    """Remove only the named temporary PDF created by ``fetch_pdf_to_local``."""
    if not path:
        return False

    supplied_name = Path(path).name
    if not TEMP_PDF_NAME.fullmatch(supplied_name):
        return False

    candidate = (TEMP_ROOT / supplied_name).resolve()
    if candidate.parent != TEMP_ROOT or not candidate.is_file():
        return False

    try:
        candidate.unlink()
    except OSError:
        return False
    return True


def fetch_pdf_to_local(
    *,
    local_path: str | None = None,
    s3_bucket: str | None = None,
    s3_key: str | None = None,
) -> str:
    """Return a local filesystem path to the PDF.

    - If local_path is provided, returns it (after checking it exists).
    - If s3_bucket + s3_key are provided, downloads via boto3 to a temp file.
    """
    if local_path:
        return resolve_safe_pdf_path(local_path).as_posix()

    if s3_bucket and s3_key:
        import boto3  # lazy import

        s3 = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION"),
        )

        fd, tmp_path = tempfile.mkstemp(suffix=".pdf", prefix="eduguard_")
        os.close(fd)
        s3.download_file(s3_bucket, s3_key, tmp_path)
        return tmp_path

    raise ValueError("Provide either local_path or (s3_bucket and s3_key)")
