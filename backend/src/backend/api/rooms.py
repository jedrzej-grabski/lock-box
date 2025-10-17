from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from src.backend.api.access import user_is_room_owner
from src.backend.db import get_db
from src.backend.models import AuditLog, DataRoom, Document, Share, User
from src.backend.utils.dependencies import get_current_user
from src.backend.utils.audit import log_audit

router = APIRouter(prefix="/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    name: str
    description: str | None = None


class ShareListItem(BaseModel):
    id: str
    user_id: str
    user_full_name: str | None = None
    user_email: str | None = None
    role: str
    expires_at: datetime | None
    revoked: bool
    created_at: datetime


class RoomOut(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str | None
    created_at: datetime


@router.get("/", response_model=list[RoomOut])
async def list_rooms(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    """
    List rooms for current user:
      - superuser: all rooms
      - owner: rooms they own + rooms shared
      - guest: rooms shared with them
    """
    from src.backend.models import Share

    if getattr(user, "is_superuser", False):
        result = await db.execute(select(DataRoom))
        rooms = result.scalars().all()
    elif getattr(user, "role", None) == "owner":
        # owned rooms
        res1 = await db.execute(select(DataRoom).where(DataRoom.owner_id == user.id))
        owned = res1.scalars().all()
        # shared rooms
        res2 = await db.execute(
            select(DataRoom)
            .join(Share)
            .where(Share.user_id == user.id, Share.revoked == False)
        )
        shared = res2.scalars().all()
        # combine unique
        room_set = {r.id: r for r in list(set(list(owned) + list(shared)))}
        rooms = list(room_set.values())
    else:
        res = await db.execute(
            select(DataRoom)
            .join(Share)
            .where(Share.user_id == user.id, Share.revoked == False)
        )
        rooms = res.scalars().all()

    return [
        RoomOut(
            id=str(r.id),
            owner_id=str(r.owner_id),
            name=r.name,
            description=r.description,
            created_at=r.created_at,
        )
        for r in rooms
    ]


@router.post("/", response_model=RoomOut)
async def create_room(
    req: CreateRoomRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Create a data room. Only users with role 'owner' or superuser may create rooms.
    On creation, create a Share record granting the owner 'owner' role on the room.
    """
    if not (
        getattr(user, "is_superuser", False) or getattr(user, "role", None) == "owner"
    ):
        raise HTTPException(status_code=403, detail="Only owners may create rooms")

    room = DataRoom(
        owner_id=user.id,
        name=req.name,
        description=req.description,
        created_at=datetime.now(timezone.utc),
    )
    db.add(room)
    await db.flush()  # get room.id

    # create owner Share
    owner_share = Share(
        data_room_id=room.id,
        user_id=user.id,
        invite_id=None,
        role="owner",
        expires_at=None,
        revoked=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(owner_share)
    await log_audit(
        db,
        str(user.id),
        "create_room",
        "data_room",
        str(room.id),
        details={"name": req.name},
        request=request,
    )
    await db.commit()
    await db.refresh(room)

    return RoomOut(
        id=str(room.id),
        owner_id=str(room.owner_id),
        name=room.name,
        description=room.description,
        created_at=room.created_at,
    )


@router.post("/{room_id}/shares/{user_id}/revoke")
async def revoke_share(
    room_id: str,
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Owner can revoke a user's access to their room.
    """
    # verify room exists and owner
    q = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = q.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(status_code=403, detail="Only room owner can revoke access")

    # fetch share
    from src.backend.models import Share  # local import to avoid cycle

    q2 = await db.execute(
        select(Share).where(Share.data_room_id == room_id, Share.user_id == user_id)
    )
    share = q2.scalars().first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    share.revoked = True
    await log_audit(
        db,
        str(user.id),
        "revoke_access",
        "share",
        str(share.id),
        details={"revoked_user_id": user_id},
        request=request,
    )
    await db.commit()
    return {"detail": "Access revoked"}


@router.get("/{room_id}/shares", response_model=list[ShareListItem])
async def list_shares(
    room_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    # only owner or superuser
    qroom = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = qroom.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Data room not found")
    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(status_code=403, detail="Only owner can list shares")
    from src.backend.models import Share

    res = await db.execute(
        select(Share)
        .options(selectinload(Share.user))
        .where(Share.data_room_id == room_id)
    )
    shares = res.scalars().all()
    return [
        ShareListItem(
            id=str(s.id),
            user_id=str(s.user_id),
            user_full_name=s.user.full_name,
            user_email=s.user.email,
            role=s.role,
            expires_at=s.expires_at,
            revoked=bool(s.revoked),
            created_at=s.created_at,
        )
        for s in shares
    ]


@router.delete("/{room_id}")
async def delete_data_room(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes a data room (owner or superuser only).
    Also logs an audit entry.
    """
    result = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not (current_user.is_superuser or room.owner_id == current_user.id):
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this room"
        )

    await db.delete(room)
    await db.commit()

    await log_audit(
        db=db,
        user_id=str(current_user.id),
        action="delete_room",
        object_type="data_room",
        object_id=str(room_id),
        details={"name": room.name},
    )

    return {"detail": "Data room deleted successfully"}


@router.get("/{room_id}/downloads")
async def list_room_downloads(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all download_document audit entries for the given room.
    Includes user email, full name, file info, and timestamp.
    """

    # Verify access
    if not (
        current_user.is_superuser
        or await user_is_room_owner(db, current_user.id, room_id)
    ):
        raise HTTPException(status_code=403, detail="Not authorized to view downloads")

    # Fetch all relevant downloads
    result = await db.execute(
        select(AuditLog, User, Document)
        .join(User, AuditLog.user_id == User.id)
        .join(Document, AuditLog.object_id == Document.id)
        .where(
            and_(
                AuditLog.action == "download_document", Document.data_room_id == room_id
            )
        )
        .order_by(AuditLog.created_at.desc())
    )
    rows = result.all()

    downloads = []
    for log, user, doc in rows:
        downloads.append(
            {
                "timestamp": log.created_at,
                "user_id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "document_id": str(doc.id),
                "filename": doc.filename,
            }
        )

    return downloads
