from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Collection, Conversation, Document, Message, ProcessingJob, ResearchNote, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recent_docs = (
        db.execute(
            select(Document).where(Document.owner_id == user.id).order_by(Document.created_at.desc()).limit(6)
        )
        .scalars()
        .all()
    )
    active_collections = (
        db.execute(
            select(Collection, func.count())
            .where(Collection.owner_id == user.id)
            .group_by(Collection.id)
            .order_by(Collection.created_at.desc())
            .limit(4)
        )
        .all()
    )
    recent_questions = (
        db.execute(
            select(Message)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Conversation.owner_id == user.id, Message.role == "user")
            .order_by(Message.created_at.desc())
            .limit(6)
        )
        .scalars()
        .all()
    )
    saved_notes = (
        db.execute(
            select(ResearchNote).where(ResearchNote.owner_id == user.id).order_by(ResearchNote.updated_at.desc()).limit(6)
        )
        .scalars()
        .all()
    )
    processing = (
        db.execute(
            select(ProcessingJob)
            .join(Document, Document.id == ProcessingJob.document_id)
            .where(ProcessingJob.owner_id == user.id, ProcessingJob.status == "running")
            .order_by(ProcessingJob.created_at.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )
    stats = {
        "documents": db.scalar(select(func.count(Document.id)).where(Document.owner_id == user.id)) or 0,
        "collections": db.scalar(select(func.count(Collection.id)).where(Collection.owner_id == user.id)) or 0,
        "conversations": db.scalar(select(func.count(Conversation.id)).where(Conversation.owner_id == user.id)) or 0,
        "notes": db.scalar(select(func.count(ResearchNote.id)).where(ResearchNote.owner_id == user.id)) or 0,
    }
    return {
        "stats": stats,
        "recent_documents": [
            {
                "id": d.id,
                "title": d.title,
                "file_type": d.file_type,
                "status": d.status,
                "page_count": d.page_count,
                "duration_seconds": d.duration_seconds,
                "created_at": str(d.created_at),
            }
            for d in recent_docs
        ],
        "active_collections": [
            {"id": c.id, "name": c.name, "color": c.color, "document_count": cnt}
            for c, cnt in active_collections
        ],
        "recent_questions": [
            {"id": m.id, "conversation_id": m.conversation_id, "content": m.content, "created_at": str(m.created_at)}
            for m in recent_questions
        ],
        "saved_notes": [
            {"id": n.id, "title": n.title, "pinned": n.pinned, "updated_at": str(n.updated_at)} for n in saved_notes
        ],
        "processing": [
            {
                "job_id": j.id,
                "document_id": j.document_id,
                "filename": j.document.original_filename if j.document else "",
                "stage": j.stage,
                "progress": j.progress,
                "detail": j.detail,
            }
            for j in processing
        ],
    }