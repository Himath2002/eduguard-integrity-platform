from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class FalseDetectionRemovedRangeIn(BaseModel):
    occurrenceId: str = Field(min_length=1)
    start: int
    end: int
    text: str | None = None

    @field_validator("occurrenceId")
    @classmethod
    def validate_occurrence_id(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("occurrenceId is required")
        return cleaned


class FalseDetectionReviewSaveIn(BaseModel):
    removed_ranges: list[FalseDetectionRemovedRangeIn] = Field(default_factory=list)
    adjusted_plagiarism_percent: int = Field(ge=0, le=100)
    justification_note: str = Field(min_length=1)
    lock_token: str | None = None

    @field_validator("justification_note")
    @classmethod
    def validate_justification_note(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("justification_note is required")
        return cleaned
