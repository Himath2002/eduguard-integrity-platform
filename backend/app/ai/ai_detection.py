from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .models import _pick_ai_probability, get_ai_detector


@dataclass
class AIChunkScore:
    chunk_id: int
    label: str
    score: float


@dataclass
class AIDetectionResult:
    overall_score: float
    chunks: List[AIChunkScore]
    model_name: str
    error: Optional[str] = None


def detect_ai(chunks: List[tuple[int, str]]) -> AIDetectionResult:
    """Run transformer-based AI text detection on chunks.

    `chunks` is list of (chunk_id, text).
    Returns overall score as mean probability of AI label when available.
    """
    if not chunks:
        return AIDetectionResult(overall_score=0.0, chunks=[], model_name="")

    try:
        detector = get_ai_detector()
    except Exception as e:
        # Keep the pipeline running even if the detector model isn't available yet.
        return AIDetectionResult(
            overall_score=0.0,
            chunks=[],
            model_name="",
            error=f"AI detector unavailable: {e}",
        )

    model_name = getattr(detector, "model", None)
    model_name = getattr(model_name, "name_or_path", "") if model_name else ""

    scores: List[AIChunkScore] = []
    ai_probs: List[float] = []

    batch_size = 8
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        texts = [t for _, t in batch]
        try:
            outputs = detector(texts)
        except Exception as e:
            return AIDetectionResult(
                overall_score=0.0,
                chunks=scores,
                model_name=model_name,
                error=f"AI detector failed: {e}",
            )

        for (chunk_id, _), out in zip(batch, outputs):
            primary = out[0] if isinstance(out, list) and out else out
            label = str(primary.get("label", "")) if isinstance(primary, dict) else ""
            try:
                score = float(primary.get("score", 0.0)) if isinstance(primary, dict) else 0.0
            except Exception:
                score = 0.0
            scores.append(AIChunkScore(chunk_id=chunk_id, label=label, score=max(0.0, min(1.0, score))))
            ai_probs.append(_pick_ai_probability(out))

    overall = sum(ai_probs) / max(1, len(ai_probs))
    return AIDetectionResult(overall_score=float(overall), chunks=scores, model_name=model_name)
