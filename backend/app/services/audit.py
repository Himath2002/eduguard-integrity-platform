from __future__ import annotations

from typing import Any
from uuid import UUID

from app.models.audit_event import AuditEvent


def write_audit_event(
    db,
    *,
    actor_user_id: int | None,
    event_type: str,
    entity_table: str,
    entity_id: int | None,
    metadata: dict[str, Any] | None = None,
    correlation_id: UUID | str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor_user_id,
        event_type=event_type,
        entity_table=entity_table,
        entity_id=entity_id,
        meta=metadata or {},
    )
    if correlation_id is not None:
        event.correlation_id = correlation_id
    db.add(event)
    return event
