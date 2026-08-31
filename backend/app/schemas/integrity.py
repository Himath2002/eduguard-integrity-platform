from __future__ import annotations

from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal, Any, Dict


class IntegrityAnalyzeRequest(BaseModel):
    submission_id: int = Field(gt=0)

    local_path: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_key: Optional[str] = None

    idempotency_key: str = Field(default="default")
    correlation_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_location(self):
        if not self.local_path and not (self.s3_bucket and self.s3_key):
            raise ValueError("Provide local_path or both s3_bucket and s3_key")
        return self


class IntegrityJobOut(BaseModel):
    submission_id: int
    idempotency_key: str
    status: Literal["queued", "running", "done", "failed"]
    progress: int
    correlation_id: Optional[str] = None
    error: Optional[str] = None


class IntegrityResultOut(BaseModel):
    submission_id: int
    ai_score: float
    plagiarism_score: float
    payload: Dict[str, Any]
