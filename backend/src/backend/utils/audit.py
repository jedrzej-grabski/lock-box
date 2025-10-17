# src/backend/utils/audit.py
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from src.backend.models import AuditLog


async def log_audit(
    db: AsyncSession,
    user_id: str | None,
    action: str,
    object_type: str | None = None,
    object_id: str | None = None,
    *,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    Unified audit logger.
    If FastAPI `request` is provided, extracts IP and user-agent automatically.
    """
    if request is not None:
        if ip_address is None and getattr(request, "client", None):
            ip_address = request.client.host
        if user_agent is None:
            user_agent = request.headers.get("user-agent")

    log = AuditLog(
        user_id=user_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(log)
