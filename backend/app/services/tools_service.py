from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Document, DocumentChunk, User
from .chunking import tokenize
from .llm import BaseLLM, _sentences, get_llm
from .rag import retrieve

KIND_PROMPTS = {
    "findings": (
        "Extract the key findings of this research. List each finding as a bullet with an inline "
        "[n] citation. Only include findings supported by the retrieved passages."
    ),
    "methodology": (
        "Describe the methodology described in these passages: design, sample, data collection, "
        "analysis. Cite [n] for each claim."
    ),
    "objectives": (
        "List the research objectives, aims or hypotheses stated in these passages, each with an "
        "inline [n] citation."
    ),
    "results": (
        "Summarize the results reported in these passages (numerical results, outcomes, statistics), "
        "each with an inline [n] citation."
    ),
}

_FINDING_WORDS = {"found", "findings", "showed", "revealed", "concludes", "concluded", "result", "significant", "evidence", "suggest", "suggests", "demonstrated", "observed"}
_METHOD_WORDS = {"method", "methodology", "participants", "sample", "procedure", "measure", "measured", "questionnaire", "interview", "design", "analyzed", "analysis", "collected", "data"}
_OBJECTIVE_WORDS = {"aim", "aims", "objective", "objectives", "goal", "goal", "purpose", "hypothesis", "research question", "intended", "seek", "seeks", "investigate", "examine"}
_RESULT_WORDS = {"result", "results", "outcome", "outcomes", "found", "mean", "median", "significant", "p-value", "increase", "decrease", "percentage", "correlation", "effect"}


def _passages_for_doc(db: Session, user: User, document_id: int) -> list[Document]:
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


def _chunk_dicts(rows: list[DocumentChunk], doc: Document) -> list[dict]:
    return [
        {
            "chunk_id": c.id,
            "document_id": c.document_id,
            "document_title": doc.title,
            "file_type": doc.file_type,
            "page": c.page,
            "timestamp": c.timestamp,
            "section": c.section,
            "content": c.content,
            "score": 1.0,
        }
        for c in rows
    ]


def _is_remote(llm: BaseLLM) -> bool:
    return llm.name in ("openai", "anthropic")


def _extractive_ranked(texts: list[str], kind: str, top: int = 6) -> list[str]:
    word_set = {
        "findings": _FINDING_WORDS,
        "methodology": _METHOD_WORDS,
        "objectives": _OBJECTIVE_WORDS,
        "results": _RESULT_WORDS,
    }.get(kind, set())
    scored = []
    for t in texts:
        toks = set(tokenize(t))
        score = len(toks & word_set) + 0.05 * len(toks)
        scored.append((score, t))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [t for _s, t in scored[:top] if _s > 0]


def summarize_document(db, user, document_id, length="medium") -> dict:
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.owner_id == user.id))
    if doc is None:
        raise ValueError("Document not found")
    rows = _passages_for_doc(db, user, document_id)
    chunks = _chunk_dicts(rows, doc)
    llm = get_llm()
    if _is_remote(llm) and rows:
        max_sentences = {"short": 3, "medium": 6, "detailed": 12}.get(length, 6)
        result = llm.generate(
            f"Summarize this document ({length} length, about {max_sentences} sentences). Use inline [n] citations.",
            chunks,
            system_prompt=(
                "You are a precise summarizer. Summarize the document in a neutral academic tone "
                "using only the retrieved passages. Add [n] citations to each key point. "
                "Do not invent information."
            ),
        )
        summary = result.text
    else:
        sentences = [s for c in rows for s in _sentences(c.content)]
        freq: dict[str, int] = {}
        for s in sentences:
            for t in set(tokenize(s)):
                freq[t] = freq.get(t, 0) + 1
        def _sent_score(s: str) -> float:
            toks = set(tokenize(s))
            if not toks:
                return 0
            return sum(freq.get(t, 0) for t in toks) / (len(toks) ** 1.2)
        ranked = sorted((( _sent_score(s), s) for s in sentences), reverse=True)
        limit = {"short": 3, "medium": 6, "detailed": 12}.get(length, 6)
        seen, picked = set(), []
        for score, s in ranked:
            if s.lower()[:40] in seen:
                continue
            seen.add(s.lower()[:40])
            picked.append(s)
            if len(picked) >= limit:
                break
        summary = " ".join(picked) if picked else doc.extracted_text[:600]
    return {"document_id": document_id, "summary": summary, "length": length}


