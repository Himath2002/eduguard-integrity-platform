from __future__ import annotations

import math
import os
import re
from typing import Dict, List, Tuple

from .ai_config import get_ai_risk_config

_WORD = re.compile(r"\b\w+\b", re.UNICODE)
_SENT_RE = re.compile(r"(?s)\S.*?(?:[.!?]+(?=\s)|$)")
_YEAR_RE = re.compile(r"\((?:19|20)\d{2}[a-z]?\)")
_BRACKET_CITATION_RE = re.compile(r"\[[0-9,;\-\s]+\]")

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
    "for this reason",
    "to begin with",
    "another important point",
)

_HEDGES = {
    "may", "might", "could", "suggest", "suggests", "appear", "appears", "likely", "possibly",
    "perhaps", "arguably", "often", "generally", "typically", "seems", "seem", "indicate", "indicates",
}
_MODAL_VERBS = {
    "can", "could", "may", "might", "must", "should", "would", "will", "shall"
}

_HUMAN_CONTRAST_PHRASES = (
    "however",
    "although",
    "while",
    "yet",
    "rather than",
    "in practice",
    "by contrast",
    "even when",
    "later",
    "instead of",
)

_HUMAN_EXAMPLE_PHRASES = (
    "for example",
    "for instance",
    "such as",
    "in one case",
    "for this reason",
    "that said",
)

_HUMAN_REVISION_PHRASES = (
    "on the other hand",
    "at first",
    "after reading",
    "after reviewing",
    "after comparing",
    "in this sense",
    "this process",
)

_NUMERIC_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def split_sentences_with_offsets(text: str) -> List[Tuple[int, int, str]]:
    """Split text into sentences with stable (start, end, sentence_text) offsets."""
    t = text or ""
    out: List[Tuple[int, int, str]] = []
    for m in _SENT_RE.finditer(t):
        s = m.start()
        e = m.end()
        raw = t[s:e]
        sent = raw.strip()
        if not sent:
            continue
        left_ws = len(raw) - len(raw.lstrip())
        right_ws = len(raw) - len(raw.rstrip())
        s2 = s + left_ws
        e2 = e - right_ws
        if e2 > s2:
            out.append((s2, e2, t[s2:e2]))
    return out


def stylometry_features(text: str) -> Dict[str, float]:
    t = (text or "").strip()
    if not t:
        return {
            "char_len": 0.0,
            "word_count": 0.0,
            "avg_word_len": 0.0,
            "unique_ratio": 0.0,
            "punct_ratio": 0.0,
        }

    words = [w.lower() for w in _WORD.findall(t)]
    wc = len(words) or 1
    unique = len(set(words))
    avg_wl = sum(len(w) for w in words) / wc
    punct = sum(1 for ch in t if ch in ".,;:!?")
    return {
        "char_len": float(len(t)),
        "word_count": float(len(words)),
        "avg_word_len": float(avg_wl),
        "unique_ratio": float(unique / wc),
        "punct_ratio": float(punct / max(1, len(t))),
    }


def _ngram_repetition_ratio(tokens: List[str], n: int) -> float:
    if len(tokens) < n or n <= 0:
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


def _paragraph_lengths(text: str) -> List[int]:
    paras = [p.strip() for p in re.split(r"\n{2,}", text or "") if p.strip()]
    lengths = [len(_WORD.findall(p)) for p in paras if p.strip()]
    return [ln for ln in lengths if ln > 0]


