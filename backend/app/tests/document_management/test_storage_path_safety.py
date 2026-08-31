from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from app.ai.storage import cleanup_downloaded_pdf, resolve_safe_pdf_path


def _temporary_pdf(prefix: str) -> Path:
    descriptor, path = tempfile.mkstemp(prefix=prefix, suffix=".pdf")
    os.close(descriptor)
    return Path(path)


def test_resolve_safe_pdf_path_accepts_managed_temporary_pdf():
    pdf_path = _temporary_pdf("eduguard_")
    try:
        assert resolve_safe_pdf_path(pdf_path) == pdf_path.resolve()
    finally:
        pdf_path.unlink(missing_ok=True)


def test_resolve_safe_pdf_path_rejects_repository_file_outside_managed_roots(
    shared_test_data_dir: Path,
):
    with pytest.raises(ValueError, match="outside EduGuard-managed storage"):
        resolve_safe_pdf_path(shared_test_data_dir / "valid.pdf")


def test_cleanup_downloaded_pdf_removes_only_eduguard_temporary_files():
    managed_pdf = _temporary_pdf("eduguard_")

    assert cleanup_downloaded_pdf(managed_pdf) is True
    assert not managed_pdf.exists()


def test_cleanup_downloaded_pdf_rejects_unmanaged_temporary_name():
    unmanaged_pdf = _temporary_pdf("external_")
    try:
        assert cleanup_downloaded_pdf(unmanaged_pdf) is False
        assert unmanaged_pdf.exists()
    finally:
        unmanaged_pdf.unlink(missing_ok=True)
