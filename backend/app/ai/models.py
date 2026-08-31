from __future__ import annotations

import os
from functools import lru_cache
from typing import Sequence


@lru_cache(maxsize=1)
def get_sbert_model():
    from sentence_transformers import SentenceTransformer

    name = os.getenv("SBERT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
    return SentenceTransformer(name)


def encode_with_sbert(texts: Sequence[str]) -> list[list[float]]:
    material = [str(t or "").strip() for t in texts if str(t or "").strip()]
    if not material:
        return []
    model = get_sbert_model()
    vectors = model.encode(material, batch_size=int(os.getenv("SBERT_BATCH_SIZE", "16")), show_progress_bar=False, normalize_embeddings=True)
    return vectors.tolist() if hasattr(vectors, "tolist") else list(vectors)


@lru_cache(maxsize=1)
def get_plagiarism_reranker():
    mode = os.getenv("PLAG_RERANKER_MODE", "hybrid").strip().lower()
    if mode in {"off", "none", "hybrid", "local"}:
        return None

    from sentence_transformers import CrossEncoder

    model_name = os.getenv(
        "PLAG_RERANKER_MODEL_NAME",
        "cross-encoder/ms-marco-MiniLM-L-6-v2",
    )
    return CrossEncoder(model_name)


def score_pairs_with_plagiarism_reranker(pairs: Sequence[tuple[str, str]]) -> list[float | None]:
    material = [(str(a or ""), str(b or "")) for a, b in pairs]
    if not material:
        return []

    reranker = get_plagiarism_reranker()
    if reranker is None:
        return [None] * len(material)

    try:
        import numpy as np

        scores = reranker.predict(
            material,
            batch_size=int(os.getenv("PLAG_RERANK_BATCH_SIZE", "12")),
            show_progress_bar=False,
        )
        arr = np.asarray(scores, dtype="float32")

        if arr.size and (float(arr.min()) < 0.0 or float(arr.max()) > 1.0):
            arr = 1.0 / (1.0 + np.exp(-arr))

        return [max(0.0, min(1.0, float(x))) for x in arr.tolist()]
    except Exception:
        return [None] * len(material)


@lru_cache(maxsize=1)
def get_ai_detector():
    from transformers import pipeline

    model_name = os.getenv("AI_DETECTOR_MODEL_NAME", "roberta-base-openai-detector")
    device = int(os.getenv("HF_DEVICE", "-1"))
    return pipeline(
        "text-classification",
        model=model_name,
        tokenizer=model_name,
        device=device,
        truncation=True,
        top_k=None,
    )


def _pick_ai_probability(output, *, positive_label: str | None = None) -> float:
    rows = output if isinstance(output, list) else [output]
    cleaned: list[tuple[str, float]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label", "") or "").strip()
        try:
            score = float(row.get("score", 0.0) or 0.0)
        except Exception:
            score = 0.0
        cleaned.append((label, score))

    if not cleaned:
        return 0.0

    if positive_label:
        wanted = positive_label.strip().upper()
        for label, score in cleaned:
            if label.upper() == wanted:
                return max(0.0, min(1.0, score))

    upper_map = {label.upper(): score for label, score in cleaned}

    for key in ("AI", "FAKE", "GENERATED", "MACHINE", "SYNTHETIC"):
        for label, score in upper_map.items():
            if key in label and "HUMAN" not in label and "REAL" not in label:
                return max(0.0, min(1.0, score))

    for key in ("HUMAN", "REAL", "ORIGINAL"):
        for label, score in upper_map.items():
            if key in label:
                return max(0.0, min(1.0, 1.0 - score))

    best_label, best_score = max(cleaned, key=lambda item: item[1])
    label_up = best_label.upper()
    if "HUMAN" in label_up or "REAL" in label_up or "ORIGINAL" in label_up:
        return max(0.0, min(1.0, 1.0 - best_score))
    return max(0.0, min(1.0, best_score))


def score_texts_with_ai_detector(texts: Sequence[str], *, positive_label: str | None = None) -> list[float]:
    material = [str(t or "").strip() for t in texts]
    if not material:
        return []

    detector = get_ai_detector()
    outputs = detector(material)
    return [_pick_ai_probability(out, positive_label=positive_label) for out in outputs]
