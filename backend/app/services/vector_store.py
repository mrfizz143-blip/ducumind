from __future__ import annotations

import json
import struct
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CollectionDocument, Document, DocumentChunk
from .chunking import Chunk
from .embeddings import cosine_similarity


class VectorStore:
    """Interface for the vector index. Swappable between pgvector and local numpy."""

    def index(self, db: Session, document_id: int, chunks: list[Chunk], vectors: list[list[float]]) -> int:
        raise NotImplementedError

    def search(
        self,
        db: Session,
        query_vector: list[float],
        user_id: int,
        top_k: int = 6,
        document_ids: list[int] | None = None,
        collection_id: int | None = None,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    def delete(self, db: Session, document_id: int) -> None:
        raise NotImplementedError


def _pack_vector(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *[float(v) for v in vec])


def _unpack_vector(blob: bytes) -> list[float]:
    return list(struct.unpack(f"{len(blob) // 4}f", blob))


def _apply_collection_filter(stmt, collection_id: int | None):
    if collection_id:
        stmt = stmt.join(CollectionDocument, CollectionDocument.document_id == Document.id).where(
            CollectionDocument.collection_id == collection_id
        )
    return stmt


class LocalVectorStore(VectorStore):
    """Brute-force numpy store. Real vectors, real cosine similarity."""

    name = "local"

    def index(self, db: Session, document_id: int, chunks: list[Chunk], vectors: list[list[float]]) -> int:
        count = 0
        for chunk, vec in zip(chunks, vectors):
            chunk_row = db.scalar(
                select(DocumentChunk).where(
                    DocumentChunk.document_id == document_id,
                    DocumentChunk.chunk_index == chunk.chunk_index,
                )
            )
            if chunk_row is None:
                continue
            chunk_row.embedding = _pack_vector(vec)
            count += 1
        db.commit()
        return count

    def search(
        self,
        db: Session,
        query_vector: list[float],
        user_id: int,
        top_k: int = 6,
        document_ids: list[int] | None = None,
        collection_id: int | None = None,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(Document.owner_id == user_id, Document.status == "ready", DocumentChunk.embedding.isnot(None))
        )
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
        stmt = _apply_collection_filter(stmt, collection_id)
        rows = db.execute(stmt).scalars().all()

        results: list[dict[str, Any]] = []
        for row in rows:
            score = cosine_similarity(query_vector, _unpack_vector(row.embedding))
            if score >= min_score:
                results.append(
                    {
                        "chunk_id": row.id,
                        "document_id": row.document_id,
                        "page": row.page,
                        "timestamp": row.timestamp,
                        "section": row.section,
                        "content": row.content,
                        "keywords": row.keywords,
                        "score": round(float(score), 4),
                        "chunk_index": row.chunk_index,
                    }
                )
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:top_k]

    def delete(self, db: Session, document_id: int) -> None:
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        db.commit()


class PgVectorStore(VectorStore):
    """pgvector-backed store for PostgreSQL."""

    name = "pgvector"

    def index(self, db: Session, document_id: int, chunks: list[Chunk], vectors: list[list[float]]) -> int:
        from pgvector.sqlalchemy import Vector

        from ..models import Embedding

        count = 0
        for chunk, vec in zip(chunks, vectors):
            chunk_row = db.scalar(
                select(DocumentChunk).where(
                    DocumentChunk.document_id == document_id,
                    DocumentChunk.chunk_index == chunk.chunk_index,
                )
            )
            if chunk_row is None:
                continue
            existing = db.scalar(select(Embedding).where(Embedding.chunk_id == chunk_row.id))
            if existing is None:
                db.add(Embedding(chunk_id=chunk_row.id, document_id=document_id, vector=vec))
            else:
                existing.vector = vec
            chunk_row.embedding = _pack_vector(vec)
            count += 1
        db.commit()
        return count

    def search(
        self,
        db: Session,
        query_vector: list[float],
        user_id: int,
        top_k: int = 6,
        document_ids: list[int] | None = None,
        collection_id: int | None = None,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        from ..models import Embedding

        stmt = (
            select(Embedding, DocumentChunk, Document)
            .join(DocumentChunk, DocumentChunk.id == Embedding.chunk_id)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(Document.owner_id == user_id, Document.status == "ready")
            .order_by(Embedding.vector.cosine_distance(query_vector).asc())
            .limit(top_k * 4)
        )
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
        stmt = _apply_collection_filter(stmt, collection_id)
        rows = db.execute(stmt).all()
        results = []
        for emb, chunk, doc in rows:
            score = cosine_similarity(query_vector, emb.vector)
            if score >= min_score:
                results.append(
                    {
                        "chunk_id": chunk.id,
                        "document_id": chunk.document_id,
                        "page": chunk.page,
                        "timestamp": chunk.timestamp,
                        "section": chunk.section,
                        "content": chunk.content,
                        "keywords": chunk.keywords,
                        "score": round(float(score), 4),
                        "chunk_index": chunk.chunk_index,
                    }
                )
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:top_k]

    def delete(self, db: Session, document_id: int) -> None:
        from ..models import Embedding

        db.execute(delete(Embedding).where(Embedding.document_id == document_id))
        db.commit()


def get_vector_store() -> VectorStore:
    if settings.is_postgres:
        return PgVectorStore()
    return LocalVectorStore()


def keyword_overlap(query_tokens: set[str], chunk_keywords: str) -> float:
    """Jaccard-style overlap between query tokens and a chunk's keyword JSON."""
    if not chunk_keywords:
        return 0.0
    try:
        words = set(json.loads(chunk_keywords))
    except Exception:
        words = {w for w in chunk_keywords.split(",") if w}
    if not words:
        return 0.0
    union = query_tokens | words
    if not union:
        return 0.0
    return len(query_tokens & words) / len(union)