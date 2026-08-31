from typing import Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator

RoleAdminManage = Literal["student", "lecturer"]
RoleAdminUserOut = Literal["student", "lecturer", "admin"]


def _validate_email_text(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Email is required")
    try:
        validate_email(raw, check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return raw


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    full_name: str
    username: str
    email: str
    role: RoleAdminUserOut


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=2)
    email: str | None = None
    role: RoleAdminManage | None = None

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_email_text(value)


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2)
    username: str = Field(min_length=3)
    email: str
    role: RoleAdminManage
    password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return _validate_email_text(value)
