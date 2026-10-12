from __future__ import annotations

from pathlib import Path

from ..config import settings
from .audio_processor import AudioProcessor
from .base import BaseProcessor, Block, ExtractionResult
from .media_utils import extract_audio_track, extract_frames, probe_media


class VideoProcessor(BaseProcessor):
    name = "video"

    @staticmethod
    def supports(filename: str) -> bool:
        return filename.lower().endswith((".mp4", ".mov", ".mkv", ".webm", ".avi"))

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        result = ExtractionResult(title=Path(original_name).stem)
        info = probe_media(file_path)
        duration = info.get("duration") or 0
        result.duration_seconds = duration
        result.metadata = {
            "duration": duration,
            "format": Path(original_name).suffix.lstrip("."),
            "width": 0,
            "height": 0,
        }
        for s in info.get("streams", []):
            if s.get("codec_type") == "video":
                result.metadata["width"] = int(s.get("width", 0))
                result.metadata["height"] = int(s.get("height", 0))
                break

        frames = extract_frames(file_path, media_dir)
        result.media_assets = [str(f) for f in frames]

        wav = extract_audio_track(file_path, media_dir / "video_audio.wav")
        if wav:
            audio_proc = AudioProcessor()
            try:
                segs = audio_proc._transcribe(wav)
            except Exception:
                segs = []
            if segs:
                for i, seg in enumerate(segs):
                    result.blocks.append(
                        Block(
                            content=seg["text"],
                            timestamp=round(seg["start"], 1),
                            section=f"Transcript {i // 6 + 1}",
                            block_type="transcript",
                        )
                    )
                result.text = "\n".join(b.content for b in result.blocks)
                result.metadata["transcription_engine"] = (
                    "openai" if (settings.SPEECH_ENGINE in ("auto", "openai") and settings.OPENAI_API_KEY) else "whisper"
                )
            else:
                result.metadata["transcription_status"] = "unavailable"
        return result