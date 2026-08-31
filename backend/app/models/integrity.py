from __future__ import annotations

from sqlalchemy import Column, Integer, String, DateTime, Text, Float, UniqueConstraint, BigInteger
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class IntegrityJob(Base):
    __tablename__ = "integrity_jobs"
    __table_args__ = (
        UniqueConstraint("submission_id", "idempotency_key", name="uq_integrity_submission_idem"),
    )

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, index=True, nullable=False)
    idempotency_key = Column(String, index=True, nullable=False)

    status = Column(String, index=True, nullable=False, default="queued")
    progress = Column(Integer, nullable=False, default=0)

    correlation_id = Column(String, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class IntegrityResult(Base):
    __tablename__ = "integrity_results"

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, index=True, nullable=False)

    ai_score = Column(Float, nullable=False, default=0.0)
    plagiarism_score = Column(Float, nullable=False, default=0.0)

    payload = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class IntegrityReviewOverride(Base):
    __tablename__ = "integrity_review_overrides"

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, index=True, nullable=False, unique=True)

    adjusted_plagiarism_score = Column(Float, nullable=False, default=0.0)
    removed_ranges = Column(JSONB, nullable=False, default=list)

    created_by = Column(BigInteger, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class IntegrityReviewOverrideVersion(Base):
    __tablename__ = "integrity_review_override_versions"
    __table_args__ = (
        UniqueConstraint("submission_id", "version_no", name="uq_integrity_review_version_no"),
        UniqueConstraint("submission_id", "idempotency_key", name="uq_integrity_review_idem"),
    )

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, index=True, nullable=False)
    version_no = Column(Integer, nullable=False)
    adjusted_plagiarism_score = Column(Float, nullable=False, default=0.0)
    removed_ranges = Column(JSONB, nullable=False, default=list)
    justification_note = Column(Text, nullable=False)
    created_by = Column(BigInteger, nullable=False)
    idempotency_key = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class IntegrityReviewLock(Base):
    __tablename__ = "integrity_review_locks"

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, index=True, nullable=False, unique=True)
    locked_by = Column(BigInteger, nullable=False)
    lock_token = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class CorpusChunk(Base):
    __tablename__ = "corpus_chunks"

    id = Column(Integer, primary_key=True)

    # submission ids stay positive; lecture-material ids can be negative deterministic ids
    doc_id = Column(BigInteger, index=True, nullable=False)
    chunk_id = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)

    # NEW
    source_type = Column(String, index=True, nullable=False, default="submission")
    source_name = Column(Text, nullable=True)
    source_path = Column(Text, nullable=True)
    class_id = Column(BigInteger, index=True, nullable=True)
    assignment_id = Column(BigInteger, index=True, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)