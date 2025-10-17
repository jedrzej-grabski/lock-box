from passlib.context import CryptContext
from src.backend.config import settings

pwd_context = CryptContext(
    schemes=[settings.PASSWORD_HASHING_SCHEME], deprecated="auto"
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)
