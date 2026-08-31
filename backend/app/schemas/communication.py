from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class AnnouncementCreate(BaseModel):
    subject: str
    body: str
    audience: str = "students"

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Subject is required")
        return v

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Message is required")
        return v

    @field_validator("audience")
    @classmethod
    def validate_audience(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v != "students":
            raise ValueError("Only student announcements are supported for now")
        return v


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    audience: str
    subject: str
    body: str
    is_active: bool
    created_by: int | None
    created_at: datetime
    updated_at: datetime
