from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import secrets

from src.backend.db import get_db
from src.backend.models import Invite, DataRoom, Share
from src.backend.utils.dependencies import get_current_user
from src.backend.utils.audit import log_audit
from src.backend.config import settings

router = APIRouter(prefix="/invites", tags=["invites"])


def _hash_token(raw_token: str, secret: str) -> str:
    # HMAC-SHA256 hex digest
    mac = hmac.new(secret.encode(), raw_token.encode(), hashlib.sha256)
    return mac.hexdigest()


class InviteCreateRequest(BaseModel):
    data_room_id: str
    allowed_email: EmailStr | None = None
    max_uses: int | None = None  # None = unlimited
    expires_hours: int | None = None  # None = no expiry
    single_use: bool = False


class InviteListItem(BaseModel):
    id: str
    allowed_email: str | None
    max_uses: int | None
    uses_count: int
    expires_at: datetime | None
    revoked: bool


class InviteCreateResponse(BaseModel):
    invite_id: str
    raw_token: str
    invite_link_path: str


@router.get("/room/{room_id}", response_model=list[InviteListItem])
async def list_invites_for_room(
    room_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    # verify owner or superuser
    qroom = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = qroom.scalars().first()

    if not room:
        raise HTTPException(status_code=404, detail="Data room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(status_code=403, detail="Only owner can list invites")

    res = await db.execute(select(Invite).where(Invite.data_room_id == room_id))
    invites = res.scalars().all()

    return [
        InviteListItem(
            id=str(i.id),
            allowed_email=i.allowed_email,
            max_uses=i.max_uses,
            uses_count=i.uses_count,
            expires_at=i.expires_at,
            revoked=bool(i.revoked),
        )
        for i in invites
    ]


@router.post("/", response_model=InviteCreateResponse)
async def create_invite(
    req: InviteCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    # verify room and ownership
    q = await db.execute(select(DataRoom).where(DataRoom.id == req.data_room_id))
    room = q.scalars().first()

    if not room:
        raise HTTPException(status_code=404, detail="Data room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(
            status_code=403, detail="Only room owner can create invites"
        )

    # generate raw token and store hash
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token, settings.INVITE_TOKEN_HMAC_SECRET)

    expires_at = None
    if req.expires_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=req.expires_hours)

    max_uses = req.max_uses
    if req.single_use:
        max_uses = 1

    invite = Invite(
        data_room_id=req.data_room_id,
        token_hash=token_hash,
        created_by=user.id,
        allowed_email=req.allowed_email,
        max_uses=max_uses,
        uses_count=0,
        expires_at=expires_at,
        revoked=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(invite)
    await db.flush()
    await log_audit(
        db,
        str(user.id),
        "create_invite",
        "invite",
        str(invite.id),
        details={"data_room_id": req.data_room_id, "max_uses": max_uses},
        request=request,
    )
    await db.commit()

    invite_link_path = f"/invites/accept?token={raw_token}"
    return InviteCreateResponse(
        invite_id=str(invite.id), raw_token=raw_token, invite_link_path=invite_link_path
    )


@router.post("/accept")
async def accept_invite(
    request: Request,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Accept an invite using the raw token (user must be authenticated).
    Validations:
      - invite exists (by token hash), not revoked, not expired
      - allowed_email if present must match user.email
      - max_uses if present must not be exceeded
    On success: create Share(user_id, data_room_id, role='guest', invite_id=invite.id), increment uses_count, audit.
    """
    token_hash = _hash_token(token, settings.INVITE_TOKEN_HMAC_SECRET)
    q = await db.execute(select(Invite).where(Invite.token_hash == token_hash))
    invite = q.scalars().first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or invalid")

    if invite.revoked:
        raise HTTPException(status_code=403, detail="Invite revoked")

    if invite.expires_at and invite.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Invite expired")

    if invite.allowed_email and invite.allowed_email.lower() != user.email.lower():
        raise HTTPException(
            status_code=403, detail="Invite restricted to a different email"
        )

    if invite.max_uses is not None and (invite.uses_count or 0) >= invite.max_uses:
        raise HTTPException(status_code=403, detail="Invite max uses exceeded")

    # create share if not already present
    existing_q = await db.execute(
        select(Share).where(
            Share.data_room_id == invite.data_room_id, Share.user_id == user.id
        )
    )
    existing_share = existing_q.scalars().first()
    if existing_share:
        # if previously revoked, return error; otherwise just return OK
        if existing_share.revoked:
            raise HTTPException(
                status_code=403, detail="Your access was revoked for this room"
            )
        # else already a member
        return {"detail": "Already member of the room"}

    new_share = Share(
        data_room_id=invite.data_room_id,
        user_id=user.id,
        invite_id=invite.id,
        role="guest",
        expires_at=None,
        revoked=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_share)

    invite.uses_count = (invite.uses_count or 0) + 1

    await log_audit(
        db,
        str(user.id),
        "accept_invite",
        "invite",
        str(invite.id),
        details={"data_room_id": str(invite.data_room_id)},
        request=request,
    )
    await db.commit()
    return {"detail": "Invite accepted", "data_room_id": str(invite.data_room_id)}


@router.post("/{invite_id}/revoke")
async def revoke_invite(
    invite_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Revoke invite. Only room owner or superuser may revoke.
    """
    q = await db.execute(select(Invite).where(Invite.id == invite_id))
    invite = q.scalars().first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    # check ownership of room
    qroom = await db.execute(select(DataRoom).where(DataRoom.id == invite.data_room_id))
    room = qroom.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Data room for invite not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(
            status_code=403, detail="Only room owner or superuser can revoke invite"
        )

    invite.revoked = True
    await log_audit(
        db,
        str(user.id),
        "revoke_invite",
        "invite",
        str(invite.id),
        details={"data_room_id": str(invite.data_room_id)},
        request=request,
    )
    await db.commit()
    return {"detail": "Invite revoked"}
