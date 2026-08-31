from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AssignmentCreate(BaseModel):
    class_id: int
    title: str = Field(min_length=1)
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    allow_resubmission: bool = True
    max_attempts: int = Field(default=1, ge=1)
    student_report_visible: bool = False
