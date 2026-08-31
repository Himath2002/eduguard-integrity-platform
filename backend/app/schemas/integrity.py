from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Literal, Any, Dict


class IntegrityAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_id: int = Field(gt=0)
    idempotency_key: str = Field(default="default")
    correlation_id: Optional[str] = None


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
