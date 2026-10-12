from __future__ import annotations

from pathlib import Path

from .base import BaseProcessor, Block, ExtractionResult


class TXTProcessor(BaseProcessor):
    name = "text"

    @staticmethod
    def supports(filename: str) -> bool:
        return filename.lower().endswith((".txt", ".md", ".csv", ".json", ".log"))

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        for encoding in ("utf-8", "utf-16", "latin-1"):
            try:
                raw = file_path.read_bytes()
                text = raw.decode(encoding)
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            text = file_path.read_text(errors="replace")

        text = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = text.split("\n")
        result = ExtractionResult(title=Path(original_name).stem)
        result.metadata = {
            "lines": len(lines),
            "characters": len(text),
            "encoding": "detected",
        }
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if _looks_heading(line):
                result.blocks.append(Block(content=line, block_type="heading"))
            else:
                result.blocks.append(Block(content=line, block_type="paragraph"))
        result.text = text.strip()
        result.toc = [
            {"level": 1, "title": b.content, "page": 0}
            for b in result.blocks
            if b.block_type == "heading"
        ]
        return result


def _looks_heading(line: str) -> bool:
    words = line.split()
    return (
        1 <= len(words) <= 14
        and len(line) <= 100
        and not line.endswith((".", "!", "?", ":", ";"))
    )