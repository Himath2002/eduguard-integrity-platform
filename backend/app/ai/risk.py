from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .ai_config import get_ai_risk_config, get_ai_model_config
from .features import split_sentences_with_offsets, stylometry_features, linguistic_features
from .models import score_texts_with_ai_detector
from .reference_corpus import compare_against_reference_profiles

_WORD = re.compile(r"\b\w+\b", re.UNICODE)
_CLAUSE_RE = re.compile(r"(?s)\S.*?(?:[,;:]+(?=\s)|$)")

_TRANSITION_PHRASES = (
    "in conclusion",
    "to conclude",
    "in summary",
    "overall",
    "moreover",
    "furthermore",
    "additionally",
    "in addition",
    "on the other hand",
    "as a result",
    "therefore",
    "thus",
    "consequently",
    "it is important to note",
    "this report",
    "this essay",
    "this paper",
)

_META_LINE_HINTS = (
    "course code",
    "assignment title",
    "student declaration",
    "submission",
    "ai test document",
    "final plagiarism test document",
    "human-written",
    "more formulaic",
    "original document",
    "mixed copied",
)

_HUMAN_DISCOURSE_MARKERS = (
    "however",
    "although",
    "while",
    "yet",
    "for example",
    "for instance",
    "in practice",
    "rather than",
    "in this sense",
    "after reading",
    "after reviewing",
)


_HUMAN_JUDGMENT_PHRASES = (
    "compare claims",
    "compare sources",
    "identify evidence",
    "judge authority",
    "evaluate sources",
    "cross-check",
    "revise the argument",
    "after reading",
    "after comparing",
    "distinguish strong evidence",
    "weigh evidence",
    "question where information comes from",
)

_ENUMERATIVE_AI_MARKERS = (
    "first,",
    "second,",
    "third,",
    "finally,",
    "overall,",
    "in conclusion,",
    "to conclude,",
    "in summary,",
)

def _is_meta_or_heading_segment(text: str) -> bool:
    raw = str(text or "").strip()
    if not raw:
        return True
    lower = raw.lower()
    if any(hint in lower for hint in _META_LINE_HINTS):
        return True
    words = _WORD.findall(raw)
    if len(words) <= 10 and not re.search(r"[.!?]$", raw):
        titlecase_words = sum(1 for w in words if w[:1].isupper())
        if titlecase_words >= max(2, int(len(words) * 0.6)):
            return True
    if len(words) <= 6 and raw.endswith(":"):
        return True
    return False


def _human_discourse_density(text: str) -> float:
    lower = str(text or "").lower()
    if not lower.strip():
        return 0.0
    hits = sum(lower.count(marker) for marker in _HUMAN_DISCOURSE_MARKERS)
    sentences = max(1, len(split_sentences_with_offsets(lower)))
    return _clamp01(hits / sentences)


def _human_judgment_density(text: str) -> float:
    lower = str(text or "").lower()
    if not lower.strip():
        return 0.0
    hits = sum(lower.count(marker) for marker in _HUMAN_JUDGMENT_PHRASES)
    sentences = max(1, len(split_sentences_with_offsets(lower)))
    tokens = max(1, len(_WORD.findall(lower)))
    signal = (0.75 * (hits / sentences)) + (0.25 * (hits / tokens) * 40.0)
    return _clamp01(signal)


def _enumerative_ai_density(text: str) -> float:
    lower = str(text or "").lower()
    if not lower.strip():
        return 0.0
    lines = [ln.strip().lower() for ln in lower.splitlines() if ln.strip()]
    line_hits = sum(1 for ln in lines if any(ln.startswith(marker) for marker in _ENUMERATIVE_AI_MARKERS))
    inline_hits = sum(lower.count(marker) for marker in _ENUMERATIVE_AI_MARKERS)
    sentences = max(1, len(split_sentences_with_offsets(lower)))
    signal = ((0.55 * line_hits) + (0.45 * inline_hits)) / sentences
    return _clamp01(signal * 1.8)


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else float(x)


def _ngram_repetition_ratio(tokens: List[str], n: int) -> float:
    if n <= 0 or len(tokens) < n:
        return 0.0
    grams = [tuple(tokens[i : i + n]) for i in range(0, len(tokens) - n + 1)]
    if not grams:
        return 0.0
    total = len(grams)
    unique = len(set(grams))
    return float((total - unique) / max(1, total))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = len(a.intersection(b))
    union = len(a.union(b))
    return float(inter / max(1, union))


@dataclass(frozen=True)
class AIRiskSpan:
    start: int
    end: int
    confidence_percent: int
    text_preview: str
    reasons: List[str]
    severity: str = "low"
    coverage_percent: int = 0
    contribution_percent: int = 0


@dataclass(frozen=True)
class AIRiskResult:
    risk_score: float  # 0..1
    risk_percent: int  # 0..100
    risk_level: str  # low|medium|high
    detected: bool
    spans: List[AIRiskSpan]
    note: Optional[str] = None
    error: Optional[str] = None
    components: Optional[Dict[str, float]] = None


def _level(percent: int, *, medium_at: int, high_at: int) -> str:
    if percent >= high_at:
        return "high"
    if percent >= medium_at:
        return "medium"
    return "low"


def _normalize_weighted(components: Dict[str, float], weights: Dict[str, float]) -> float:
    wsum = sum(max(0.0, float(w)) for w in weights.values()) or 1.0
    total = 0.0
    for k, v in components.items():
        w = max(0.0, float(weights.get(k, 0.0)))
        total += float(v) * (w / wsum)
    return _clamp01(total)


