from pydantic import BaseModel, field_validator


class PresignRequest(BaseModel):
    class_id: int
    assignment_id: int
    filename: str
    content_type: str

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        if not v or not v.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are allowed.")
        return v

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        if (v or "").lower() != "application/pdf":
            raise ValueError("Only PDF files are allowed.")
        return v.lower()


class FinalizeRequest(BaseModel):
    class_id: int
    assignment_id: int
    filename: str
    content_type: str
    file_size: int
    s3_bucket: str
    s3_key: str

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        if not v or not v.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are allowed.")
        return v

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        if (v or "").lower() != "application/pdf":
            raise ValueError("Only PDF files are allowed.")
        return v.lower()