def compare_documents(db, user, doc_a_id, doc_b_id) -> dict:
    doc_a = db.scalar(select(Document).where(Document.id == doc_a_id, Document.owner_id == user.id))
    doc_b = db.scalar(select(Document).where(Document.id == doc_b_id, Document.owner_id == user.id))
    if doc_a is None or doc_b is None:
        raise ValueError("One or both documents not found")

    toks_a = set(tokenize(doc_a.extracted_text))
    toks_b = set(tokenize(doc_b.extracted_text))

    def _clean(tokens: set[str]) -> set[str]:
        stop = {"the", "and", "of", "to", "in", "for", "with", "on", "a", "an", "is", "are",
                "was", "were", "be", "this", "that", "it", "as", "by", "at", "from", "or", "not",
                "their", "them", "they", "we", "you", "our", "may", "can", "study", "paper", "research"}
        return {t for t in tokens if len(t) > 3 and t not in stop}

    clean_a, clean_b = _clean(toks_a), _clean(toks_b)
    shared = clean_a & clean_b
    only_a = sorted(clean_a - clean_b, key=len, reverse=True)[:16]
    only_b = sorted(clean_b - clean_a, key=len, reverse=True)[:16]

    llm = get_llm()
    if _is_remote(llm):
        chunks = _chunk_dicts(_passages_for_doc(db, user, doc_a_id), doc_a) + _chunk_dicts(
            _passages_for_doc(db, user, doc_b_id), doc_b
        )
        result = llm.generate(
            f"Compare these two documents ({doc_a.title} and {doc_b.title}). "
            "List 3-5 similarities and 3-5 differences with [n] citations to the source passages.",
            chunks,
            system_prompt=(
                "You compare research documents. Produce a JSON-ish structured markdown comparison "
                "with 'Similarities' and 'Differences' sections and [n] citations."
            ),
        )
        narrative = result.text
    else:
        narrative = (
            f"Comparison of “{doc_a.title}” and “{doc_b.title}”.\n\n"
            f"Shared themes: {', '.join(sorted(shared)[:20]) or 'none detected'}.\n\n"
            f"Unique to “{doc_a.title}”: {', '.join(only_a) or 'none'}.\n"
            f"Unique to “{doc_b.title}”: {', '.join(only_b) or 'none'}."
        )

    return {
        "document_a": {"id": doc_a.id, "title": doc_a.title},
        "document_b": {"id": doc_b.id, "title": doc_b.title},
        "similarities": sorted(shared)[:24],
        "differences": {"a_only": only_a, "b_only": only_b},
        "narrative": narrative,
    }


def extract_kind(db, user, document_id, kind) -> dict:
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.owner_id == user.id))
    if doc is None:
        raise ValueError("Document not found")
    rows = _passages_for_doc(db, user, document_id)
    chunks = _chunk_dicts(rows, doc)
    llm = get_llm()
    if _is_remote(llm) and rows:
        result = llm.generate(KIND_PROMPTS.get(kind, "Extract the most relevant passages."), chunks)
        body = result.text
        numbers = result.citation_numbers
    else:
        texts = [c.content for c in rows]
        picked = _extractive_ranked(texts, kind, top=6)
        body = "\n\n".join(f"{t} [{'N/A'}]" for t in picked) if picked else (
            f"No passages clearly matching '{kind}' were found in this document."
        )
        numbers = []
    return {"document_id": document_id, "kind": kind, "content": body}


def find_similar(db, user, document_id, top_k=5) -> list[dict]:
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.owner_id == user.id))
    if doc is None:
        raise ValueError("Document not found")
    rows = _passages_for_doc(db, user, document_id)
    if not rows:
        return []
    probe = rows[0].content
    hits = retrieve(
        db, user.id, probe, top_k=top_k + 1, use_hybrid=True, use_rerank=True
    )
    # exclude the source document
    hits = [h for h in hits if h["document_id"] != document_id][:top_k]
    return hits


