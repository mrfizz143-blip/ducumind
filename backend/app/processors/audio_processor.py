from __future__ import annotations

from pathlib import Path

from ..config import settings
from .base import BaseProcessor, Block, ExtractionResult
from .media_utils import probe_media, run_ffmpeg


class AudioProcessor(BaseProcessor):
    name = "audio"

    @staticmethod
    def supports(filename: str) -> bool:
        return filename.lower().endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"))

    def process(self, file_path: Path, original_name: str, media_dir: Path) -> ExtractionResult:
        result = ExtractionResult(title=Path(original_name).stem)
        info = probe_media(file_path)
        duration = info.get("duration") or 0
        result.duration_seconds = duration
        result.metadata = {"duration": duration, "format": Path(original_name).suffix.lstrip(".")}
        if info.get("meta"):
            result.metadata.update(info["meta"])

        wav_path = self._normalise_audio(file_path, media_dir)
        transcript = self._transcribe(wav_path or file_path)
        if transcript:
            result.blocks.extend(self._transcript_blocks(transcript, duration))
            result.text = "\n".join(b.content for b in result.blocks)
            result.metadata["transcription_engine"] = "openai" if (settings.SPEECH_ENGINE in ("auto", "openai") and settings.OPENAI_API_KEY) else "whisper"
        else:
            result.metadata["transcription_status"] = "unavailable"
        return result

    def _normalise_audio(self, file_path: Path, media_dir: Path) -> Path | None:
        out = media_dir / "audio.wav"
        try:
            run_ffmpeg(["-i", str(file_path), "-ac", "1", "-ar", "16000", str(out)])
            return out if out.exists() else None
        except Exception:
            return None

    def _transcribe(self, audio_path: Path) -> list[dict]:
        engine = settings.SPEECH_ENGINE
        if engine == "none":
            return []
        if engine in ("auto", "openai") and settings.OPENAI_API_KEY:
            try:
                from openai import OpenAI

                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
                with open(audio_path, "rb") as fh:
                    resp = client.audio.transcriptions.create(
                        model="whisper-1", file=fh, response_format="verbose_json", timestamp_granularities=["segment"]
                    )
                segments = []
                for seg in (getattr(resp, "segments", None) or []):
                    segments.append(
                        {"start": float(seg.get("start", 0)), "end": float(seg.get("end", 0)), "text": seg.get("text", "").strip()}
                    )
                if segments:
                    return segments
                full = (resp.text or "").strip()
                if full:
                    return [{"start": 0.0, "end": 0.0, "text": full}]
                return []
            except Exception:
                if engine == "openai":
                    raise
        if engine in ("auto", "whisper"):
            try:
                from faster_whisper import WhisperModel

                model = WhisperModel("base", device="cpu", compute_type="int8")
                segments, _info = model.transcribe(str(audio_path), vad_filter=True)
                out = []
                for seg in segments:
                    out.append({"start": float(seg.start), "end": float(seg.end), "text": seg.text.strip()})
                return out
            except Exception:
                if engine == "whisper":
                    raise
                return []
        return []

    @staticmethod
    def _transcript_blocks(segments: list[dict], duration: float) -> list[Block]:
        blocks = []
        for i, seg in enumerate(segments):
            blocks.append(
                Block(
                    content=seg["text"],
                    timestamp=round(seg["start"], 1),
                    section=f"Transcript {i // 6 + 1}",
                    block_type="transcript",
                )
            )
        return blocks