def _document_risk_components(full_text: str, text_stats: Dict[str, float], ling: Dict[str, float]) -> Dict[str, float]:
    burstiness = float(ling.get("burstiness", 0.0))
    rep2 = float(ling.get("repetition_2gram", 0.0))
    rep3 = float(ling.get("repetition_3gram", 0.0))
    coh = float(ling.get("coherence_proxy", 0.0))
    unique_ratio = float(text_stats.get("unique_ratio", 0.0))
    transition_density = float(ling.get("transition_density", 0.0))
    starter_diversity = float(ling.get("sentence_starter_diversity", 0.0))
    paragraph_cv = float(ling.get("paragraph_length_cv", 0.0))
    hedge_density = float(ling.get("hedge_density", 0.0))
    modal_density = float(ling.get("modal_density", 0.0))
    punctuation_cadence = float(ling.get("punctuation_cadence", 0.0))
    citation_density = float(ling.get("citation_density", 0.0))
    contrast_density = float(ling.get("contrast_density", 0.0))
    example_density = float(ling.get("example_density", 0.0))
    revision_density = float(ling.get("revision_density", 0.0))
    numeric_detail_density = float(ling.get("numeric_detail_density", 0.0))

    risk_burstiness = _clamp01((2.0 - burstiness) / 2.0)
    risk_rep2 = _clamp01((rep2 - 0.035) / 0.080)
    risk_rep3 = _clamp01((rep3 - 0.003) / 0.018)
    risk_coh = _clamp01((coh - 0.03) / 0.07)
    risk_lex = _clamp01((0.62 - unique_ratio) / 0.22)
    risk_transition = _clamp01((transition_density - 0.10) / 0.25)
    risk_structure = _clamp01((0.42 - paragraph_cv) / 0.34)
    human_hedge_signal = _clamp01((hedge_density - 0.008) / 0.025)
    human_modal_signal = _clamp01((modal_density - 0.010) / 0.040)
    human_starter_diversity = _clamp01((starter_diversity - 0.42) / 0.34)
    human_punctuation_var = _clamp01((punctuation_cadence - 0.10) / 0.45)
    human_structural_variation = _clamp01((paragraph_cv - 0.18) / 0.35)
    human_citation_signal = _clamp01((citation_density - 0.02) / 0.12)
    human_contrast_signal = _clamp01((contrast_density - 0.05) / 0.30)
    human_example_signal = _clamp01((example_density - 0.03) / 0.22)
    human_revision_signal = _clamp01((revision_density - 0.02) / 0.18)
    human_numeric_signal = _clamp01((numeric_detail_density - 0.005) / 0.05)
    human_judgment_signal = _human_judgment_density(full_text)
    enumerative_ai_signal = _enumerative_ai_density(full_text)

    return {
        "burstiness": float(risk_burstiness),
        "repetition2": float(risk_rep2),
        "repetition3": float(risk_rep3),
        "coherence": float(risk_coh),
        "lexical": float(risk_lex),
        "transition": float(risk_transition),
        "structure": float(risk_structure),
        "human_hedge_signal": float(human_hedge_signal),
        "human_modal_signal": float(human_modal_signal),
        "human_starter_diversity": float(human_starter_diversity),
        "human_punctuation_var": float(human_punctuation_var),
        "human_structural_variation": float(human_structural_variation),
        "human_citation_signal": float(human_citation_signal),
        "human_contrast_signal": float(human_contrast_signal),
        "human_example_signal": float(human_example_signal),
        "human_revision_signal": float(human_revision_signal),
        "human_numeric_signal": float(human_numeric_signal),
        "human_judgment_signal": float(human_judgment_signal),
        "enumerative_ai_signal": float(enumerative_ai_signal),
    }


def _segment_text_with_offsets(full_text: str, *, max_chars: int = 120) -> List[Tuple[int, int, str]]:
    """Split the document into small stable segments for exact highlighting.

    Smaller segments let the final highlighted coverage align much more closely with the
    document-level AI percentage while still mapping cleanly back to the source text.
    """
    segments: List[Tuple[int, int, str]] = []
    for sent_start, sent_end, sent in split_sentences_with_offsets(full_text):
        if len(sent) <= max_chars:
            clean = sent.strip()
            if clean:
                lead = sent.find(clean)
                seg_start = sent_start + max(0, lead)
                seg_end = seg_start + len(clean)
                segments.append((seg_start, seg_end, full_text[seg_start:seg_end]))
            continue

        rel_parts: List[Tuple[int, int, str]] = []
        for match in _CLAUSE_RE.finditer(sent):
            raw = match.group(0)
            clean = raw.strip()
            if not clean:
                continue
            left_ws = len(raw) - len(raw.lstrip())
            right_ws = len(raw) - len(raw.rstrip())
            part_start = sent_start + match.start() + left_ws
            part_end = sent_start + match.end() - right_ws
            if part_end > part_start:
                rel_parts.append((part_start, part_end, full_text[part_start:part_end]))

        if not rel_parts:
            rel_parts = [(sent_start, sent_end, sent)]

        for part_start, part_end, part_text in rel_parts:
            if len(part_text) <= max_chars:
                clean = part_text.strip()
                if clean:
                    local = part_text.find(clean)
                    seg_start = part_start + max(0, local)
                    seg_end = seg_start + len(clean)
                    segments.append((seg_start, seg_end, full_text[seg_start:seg_end]))
                continue

            cursor = 0
            while cursor < len(part_text):
                piece = part_text[cursor : cursor + max_chars]
                if not piece:
                    break
                if cursor + max_chars < len(part_text):
                    split_at = max(piece.rfind(', '), piece.rfind('; '), piece.rfind(': '), piece.rfind(' '))
                    if split_at >= max_chars // 2:
                        piece = piece[: split_at + 1]
                clean = piece.strip()
                if clean:
                    local_start = part_text.find(clean, cursor)
                    seg_start = part_start + max(0, local_start)
                    seg_end = seg_start + len(clean)
                    if seg_end > seg_start:
                        segments.append((seg_start, seg_end, full_text[seg_start:seg_end]))
                cursor += max(1, len(piece))

    return segments


def _build_model_windows(segments: Sequence[Tuple[int, int, str]], *, target_chars: int = 260, stride: int = 1) -> Tuple[List[str], List[List[int]]]:
    windows: List[str] = []
    mapping: List[List[int]] = []
    if not segments:
        return windows, mapping

    i = 0
    while i < len(segments):
        chars = 0
        parts: List[str] = []
        member_indexes: List[int] = []
        j = i
        while j < len(segments) and chars < target_chars:
            txt = str(segments[j][2] or '').strip()
            if txt:
                parts.append(txt)
                member_indexes.append(j)
                chars += len(txt)
            j += 1
        if parts and member_indexes:
            windows.append(' '.join(parts))
            mapping.append(member_indexes)
        i += max(1, stride)

    return windows, mapping


