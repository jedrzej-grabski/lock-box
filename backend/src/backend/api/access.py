from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from src.backend.models import Share, DataRoom


async def user_is_room_owner(db: AsyncSession, user_id: UUID, room_id: UUID) -> bool:
    """
    Checks if the given user is the owner of a data room.
    """
    result = await db.execute(select(DataRoom.owner_id).where(DataRoom.id == room_id))
    owner_id = result.scalar_one_or_none()
    return owner_id == user_id


async def user_has_room_access(db: AsyncSession, user_id: UUID, room_id: UUID) -> bool:
    """
    Checks if a user has an active (non-revoked, non-expired) Share for a room.
    Superusers should be handled externally by the caller.
    """
    result = await db.execute(
        select(Share)
        .where(Share.data_room_id == room_id)
        .where(Share.user_id == user_id)
        .where(Share.revoked.is_(False))
    )
    share = result.scalar_one_or_none()
    return bool(share)
