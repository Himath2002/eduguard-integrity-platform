from sqlalchemy import (
    Column,
    BigInteger,
    Text,
    ForeignKey,
    DateTime,
    func,
    Boolean,
    Integer,
    String,
)
from app.db.base import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(BigInteger, primary_key=True, index=True)
    class_id = Column(
        BigInteger,
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)

    allow_resubmission = Column(Boolean, nullable=False, default=True)
    max_attempts = Column(Integer, nullable=False, default=1)
    student_report_visible = Column(Boolean, nullable=False, default=False, server_default="false")


    material_path = Column(Text, nullable=True)
    material_name = Column(Text, nullable=True)
    material_type = Column(Text, nullable=True)
    material_size = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
