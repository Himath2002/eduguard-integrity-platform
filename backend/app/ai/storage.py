from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional, Tuple


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
        p = Path(local_path)
        if not p.exists():
            raise FileNotFoundError(f"local_path not found: {p}")
        return p.as_posix()

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
