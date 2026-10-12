from pathlib import Path

from .audio_processor import AudioProcessor
from .base import BaseProcessor, Block, ExtractionResult
from .docx_processor import DOCXProcessor
from .image_processor import ImageProcessor
from .pdf_processor import PDFProcessor
from .txt_processor import TXTProcessor
from .video_processor import VideoProcessor

PROCESSORS: list[BaseProcessor] = [
    PDFProcessor(),
    DOCXProcessor(),
    TXTProcessor(),
    ImageProcessor(),
    AudioProcessor(),
    VideoProcessor(),
]


def get_processor(filename: str) -> BaseProcessor | None:
    for proc in PROCESSORS:
        if proc.supports(filename):
            return proc
    return None


def is_supported(filename: str) -> bool:
    return get_processor(filename) is not None


__all__ = [
    "PROCESSORS",
    "get_processor",
    "is_supported",
    "BaseProcessor",
    "Block",
    "ExtractionResult",
]