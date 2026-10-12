from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Document, NoteSource, ResearchNote, User
from ..schemas import NoteCreate, NoteDetail, NoteOut, NoteSourceOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _counts(db: Session, note: ResearchNote) -> int:
    return db.scalar(select(func.count(NoteSource.id)).where(NoteSource.note_id == note.id)) or 0


@router.get("", response_model=list[NoteOut])
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(ResearchNote).where(ResearchNote.owner_id == user.id).order_by(ResearchNote.pinned.desc(), ResearchNote.updated_at.desc())
    ).scalars().all()
    out = []
    for n in rows:
        item = NoteOut.model_validate(n)
        item.source_count = _counts(db, n)
        out.append(item)
    return out


@router.post("", response_model=NoteOut, status_code=201)
def create_note(payload: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = ResearchNote(
        owner_id=user.id, title=payload.title.strip() or "Untitled note", body=payload.body,
        color=payload.color, pinned=payload.pinned,
    )
    db.add(note)
    db.flush()
    for chunk_id in payload.source_ids:
        from ..models import DocumentChunk

        chunk = db.get(DocumentChunk, chunk_id)
        if chunk is None:
            continue
        doc = db.get(Document, chunk.document_id)
        if doc is None or doc.owner_id != user.id:
            continue
        db.add(
            NoteSource(
                note_id=note.id,
                document_id=doc.id,
                chunk_id=chunk.id,
                page=chunk.page,
                excerpt=chunk.content[:420],
            )
        )
    db.commit()
    db.refresh(note)
    out = NoteOut.model_validate(note)
    out.source_count = _counts(db, note)
    return out


@router.get("/{note_id}", response_model=NoteDetail)
def get_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(ResearchNote).where(ResearchNote.id == note_id, ResearchNote.owner_id == user.id))
    if note is None:
        raise HTTPException(404, "Note not found")
    srcs = db.execute(select(NoteSource).where(NoteSource.note_id == note.id)).scalars().all()
    out = NoteDetail.model_validate(note)
    out.source_count = len(srcs)
    out.sources = []
    for s in srcs:
        doc = db.get(Document, s.document_id)
        out.sources.append(
            NoteSourceOut(
                document_id=s.document_id,
                document_title=doc.title if doc else "",
                chunk_id=s.chunk_id,
                page=s.page,
                excerpt=s.excerpt,
            )
        )
    return out


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(ResearchNote).where(ResearchNote.id == note_id, ResearchNote.owner_id == user.id))
    if note is None:
        raise HTTPException(404, "Note not found")
    if payload.title is not None:
        note.title = payload.title
    if payload.body is not None:
        note.body = payload.body
    if payload.color is not None:
        note.color = payload.color
    if payload.pinned is not None:
        note.pinned = payload.pinned
    db.commit()
    db.refresh(note)
    out = NoteOut.model_validate(note)
    out.source_count = _counts(db, note)
    return out


@router.delete("/{note_id}")
def delete_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(ResearchNote).where(ResearchNote.id == note_id, ResearchNote.owner_id == user.id))
    if note is None:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}