def _project_window_probs_to_segments(segment_count: int, mapping: Sequence[Sequence[int]], window_probs: Sequence[float]) -> List[float]:
    if segment_count <= 0:
        return []
    buckets: List[List[float]] = [[] for _ in range(segment_count)]
    for idx, members in enumerate(mapping):
        prob = float(window_probs[idx]) if idx < len(window_probs) else 0.0
        for seg_idx in members:
            if 0 <= int(seg_idx) < segment_count:
                buckets[int(seg_idx)].append(prob)
    projected: List[float] = []
    for values in buckets:
        if not values:
            projected.append(0.0)
            continue
        mean_val = sum(values) / max(1, len(values))
        max_val = max(values)
        projected.append(_clamp01((0.65 * max_val) + (0.35 * mean_val)))
    return projected


def _collect_multiscale_model_probs(
    segments: Sequence[Tuple[int, int, str]],
    *,
    positive_label: str | None,
    enable_multiscale: bool,
) -> List[float]:
    if not segments:
        return []

    specs = [(180, 1), (260, 1), (340, 2)] if enable_multiscale else [(260, 1)]
    bucket: List[List[float]] = [[] for _ in range(len(segments))]

    for target_chars, stride in specs:
        windows, membership = _build_model_windows(segments, target_chars=target_chars, stride=stride)
        if not windows:
            continue
        probs = score_texts_with_ai_detector(windows, positive_label=positive_label)
        projected = _project_window_probs_to_segments(len(segments), membership, probs)
        for idx, score in enumerate(projected):
            bucket[idx].append(float(score))

    result: List[float] = []
    for values in bucket:
        if not values:
            result.append(0.0)
            continue
        ordered = sorted(values)
        mean_val = sum(ordered) / max(1, len(ordered))
        median_val = ordered[len(ordered) // 2]
        max_val = ordered[-1]
        result.append(_clamp01((0.40 * max_val) + (0.35 * mean_val) + (0.25 * median_val)))
    return result


def _trim_text_to_char_budget(start: int, end: int, text: str, char_budget: int) -> Tuple[int, int, str]:
    seg_len = max(0, int(end) - int(start))
    if char_budget >= seg_len:
        return int(start), int(end), text

    budget = max(24, int(char_budget))
    snippet = str(text or '')[:budget]
    if budget < len(text):
        split_at = max(snippet.rfind('. '), snippet.rfind(', '), snippet.rfind('; '), snippet.rfind(': '), snippet.rfind(' '))
        if split_at >= max(12, budget // 2):
            snippet = snippet[: split_at + 1]
    snippet = snippet.strip()
    trimmed_end = int(start) + len(snippet)
    if trimmed_end <= int(start):
        trimmed_end = min(int(end), int(start) + budget)
        snippet = str(text or '')[: max(1, trimmed_end - int(start))]
    return int(start), int(trimmed_end), snippet


def _severity_for_confidence(percent: int) -> str:
    if percent >= 80:
        return 'very_high'
    if percent >= 65:
        return 'high'
    if percent >= 45:
        return 'medium'
    return 'low'


def _sigmoid_stretch(x: float, *, center: float = 0.30, slope: float = 8.0) -> float:
    x = _clamp01(float(x))
    try:
        return _clamp01(1.0 / (1.0 + math.exp(-float(slope) * (x - float(center)))))
    except OverflowError:
        return 0.0 if x < center else 1.0


def _weighted_fraction(scores: Sequence[tuple[float, int]], threshold: float) -> float:
    total = sum(max(0, int(length)) for _, length in scores)
    if total <= 0:
        return 0.0
    kept = sum(max(0, int(length)) for score, length in scores if float(score) >= float(threshold))
    return float(kept / total)


def _weighted_quantile(scores: Sequence[tuple[float, int]], q: float) -> float:
    total = sum(max(0, int(length)) for _, length in scores)
    if total <= 0:
        return 0.0
    target = max(0.0, min(1.0, float(q))) * total
    acc = 0
    for score, length in sorted(scores, key=lambda item: item[0]):
        acc += max(0, int(length))
        if acc >= target:
            return _clamp01(float(score))
    return _clamp01(float(sorted(scores, key=lambda item: item[0])[-1][0]))


def _sentence_starter_risk(full_text: str) -> float:
    starters: list[str] = []
    for _s, _e, sent in split_sentences_with_offsets(full_text):
        toks = [w.lower() for w in _WORD.findall(sent)]
        if len(toks) >= 2:
            starters.append(' '.join(toks[:2]))
        elif toks:
            starters.append(toks[0])
    if len(starters) < 4:
        return 0.0
    counts: dict[str, int] = {}
    for starter in starters:
        counts[starter] = counts.get(starter, 0) + 1
    repeated = sum(count for count in counts.values() if count >= 2)
    ratio = repeated / max(1, len(starters))
    return _clamp01((ratio - 0.12) / 0.40)


def _paragraph_uniformity_risk(full_text: str) -> float:
    paras = [p.strip() for p in re.split(r'\n{2,}', full_text or '') if p.strip()]
    if len(paras) < 2:
        return 0.0
    lengths = [len(_WORD.findall(p)) for p in paras if p.strip()]
    if len(lengths) < 2:
        return 0.0
    mean = sum(lengths) / max(1, len(lengths))
    var = sum((x - mean) ** 2 for x in lengths) / max(1, len(lengths))
    cv = math.sqrt(max(0.0, var)) / max(1.0, mean)
    return _clamp01((0.45 - cv) / 0.35)


def _list_pattern_risk(full_text: str) -> float:
    lines = [ln.strip() for ln in (full_text or '').splitlines() if ln.strip()]
    if len(lines) < 4:
        return 0.0
    heading_like = sum(1 for ln in lines if ln.endswith(':') or len(ln.split()) <= 4)
    ratio = heading_like / max(1, len(lines))
    return _clamp01((ratio - 0.18) / 0.40)


def _rough_human_draft_signal(full_text: str, ling: Dict[str, float]) -> float:
    """Detect rough student draft cues before penalising them as AI-like polish."""
    text = full_text or ""
    lower_text = text.lower()
    tokens = [w.lower() for w in _WORD.findall(text)]
    if len(tokens) < 120:
        return 0.0

    sentences = split_sentences_with_offsets(text)
    lower_starts = 0
    for _start, _end, sentence in sentences:
        stripped = sentence.strip()
        if stripped and stripped[0].isalpha() and stripped[0].islower():
            lower_starts += 1

    lower_start_ratio = lower_starts / max(1, len(sentences))
    adjacent_repeats = sum(1 for left, right in zip(tokens, tokens[1:]) if left == right)
    missing_space_after_punct = len(re.findall(r"[.!?][A-Za-z]", text))
    slash_phrases = len(re.findall(r"\b\w+\s*/\s*\w+\b", text))
    first_person = sum(1 for tok in tokens if tok in {"i", "me", "my", "we", "us", "our"})
    first_person_per_100 = (first_person * 100.0) / max(1, len(tokens))
    contractions = len(
        re.findall(
            r"\b(?:it|there|they|we|you|that|isn|aren|don|doesn|didn|can|couldn|wouldn|shouldn|won|wasn|weren|hasn|haven|hadn)'[a-z]+\b",
            lower_text,
        )
    )
    informal_marks = text.count("!") + text.count("(") + text.count(")")
    sentence_lengths = [len(_WORD.findall(sentence)) for _start, _end, sentence in sentences]
    long_sentence_ratio = (
        sum(1 for length in sentence_lengths if length >= 30) / max(1, len(sentence_lengths))
    )

    lower_start_signal = _clamp01((lower_start_ratio - 0.06) / 0.20)
    adjacent_repeat_signal = _clamp01(float(adjacent_repeats))
    missing_space_signal = _clamp01(float(missing_space_after_punct))
    slash_signal = _clamp01(float(slash_phrases))
    first_person_signal = _clamp01((first_person_per_100 - 0.20) / 1.00)
    burstiness_signal = _clamp01((float(ling.get("burstiness", 0.0)) - 2.0) / 3.0)
    punctuation_signal = _clamp01((float(ling.get("punctuation_cadence", 0.0)) - 0.18) / 0.35)
    low_transition_signal = _clamp01((0.12 - float(ling.get("transition_density", 0.0))) / 0.12)
    contraction_signal = _clamp01((contractions - 1.0) / 5.0)
    informal_mark_signal = _clamp01(informal_marks / 3.0)
    long_sentence_signal = _clamp01((long_sentence_ratio - 0.12) / 0.28)

    return _clamp01(
        (0.22 * lower_start_signal)
        + (0.16 * adjacent_repeat_signal)
        + (0.14 * missing_space_signal)
        + (0.07 * slash_signal)
        + (0.12 * first_person_signal)
        + (0.11 * burstiness_signal)
        + (0.08 * punctuation_signal)
        + (0.10 * low_transition_signal)
        + (0.10 * contraction_signal)
        + (0.08 * informal_mark_signal)
        + (0.08 * long_sentence_signal)
    )


def _calibrated_document_score(
    *,
    heuristic_doc_score: float,
    weighted_model_score: float | None,
    weighted_segment_score: float,
    score_length_pairs: Sequence[tuple[float, int]],
    starter_risk: float,
    paragraph_uniformity_risk: float,
    list_risk: float,
    reference_ai_score: float,
    human_conformity: float,
    human_judgment_signal: float,
    enumerative_ai_signal: float,
    rough_human_draft_signal: float,
    transition_risk: float,
) -> float:
    prevalence_high = _weighted_fraction(score_length_pairs, 0.45)
    prevalence_medium = _weighted_fraction(score_length_pairs, 0.30)
    prevalence_low = _weighted_fraction(score_length_pairs, 0.20)
    p75 = _weighted_quantile(score_length_pairs, 0.75)
    p90 = _weighted_quantile(score_length_pairs, 0.90)

    stretched_segment = _sigmoid_stretch(weighted_segment_score, center=0.25, slope=7.0)
    stretched_model = _sigmoid_stretch(weighted_model_score or 0.0, center=0.24, slope=8.0) if weighted_model_score is not None else 0.0
    stretched_heuristic = _sigmoid_stretch(heuristic_doc_score, center=0.24, slope=7.0)
    stretched_reference = _sigmoid_stretch(reference_ai_score, center=0.44, slope=6.0)

    prevalence_signal = _clamp01(
        (0.44 * prevalence_high)
        + (0.28 * prevalence_medium)
        + (0.08 * prevalence_low)
        + (0.12 * p75)
        + (0.08 * p90)
    )

    structure_signal = _clamp01(
        (0.34 * starter_risk)
        + (0.26 * paragraph_uniformity_risk)
        + (0.16 * list_risk)
        + (0.24 * enumerative_ai_signal)
    )
    human_grounding_signal = _clamp01((0.62 * human_conformity) + (0.38 * human_judgment_signal))

    if weighted_model_score is None:
        overall = _clamp01(
            (0.29 * stretched_segment)
            + (0.24 * stretched_heuristic)
            + (0.18 * prevalence_signal)
            + (0.12 * structure_signal)
            + (0.17 * stretched_reference)
        )
    else:
        overall = _clamp01(
            (0.30 * stretched_model)
            + (0.18 * stretched_segment)
            + (0.18 * stretched_heuristic)
            + (0.13 * prevalence_signal)
            + (0.08 * structure_signal)
            + (0.13 * stretched_reference)
        )

    if human_grounding_signal >= 0.72 and reference_ai_score < 0.28 and prevalence_medium < 0.24:
        overall *= 0.50
    elif human_grounding_signal >= 0.66 and weighted_model_score is not None and weighted_model_score < 0.38 and prevalence_high < 0.18:
        overall *= max(0.58, 1.0 - (0.34 * (human_grounding_signal - 0.66) / 0.34))
    elif human_grounding_signal >= 0.62 and heuristic_doc_score < 0.38:
        overall *= max(0.68, 1.0 - (0.24 * (human_grounding_signal - 0.62) / 0.38))

    if reference_ai_score >= 0.62 and prevalence_low >= 0.32 and overall < 0.56:
        overall = max(overall, 0.56 + 0.18 * (reference_ai_score - 0.62))
    if prevalence_medium >= 0.55 and overall < 0.50:
        overall = max(overall, 0.50 + 0.22 * (prevalence_medium - 0.55))
    if prevalence_high >= 0.45 and overall < 0.62:
        overall = max(overall, 0.62 + 0.18 * (prevalence_high - 0.45))
    if structure_signal >= 0.55 and prevalence_low >= 0.65 and overall < 0.58:
        overall = max(overall, 0.58 + 0.16 * (structure_signal - 0.55))
    if heuristic_doc_score >= 0.55 and starter_risk >= 0.35 and prevalence_low >= 0.45 and overall < 0.60:
        overall = max(overall, 0.60 + 0.18 * (heuristic_doc_score - 0.55))
    if heuristic_doc_score >= 0.62 and starter_risk >= 0.45 and prevalence_medium >= 0.30 and overall < 0.70:
        overall = max(overall, 0.70 + 0.10 * (heuristic_doc_score - 0.62))
    if enumerative_ai_signal >= 0.36 and prevalence_medium >= 0.24 and overall < 0.64:
        overall = max(overall, 0.64 + 0.12 * (enumerative_ai_signal - 0.36))

    ai_template_signal = _clamp01(
        (0.62 * transition_risk)
        + (0.26 * enumerative_ai_signal)
        + (0.12 * list_risk)
    )
    weak_positive_ai_evidence = (
        reference_ai_score < 0.62
        and ai_template_signal < 0.30
        and prevalence_high < 0.50
        and (weighted_model_score is None or weighted_model_score < 0.48)
    )
    if weak_positive_ai_evidence:
        if (
            rough_human_draft_signal >= 0.30
            or (
                reference_ai_score < 0.52
                and ai_template_signal < 0.12
                and heuristic_doc_score < 0.42
            )
        ):
            overall = 0.0
        else:
            overall = min(overall, 0.38)

    if (
        rough_human_draft_signal >= 0.60
        and reference_ai_score < 0.50
        and enumerative_ai_signal < 0.20
        and prevalence_high < 0.34
        and (weighted_model_score is None or weighted_model_score < 0.48)
    ):
        overall = 0.0
    elif (
        rough_human_draft_signal >= 0.42
        and reference_ai_score < 0.52
        and prevalence_high < 0.40
        and (weighted_model_score is None or weighted_model_score < 0.52)
    ):
        overall *= max(0.42, 1.0 - (0.70 * rough_human_draft_signal))

    if reference_ai_score < 0.18 and heuristic_doc_score < 0.30 and prevalence_high < 0.16 and human_grounding_signal >= 0.56:
        overall = min(overall, 0.18 + (0.08 * prevalence_medium))
    elif prevalence_high < 0.12 and prevalence_medium < 0.24 and reference_ai_score < 0.35 and human_grounding_signal >= 0.64:
        overall = min(overall, 0.24)
    elif prevalence_high < 0.18 and prevalence_medium < 0.30 and weighted_model_score is not None and weighted_model_score < 0.36 and human_grounding_signal >= 0.58:
        overall = min(overall, 0.30)
    elif human_judgment_signal >= 0.30 and reference_ai_score < 0.42 and prevalence_high < 0.12 and weighted_model_score is not None and weighted_model_score < 0.34:
        overall = min(overall, 0.20 + (0.06 * prevalence_medium))

    return _clamp01(overall)


def _segment_scores(
    segments: Sequence[Tuple[int, int, str]],
    *,
    doc_mean_len: float,
    doc_var_len: float,
    model_probs: Sequence[float] | None,
    doc_risk: float,
    use_reference_profiles: bool,
) -> List[Tuple[int, int, str, float, List[str], int]]:
    doc_sd = math.sqrt(max(1e-6, float(doc_var_len)))
    uniformity_factor = _clamp01((12.0 - doc_sd) / 12.0)

    prev_tokens: Optional[set[str]] = None
    out: List[Tuple[int, int, str, float, List[str], int]] = []

    for idx, (start, end, sent) in enumerate(segments):
        txt = sent.strip()
        if not txt or _is_meta_or_heading_segment(txt):
            continue
        lower = txt.lower()
        tokens = [w.lower() for w in _WORD.findall(txt)]
        token_set = set(tokens)
        seg_len = max(0, int(end) - int(start))
        reasons: List[str] = []

        trans_hit = any(p in lower for p in _TRANSITION_PHRASES)
        if trans_hit:
            reasons.append("templated transition phrase")

        rep2 = _ngram_repetition_ratio(tokens, 2)
        rep3 = _ngram_repetition_ratio(tokens, 3)
        rep_risk = max(_clamp01((rep2 - 0.02) / 0.10), _clamp01((rep3 - 0.001) / 0.020))
        if rep_risk >= 0.55:
            reasons.append("high local repetition")

        overlap_risk = 0.0
        if prev_tokens is not None and token_set:
            j = _jaccard(prev_tokens, token_set)
            overlap_risk = _clamp01((j - 0.08) / 0.20)
            if overlap_risk >= 0.55:
                reasons.append("high adjacent overlap")
        prev_tokens = token_set

        sent_len = len(tokens)
        if doc_mean_len <= 0:
            len_risk = 0.0
        else:
            dev = abs(sent_len - doc_mean_len) / max(1.0, doc_mean_len)
            len_risk = uniformity_factor * _clamp01((0.25 - dev) / 0.25)
            if len_risk >= 0.55 and uniformity_factor >= 0.35:
                reasons.append("uniform structure")

        human_discourse = _human_discourse_density(txt)
        human_judgment = _human_judgment_density(txt)
        enumerative_ai = _enumerative_ai_density(txt)
        if human_discourse >= 0.35:
            reasons.append("nuanced human-style discourse")
        if human_judgment >= 0.28:
            reasons.append("evidence-weighing / human judgment signal")
        if enumerative_ai >= 0.28:
            reasons.append("enumerative AI-style structuring")

        repeated_starter_hit = False
        if len(tokens) >= 2:
            starter = ' '.join(tokens[:2])
            if starter in {"it is", "this is", "there are", "there is", "known for", "has a", "has many", "one of", "in addition", "for example", "to begin", "another important"}:
                repeated_starter_hit = True
                reasons.append("formulaic sentence starter")

        local_risk = _clamp01(
            0.20 * (1.0 if trans_hit else 0.0)
            + 0.20 * rep_risk
            + 0.16 * overlap_risk
            + 0.12 * len_risk
            + 0.14 * (1.0 if repeated_starter_hit else 0.0)
            + 0.18 * enumerative_ai
        )
        human_local_counter = _clamp01(
            0.42 * human_discourse
            + 0.34 * human_judgment
            + 0.24 * (1.0 if len(tokens) >= 18 and not trans_hit and rep_risk < 0.18 else 0.0)
        )

        reference_ai_score = 0.0
        human_conformity = 0.0
        if use_reference_profiles and len(tokens) >= 10:
            try:
                ref_cmp = compare_against_reference_profiles(txt)
                reference_ai_score = _clamp01(float(ref_cmp.ai_style_score))
                human_conformity = _clamp01(float(ref_cmp.human_conformity))
                if reference_ai_score >= 0.62:
                    reasons.append("reference style resembles AI-typical phrasing")
                elif human_conformity >= 0.64:
                    reasons.append("reference profile is consistent with human writing")
            except Exception:
                reference_ai_score = 0.0
                human_conformity = 0.0

        raw_model_risk = _clamp01(float(model_probs[idx])) if model_probs and idx < len(model_probs) else 0.0
        model_risk = _sigmoid_stretch(raw_model_risk, center=0.24, slope=8.0) if raw_model_risk > 0.0 else 0.0
        if raw_model_risk >= 0.60:
            reasons.append("RoBERTa multi-window AI-authorship signal")
        elif raw_model_risk >= 0.40:
            reasons.append("moderate AI-authorship signal")
        elif raw_model_risk >= 0.24:
            reasons.append("low-but-consistent AI-authorship signal")

        if raw_model_risk > 0.0:
            combined = _clamp01(
                (0.34 * model_risk)
                + (0.20 * local_risk)
                + (0.16 * float(doc_risk))
                + (0.12 * reference_ai_score)
                + (0.08 * max(0.0, 1.0 - human_conformity))
                + (0.05 * max(0.0, 1.0 - human_local_counter))
                + (0.05 * enumerative_ai)
            )
        else:
            combined = _clamp01(
                (0.36 * local_risk)
                + (0.22 * float(doc_risk))
                + (0.18 * reference_ai_score)
                + (0.08 * max(0.0, 1.0 - human_conformity))
                + (0.08 * max(0.0, 1.0 - human_local_counter))
                + (0.08 * enumerative_ai)
            )

        if human_local_counter >= 0.45 and raw_model_risk < 0.36 and reference_ai_score < 0.40:
            combined *= 0.50
        elif human_conformity >= 0.68 and raw_model_risk < 0.28 and local_risk < 0.35:
            combined *= 0.68
        elif human_conformity >= 0.60 and human_local_counter >= 0.35 and raw_model_risk < 0.34:
            combined *= 0.60
        if human_judgment >= 0.30 and raw_model_risk < 0.34 and reference_ai_score < 0.44:
            combined *= 0.72
        if enumerative_ai >= 0.34 and (raw_model_risk >= 0.34 or reference_ai_score >= 0.52):
            combined = max(combined, _clamp01(0.20 + 0.65 * max(raw_model_risk, reference_ai_score, enumerative_ai)))

        out.append((int(start), int(end), txt, float(combined), reasons, seg_len))

    return out


def _select_segments_for_target_coverage(
    ranked: Sequence[Tuple[int, int, str, float, List[str], int]],
    *,
    target_chars: int,
    total_chars: int,
    overall_percent: int,
) -> List[Tuple[int, int, str, float, List[str], int, int, int, str]]:
    if not ranked or target_chars <= 0:
        return []

    selected: List[Tuple[int, int, str, float, List[str], int, int, int, str]] = []
    covered = 0
    min_score = 0.18 if overall_percent >= 45 else 0.22 if overall_percent >= 30 else 0.26
    contribution_used = 0.0
    total_target_contribution = float(overall_percent) / 100.0

    for idx, row in enumerate(ranked):
        start, end, txt, score, reasons, seg_len = row
        if float(score) < min_score:
            continue
        if covered >= target_chars:
            break
        remaining = target_chars - covered
        if remaining <= 0:
            break
        take_len = seg_len if seg_len <= remaining else remaining
        take_start, take_end, take_text = _trim_text_to_char_budget(start, end, txt, take_len)
        actual_len = max(0, take_end - take_start)
        if actual_len <= 0:
            continue
        coverage_percent = int(round(actual_len * 100 / max(1, total_chars)))
        raw_contribution = float(score) * (actual_len / max(1, total_chars))
        contribution_used += raw_contribution
        contribution_percent = int(round(raw_contribution * 100))
        confidence_percent = int(round(_clamp01(float(score)) * 100))
        severity = _severity_for_confidence(confidence_percent)
        selected.append((take_start, take_end, take_text, score, list(reasons), actual_len, coverage_percent, contribution_percent, severity))
        covered += actual_len

    if selected and covered < int(target_chars * 0.95):
        remaining = target_chars - covered
        for row in ranked:
            start, end, txt, score, reasons, seg_len = row
            if any(existing[0] == start and existing[1] == end for existing in selected):
                continue
            take_start, take_end, take_text = _trim_text_to_char_budget(start, end, txt, remaining)
            actual_len = max(0, take_end - take_start)
            if actual_len <= 0:
                continue
            coverage_percent = int(round(actual_len * 100 / max(1, total_chars)))
            raw_contribution = float(score) * (actual_len / max(1, total_chars))
            contribution_percent = int(round(raw_contribution * 100))
            confidence_percent = int(round(_clamp01(float(score)) * 100))
            severity = _severity_for_confidence(confidence_percent)
            selected.append((take_start, take_end, take_text, score, list(reasons), actual_len, coverage_percent, contribution_percent, severity))
            covered += actual_len
            if covered >= target_chars:
                break

    return selected

def _merge_selected_segments(selected: Sequence[Tuple[int, int, str, float, List[str], int, int, int, str]]) -> List[AIRiskSpan]:
    if not selected:
        return []

    ordered = sorted(selected, key=lambda row: (row[0], row[1]))
    merged: List[dict] = []
    for start, end, txt, score, reasons, _seg_len, coverage_percent, contribution_percent, severity in ordered:
        if not merged:
            merged.append({
                "start": int(start),
                "end": int(end),
                "score": float(score),
                "texts": [txt],
                "reasons": list(reasons),
                "coverage_percent": int(coverage_percent),
                "contribution_percent": int(contribution_percent),
                "severity": severity,
            })
            continue
        last = merged[-1]
        if int(start) <= int(last["end"]) + 2 and severity == last["severity"]:
            last["end"] = max(int(last["end"]), int(end))
            last["score"] = max(float(last["score"]), float(score))
            last["coverage_percent"] += int(coverage_percent)
            last["contribution_percent"] += int(contribution_percent)
            if txt:
                last["texts"].append(txt)
            for reason in reasons:
                if reason not in last["reasons"]:
                    last["reasons"].append(reason)
        else:
            merged.append({
                "start": int(start),
                "end": int(end),
                "score": float(score),
                "texts": [txt],
                "reasons": list(reasons),
                "coverage_percent": int(coverage_percent),
                "contribution_percent": int(contribution_percent),
                "severity": severity,
            })

    spans: List[AIRiskSpan] = []
    for item in merged:
        preview = " ".join(t.strip() for t in item["texts"] if t.strip()).strip()
        preview = preview[:160] + ("…" if len(preview) > 160 else "")
        spans.append(
            AIRiskSpan(
                start=int(item["start"]),
                end=int(item["end"]),
                confidence_percent=int(round(_clamp01(float(item["score"])) * 100)),
                text_preview=preview,
                reasons=list(item["reasons"]),
                severity=str(item.get("severity") or _severity_for_confidence(int(round(_clamp01(float(item["score"])) * 100)))),
                coverage_percent=int(item.get("coverage_percent") or 0),
                contribution_percent=int(item.get("contribution_percent") or 0),
            )
        )
    return spans


def _normalize_span_contributions(spans: Sequence[AIRiskSpan], overall_percent: int) -> List[AIRiskSpan]:
    if not spans or overall_percent <= 0:
        return list(spans)

    raw_total = sum(max(0, int(span.contribution_percent)) for span in spans)
    if raw_total <= 0:
        return list(spans)

    scaled = [
        max(0.0, int(span.contribution_percent)) * float(overall_percent) / float(raw_total)
        for span in spans
    ]
    floors = [int(math.floor(value)) for value in scaled]
    remainder = int(overall_percent) - sum(floors)
    if remainder > 0:
        order = sorted(
            range(len(scaled)),
            key=lambda idx: (scaled[idx] - floors[idx], scaled[idx]),
            reverse=True,
        )
        for idx in order[:remainder]:
            floors[idx] += 1

    return [
        AIRiskSpan(
            start=span.start,
            end=span.end,
            confidence_percent=span.confidence_percent,
            text_preview=span.text_preview,
            reasons=span.reasons,
            severity=span.severity,
            coverage_percent=span.coverage_percent,
            contribution_percent=floors[idx],
        )
        for idx, span in enumerate(spans)
    ]


def compute_ai_risk(full_text: str) -> AIRiskResult:
    cfg = get_ai_risk_config()
    model_cfg = get_ai_model_config()
    if not cfg.enabled:
        return AIRiskResult(0.0, 0, "low", False, [], note="AI analysis disabled.", components=None)

    base = stylometry_features(full_text)
    wc = int(base.get("word_count", 0) or 0)
    if wc < int(cfg.min_words):
        return AIRiskResult(
            risk_score=0.0,
            risk_percent=0,
            risk_level="low",
            detected=False,
            spans=[],
            note=f"Text too short for AI risk scoring (min {cfg.min_words} words).",
            error="Content too short to analyze for AI-generated text.",
            components=None,
        )

    ling = linguistic_features(full_text)
    comps = _document_risk_components(full_text, base, ling)
    human_profile_signal = 0.0
    reference_ai_score = 0.0
    reference_error: str | None = None
    if cfg.enable_reference_profiles:
        try:
            ref_cmp = compare_against_reference_profiles(full_text)
            human_profile_signal = float(ref_cmp.human_conformity)
            reference_ai_score = float(ref_cmp.ai_style_score)
        except Exception as exc:
            reference_error = f"reference profiles unavailable: {exc}"
            human_profile_signal = 0.0
            reference_ai_score = 0.0

    human_counter_signal = _clamp01(
        (0.13 * float(comps.get("human_hedge_signal", 0.0)))
        + (0.10 * float(comps.get("human_modal_signal", 0.0)))
        + (0.14 * float(comps.get("human_starter_diversity", 0.0)))
        + (0.10 * float(comps.get("human_punctuation_var", 0.0)))
        + (0.12 * float(comps.get("human_structural_variation", 0.0)))
        + (0.10 * float(comps.get("human_citation_signal", 0.0)))
        + (0.09 * float(comps.get("human_contrast_signal", 0.0)))
        + (0.06 * float(comps.get("human_example_signal", 0.0)))
        + (0.04 * float(comps.get("human_revision_signal", 0.0)))
        + (0.12 * float(comps.get("human_judgment_signal", 0.0)))
    )

    weights = {
        "burstiness": float(cfg.w_burstiness),
        "repetition2": float(cfg.w_repetition2),
        "repetition3": float(cfg.w_repetition3),
        "coherence": float(cfg.w_coherence),
        "lexical": float(cfg.w_lexical),
        "transition": float(cfg.w_transition),
        "structure": float(cfg.w_structure),
        "reference_ai": float(cfg.w_reference_ai),
        "reference_human": float(cfg.w_reference_human),
    }

    scoring_components = {
        "burstiness": float(comps.get("burstiness", 0.0)),
        "repetition2": float(comps.get("repetition2", 0.0)),
        "repetition3": float(comps.get("repetition3", 0.0)),
        "coherence": float(comps.get("coherence", 0.0)),
        "lexical": float(comps.get("lexical", 0.0)),
        "transition": float(comps.get("transition", 0.0)),
        "structure": float(comps.get("structure", 0.0)),
        "reference_ai": float(reference_ai_score),
        "reference_human": float(max(0.0, 1.0 - max(human_profile_signal, human_counter_signal))),
    }
    heuristic_doc_score = _normalize_weighted(scoring_components, weights)

    components = {k: float(v) for k, v in comps.items()}
    components["reference_ai"] = float(reference_ai_score)
    components["human_profile_signal"] = float(human_profile_signal)
    components["human_counter_signal"] = float(human_counter_signal)
    components["heuristic_document"] = float(heuristic_doc_score)
    components["enumerative_ai_signal"] = float(comps.get("enumerative_ai_signal", 0.0))

    segments = _segment_text_with_offsets(full_text, max_chars=120)
    if not segments:
        return AIRiskResult(0.0, 0, "low", False, [], note="No analyzable text segments found.", components=components)

    model_probs: List[float] = []
    model_error: str | None = None
    if model_cfg.enabled:
        try:
            model_probs = _collect_multiscale_model_probs(
                segments,
                positive_label=model_cfg.positive_label,
                enable_multiscale=bool(cfg.enable_multiscale_windows),
            )
        except Exception as exc:
            model_error = f"AI detector unavailable: {exc}"
            model_probs = []

    segment_rows = _segment_scores(
        segments,
        doc_mean_len=float(ling.get("sentence_len_mean", 0.0)),
        doc_var_len=float(ling.get("sentence_len_var", 0.0)),
        model_probs=model_probs,
        doc_risk=float(heuristic_doc_score),
        use_reference_profiles=bool(cfg.enable_reference_profiles),
    )

    total_chars = max(1, sum(row[5] for row in segment_rows))
    weighted_segment_score = sum((row[3] * row[5]) for row in segment_rows) / total_chars
    weighted_model_score = None
    if model_probs:
        weighted_model_score = sum((float(model_probs[idx]) * segment_rows[idx][5]) for idx in range(min(len(model_probs), len(segment_rows)))) / total_chars
        components["model_document"] = float(weighted_model_score)

    starter_risk = _sentence_starter_risk(full_text)
    paragraph_uniformity_risk = _paragraph_uniformity_risk(full_text)
    list_risk = _list_pattern_risk(full_text)
    rough_human_draft_signal = _rough_human_draft_signal(full_text, ling)
    components["sentence_starter"] = float(starter_risk)
    components["paragraph_uniformity"] = float(paragraph_uniformity_risk)
    components["list_pattern"] = float(list_risk)
    components["rough_human_draft_signal"] = float(rough_human_draft_signal)

    score_length_pairs = [(float(row[3]), int(row[5])) for row in segment_rows]
    overall_score = _calibrated_document_score(
        heuristic_doc_score=float(heuristic_doc_score),
        weighted_model_score=weighted_model_score,
        weighted_segment_score=float(weighted_segment_score),
        score_length_pairs=score_length_pairs,
        starter_risk=float(starter_risk),
        paragraph_uniformity_risk=float(paragraph_uniformity_risk),
        list_risk=float(list_risk),
        reference_ai_score=float(reference_ai_score),
        human_conformity=float(max(human_profile_signal, human_counter_signal)),
        human_judgment_signal=float(comps.get("human_judgment_signal", 0.0)),
        enumerative_ai_signal=float(comps.get("enumerative_ai_signal", 0.0)),
        rough_human_draft_signal=float(rough_human_draft_signal),
        transition_risk=float(comps.get("transition", 0.0)),
    )

    percent = int(round(overall_score * 100))
    lvl = _level(percent, medium_at=int(cfg.level_medium_at), high_at=int(cfg.level_high_at))
    detected = bool(percent >= int(cfg.threshold_percent))

    ranked = sorted(segment_rows, key=lambda row: (-row[3], row[0]))
    target_chars = int(round(total_chars * (percent / 100.0)))
    selected = _select_segments_for_target_coverage(
        ranked,
        target_chars=target_chars,
        total_chars=total_chars,
        overall_percent=percent,
    )

    if not selected and ranked and percent > 0:
        selected = _select_segments_for_target_coverage(
            ranked[:1],
            target_chars=min(ranked[0][5], max(24, target_chars)),
            total_chars=total_chars,
            overall_percent=percent,
        )

    spans = _normalize_span_contributions(_merge_selected_segments(selected), percent)

    note_parts: List[str] = []
    if model_error:
        note_parts.append(model_error)
    elif model_probs:
        note_parts.append("AI highlights use RoBERTa multi-window scoring")
    else:
        note_parts.append("AI highlights use explainable local AI-risk scoring")
    if cfg.enable_reference_profiles:
        if reference_error:
            note_parts.append(reference_error)
        else:
            note_parts.append("reference-profile calibration against bundled human and AI-style corpora")
    note_parts.append("structural/stylometric calibration, discourse-aware human dampening, and anchored span selection")
    note = "; ".join(note_parts) + "."

    return AIRiskResult(
        risk_score=float(overall_score),
        risk_percent=int(percent),
        risk_level=str(lvl),
        detected=bool(detected),
        spans=spans,
        components=components,
        error=model_error,
        note=note,
    )
