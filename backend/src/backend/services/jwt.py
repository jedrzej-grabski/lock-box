# src/backend/services/jwt.py
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError, ExpiredSignatureError
from fastapi import HTTPException, status
from src.backend.config import settings
import uuid

ALGORITHM = settings.JWT_ALGORITHM


def _load_private_key() -> str:
    """Load RSA private key."""
    with open(settings.JWT_PRIVATE_KEY_PATH, "r") as f:
        return f.read()


def _load_public_key() -> str:
    """Load RSA public key."""
    with open(settings.JWT_PUBLIC_KEY_PATH, "r") as f:
        return f.read()


# -------------------------------
#   Token Creation
# -------------------------------


def create_access_token(user_id: str) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRES_MINUTES)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": settings.JWT_ISSUER,
    }
    token = jwt.encode(payload, _load_private_key(), algorithm=ALGORITHM)
    return token, int((expires_at - now).total_seconds())


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRES_DAYS)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": settings.JWT_ISSUER,
    }
    token = jwt.encode(payload, _load_private_key(), algorithm=ALGORITHM)
    return token, jti, expires_at


# -------------------------------
#   Token Verification
# -------------------------------


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            _load_public_key(),
            algorithms=[ALGORITHM],
            issuer=settings.JWT_ISSUER,
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
