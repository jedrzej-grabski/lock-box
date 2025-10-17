from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import uuid4
from datetime import datetime, timezone


from src.backend.db import get_db
from src.backend.models import DataRoom, Document
from src.backend.services import s3 as s3svc
from src.backend.config import settings
from src.backend.utils.dependencies import (
    get_current_user,
)
from src.backend.utils.audit import log_audit
from botocore.exceptions import ClientError

router = APIRouter(prefix="/rooms/{room_id}/documents", tags=["documents"])


class PresignResponse(BaseModel):
    upload_url: str
    storage_key: str
    expires_in: int


class ConfirmUploadRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    storage_key: str
    sha256_hash: str | None = None


class DocumentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    uploaded_by: str


class DownloadResponse(BaseModel):
    download_url: str
    expires_in: int


@router.get("/", response_model=list[DocumentOut])
async def list_documents_in_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    List documents in a room (owner/guest/superuser).
    """
    # check access (reuse require_room_access)
    from src.backend.utils.dependencies import (
        require_room_access as require_room_access_fn,
    )

    await require_room_access_fn(room_id, user=user, db=db)

    q = await db.execute(
        select(Document)
        .where(Document.data_room_id == room_id)
        .order_by(Document.uploaded_at.desc())
    )
    docs = q.scalars().all()
    return [
        DocumentOut(
            id=str(d.id),
            filename=d.filename,
            content_type=d.content_type,
            size_bytes=d.size_bytes,
            uploaded_at=d.uploaded_at,
            uploaded_by=str(d.uploaded_by),
        )
        for d in docs
    ]


@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    room_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    # verify room exists and user is owner of room or superuser
    q = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = q.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(
            status_code=403, detail="Only room owner can initiate uploads"
        )

    # create storage key
    doc_uuid = uuid4()
    storage_key = f"rooms/{room_id}/documents/{doc_uuid}"
    expires = 300  # 5 minutes

    presigned = s3svc.generate_presigned_put_url(
        settings.S3_BUCKET, storage_key, expires_in=expires
    )

    await log_audit(
        db,
        str(user.id),
        "presign_upload",
        "data_room",
        room_id,
        details={"storage_key": storage_key},
        request=request,
    )
    await db.commit()

    return PresignResponse(
        upload_url=presigned["url"], storage_key=storage_key, expires_in=expires
    )


@router.post("/confirm", response_model=DocumentOut)
async def confirm_upload(
    room_id: str,
    payload: ConfirmUploadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    After client uploads to S3 using the presigned URL, the client calls this endpoint with metadata
    to create the Document DB record.
    Only room owner may create Document records.
    """
    # verify room exists
    q = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = q.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(
            status_code=403, detail="Only room owner can confirm uploads"
        )

    # validate the storage key corresponds to the expected room path
    if not payload.storage_key.startswith(f"rooms/{room_id}/documents/"):
        raise HTTPException(
            status_code=400, detail="storage_key does not belong to room"
        )

    # HEAD the S3 object to validate presence and size
    try:
        meta = s3svc.head_object(settings.S3_BUCKET, payload.storage_key)
    except ClientError:
        raise HTTPException(status_code=400, detail="Uploaded object not found in S3")

    s3_size = int(meta.get("ContentLength", 0))
    if s3_size != payload.size_bytes:
        raise HTTPException(
            status_code=400, detail="Size mismatch between client and S3"
        )

    new_doc = Document(
        data_room_id=room_id,
        uploaded_by=user.id,
        filename=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        sha256_hash=payload.sha256_hash,
        storage_key=payload.storage_key,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(new_doc)
    await db.commit()

    await db.flush()
    await log_audit(
        db,
        str(user.id),
        "upload_document",
        "document",
        str(new_doc.id),
        details={"filename": payload.filename},
        request=request,
    )
    await db.commit()
    await db.refresh(new_doc)

    return DocumentOut(
        id=str(new_doc.id),
        filename=new_doc.filename,
        content_type=new_doc.content_type,
        size_bytes=new_doc.size_bytes,
        uploaded_at=new_doc.uploaded_at,
        uploaded_by=str(new_doc.uploaded_by),
    )


@router.get("/{doc_id}/download", response_model=DownloadResponse)
async def get_download_url(
    room_id: str,
    request: Request,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Verify access and return presigned GET URL (1 minute TTL).
    Access rules: owner of room, guest with valid Share, or superuser.
    """
    # require_room_access will raise if user cannot access; we call it here to enforce rules
    from src.backend.utils.dependencies import (
        require_room_access as require_room_access_fn,
    )

    access = await require_room_access_fn(room_id, user=user, db=db)
    # Fetch document
    q = await db.execute(
        select(Document).where(Document.id == doc_id, Document.data_room_id == room_id)
    )
    doc = q.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    expires = 60  # 1 minute
    url = s3svc.generate_presigned_get_url(
        settings.S3_BUCKET, doc.storage_key, expires_in=expires
    )

    await log_audit(
        db,
        str(user.id),
        "download_document",
        "document",
        str(doc.id),
        details={"filename": doc.filename},
        request=request,
    )
    await db.commit()

    return DownloadResponse(download_url=url, expires_in=expires)


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    room_id: str,
    doc_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Delete a document: only room owner (or superuser) may delete.
    Removes DB record and attempts to delete object from S3.
    """
    # verify room exists and ownership
    q = await db.execute(select(DataRoom).where(DataRoom.id == room_id))
    room = q.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not (getattr(user, "is_superuser", False) or str(room.owner_id) == str(user.id)):
        raise HTTPException(
            status_code=403, detail="Only room owner can delete documents"
        )

    # fetch document
    q2 = await db.execute(
        select(Document).where(Document.id == doc_id, Document.data_room_id == room_id)
    )
    doc = q2.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        s3svc.delete_object(settings.S3_BUCKET, doc.storage_key)
    except Exception:
        print("Failed to delete object from S3")

    # delete DB record
    await db.delete(doc)
    await log_audit(
        db,
        str(user.id),
        "delete_document",
        "document",
        str(doc.id),
        details={"filename": doc.filename},
        request=request,
    )
    await db.commit()
    return
