from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import mean, pstdev
from typing import Dict, Iterable, List

from .features import linguistic_features, stylometry_features

REFERENCE_KEYS = [
    "avg_word_len",
    "unique_ratio",
    "punct_ratio",
    "sentence_len_mean",
    "sentence_len_var",
    "burstiness",
    "repetition_2gram",
    "repetition_3gram",
    "coherence_proxy",
    "transition_density",
    "sentence_starter_diversity",
    "paragraph_length_cv",
    "hedge_density",
    "modal_density",
    "punctuation_cadence",
    "citation_density",
    "contrast_density",
    "example_density",
    "revision_density",
    "numeric_detail_density",
]


@dataclass(frozen=True)
class StyleProfile:
    label: str
    centroid: Dict[str, float]
    spread: Dict[str, float]
    document_count: int


@dataclass(frozen=True)
class ReferenceComparison:
    human_distance: float
    ai_distance: float
    human_conformity: float
    ai_style_score: float


def _feature_vector(text: str) -> Dict[str, float]:
    base = stylometry_features(text)
    ling = linguistic_features(text)
    merged = {**base, **ling}
    return {key: float(merged.get(key, 0.0)) for key in REFERENCE_KEYS}


def _load_texts(folder: Path) -> List[str]:
    texts: List[str] = []
    if not folder.exists():
        return texts
    for path in sorted(folder.glob("*.txt")):
        try:
            data = path.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if data:
            texts.append(data)
    return texts


def _build_profile(label: str, texts: Iterable[str]) -> StyleProfile:
    rows = [_feature_vector(text) for text in texts if text and text.strip()]
    if not rows:
        centroid = {key: 0.0 for key in REFERENCE_KEYS}
        spread = {key: 1.0 for key in REFERENCE_KEYS}
        return StyleProfile(label=label, centroid=centroid, spread=spread, document_count=0)

    centroid = {key: mean([row.get(key, 0.0) for row in rows]) for key in REFERENCE_KEYS}
    spread = {}
    for key in REFERENCE_KEYS:
        values = [row.get(key, 0.0) for row in rows]
        s = pstdev(values) if len(values) > 1 else 0.0
        spread[key] = float(s if s > 1e-4 else max(abs(centroid[key]) * 0.15, 0.05))
    return StyleProfile(label=label, centroid=centroid, spread=spread, document_count=len(rows))


@lru_cache(maxsize=1)
def get_reference_profiles() -> tuple[StyleProfile, StyleProfile]:
    root = Path(__file__).resolve().parent / "reference"
    human_texts = _load_texts(root / "human")
    ai_like_texts = _load_texts(root / "ai_like")
    return _build_profile("human", human_texts), _build_profile("ai_like", ai_like_texts)


def _profile_distance(vector: Dict[str, float], profile: StyleProfile) -> float:
    total = 0.0
    weight_total = 0.0
    for key in REFERENCE_KEYS:
        value = float(vector.get(key, 0.0))
        center = float(profile.centroid.get(key, 0.0))
        spread = max(1e-4, float(profile.spread.get(key, 1.0)))
        z = abs(value - center) / spread
        weight = 1.0
        if key in {"burstiness", "sentence_len_var", "sentence_starter_diversity", "paragraph_length_cv"}:
            weight = 1.15
        elif key in {"transition_density", "hedge_density", "modal_density", "coherence_proxy"}:
            weight = 1.10
        elif key in {"citation_density", "contrast_density", "example_density", "revision_density", "numeric_detail_density"}:
            weight = 1.18
        total += z * weight
        weight_total += weight
    return float(total / max(1e-6, weight_total))


def compare_against_reference_profiles(text: str) -> ReferenceComparison:
    human_profile, ai_profile = get_reference_profiles()
    vector = _feature_vector(text)

    human_distance = _profile_distance(vector, human_profile)
    ai_distance = _profile_distance(vector, ai_profile)

    human_conformity = 1.0 / (1.0 + human_distance)
    relative_gap = (human_distance - ai_distance) / max(0.35, human_distance + ai_distance)
    ai_style_score = 1.0 / (1.0 + pow(2.718281828, -4.2 * relative_gap))

    return ReferenceComparison(
        human_distance=float(human_distance),
        ai_distance=float(ai_distance),
        human_conformity=float(max(0.0, min(1.0, human_conformity))),
        ai_style_score=float(max(0.0, min(1.0, ai_style_score))),
    )
