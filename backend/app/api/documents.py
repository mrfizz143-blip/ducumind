import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Document, User
from ..schemas import DocumentDetail, DocumentOut
from ..services import document_service
from ..services.processing_service import run_job_async

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", status_code=201)
async def upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = file.filename or "upload"
    content = await file.read()
    ok, reason = document_service.validate_upload(filename, len(content))
    if not ok:
        raise HTTPException(422, reason)
    doc, job = document_service.save_upload(db, user, filename, content, file.content_type or "")
    run_job_async(job.id)
    return {
        "document_id": doc.id,
        "job_id": job.id,
        "status": "queued",
        "filename": filename,
    }


@router.get("", response_model=list[DocumentOut])
def list_documents(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return document_service.list_documents(db, user, limit, offset)


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = document_service.get_document(db, user, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return DocumentDetail.model_validate(doc)


@router.delete("/{document_id}")
def delete_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not document_service.delete_document(db, user, document_id):
        raise HTTPException(404, "Document not found")
    return {"status": "deleted"}


@router.get("/{document_id}/highlights")
def highlight_map(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if document_service.get_document(db, user, document_id) is None:
        raise HTTPException(404, "Document not found")
    return document_service.document_highlight_map(db, user, document_id)


@router.get("/{document_id}/media/{asset:path}")
def serve_media(
    document_id: int,
    asset: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = document_service.get_document(db, user, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    base = Path(settings.MEDIA_DIR) / str(user.id) / str(doc.id)
    safe = Path(asset).name
    target = base / safe
    if not target.exists():
        raise HTTPException(404, "Asset not found")
    return FileResponse(str(target))


@router.get("/{document_id}/file")
def serve_original_file(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = document_service.get_document(db, user, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(404, "Stored file missing")
    return FileResponse(str(path), media_type=doc.mime_type or None, filename=doc.original_filename)


@router.get("/{document_id}/passages")
def document_passages(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if document_service.get_document(db, user, document_id) is None:
        raise HTTPException(404, "Document not found")
    rows = document_service.document_passages(db, user, document_id)
    return [
        {
            "chunk_id": r.id,
            "chunk_index": r.chunk_index,
            "content": r.content,
            "page": r.page,
            "timestamp": r.timestamp,
            "section": r.section,
            "block_type": r.keywords,
        }
        for r in rows
    ]