def linguistic_features(text: str) -> Dict[str, float]:
    """Compute explainable AI-related linguistic features.

    These signals stay inside the approved stack and are cheap enough to run in the
    request/worker path on both macOS and Windows.
    """
    t = (text or "").strip()
    if not t:
        return {
            "sentence_len_mean": 0.0,
            "sentence_len_var": 0.0,
            "burstiness": 0.0,
            "repetition_2gram": 0.0,
            "repetition_3gram": 0.0,
            "coherence_proxy": 0.0,
            "transition_density": 0.0,
            "sentence_starter_diversity": 0.0,
            "paragraph_length_cv": 0.0,
            "hedge_density": 0.0,
            "modal_density": 0.0,
            "punctuation_cadence": 0.0,
            "citation_density": 0.0,
            "contrast_density": 0.0,
            "example_density": 0.0,
            "revision_density": 0.0,
            "numeric_detail_density": 0.0,
        }

    sents = split_sentences_with_offsets(t)
    sent_lens = [len(_WORD.findall(s)) for _, _, s in sents if s]
    if not sent_lens:
        sent_lens = [len(_WORD.findall(t))]

    mean = sum(sent_lens) / max(1, len(sent_lens))
    var = sum((x - mean) ** 2 for x in sent_lens) / max(1, len(sent_lens))
    burstiness = float(var / max(1e-6, mean))

    tokens = [w.lower() for w in _WORD.findall(t)]
    rep2 = _ngram_repetition_ratio(tokens, 2)
    rep3 = _ngram_repetition_ratio(tokens, 3)

    sent_token_sets: List[set[str]] = [set(w.lower() for w in _WORD.findall(s)) for _, _, s in sents[:140] if s]
    if len(sent_token_sets) >= 2:
        coherences = [_jaccard(sent_token_sets[i], sent_token_sets[i + 1]) for i in range(len(sent_token_sets) - 1)]
        coherence_proxy = float(sum(coherences) / max(1, len(coherences)))
    else:
        coherence_proxy = 0.0

    transitions = sum(1 for _, _, s in sents if any(phrase in s.lower() for phrase in _TRANSITION_PHRASES))
    transition_density = float(transitions / max(1, len(sents)))

    starters = []
    for _, _, s in sents:
        toks = [w.lower() for w in _WORD.findall(s)]
        if len(toks) >= 2:
            starters.append(" ".join(toks[:2]))
        elif toks:
            starters.append(toks[0])
    sentence_starter_diversity = float(len(set(starters)) / max(1, len(starters))) if starters else 0.0

    para_lengths = _paragraph_lengths(t)
    if len(para_lengths) >= 2:
        para_mean = sum(para_lengths) / max(1, len(para_lengths))
        para_var = sum((x - para_mean) ** 2 for x in para_lengths) / max(1, len(para_lengths))
        paragraph_length_cv = float(math.sqrt(max(0.0, para_var)) / max(1.0, para_mean))
    else:
        paragraph_length_cv = 0.0

    hedge_density = float(sum(1 for tok in tokens if tok in _HEDGES) / max(1, len(tokens)))
    modal_density = float(sum(1 for tok in tokens if tok in _MODAL_VERBS) / max(1, len(tokens)))

    punct_per_sentence = [sum(1 for ch in s if ch in ".,;:!?") for _, _, s in sents if s]
    if punct_per_sentence:
        pmean = sum(punct_per_sentence) / max(1, len(punct_per_sentence))
        pvar = sum((x - pmean) ** 2 for x in punct_per_sentence) / max(1, len(punct_per_sentence))
        punctuation_cadence = float(math.sqrt(max(0.0, pvar)) / max(1.0, pmean or 1.0))
    else:
        punctuation_cadence = 0.0

    citations = len(_YEAR_RE.findall(t)) + len(_BRACKET_CITATION_RE.findall(t)) + t.lower().count("et al")
    citation_density = float(citations / max(1, len(sents) or 1))

    lower_t = t.lower()
    contrast_hits = sum(lower_t.count(phrase) for phrase in _HUMAN_CONTRAST_PHRASES)
    example_hits = sum(lower_t.count(phrase) for phrase in _HUMAN_EXAMPLE_PHRASES)
    revision_hits = sum(lower_t.count(phrase) for phrase in _HUMAN_REVISION_PHRASES)
    numeric_hits = len(_NUMERIC_RE.findall(t))
    contrast_density = float(contrast_hits / max(1, len(sents) or 1))
    example_density = float(example_hits / max(1, len(sents) or 1))
    revision_density = float(revision_hits / max(1, len(sents) or 1))
    numeric_detail_density = float(numeric_hits / max(1, len(tokens) or 1))

    feats: Dict[str, float] = {
        "sentence_len_mean": float(mean),
        "sentence_len_var": float(var),
        "burstiness": float(burstiness),
        "repetition_2gram": float(rep2),
        "repetition_3gram": float(rep3),
        "coherence_proxy": float(coherence_proxy),
        "transition_density": float(transition_density),
        "sentence_starter_diversity": float(sentence_starter_diversity),
        "paragraph_length_cv": float(paragraph_length_cv),
        "hedge_density": float(hedge_density),
        "modal_density": float(modal_density),
        "punctuation_cadence": float(punctuation_cadence),
        "citation_density": float(citation_density),
        "contrast_density": float(contrast_density),
        "example_density": float(example_density),
        "revision_density": float(revision_density),
        "numeric_detail_density": float(numeric_detail_density),
    }

    cfg = get_ai_risk_config()
    if cfg.enable_perplexity:
        try:
            feats["perplexity"] = float(proxy_perplexity(t, max_chars=4000))
        except Exception:
            pass

    return feats


def proxy_perplexity(text: str, max_chars: int = 4000) -> float:
    """Optional perplexity using a small LM (disabled by default)."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch

    snippet = (text or "")[:max_chars]
    if not snippet.strip():
        return 0.0

    model_name = os.getenv("AI_PERPLEXITY_MODEL", "distilgpt2")
    tok = AutoTokenizer.from_pretrained(model_name)
    mdl = AutoModelForCausalLM.from_pretrained(model_name)
    mdl.eval()

    enc = tok(snippet, return_tensors="pt", truncation=True, max_length=tok.model_max_length)
    with torch.no_grad():
        out = mdl(**enc, labels=enc["input_ids"])
        loss = float(out.loss)
    return float(math.exp(loss))
