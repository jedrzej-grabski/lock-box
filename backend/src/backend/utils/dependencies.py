from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from src.backend.db import get_db
from src.backend.models import User, DataRoom, Share
from src.backend.services.jwt import verify_token

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Email not verified")

    return user


async def require_superuser(user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser access required")
    return user


async def require_room_access(
    room_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    require_role: Optional[str] = None,
):
    """
    Check if the current user can access a room.
      - Superuser → allow
      - Room owner → allow
      - Else must have active Share (not revoked, not expired)
      - If require_role provided → Share.role must match
    """
    if user.is_superuser:
        room = await db.get(DataRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Data room not found")
        return {"room": room, "share": None}

    room = await db.get(DataRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Data room not found")

    # Owner check
    if str(room.owner_id) == str(user.id):
        return {"room": room, "share": None}

    # Otherwise check share record
    q = await db.execute(
        select(Share).where(
            Share.user_id == user.id,
            Share.data_room_id == room_id,
            Share.revoked == False,
        )
    )
    share = q.scalars().first()
    if not share:
        raise HTTPException(status_code=403, detail="Access denied")

    # Expiry check
    if share.expires_at and share.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Share expired")

    # Role check
    if require_role and share.role != require_role:
        raise HTTPException(status_code=403, detail="Insufficient role")

    return {"room": room, "share": share}
