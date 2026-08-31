from typing import Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator, model_validator

Role = Literal["student", "lecturer", "admin"]


def _validate_email_text(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Email is required")
    try:
        validate_email(raw, check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return raw


def _validate_non_empty_text(value: str, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required")
    return text


class SignupRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2)

    firstName: str | None = Field(default=None, min_length=2)
    lastName: str | None = Field(default=None, min_length=2)

    username: str = Field(min_length=3)
    email: str
    password: str = Field(min_length=8, max_length=72)
    role: Role

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return _validate_email_text(value)

    @model_validator(mode="after")
    def ensure_names(self):
        if self.full_name and (not self.firstName or not self.lastName):
            parts = self.full_name.strip().split()
            if len(parts) < 2:
                raise ValueError("full_name must include at least first and last name")
            self.firstName = parts[0]
            self.lastName = " ".join(parts[1:])
            return self

        if self.firstName and self.lastName and not self.full_name:
            self.full_name = f"{self.firstName.strip()} {self.lastName.strip()}".strip()
            return self

        if not (self.full_name or (self.firstName and self.lastName)):
            raise ValueError("Provide either full_name or firstName + lastName")

        return self


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return _validate_email_text(value)


class ChangePasswordRequest(BaseModel):
    email: str
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return _validate_email_text(value)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=20)

    @field_validator("credential")
    @classmethod
    def validate_credential(cls, value: str) -> str:
        return _validate_non_empty_text(value, "credential")


class GoogleCompleteRequest(BaseModel):
    signup_token: str = Field(min_length=20)
    username: str = Field(min_length=3, max_length=50)
    role: Role

    @field_validator("signup_token")
    @classmethod
    def validate_signup_token(cls, value: str) -> str:
        return _validate_non_empty_text(value, "signup_token")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        username = _validate_non_empty_text(value, "username")
        if " " in username:
            raise ValueError("Username cannot contain spaces")
        return username
