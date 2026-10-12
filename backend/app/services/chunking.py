from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..config import settings
from ..processors.base import Block

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of",
    "to", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "this", "that", "these", "those", "it",
    "its", "their", "they", "them", "his", "her", "he", "she", "we", "you",
    "your", "i", "me", "my", "our", "not", "no", "so", "such", "will", "would",
    "can", "could", "should", "may", "might", "must", "do", "does", "did",
    "has", "have", "had", "having", "what", "which", "who", "whom", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "any", "about", "into", "over", "under", "between",
    "against", "during", "before", "after", "above", "below", "up", "down",
    "out", "off", "then", "than", "too", "very", "just", "also", "only", "own",
}


@dataclass
class Chunk:
    content: str
    chunk_index: int
    page: int = 0
    timestamp: float = 0.0
    section: str = ""
    start_char: int = 0
    end_char: int = 0
    block_type: str = "paragraph"
    keywords: list[str] = field(default_factory=list)


_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]{2,}")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def extract_keywords(text: str, top: int = 12) -> list[str]:
    freq: dict[str, int] = {}
    for tok in tokenize(text):
        if tok in STOPWORDS or len(tok) < 3:
            continue
        freq[tok] = freq.get(tok, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)
    return [w for w, _ in ranked[:top]]


class Chunker:
    def __init__(self, size: int | None = None, overlap: int | None = None):
        self.size = size or settings.RAG_CHUNK_SIZE
        self.overlap = overlap if overlap is not None else settings.RAG_CHUNK_OVERLAP

    def chunk_blocks(self, blocks: list[Block], base_text: str = "") -> list[Chunk]:
        chunks: list[Chunk] = []
        running: list[Block] = []
        running_len = 0
        index = 0

        def flush() -> None:
            nonlocal running, running_len, index
            if not running:
                return
            content = "\n\n".join(b.content for b in running if b.content.strip())
            if not content.strip():
                running = []
                running_len = 0
                return
            first = running[0]
            start = _find_start(base_text, content)
            end = start + len(content)
            keywords = extract_keywords(content)
            chunks.append(
                Chunk(
                    content=content.strip(),
                    chunk_index=index,
                    page=first.page,
                    timestamp=first.timestamp,
                    section=first.section,
                    start_char=start,
                    end_char=end,
                    block_type=first.block_type,
                    keywords=keywords,
                )
            )
            index += 1
            running = []
            running_len = 0

        for block in blocks:
            text = block.content.strip()
            if not text:
                continue
            if block.block_type == "heading" and running:
                flush()
                running.append(block)
                continue
            if running_len + len(text) + 2 > self.size and running:
                flush()
            running.append(block)
            running_len += len(text) + 2

        flush()

        if self.overlap > 0 and len(chunks) > 1:
            chunks = self._apply_overlap(chunks)
        return chunks

    def _apply_overlap(self, chunks: list[Chunk]) -> list[Chunk]:
        result = [chunks[0]]
        for i in range(1, len(chunks)):
            prev = result[-1]
            tail = prev.content[-self.overlap:]
            merged = f"{tail}\n\n{chunks[i].content}"
            merged_chunk = Chunk(
                content=merged,
                chunk_index=chunks[i].chunk_index,
                page=chunks[i].page,
                timestamp=chunks[i].timestamp,
                section=chunks[i].section,
                start_char=max(0, chunks[i].start_char - len(tail)),
                end_char=chunks[i].end_char,
                block_type=chunks[i].block_type,
                keywords=chunks[i].keywords,
            )
            result.append(merged_chunk)
        return result


def _find_start(base_text: str, content: str) -> int:
    if not base_text:
        return 0
    idx = base_text.find(content[:120])
    return idx if idx >= 0 else 0