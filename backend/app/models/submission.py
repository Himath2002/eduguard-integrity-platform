from sqlalchemy import Column, BigInteger, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base
import uuid


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(BigInteger, primary_key=True)

    assignment_id = Column(
        BigInteger, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    attempt_no = Column(Integer, nullable=False, server_default="1")
    status = Column(Text, nullable=False, server_default="submitted")

    submitted_at = Column(DateTime(timezone=True), nullable=True)
    correlation_id = Column(UUID(as_uuid=True), nullable=True, default=uuid.uuid4)

    # Uploaded file metadata
    file_path = Column(Text, nullable=True)
    file_name = Column(Text, nullable=True)
    file_type = Column(Text, nullable=True)
    file_size = Column(BigInteger, nullable=True)

    # Storage metadata for S3-backed submissions
    storage_provider = Column(Text, nullable=False, server_default="local")
    s3_bucket = Column(Text, nullable=True)
    s3_key = Column(Text, nullable=True)
    mime_type = Column(Text, nullable=True)
    sha256_checksum = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
