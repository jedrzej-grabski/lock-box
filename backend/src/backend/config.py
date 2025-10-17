from pathlib import Path
from typing import final
from pydantic_settings import BaseSettings


@final
class Settings(BaseSettings):
    ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    API_PREFIX: str = "/api/v1"
    FRONTEND_BASE: str = "https://<placeholder>"

    DATABASE_URL: str = ""
    JWT_PRIVATE_KEY_PATH: str = ""
    JWT_PUBLIC_KEY_PATH: str = ""
    ACCESS_TOKEN_EXPIRES_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRES_DAYS: int = 7
    JWT_ALGORITHM: str = "RS256"
    JWT_ISSUER: str = "lockbox"

    INVITE_TOKEN_HMAC_SECRET: str = "change-me-please"

    S3_BUCKET: str = ""
    S3_REGION: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_ENDPOINT_URL: str | None = None

    PASSWORD_HASHING_SCHEME: str = "argon2"

    EMAIL_FROM: str = "no-reply@lockbox.com"
    EMAIL_VERIFICATION_EXPIRY_HOURS: int = 48

    class Config:
        env_file = str(Path(__file__).resolve().parent.parent.parent.parent / ".env")


settings = Settings()
