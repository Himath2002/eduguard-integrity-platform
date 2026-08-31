from sqlalchemy import (
    Column,
    BigInteger,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import relationship
from app.db.base import Base


class Class(Base):
    __tablename__ = "classes"

    id = Column(BigInteger, primary_key=True, index=True)
    lecturer_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = Column(Text, nullable=False)
    class_code = Column(String(32), nullable=False, index=True)
    description = Column(Text, nullable=True)

    enrollment_key_hash = Column(Text, nullable=True)  # optional
    is_active = Column(Boolean, nullable=False, server_default="true")

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    lecturer = relationship("User", backref="classes")
