from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from uuid import UUID

from src.backend.utils.dependencies import get_current_user
from src.backend.db import get_db
from src.backend.models import User, RefreshToken
from src.backend.utils.audit import log_audit
from src.backend.utils.security import hash_password, verify_password
from src.backend.services.jwt import (
    create_access_token,
    create_refresh_token,
    verify_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------
# Schemas
# ------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    role: str  # 'owner' or 'guest'


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None = None
    role: str
    is_verified: bool
    is_active: bool
    is_superuser: bool
    created_at: datetime


# ------------------------
# Endpoints
# ------------------------


@router.post("/register", response_model=TokenResponse)
async def register(
    req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    if req.role not in ("owner", "guest"):
        raise HTTPException(status_code=400, detail="Invalid role")

    q = await db.execute(select(User).where(User.email == req.email.lower()))
    if q.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email.lower(),
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role=req.role,
        is_verified=True,
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    await db.flush()

    access_token, access_expires_in = create_access_token(str(user.id))
    refresh_token, jti, refresh_expires_at = create_refresh_token(str(user.id))

    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            issued_at=datetime.now(timezone.utc),
            expires_at=refresh_expires_at,
            revoked=False,
        )
    )

    await log_audit(
        db, str(user.id), "user_register", "user", str(user.id), request=request
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_in=access_expires_in,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    q = await db.execute(select(User).where(User.email == req.email.lower()))
    user = q.scalars().first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Email not verified")

    access_token, access_expires_in = create_access_token(str(user.id))
    refresh_token, jti, refresh_expires_at = create_refresh_token(str(user.id))

    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            issued_at=datetime.now(timezone.utc),
            expires_at=refresh_expires_at,
            revoked=False,
        )
    )

    await log_audit(
        db, str(user.id), "user_login", "user", str(user.id), request=request
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_in=access_expires_in,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    req: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    payload = verify_token(req.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    jti = payload.get("jti")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    q = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    old_rt = q.scalars().first()
    if not old_rt or old_rt.revoked:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # check expiry
    from datetime import datetime as dt, timezone as _tz

    if old_rt.expires_at and old_rt.expires_at <= dt.now(_tz.utc):
        old_rt.revoked = True
        await db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired")

    access_token, access_expires_in = create_access_token(user_id)
    new_refresh_token, new_jti, new_expires_at = create_refresh_token(user_id)

    new_rt = RefreshToken(
        user_id=user_id,
        jti=new_jti,
        issued_at=dt.now(_tz.utc),
        expires_at=new_expires_at,
        revoked=False,
    )
    db.add(new_rt)
    await db.flush()  # ensure new_rt.id is available

    old_rt.revoked = True
    old_rt.replaced_by = new_rt.id

    await log_audit(
        db,
        str(user_id),
        "refresh_token",
        "refresh_token",
        str(old_rt.id),
        request=request,
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        access_expires_in=access_expires_in,
    )


@router.post("/logout")
async def logout(
    req: LogoutRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    payload = verify_token(req.refresh_token)
    user_id = payload.get("sub")
    jti = payload.get("jti")

    q = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    rt = q.scalars().first()
    if rt:
        rt.revoked = True
        await log_audit(
            db, str(user_id), "logout", "refresh_token", str(rt.id), request=request
        )
        await db.commit()

    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
async def read_current_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns info about the currently authenticated user.
    Useful for the frontend to identify role, email, verification status, etc.
    """
    return current_user
