from __future__ import annotations

import json
from pathlib import Path

from .base import BaseProcessor, Block, ExtractionResult


class PDFProcessor(BaseProcessor):
    name = "pdf"

    @staticmethod
    def supports(filename: str) -> bool:
        return filename.lower().endswith(".pdf")

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        from pypdf import PdfReader

        reader = PdfReader(str(file_path))
        result = ExtractionResult(title=Path(original_name).stem, author="")
        md = reader.metadata or {}
        if md.get("/Title"):
            result.title = str(md["/Title"])
        if md.get("/Author"):
            result.author = str(md["/Author"])
        result.metadata = {
            k.strip("/").lower(): str(v) for k, v in md.items() if v is not None
        }
        result.page_count = len(reader.pages)

        pages_text: list[str] = []
        for idx, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            pages_text.append(text)
            for para in _split_paragraphs(text):
                result.blocks.append(
                    Block(content=para, page=idx, block_type=_classify(para))
                )

        result.text = "\n\n".join(p for p in pages_text if p.strip())
        result.toc = self._build_toc(result.blocks)
        return result

    @staticmethod
    def _build_toc(blocks: list[Block]) -> list[dict]:
        toc = []
        for b in blocks:
            if b.block_type == "heading":
                toc.append({"level": 1, "title": b.content.strip(), "page": b.page})
        return toc


def _classify(text: str) -> str:
    t = text.strip()
    if not t:
        return "paragraph"
    # Heuristic heading detection: short line, not ending in sentence punctuation,
    # fewer than 90 chars, and at most one sentence.
    words = t.split()
    if 1 <= len(words) <= 14 and len(t) <= 110 and not t.endswith((".", "!", "?", ":", ";")):
        return "heading"
    return "paragraph"


def _split_paragraphs(text: str, max_len: int = 2000) -> list[str]:
    parts = []
    for chunk in text.split("\n"):
        chunk = " ".join(chunk.split())
        if not chunk:
            continue
        parts.append(chunk)
    return parts


def _split_long(chunk: str, max_len: int = 2000) -> list[str]:
    if len(chunk) <= max_len:
        return [chunk]
    out = []
    while chunk:
        cut = min(len(chunk), max_len)
        cut = chunk.rfind(" ", 0, cut)
        if cut < max_len * 0.5:
            cut = min(len(chunk), max_len)
        out.append(chunk[:cut].strip())
        chunk = chunk[cut:].strip()
    return out