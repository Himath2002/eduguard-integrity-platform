from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ClassEnrollment(Base):
    __tablename__ = "class_enrollments"

    class_id = Column(
        BigInteger, ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True
    )
    student_id = Column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    status = Column(
        String(16), nullable=False, server_default="active"
    )  # active | removed
    enrolled_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    removed_at = Column(DateTime(timezone=True), nullable=True)

    class_ = relationship("Class", backref="enrollments")
    student = relationship("User", backref="class_enrollments")
