from __future__ import annotations

import os
from pathlib import Path
from typing import Any
import uuid


def _require_bucket_name() -> str:
    bucket = (os.getenv("S3_BUCKET_NAME") or "").strip()
    if not bucket:
        raise RuntimeError("S3_BUCKET_NAME is not set")
    return bucket


def get_bucket_name() -> str:
    return _require_bucket_name()


def has_s3_storage() -> bool:
    return bool((os.getenv("S3_BUCKET_NAME") or "").strip())


def _get_client():
    import boto3

    kwargs: dict[str, Any] = {}
    region = (os.getenv("AWS_REGION") or "").strip()
    if region:
        kwargs["region_name"] = region

    access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
    secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key

    session_token = (os.getenv("AWS_SESSION_TOKEN") or "").strip()
    if session_token:
        kwargs["aws_session_token"] = session_token

    return boto3.client("s3", **kwargs)


def build_submission_key(class_id: int, assignment_id: int, student_id: int, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return (
        f"submissions/class_{class_id}/assignment_{assignment_id}/"
        f"student_{student_id}/{uuid.uuid4()}.{ext}"
    )


def build_assignment_material_key(class_id: int, assignment_id: int, filename: str) -> str:
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return f"materials/class_{class_id}/assignment_{assignment_id}/{uuid.uuid4()}_{safe_name}"


def build_marked_report_key(submission_id: int, lecturer_id: int) -> str:
    return f"marked-reports/submission_{submission_id}/lecturer_{lecturer_id}/{uuid.uuid4()}.pdf"


def create_presigned_post(key: str, content_type: str, max_size_bytes: int):
    bucket = _require_bucket_name()
    s3 = _get_client()
    fields = {"Content-Type": content_type, "acl": "private"}
    conditions = [
        {"Content-Type": content_type},
        {"acl": "private"},
        ["content-length-range", 1, max_size_bytes],
    ]
    return s3.generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=600,
    )


def create_download_url(
    key: str,
    expires_in: int = 3600,
    filename: str | None = None,
    content_type: str | None = None,
    disposition: str = "inline",
):
    bucket = _require_bucket_name()
    s3 = _get_client()
    params: dict[str, Any] = {"Bucket": bucket, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = f'{disposition}; filename="{filename}"'
    if content_type:
        params["ResponseContentType"] = content_type
    return s3.generate_presigned_url("get_object", Params=params, ExpiresIn=expires_in)


def head_object_safe(key: str):
    bucket = _require_bucket_name()
    s3 = _get_client()
    try:
        res = s3.head_object(Bucket=bucket, Key=key)
        return {
            "exists": True,
            "size": res.get("ContentLength"),
            "content_type": res.get("ContentType"),
        }
    except Exception:
        return {"exists": False, "size": None, "content_type": None}


def upload_file(local_path: str, key: str, content_type: str = "application/octet-stream") -> None:
    bucket = _require_bucket_name()
    s3 = _get_client()
    p = Path(local_path)
    extra_args = {"ContentType": content_type, "ACL": "private"}
    s3.upload_file(str(p), bucket, key, ExtraArgs=extra_args)
