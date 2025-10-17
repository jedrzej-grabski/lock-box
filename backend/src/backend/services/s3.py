from typing import Any
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
import logging

# adjust path to your config/settings module
from src.backend.config import settings  # noqa: E402

logger = logging.getLogger(__name__)

_session = boto3.Session()

_s3_client = _session.client(
    "s3",
    region_name=settings.S3_REGION,
    aws_access_key_id=settings.S3_ACCESS_KEY_ID,
    aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    endpoint_url=settings.S3_ENDPOINT_URL,
    config=Config(signature_version="s3v4"),
)


def generate_presigned_put_url(
    bucket_name: str,
    key: str,
    expires_in: int = 300,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        url = _s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
        return {"url": url}
    except ClientError as e:
        logger.exception("Failed to generate presigned PUT url")
        raise


def generate_presigned_get_url(bucket_name: str, key: str, expires_in: int = 60) -> str:
    """Return a presigned GET URL for the object"""
    try:
        url = _s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError as e:
        logger.exception("Failed to generate presigned GET url")
        raise


def head_object(bucket_name: str, key: str) -> dict[str, Any]:
    """Return head_object metadata (raises ClientError if not found)"""
    resp = _s3_client.head_object(Bucket=bucket_name, Key=key)
    return resp


def delete_object(bucket_name: str, key: str) -> None:
    """Delete an object from S3 (raises ClientError if failure)"""
    _s3_client.delete_object(Bucket=bucket_name, Key=key)
