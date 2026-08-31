from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    v = os.getenv(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return int(v)
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return float(v)
    except Exception:
        return default


@dataclass(frozen=True)
class AIRiskConfig:
    enabled: bool
    min_words: int

    threshold_percent: int
    level_medium_at: int
    level_high_at: int

    span_threshold_percent: int
    max_spans: int
    max_sentences: int
    min_sentence_chars: int

    w_burstiness: float
    w_repetition2: float
    w_repetition3: float
    w_coherence: float
    w_lexical: float
    w_transition: float
    w_structure: float
    w_reference_ai: float
    w_reference_human: float

    enable_perplexity: bool
    enable_multiscale_windows: bool
    enable_reference_profiles: bool


@dataclass(frozen=True)
class AIModelConfig:
    enabled: bool
    model_name: str
    hf_device: int
    positive_label: str | None


def get_ai_risk_config() -> AIRiskConfig:
    enabled = _env_bool("ENABLE_AI_DETECTION", True)
    threshold = max(0, min(100, _env_int("AI_THRESHOLD_PERCENT", 58)))
    return AIRiskConfig(
        enabled=enabled,
        min_words=max(0, _env_int("AI_RISK_MIN_WORDS", 80)),
        threshold_percent=threshold,
        level_medium_at=max(0, min(100, _env_int("AI_LEVEL_MEDIUM_AT", 38))),
        level_high_at=max(0, min(100, _env_int("AI_LEVEL_HIGH_AT", 68))),
        span_threshold_percent=max(0, min(100, _env_int("AI_RISK_SPAN_THRESHOLD_PERCENT", threshold))),
        max_spans=max(0, _env_int("AI_RISK_MAX_SPANS", 8)),
        max_sentences=max(10, _env_int("AI_MAX_SENTENCES", 240)),
        min_sentence_chars=max(10, _env_int("AI_MIN_SENTENCE_CHARS", 22)),
        w_burstiness=_env_float("AI_RISK_W_BURSTINESS", 0.18),
        w_repetition2=_env_float("AI_RISK_W_REPETITION2", 0.18),
        w_repetition3=_env_float("AI_RISK_W_REPETITION3", 0.10),
        w_coherence=_env_float("AI_RISK_W_COHERENCE", 0.14),
        w_lexical=_env_float("AI_RISK_W_LEXICAL", 0.12),
        w_transition=_env_float("AI_RISK_W_TRANSITION", 0.12),
        w_structure=_env_float("AI_RISK_W_STRUCTURE", 0.08),
        w_reference_ai=_env_float("AI_RISK_W_REFERENCE_AI", 0.16),
        w_reference_human=_env_float("AI_RISK_W_REFERENCE_HUMAN", 0.12),
        enable_perplexity=_env_bool("AI_ENABLE_PERPLEXITY", False),
        enable_multiscale_windows=_env_bool("AI_ENABLE_MULTISCALE_WINDOWS", True),
        enable_reference_profiles=_env_bool("AI_ENABLE_REFERENCE_PROFILES", True),
    )


def get_ai_model_config() -> AIModelConfig:
    enabled = _env_bool("ENABLE_AI_MODEL_DETECTION", True)
    model_name = os.getenv("AI_DETECTOR_MODEL_NAME", "roberta-base-openai-detector").strip()
    return AIModelConfig(
        enabled=enabled,
        model_name=model_name,
        hf_device=_env_int("HF_DEVICE", -1),
        positive_label=(os.getenv("AI_POSITIVE_LABEL") or "").strip() or None,
    )
