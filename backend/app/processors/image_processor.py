from __future__ import annotations

from pathlib import Path

from ..config import settings
from .base import BaseProcessor, Block, ExtractionResult


class ImageProcessor(BaseProcessor):
    name = "image"

    @staticmethod
    def supports(filename: str) -> bool:
        return filename.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"))

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        from PIL import Image

        result = ExtractionResult(title=Path(original_name).stem)
        img = Image.open(file_path)
        result.metadata = {
            "format": img.format or "",
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
        }
        try:
            exif = img._getexif()
            if exif:
                from PIL.ExifTags import TAGS

                result.metadata["exif"] = {
                    TAGS.get(k, str(k)): str(v) for k, v in exif.items()
                }
        except Exception:
            pass

        ocr_text = self._ocr(file_path)
        vision_text = self._vision(file_path, result.metadata)
        combined = "\n".join(t for t in (ocr_text, vision_text) if t)
        if combined.strip():
            result.blocks.append(Block(content=combined.strip(), block_type="ocr"))
            result.text = combined.strip()
        result.metadata["ocr_engine"] = settings.OCR_ENGINE
        result.metadata["vision_engine"] = settings.VISION_ENGINE
        return result

    def _ocr(self, file_path: Path) -> str:
        engine = settings.OCR_ENGINE
        if engine == "none":
            return ""
        if engine in ("auto", "tesseract"):
            try:
                import pytesseract
                from PIL import Image

                if settings.OCR_ENGINE == "tesseract" or settings.TESSERACT_CMD:
                    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
                return pytesseract.image_to_string(Image.open(file_path)).strip()
            except Exception:
                if settings.OCR_ENGINE == "tesseract":
                    raise
                return ""
        return ""

    def _vision(self, file_path: Path, meta: dict) -> str:
        engine = settings.VISION_ENGINE
        if engine == "none" or not settings.OPENAI_API_KEY:
            return ""
        try:
            import base64

            from openai import OpenAI

            client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
            b64 = base64.b64encode(file_path.read_bytes()).decode()
            resp = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Describe this image in detail for a research knowledge base. "
                                    "Include all readable text, charts, tables and diagrams. "
                                    f"Format: {meta.get('format')} {meta.get('width')}x{meta.get('height')}."
                                ),
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/{meta.get('format','png').lower()};base64,{b64}"},
                            },
                        ],
                    }
                ],
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception:
            return ""