def explain_passage(db, user, chunk_id, document_id) -> dict:
    chunk = db.get(DocumentChunk, chunk_id)
    if chunk is None or chunk.document_id != document_id:
        raise ValueError("Passage not found")
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.owner_id == user.id))
    if doc is None:
        raise ValueError("Document not found")
    related = retrieve(
        db, user.id, chunk.content, document_ids=[document_id], top_k=4, use_hybrid=True, use_rerank=True
    )
    related = [r for r in related if r["chunk_id"] != chunk_id]
    llm = get_llm()
    if _is_remote(llm):
        context = [{"chunk_id": chunk.id, "document_id": doc.id, "document_title": doc.title,
                    "page": chunk.page, "timestamp": chunk.timestamp, "content": chunk.content,
                    "score": 1.0}]
        result = llm.generate(
            f"Explain the selected passage from '{doc.title}' in simple academic terms, "
            "relating it to the surrounding research context. Use [1] citations.",
            context,
            system_prompt="You are an academic explainer. Be clear, accurate and grounded.",
        )
        explanation = result.text
    else:
        explanation = (
            f"The selected passage states: “{chunk.content[:500]}”\n\n"
            "This passage belongs to the section “{section}”"
            + (f" (page {chunk.page})." if chunk.page else ".")
        ).format(section=chunk.section)
        if related:
            explanation += "\n\nRelated passages in the same document:\n" + "\n\n".join(
                f"• {r['content'][:220]}" for r in related
            )
    return {"chunk_id": chunk_id, "document_id": document_id, "explanation": explanation, "related": related}


def generate_references(db, user, document_ids) -> list[dict]:
    refs = []
    for did in document_ids:
        doc = db.scalar(select(Document).where(Document.id == did, Document.owner_id == user.id))
        if doc is None:
            continue
        year = ""
        try:
            meta = json.loads(doc.metadata_json or "{}")
            year = re.search(r"(19|20)\d{2}", str(meta.get("created", "")) or "") or re.search(r"(19|20)\d{2}", str(meta.get("modified", "")) or "")
            if year:
                year = year.group(0)
        except Exception:
            pass
        authors = doc.author or "Author Unknown"
        refs.append(
            {
                "document_id": doc.id,
                "citation": f"{authors}. “{doc.title}.” Marginalia Research Corpus, {year or 'n.d.'}.",
                "type": doc.file_type.upper(),
            }
        )
    return refs


def literature_review(db, user, document_ids, focus="") -> dict:
    docs = []
    chunks_all = []
    for did in document_ids:
        doc = db.scalar(select(Document).where(Document.id == did, Document.owner_id == user.id))
        if doc is None:
            continue
        docs.append(doc)
        chunks_all.extend(_chunk_dicts(_passages_for_doc(db, user, did), doc))
    if not docs:
        raise ValueError("No valid documents")

    llm = get_llm()
    if _is_remote(llm):
        query = f"Write a literature review synthesizing these documents" + (f" focusing on: {focus}." if focus else ".") + " Use [n] citations to sources."
        result = llm.generate(query, chunks_all, system_prompt=(
            "You are an academic literature-review writer. Synthesize across all provided sources. "
            "Structure: Introduction / Themes / Gaps / Conclusion. Cite [n]."
        ))
        review = result.text
    else:
        sections = []
        for doc in docs:
            summaries = summarize_document(db, user, doc.id, length="short")
            sections.append(f"### {doc.title}\n{summaries['summary']}")
        review = (
            f"# Literature Review" + (f" — {focus}" if focus else "") + "\n\n"
            + "\n\n".join(sections)
        )
    return {"review": review, "document_count": len(docs)}


def generate_research_notes(db, user, document_ids, prompt="") -> dict:
    docs = []
    chunks_all = []
    for did in document_ids:
        doc = db.scalar(select(Document).where(Document.id == did, Document.owner_id == user.id))
        if doc is None:
            continue
        docs.append(doc)
        chunks_all.extend(_chunk_dicts(_passages_for_doc(db, user, did), doc))
    if not docs:
        raise ValueError("No valid documents")

    llm = get_llm()
    instruction = prompt or "Produce concise structured research notes: key points, evidence, and open questions."
    if _is_remote(llm):
        result = llm.generate(instruction, chunks_all, system_prompt=(
            "You create structured research notes from sources. Use headings, bullets and [n] citations."
        ))
        notes = result.text
    else:
        lines = []
        for doc in docs:
            top = _extractive_ranked([c.content for c in _passages_for_doc(db, user, doc.id)], "findings", top=4)
            lines.append(f"## {doc.title}")
            for i, t in enumerate(top, 1):
                lines.append(f"- {t[:240]}")
        notes = "\n".join(lines) if lines else "No passages could be summarised into notes."
    return {"notes": notes, "document_count": len(docs)}