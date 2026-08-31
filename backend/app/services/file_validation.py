from __future__ import annotations

from pathlib import Path


PDF_MAGIC = b"%PDF"
ZIP_MAGIC = b"PK\x03\x04"
OLE_MAGIC = bytes.fromhex("D0CF11E0")


def validate_file_signature(file_path: str, allowed_types: set[str]) -> str:
    """Best-effort file signature validation.

    Uses python-magic when available, then falls back to simple magic-byte checks.
    """
    detected_type: str | None = None
    try:
        import magic  # type: ignore

        detected_type = str(magic.from_file(file_path, mime=True) or "").strip().lower() or None
    except Exception:
        detected_type = None

    if not detected_type:
        header = Path(file_path).read_bytes()[:8]
        if header.startswith(PDF_MAGIC):
            detected_type = "application/pdf"
        elif header.startswith(ZIP_MAGIC):
            detected_type = "application/zip"
        elif header.startswith(OLE_MAGIC):
            detected_type = "application/msword"
        else:
            detected_type = "application/octet-stream"

    if detected_type not in allowed_types:
        raise ValueError(f"Invalid file content detected: {detected_type}")

    return detected_type
