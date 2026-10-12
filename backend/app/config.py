import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Marginalia — Multimedia Research Assistant"
    APP_ENV: str = "development"
    DEBUG: bool = True

    # Database. Use postgresql+psycopg://... + pgvector for production,
    # sqlite (default) for local out-of-the-box development.
    DATABASE_URL: str = "sqlite:///./marginalia.db"

    # Secrets
    SECRET_KEY: str = "dev-only-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Auth
    PASSWORD_MIN_LENGTH: int = 8

    # Uploads
    MAX_UPLOAD_MB: int = 200
    ALLOWED_EXTENSIONS: str = (
        "pdf,docx,txt,md,png,jpg,jpeg,gif,webp,bmp,tiff,mp3,wav,m4a,aac,ogg,flac,mp4,mov,mkv,webm,avi"
    )

    # Embeddings
    EMBEDDING_PROVIDER: str = "auto"  # auto | openai | local
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 384
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: Optional[str] = None

    # LLM
    LLM_PROVIDER: str = "auto"  # auto | openai | anthropic | local
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TEMPERATURE: float = 0.2
    LLM_MAX_TOKENS: int = 1200
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-3-5-haiku-latest"

    # RAG
    RAG_TOP_K: int = 6
    RAG_MIN_SCORE: float = 0.25
    RAG_CHUNK_SIZE: int = 900
    RAG_CHUNK_OVERLAP: int = 140
    RAG_HYBRID_WEIGHT: float = 0.6  # weight given to semantic score in hybrid ranking
    RAG_RERANK: bool = True

    # OCR / Speech / Vision (optional providers)
    OCR_ENGINE: str = "auto"  # auto | tesseract | none
    TESSERACT_CMD: str = "tesseract"
    SPEECH_ENGINE: str = "auto"  # auto | openai | whisper | none
    VISION_ENGINE: str = "auto"  # auto | openai | none

    # Media root
    MEDIA_DIR: str = "./media"
    RATE_LIMIT_PER_MINUTE: int = 120

    # Comma-separated extra CORS origins (same-origin deploys don't need any)
    CORS_ORIGINS: str = ""
    # Built frontend (vite build output) served by the backend when present
    FRONTEND_DIST: str = ""

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @property
    def allowed_extensions(self) -> set[str]:
        return {e.strip().lower() for e in self.ALLOWED_EXTENSIONS.split(",") if e.strip()}

    @property
    def upload_size_limit(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Render/Heroku hand out postgres:// URLs; SQLAlchemy needs the psycopg driver name.
    url = s.DATABASE_URL
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            s.DATABASE_URL = "postgresql+psycopg://" + url[len(prefix):]
            break
    return s


settings = get_settings()
