from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Block:
    """A single extractable unit of media content with provenance metadata."""

    content: str
    page: int = 0
    timestamp: float = 0.0
    section: str = ""
    block_type: str = "paragraph"  # heading|paragraph|table|transcript|ocr|frame|caption


@dataclass
class ExtractionResult:
    """Normalised output of every multimedia processor."""

    title: str = ""
    author: str = ""
    text: str = ""
    blocks: list[Block] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    page_count: int = 0
    duration_seconds: float = 0.0
    toc: list[dict] = field(default_factory=list)
    media_assets: list[str] = field(default_factory=list)

    def join_blocks(self) -> str:
        if self.text:
            return self.text
        return "\n\n".join(b.content for b in self.blocks if b.content.strip())


class BaseProcessor:
    """Interface every multimedia processor implements."""

    name = "base"

    @staticmethod
    def supports(filename: str) -> bool:
        return False

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        raise NotImplementedError