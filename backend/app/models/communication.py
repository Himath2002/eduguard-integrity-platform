from sqlalchemy import Column, Integer, BigInteger, ForeignKey, DateTime, Text, func
from app.db.base import Base


class CommentThread(Base):
    __tablename__ = "comment_threads"

    id = Column(Integer, primary_key=True)
    submission_id = Column(BigInteger, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    report_id = Column(Integer, ForeignKey("submission_mark_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    annotation_id = Column(Integer, ForeignKey("mark_annotations.id", ondelete="SET NULL"), nullable=True, index=True)

    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lecturer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    annotation_order_no = Column(Integer, nullable=True)
    annotation_selected_text = Column(Text, nullable=True)
    annotation_comment_snapshot = Column(Text, nullable=True)
    thread_status = Column(Text, nullable=False, default="open", server_default="open")
    last_message_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CommentMessage(Base):
    __tablename__ = "comment_messages"

    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("comment_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_role = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
