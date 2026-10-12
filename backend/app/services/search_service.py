from __future__ import annotations

import json

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models import (
    CollectionDocument,
    Conversation,
    Document,
    DocumentChunk,
    Message,
    ResearchNote,
    User,
)
from .chunking import tokenize
from .rag import retrieve


def search_all(
    db: Session,
    user: User,
    query: str,
    semantic: bool = True,
    keyword: bool = True,
    file_types: list[str] | None = None,
    collection_id: int | None = None,
    document_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    q = query.strip()
    results: list[dict] = []
    total = 0

    if semantic or keyword:
        hits = retrieve(
            db,
            user.id,
            q,
            document_ids=[document_id] if document_id else None,
            collection_id=collection_id,
            top_k=limit,
            threshold=0.0,
            use_hybrid=(semantic and keyword),
            use_rerank=True,
        )
        if file_types:
            hits = [h for h in hits if h.get("file_type") in file_types]
        for h in hits:
            results.append(
                {
                    "kind": "passage",
                    "id": h["chunk_id"],
                    "document_id": h["document_id"],
                    "document_title": h.get("document_title", ""),
                    "file_type": h.get("file_type", ""),
                    "title": h.get("document_title", "Passage"),
                    "excerpt": h["content"],
                    "page": h.get("page", 0),
                    "timestamp": h.get("timestamp", 0),
                    "score": h.get("score", 0),
                }
            )

    # document title matches
    if keyword:
        toks = " ".join(tokenize(q))
        stmt = (
            select(Document)
            .where(Document.owner_id == user.id)
            .where(
                or_(
                    Document.title.ilike(f"%{q}%"),
                    Document.extracted_text.ilike(f"%{q}%"),
                )
            )
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
        if file_types:
            stmt = stmt.where(Document.file_type.in_(file_types))
        if document_id:
            stmt = stmt.where(Document.id == document_id)
        if collection_id:
            stmt = stmt.join(CollectionDocument).where(
                CollectionDocument.collection_id == collection_id
            )
        for doc in db.execute(stmt).scalars().all():
            results.append(
                {
                    "kind": "document",
                    "id": doc.id,
                    "document_id": doc.id,
                    "document_title": doc.title,
                    "file_type": doc.file_type,
                    "title": doc.title,
                    "excerpt": doc.extracted_text[:300],
                    "page": 0,
                    "timestamp": 0,
                    "score": 0,
                }
            )

    # notes
    note_stmt = (
        select(ResearchNote)
        .where(ResearchNote.owner_id == user.id)
        .where(or_(ResearchNote.title.ilike(f"%{q}%"), ResearchNote.body.ilike(f"%{q}%")))
        .order_by(ResearchNote.updated_at.desc())
        .limit(limit)
    )
    for note in db.execute(note_stmt).scalars().all():
        results.append(
            {
                "kind": "note",
                "id": note.id,
                "document_id": 0,
                "document_title": note.title,
                "file_type": "",
                "title": note.title,
                "excerpt": note.body[:300],
                "page": 0,
                "timestamp": 0,
                "score": 0,
            }
        )

    # conversations (message content)
    conv_stmt = (
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.owner_id == user.id, Message.content.ilike(f"%{q}%"))
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    for msg in db.execute(conv_stmt).scalars().all():
        results.append(
            {
                "kind": "conversation",
                "id": msg.conversation_id,
                "message_id": msg.id,
                "document_id": 0,
                "document_title": "Conversation",
                "file_type": "",
                "title": f"Message in conversation #{msg.conversation_id}",
                "excerpt": msg.content[:300],
                "page": 0,
                "timestamp": 0,
                "score": 0,
            }
        )

    total = len(results)
    results = results[offset : offset + limit]
    return {
        "query": q,
        "total": total,
        "results": results,
        "filters": {
            "file_types": file_types,
            "collection_id": collection_id,
            "document_id": document_id,
            "date_from": date_from,
            "date_to": date_to,
        },
    }