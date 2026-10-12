from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def run_ffmpeg(args: list[str], timeout: int = 300) -> tuple[int, str]:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is not installed on this system")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[:400]}")
    return proc.returncode, proc.stderr


def probe_media(path: Path) -> dict:
    """Return duration (s), streams and metadata using ffprobe when available."""
    if not ffprobe_available():
        return {"duration": 0.0, "streams": [], "meta": {}}
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-print_format", "json",
                "-show_format", "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        import json
        data = json.loads(proc.stdout or "{}")
        fmt = data.get("format", {})
        return {
            "duration": float(fmt.get("duration", 0) or 0),
            "streams": data.get("streams", []),
            "meta": fmt.get("tags", {}),
        }
    except Exception:
        return {"duration": 0.0, "streams": [], "meta": {}}


def extract_audio_track(video_path: Path, out_wav: Path) -> Path | None:
    """Extract the audio track of a video to WAV for transcription."""
    if not ffmpeg_available():
        return None
    try:
        run_ffmpeg(["-i", str(video_path), "-vn", "-ac", "1", "-ar", "16000", str(out_wav)])
        return out_wav if out_wav.exists() else None
    except Exception:
        return None


def extract_frames(video_path: Path, media_dir: Path, interval: float = 20.0, max_frames: int = 6) -> list[Path]:
    """Extract key frames at regular intervals across the video."""
    if not ffmpeg_available():
        return []
    info = probe_media(video_path)
    duration = info.get("duration") or 0
    if duration <= 0:
        return []
    frame_dir = media_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    step = max(duration / (max_frames + 1), interval)
    t = step
    idx = 0
    while t < duration and len(paths) < max_frames:
        out = frame_dir / f"frame_{idx:03d}.jpg"
        try:
            run_ffmpeg(["-ss", f"{t:.2f}", "-i", str(video_path), "-frames:v", "1", "-q:v", "3", str(out)], timeout=60)
            if out.exists():
                paths.append(out)
                idx += 1
        except Exception:
            pass
        t += step
    return paths