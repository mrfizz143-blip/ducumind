import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Citation, Conversation, Document, DocumentChunk, Message, User
from ..schemas import ChatRequest, ConversationOut, MessageOut
from ..services import rag

router = APIRouter(tags=["conversations"])


def _chunk_title(db: Session, chunk_id: int) -> str:
    row = db.get(DocumentChunk, chunk_id)
    if row is None:
        return "Unknown"
    doc = db.get(Document, row.document_id)
    return doc.title if doc else "Unknown"


def _build_citations(db: Session, user: User, used_chunk_ids: list[int], numbers: list[int]):
    citations = []

    for n, cid in zip(numbers, used_chunk_ids):
        chunk = db.get(DocumentChunk, cid)
        if chunk is None:
            continue
        doc = db.get(Document, chunk.document_id)
        if doc is None or doc.owner_id != user.id:
            continue
        citations.append(
            {
                "number": n,
                "chunk_id": cid,
                "document_id": doc.id,
                "document_title": doc.title,
                "file_type": doc.file_type,
                "page": chunk.page,
                "timestamp": chunk.timestamp,
                "excerpt": chunk.content[:420],
                "relevance": round(float(chunk.score_cache or 0), 3),
            }
        )
    return citations


class RenameRequest(BaseModel):
    title: str | None = None
    context_document_ids: list[int] | None = None


@router.get("/api/conversations", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Conversation).where(Conversation.owner_id == user.id).order_by(Conversation.updated_at.desc()).limit(100)
    ).scalars().all()
    return rows


@router.post("/api/conversations", response_model=ConversationOut)
def create_conversation(
    payload: RenameRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = Conversation(
        owner_id=user.id,
        title=(payload.title if payload and payload.title else "New conversation"),
        context_document_ids=json.dumps(payload.context_document_ids if payload and payload.context_document_ids else []),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/api/conversations/{conv_id}")
def get_conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.scalar(select(Conversation).where(Conversation.id == conv_id, Conversation.owner_id == user.id))
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    messages = db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.id)
    ).scalars().all()
    return {
        "conversation": ConversationOut.model_validate(conv),
        "messages": [MessageOut.model_validate(m) for m in messages],
    }


@router.patch("/api/conversations/{conv_id}", response_model=ConversationOut)
def update_conversation(
    conv_id: int,
    payload: RenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = db.scalar(select(Conversation).where(Conversation.id == conv_id, Conversation.owner_id == user.id))
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    if payload.title is not None:
        conv.title = payload.title
    if payload.context_document_ids is not None:
        conv.context_document_ids = json.dumps(payload.context_document_ids)
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/api/conversations/{conv_id}")
def delete_conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.scalar(select(Conversation).where(Conversation.id == conv_id, Conversation.owner_id == user.id))
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()
    return {"status": "deleted"}


def _resolve_context(user: User, db: Session, request: ChatRequest) -> list[int]:
    doc_ids = request.document_ids
    if not doc_ids and request.conversation_id:
        conv = db.scalar(select(Conversation).where(Conversation.id == request.conversation_id, Conversation.owner_id == user.id))
        if conv and conv.context_document_ids:
            try:
                doc_ids = json.loads(conv.context_document_ids)
            except Exception:
                doc_ids = []
    if doc_ids:
        owned = db.execute(
            select(Document.id).where(Document.id.in_(doc_ids), Document.owner_id == user.id)
        ).scalars().all()
        doc_ids = list(owned)
    return doc_ids


def _prepare(user: User, db: Session, request: ChatRequest):
    conv = None
    if request.conversation_id:
        conv = db.scalar(select(Conversation).where(Conversation.id == request.conversation_id, Conversation.owner_id == user.id))
    if conv is None:
        conv = Conversation(owner_id=user.id, title="New conversation")
        db.add(conv)
        db.flush()
    doc_ids = _resolve_context(user, db, request)
    hits = rag.retrieve(
        db,
        user.id,
        request.message,
        document_ids=doc_ids or None,
        top_k=request.top_k,
        threshold=request.threshold,
    )
    return conv, hits


def _history(db: Session, conv_id: int) -> list[dict]:
    msgs = db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.id.desc()).limit(8)
    ).scalars().all()
    msgs.reverse()
    return [{"role": m.role, "content": m.content} for m in msgs]


@router.post("/api/chat")
def chat(request: ChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..services.llm import get_llm

    conv, hits = _prepare(user, db, request)
    llm = get_llm()
    result = llm.generate(request.message, hits, history=_history(db, conv.id))

    for h in hits:
        h["chunk"] = db.get(DocumentChunk, h["chunk_id"])
        if h["chunk"]:
            h["chunk"].score_cache = h["score"]

    citations = _build_citations(db, user, result.used_chunk_ids, result.citation_numbers)

    user_msg = Message(conversation_id=conv.id, role="user", content=request.message)
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=result.text,
        citations_json=json.dumps(citations),
        sources_json=json.dumps([{k: v for k, v in h.items() if k != "chunk"} for h in hits]),
    )
    db.add_all([user_msg, assistant_msg])
    if conv.title == "New conversation":
        conv.title = request.message[:60]
    db.commit()
    db.refresh(assistant_msg)
    return {
        "message": MessageOut.model_validate(assistant_msg),
        "sources": [h for h in hits],
        "citations": citations,
        "insufficient": result.insufficient,
    }


@router.post("/api/chat/stream")
def chat_stream(request: ChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..services.llm import get_llm

    conv, hits = _prepare(user, db, request)
    llm = get_llm()
    history = _history(db, conv.id)

    def event_stream():
        try:
            gen = llm.stream(request.message, hits, history=history)
            for delta in gen:
                if delta:
                    yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"

            result = llm.generate(request.message, hits, history=history)
            full = result.text

            citations = _build_citations(db, user, result.used_chunk_ids, result.citation_numbers)
            user_msg = Message(conversation_id=conv.id, role="user", content=request.message)
            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=full,
                citations_json=json.dumps(citations),
                sources_json=json.dumps([{k: v for k, v in h.items() if k != "chunk"} for h in hits]),
            )
            db.add_all([user_msg, assistant_msg])
            if conv.title == "New conversation":
                conv.title = request.message[:60]
            db.commit()
            db.refresh(assistant_msg)
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv.id, 'message': MessageOut.model_validate(assistant_msg).model_dump(mode='json'), 'citations': citations, 'sources': [h for h in hits]})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")