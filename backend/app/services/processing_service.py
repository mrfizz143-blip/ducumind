from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Document, ProcessingJob
from ..processors import get_processor
from .chunking import Chunker
from .embeddings import embed_texts
from .vector_store import get_vector_store

STAGES = [
    ("uploading", 4, "Saving file"),
    ("extracting", 22, "Extracting content"),
    ("cleaning", 38, "Cleaning extracted text"),
    ("chunking", 55, "Chunking into passages"),
    ("embedding", 76, "Creating embeddings"),
    ("indexing", 92, "Indexing in vector store"),
    ("ready", 100, "Ready"),
]


def _clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _update_job(db: Session, job: ProcessingJob, stage: str, progress: int, detail: str = ""):
    job.stage = stage
    job.progress = progress
    job.detail = detail
    db.commit()


def process_document(db: Session, job: ProcessingJob) -> bool:
    """Run the full Upload → Extract → Clean → Chunk → Embed → Store pipeline."""
    from ..database import SessionLocal

    doc = db.get(Document, job.document_id)
    if doc is None:
        job.status = "failed"
        job.error = "Document record missing"
        db.commit()
        return False

    def _fail(message: str) -> bool:
        doc.status = "failed"
        doc.error_message = message
        job.status = "failed"
        job.error = message
        job.stage = "failed"
        job.progress = 0
        db.commit()
        return False

    try:
        _update_job(db, job, *STAGES[0])
        file_path = Path(doc.storage_path)
        if not file_path.exists():
            return _fail(f"Stored file not found: {doc.storage_path}")

        _update_job(db, job, *STAGES[1])
        processor = get_processor(doc.original_filename)
        if processor is None:
            return _fail("Unsupported file type")
        media_dir = Path(settings.MEDIA_DIR) / str(doc.owner_id) / str(doc.id)
        media_dir.mkdir(parents=True, exist_ok=True)
        try:
            extraction = processor.process(file_path, doc.original_filename, media_dir)
        except Exception as exc:
            return _fail(f"Extraction failed: {exc}")

        _update_job(db, job, *STAGES[2])
        full_text = _clean_text(extraction.join_blocks())
        if not full_text:
            return _fail("No extractable content found in this file")

        doc.title = extraction.title or doc.title
        doc.author = extraction.author or doc.author
        doc.page_count = extraction.page_count
        doc.duration_seconds = extraction.duration_seconds
        doc.extracted_text = full_text
        doc.metadata_json = json.dumps(extraction.metadata, default=str)
        doc.toc_json = json.dumps(extraction.toc)
        doc.media_path = json.dumps(extraction.media_assets) if extraction.media_assets else ""
        db.commit()

        _update_job(db, job, *STAGES[3])
        chunker = Chunker()
        chunks = chunker.chunk_blocks(extraction.blocks, base_text=full_text)
        if not chunks:
            chunks = chunker.chunk_blocks([_single_block(full_text)], base_text=full_text)

        _update_job(db, job, *STAGES[4])
        vectors = embed_texts([c.content for c in chunks])

        _update_job(db, job, *STAGES[5])
        from ..models import DocumentChunk

        for i, chunk in enumerate(chunks):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    page=chunk.page,
                    section=chunk.section,
                    start_char=chunk.start_char,
                    end_char=chunk.end_char,
                    timestamp=chunk.timestamp,
                    keywords=json.dumps(chunk.keywords),
                )
            )
        db.commit()

        store = get_vector_store()
        indexed = store.index(db, doc.id, chunks, vectors)

        doc.status = "ready"
        doc.embedding_count = indexed
        job.status = "completed"
        job.stage = "ready"
        job.progress = 100
        job.detail = f"Indexed {indexed} passages"
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        return _fail(f"Processing error: {exc}")


def _single_block(text: str):
    from ..processors.base import Block

    return Block(content=text, block_type="paragraph")


def run_job_async(job_id: int) -> None:
    def _run() -> None:
        from ..database import SessionLocal

        db = SessionLocal()
        try:
            job = db.get(ProcessingJob, job_id)
            if job is None:
                return
            process_document(db, job)
        finally:
            db.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()