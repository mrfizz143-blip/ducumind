from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CollectionDocument, Document, DocumentChunk, ProcessingJob, User
from ..processors import get_processor
from .vector_store import get_vector_store


def validate_upload(filename: str, size_bytes: int) -> tuple[bool, str]:
    ext = Path(filename).suffix.lower().lstrip(".")
    if not ext:
        return False, "File has no extension"
    if ext not in settings.allowed_extensions:
        return False, f"Unsupported file type: .{ext}"
    if size_bytes <= 0:
        return False, "File is empty"
    if size_bytes > settings.upload_size_limit:
        return False, f"File exceeds the {settings.MAX_UPLOAD_MB} MB limit"
    return True, ""


def save_upload(
    db: Session,
    user: User,
    filename: str,
    content: bytes,
    mime_type: str = "",
) -> tuple[Document, ProcessingJob]:
    doc_dir = Path(settings.MEDIA_DIR) / str(user.id)
    doc_dir.mkdir(parents=True, exist_ok=True)

    from datetime import datetime, timezone

    token = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    safe = "".join(c if (c.isalnum() or c in "._-") else "_" for c in filename)
    stored_name = f"{token}_{safe}"
    stored_path = doc_dir / stored_name
    stored_path.write_bytes(content)

    ext = Path(filename).suffix.lower().lstrip(".")
    processor = get_processor(filename)
    mime = mime_type or f"application/{ext}"

    doc = Document(
        owner_id=user.id,
        title=Path(filename).stem,
        original_filename=filename,
        file_type=ext,
        mime_type=mime,
        size_bytes=len(content),
        storage_path=str(stored_path),
        status="uploading",
    )
    db.add(doc)
    db.flush()

    job = ProcessingJob(
        owner_id=user.id,
        document_id=doc.id,
        stage="queued",
        progress=0,
        detail="Queued",
        status="running",
    )
    db.add(job)
    db.commit()
    db.refresh(doc)
    db.refresh(job)
    return doc, job


def delete_document(db: Session, user: User, document_id: int) -> bool:
    doc = db.scalar(
        select(Document).where(Document.id == document_id, Document.owner_id == user.id)
    )
    if doc is None:
        return False
    try:
        path = Path(doc.storage_path)
        if path.exists():
            path.unlink()
    except Exception:
        pass
    store = get_vector_store()
    try:
        store.delete(db, document_id)
    except Exception:
        pass
    db.delete(doc)
    db.commit()
    return True


def get_document(db: Session, user: User, document_id: int) -> Document | None:
    return db.scalar(
        select(Document).where(Document.id == document_id, Document.owner_id == user.id)
    )


def list_documents(db: Session, user: User, limit: int = 100, offset: int = 0) -> list[Document]:
    return (
        db.execute(
            select(Document)
            .where(Document.owner_id == user.id)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )


def get_chunk_content(db: Session, chunk_id: int) -> DocumentChunk | None:
    return db.get(DocumentChunk, chunk_id)


def document_passages(db: Session, user: User, document_id: int) -> list[DocumentChunk]:
    return (
        db.execute(
            select(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(Document.id == document_id, Document.owner_id == user.id)
            .order_by(DocumentChunk.chunk_index)
        )
        .scalars()
        .all()
    )


def document_highlight_map(db: Session, user: User, document_id: int) -> dict:
    """Return chunk ranges with page/section for highlighting in the reader."""
    chunks = document_passages(db, user, document_id)
    return {
        "document_id": document_id,
        "passages": [
            {
                "chunk_id": c.id,
                "chunk_index": c.chunk_index,
                "start_char": c.start_char,
                "end_char": c.end_char,
                "page": c.page,
                "section": c.section,
                "timestamp": c.timestamp,
                "preview": c.content[:160],
            }
            for c in chunks
        ],
    }