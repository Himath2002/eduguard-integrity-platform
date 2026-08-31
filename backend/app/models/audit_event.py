import uuid
from sqlalchemy import Column, BigInteger, Text, DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(BigInteger, primary_key=True, index=True)
    correlation_id = Column(
        UUID(as_uuid=True), default=uuid.uuid4, nullable=False, index=True
    )

    actor_user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    event_type = Column(Text, nullable=False)
    entity_table = Column(Text, nullable=False)
    entity_id = Column(BigInteger, nullable=True)

    occurred_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # IMPORTANT: Python attribute name is "meta", DB column name is "metadata"
    meta = Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))
