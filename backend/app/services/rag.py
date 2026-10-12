from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Document, DocumentChunk
from .chunking import tokenize
from .embeddings import embed_query
from .vector_store import get_vector_store, keyword_overlap


def _keyword_search(
    db: Session,
    user_id: int,
    query: str,
    document_ids: list[int] | None = None,
    collection_id: int | None = None,
) -> list[dict[str, Any]]:
    q_tokens = set(tokenize(query))
    if not q_tokens:
        return []
    stmt = (
        select(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.owner_id == user_id, Document.status == "ready")
    )
    if document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
    if collection_id:
        from ..models import CollectionDocument

        stmt = stmt.join(CollectionDocument, CollectionDocument.document_id == Document.id).where(
            CollectionDocument.collection_id == collection_id
        )
    rows = db.execute(stmt).all()
    results = []
    for chunk, doc in rows:
        text_tokens = set(tokenize(chunk.content))
        kw_score = keyword_overlap(q_tokens, chunk.keywords)
        text_score = len(q_tokens & text_tokens) / max(len(q_tokens), 1)
        combined = max(kw_score, text_score * 0.8)
        if combined > 0.0:
            results.append(
                {
                    "chunk_id": chunk.id,
                    "document_id": chunk.document_id,
                    "document_title": doc.title,
                    "file_type": doc.file_type,
                    "page": chunk.page,
                    "timestamp": chunk.timestamp,
                    "section": chunk.section,
                    "content": chunk.content,
                    "keywords": chunk.keywords,
                    "score": round(float(combined), 4),
                    "chunk_index": chunk.chunk_index,
                }
            )
    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def _merge_scores(
    vector_hits: list[dict[str, Any]],
    keyword_hits: list[dict[str, Any]],
    weight: float,
) -> list[dict[str, Any]]:
    kw_map = {h["chunk_id"]: h["score"] for h in keyword_hits}
    kw_max = max(kw_map.values()) if kw_map else 1.0
    vec_map = {h["chunk_id"]: h["score"] for h in vector_hits}
    vec_max = max(vec_map.values()) if vec_map else 1.0

    combined: dict[int, dict[str, Any]] = {}
    for h in vector_hits:
        row = dict(h)
        row["semantic_score"] = row["score"] / vec_max
        row["keyword_score"] = kw_map.get(h["chunk_id"], 0.0) / kw_max
        row["score"] = round(weight * row["semantic_score"] + (1 - weight) * row["keyword_score"], 4)
        combined[h["chunk_id"]] = row
    for h in keyword_hits:
        if h["chunk_id"] in combined:
            continue
        row = dict(h)
        row["semantic_score"] = 0.0
        row["keyword_score"] = h["score"] / kw_max
        row["score"] = round((1 - weight) * row["keyword_score"], 4)
        combined[h["chunk_id"]] = row
    return sorted(combined.values(), key=lambda r: r["score"], reverse=True)


def _dedupe(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[int, str], dict] = {}
    out = []
    for h in hits:
        norm = " ".join(h["content"].lower().split())
        prefix = norm[:120]
        key = (h["document_id"], prefix)
        if key in seen:
            continue
        dup = False
        for (_d, _p), prev in seen.items():
            if _d != h["document_id"]:
                continue
            prev_norm = " ".join(prev["content"].lower().split())
            if prev_norm and (_overlap(norm, prev_norm) > 0.85):
                dup = True
                break
        if not dup:
            seen[key] = h
            out.append(h)
    return out


def _overlap(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    la, lb = len(a), len(b)
    return min(la, lb) / max(la, lb)


def _rerank(hits: list[dict[str, Any]], query: str, top_k: int) -> list[dict[str, Any]]:
    """Optional cross-encoder rerank when sentence-transformers is installed;
    otherwise a query-term rerank (a real scoring function)."""
    q_tokens = set(tokenize(query))
    try:
        from sentence_transformers import CrossEncoder

        encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        pairs = [(query, h["content"][:500]) for h in hits]
        scores = encoder.predict(pairs)
        for h, s in zip(hits, scores):
            h["rerank_score"] = round(float(s), 4)
        hits = sorted(hits, key=lambda h: h["rerank_score"], reverse=True)
        return hits[:top_k]
    except Exception:
        pass

    def _term_boost(h: dict) -> float:
        text_tokens = set(tokenize(h["content"]))
        boost = len(q_tokens & text_tokens) / max(len(q_tokens), 1)
        return h["score"] * 0.6 + boost * 0.4

    for h in hits:
        h["rerank_score"] = round(_term_boost(h), 4)
    hits = sorted(hits, key=lambda h: h["rerank_score"], reverse=True)
    return hits[:top_k]


def retrieve(
    db: Session,
    user_id: int,
    query: str,
    document_ids: list[int] | None = None,
    collection_id: int | None = None,
    top_k: int = 6,
    threshold: float = 0.0,
    use_hybrid: bool = True,
    use_rerank: bool = True,
) -> list[dict[str, Any]]:
    effective_top_k = min(top_k, 20)
    vector_store = get_vector_store()
    query_vec = embed_query(query)

    vector_hits = vector_store.search(
        db,
        query_vec,
        user_id,
        top_k=effective_top_k * 3,
        document_ids=document_ids,
        collection_id=collection_id,
        min_score=threshold,
    )
    for h in vector_hits:
        h["semantic_score"] = h["score"]

    if use_hybrid:
        keyword_hits = _keyword_search(db, user_id, query, document_ids, collection_id)
        hits = _merge_scores(vector_hits, keyword_hits, settings.RAG_HYBRID_WEIGHT)
    else:
        hits = vector_hits

    hits = _dedupe(hits)

    # attach document metadata
    doc_ids = {h["document_id"] for h in hits}
    if doc_ids:
        docs = db.execute(select(Document).where(Document.id.in_(doc_ids))).scalars().all()
        doc_map = {d.id: d for d in docs}
        for h in hits:
            doc = doc_map.get(h["document_id"])
            h["document_title"] = doc.title if doc else "Unknown"
            h["file_type"] = doc.file_type if doc else ""
            h["author"] = doc.author if doc else ""
            h["page_count"] = doc.page_count if doc else 0

    if use_rerank and hits:
        hits = _rerank(hits, query, effective_top_k)

    hits.sort(key=lambda r: r["score"], reverse=True)
    if threshold > 0:
        hits = [h for h in hits if h.get("score", 0) >= threshold or h.get("semantic_score", 0) >= threshold]
    return hits[:effective_top_k]