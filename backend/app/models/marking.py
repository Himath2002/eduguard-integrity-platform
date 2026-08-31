from sqlalchemy import Column, Integer, BigInteger, ForeignKey, DateTime, Text, Boolean, func
from app.db.base import Base


class SubmissionMarkReport(Base):
    __tablename__ = "submission_mark_reports"

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    lecturer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    score = Column(Integer, nullable=True)
    max_score = Column(Integer, nullable=True)
    general_feedback = Column(Text, nullable=True)
    published_to_student = Column(Boolean, nullable=False, default=True, server_default="true")
    generated_pdf_path = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MarkAnnotation(Base):
    __tablename__ = "mark_annotations"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("submission_mark_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    order_no = Column(Integer, nullable=False, default=1)
    selected_text = Column(Text, nullable=False)
    comment = Column(Text, nullable=False)
    annotation_color = Column(Text, nullable=False, default="blue", server_default="blue")
    conversation_key = Column(Text, nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
