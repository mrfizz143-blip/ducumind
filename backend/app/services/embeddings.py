from __future__ import annotations

import hashlib
import math
import re

import numpy as np

from ..config import settings

_WORD_RE = re.compile(r"[a-zA-Z0-9]+")
_WORDS = re.compile(r"\b[a-z0-9]+\b", re.IGNORECASE)


class BaseEmbedder:
    name = "base"
    dimensions = 0

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]


class LocalEmbedder(BaseEmbedder):
    """Deterministic hash-feature embedder.

    Builds a real dense vector from subword n-grams (a fastText-style bag of
    character n-grams) so that cosine similarity is a genuine semantic measure.
    Used as the offline fallback when no embedding API is configured.
    """

    name = "local"
    dimensions = settings.EMBEDDING_DIMENSIONS
    _FEATURES = 3

    def _features(self, text: str) -> list[str]:
        text = text.lower()
        words = _WORD_RE.findall(text)
        feats: set[str] = set()
        for w in words:
            w = f"▁{w}▁"
            feats.add(w)
            for n in (2, 3, 4):
                for i in range(len(w) - n + 1):
                    feats.add(w[i : i + n])
        return list(feats)

    def _vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dimensions, dtype=np.float32)
        for feat in self._features(text):
            digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
            idx = int.from_bytes(digest[:4], "little") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[idx] += sign * self._FEATURES
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t).tolist() for t in texts]


class OpenAIEmbedder(BaseEmbedder):
    name = "openai"
    dimensions = settings.EMBEDDING_DIMENSIONS

    def __init__(self) -> None:
        from openai import OpenAI

        self.client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
        self.model = settings.EMBEDDING_MODEL

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        batch_size = 64
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = self.client.embeddings.create(
                model=self.model, input=batch, dimensions=settings.EMBEDDING_DIMENSIONS
            )
            data = sorted(resp.data, key=lambda d: d.index)
            out.extend([d.embedding for d in data])
        return out


_embedder_instance: BaseEmbedder | None = None


def get_embedder() -> BaseEmbedder:
    global _embedder_instance
    if _embedder_instance is None:
        provider = settings.EMBEDDING_PROVIDER
        if provider == "local":
            _embedder_instance = LocalEmbedder()
        elif provider == "openai":
            _embedder_instance = OpenAIEmbedder()
        else:  # auto
            if settings.OPENAI_API_KEY:
                try:
                    _embedder_instance = OpenAIEmbedder()
                except Exception:
                    _embedder_instance = LocalEmbedder()
            else:
                _embedder_instance = LocalEmbedder()
    return _embedder_instance


def embed_texts(texts: list[str]) -> list[list[float]]:
    return get_embedder().embed_texts(texts)


def embed_query(text: str) -> list[float]:
    return get_embedder().embed_query(text)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def euclidean_distance(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    return float(np.linalg.norm(va - vb))