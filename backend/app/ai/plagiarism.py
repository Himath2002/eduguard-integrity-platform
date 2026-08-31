from __future__ import annotations

import hashlib
import os
import platform
import re
import threading
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .chunking import split_sentences
from .models import get_sbert_model, score_pairs_with_plagiarism_reranker
from .normalization import normalize_text, prepare_text_for_similarity


_WORD_RE = re.compile(r"[A-Za-z0-9']+")
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by", "for", "from",
    "had", "has", "have", "he", "her", "his", "i", "in", "into", "is", "it", "its", "of", "on",
    "or", "that", "the", "their", "them", "they", "this", "to", "was", "were", "will", "with",
    "you", "your", "we", "our", "us", "can", "could", "should", "would", "may", "might", "than",
    "then", "when", "while", "also", "there", "here", "these", "those", "which", "who", "whom",
}


def _env_true(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "y", "on"}


def _configure_runtime_stability() -> None:
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    if platform.system() == "Darwin":
        os.environ.setdefault("OMP_NUM_THREADS", "1")
        os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
        os.environ.setdefault("MKL_NUM_THREADS", "1")
        os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
        os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")


_configure_runtime_stability()


@dataclass
class SimilarityMatch:
    query_chunk_id: int
    query_text: str
    source_doc_id: str
    source_chunk_id: int
    source_text: str
    score: float
    shared_phrases: List[str]
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    source_path: Optional[str] = None
    class_id: Optional[int] = None
    assignment_id: Optional[int] = None
    evidence_ratio: float = 0.0
    semantic_strength: float = 0.0
    lexical_overlap: float = 0.0
    sequence_ratio: float = 0.0
    phrase_coverage: float = 0.0
    rerank_score: float = 0.0
    alignment_score: float = 0.0
    longest_phrase_tokens: int = 0
    query_window_text: str = ""
    source_window_text: str = ""
    pair_semantic_score: float = 0.0
    match_type: str = "semantic_supported"


@dataclass
class PlagiarismResult:
    overall_score: float
    matches: List[SimilarityMatch]
    model_name: str
    index_type: str


@dataclass
class _CachedIndex:
    signature: str
    index_type: str
    index_obj: Any
    texts: List[str]
    doc_ids: List[str]
    chunk_ids: List[int]
    metas: List[Dict[str, Any]]
    built_at: float


@dataclass
class _Candidate:
    query_chunk_id: int
    query_text: str
    source_type: str
    source_doc_id: str
    source_chunk_id: int
    source_text: str
    source_name: Optional[str]
    source_path: Optional[str]
    class_id: Optional[int]
    assignment_id: Optional[int]
    retrieval_score: float
    refined_query_text: str = ""
    refined_source_text: str = ""
    shared_phrases: List[str] = None  # type: ignore[assignment]
    lexical_overlap: float = 0.0
    sequence_ratio: float = 0.0
    phrase_coverage: float = 0.0
    alignment_score: float = 0.0
    longest_phrase_tokens: int = 0
    rerank_score: float = 0.0
    pair_semantic_score: float = 0.0
    evidence_ratio: float = 0.0
    semantic_strength: float = 0.0
    match_type: str = "semantic_supported"

    def __post_init__(self) -> None:
        if self.shared_phrases is None:
            self.shared_phrases = []


def _faiss_enabled() -> bool:
    if _env_true("PLAG_FORCE_FAISS", "0"):
        return True
    if _env_true("PLAG_DISABLE_FAISS", "0"):
        return False
    # macOS ARM builds have shown unstable OpenMP/FAISS crashes in local dev.
    return platform.system() == "Linux"


def _try_faiss():
    if not _faiss_enabled():
        return None
    try:
        import faiss  # type: ignore
        try:
            faiss.omp_set_num_threads(int(os.getenv("FAISS_OMP_THREADS", "1")))
        except Exception:
            pass
        return faiss
    except Exception:
        return None


_INDEX_CACHE: Dict[str, _CachedIndex] = {}
_INDEX_CACHE_LOCK = threading.Lock()
_MAX_CACHE_ITEMS = int(os.getenv("PLAG_INDEX_CACHE_ITEMS", "6"))


def embed_texts(texts: List[str]) -> np.ndarray:
    mode = os.getenv("PLAG_EMBEDDING", "sbert").strip().lower()
    if mode in {"hash", "lexical"}:
        from sklearn.feature_extraction.text import HashingVectorizer
        from sklearn.preprocessing import normalize

        dim = int(os.getenv("HASH_EMBED_DIM", "2048"))
        hv = HashingVectorizer(
            n_features=dim,
            alternate_sign=False,
            norm=None,
            ngram_range=(1, 2),
        )
        X = hv.transform(texts)
        X = normalize(X, norm="l2")
        return X.astype("float32").toarray()

    try:
        model = get_sbert_model()
        emb = model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
            batch_size=int(os.getenv("SBERT_BATCH_SIZE", "16")),
        )
        return emb.astype("float32")
    except Exception:
        from sklearn.feature_extraction.text import HashingVectorizer
        from sklearn.preprocessing import normalize

        hv = HashingVectorizer(
            n_features=2048,
            alternate_sign=False,
            norm=None,
            ngram_range=(1, 2),
        )
        X = hv.transform(texts)
        X = normalize(X, norm="l2")
        return X.astype("float32").toarray()


def _corpus_signature(records: List[Dict[str, Any]], source_type: str) -> str:
    h = hashlib.sha1()
    h.update(str(source_type).encode("utf-8"))
    h.update(str(len(records)).encode("utf-8"))
    for record in records:
        h.update(str(record.get("doc_id", "")).encode("utf-8"))
        h.update(b"|")
        h.update(str(record.get("chunk_id", 0)).encode("utf-8"))
        h.update(b"|")
        text = str(record.get("text", ""))
        h.update(str(len(text)).encode("utf-8"))
        h.update(b"|")
        h.update(text[:96].encode("utf-8", "ignore"))
        h.update(b"\n")
    return h.hexdigest()


def _build_index_for_records(records: List[Dict[str, Any]], source_type: str) -> _CachedIndex:
    texts = [str(r.get("text", "")) for r in records]
    embeddings = embed_texts(texts)
    faiss = _try_faiss()
    if faiss:
        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings)
        index_type = "faiss"
        index_obj = index
    else:
        index_type = "numpy"
        index_obj = embeddings

    return _CachedIndex(
        signature=_corpus_signature(records, source_type),
        index_type=index_type,
        index_obj=index_obj,
        texts=texts,
        doc_ids=[str(r.get("doc_id", "")) for r in records],
        chunk_ids=[int(r.get("chunk_id", 0) or 0) for r in records],
        metas=[dict(r) for r in records],
        built_at=time.time(),
    )


def _get_cached_index(records: List[Dict[str, Any]], source_type: str) -> _CachedIndex:
    signature = _corpus_signature(records, source_type)
    cache_key = f"{source_type}:{signature}"

    with _INDEX_CACHE_LOCK:
        cached = _INDEX_CACHE.get(cache_key)
        if cached is not None:
            return cached

    built = _build_index_for_records(records, source_type)
    with _INDEX_CACHE_LOCK:
        _INDEX_CACHE[cache_key] = built
        if len(_INDEX_CACHE) > _MAX_CACHE_ITEMS:
            oldest_key = min(_INDEX_CACHE.items(), key=lambda item: item[1].built_at)[0]
            _INDEX_CACHE.pop(oldest_key, None)
    return built


def _search_cached_index(query_embeddings: np.ndarray, cached: _CachedIndex, top_k: int) -> Tuple[np.ndarray, np.ndarray]:
    if cached.index_type == "faiss":
        D, I = cached.index_obj.search(query_embeddings, top_k)
        return D, I

    sims = query_embeddings @ cached.index_obj.T
    I = np.argsort(-sims, axis=1)[:, :top_k]
    D = np.take_along_axis(sims, I, axis=1)
    return D.astype("float32"), I.astype("int64")


def _tokenize(value: str) -> List[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(normalize_text(value))]


def _content_tokens(value: str) -> List[str]:
    return [tok for tok in _tokenize(value) if tok not in _STOPWORDS and len(tok) > 2]


def _semantic_strength(score: float, min_score: float) -> float:
    if score <= min_score:
        return 0.0
    return max(0.0, min(1.0, (float(score) - float(min_score)) / max(1e-6, 1.0 - float(min_score))))


def _source_profile(source_type: str) -> Dict[str, float]:
    kind = str(source_type or "submission").strip().lower()
    if kind == "lecture_material":
        return {
            "retrieval_floor": 0.58,
            "weak_floor": 0.30,
            "exact_floor": 0.20,
            "pair_semantic_floor": 0.70,
            "alignment_floor": 0.30,
            "lexical_floor": 0.16,
            "sequence_floor": 0.34,
            "source_bias": 0.02,
            "paraphrase_cap": 0.60,
        }
    if kind == "online_source":
        return {
            "retrieval_floor": 0.63,
            "weak_floor": 0.35,
            "exact_floor": 0.24,
            "pair_semantic_floor": 0.76,
            "alignment_floor": 0.36,
            "lexical_floor": 0.20,
            "sequence_floor": 0.40,
            "source_bias": 0.00,
            "paraphrase_cap": 0.50,
        }
    return {
        "retrieval_floor": 0.57,
        "weak_floor": 0.29,
        "exact_floor": 0.18,
        "pair_semantic_floor": 0.69,
        "alignment_floor": 0.30,
        "lexical_floor": 0.15,
        "sequence_floor": 0.32,
        "source_bias": 0.03,
        "paraphrase_cap": 0.64,
    }


def _lexical_diversity(tokens: List[str]) -> float:
    if not tokens:
        return 0.0
    return float(len(set(tokens)) / max(1, len(tokens)))


def _is_generic_phrase(phrase: str) -> bool:
    cleaned = prepare_text_for_similarity(phrase)
    if not cleaned:
        return True
    lowered = cleaned.lower()
    if lowered.startswith(("course code", "assignment title", "student declaration", "step ")):
        return True
    tokens = _content_tokens(cleaned)
    if len(tokens) < 3:
        return True
    if len(tokens) < 6 and _lexical_diversity(tokens) < 0.45:
        return True
    if lowered in {"in conclusion", "overall", "to conclude", "this report", "this essay"}:
        return True
    return False


def _filter_evidence_phrases(phrases: List[str]) -> List[str]:
    kept: List[str] = []
    seen = set()
    for phrase in phrases or []:
        cleaned = prepare_text_for_similarity(phrase)
        if len(cleaned) < 12 or _is_generic_phrase(cleaned):
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        kept.append(cleaned)
    return kept[:8]


def _containment_ratio(a: str, b: str) -> float:
    ta = set(_content_tokens(a))
    tb = set(_content_tokens(b))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(1, min(len(ta), len(tb)))


def _sequence_ratio(a: str, b: str) -> float:
    na = prepare_text_for_similarity(a).lower()
    nb = prepare_text_for_similarity(b).lower()
    if not na or not nb:
        return 0.0
    return float(SequenceMatcher(None, na, nb, autojunk=True).ratio())


def _phrase_coverage(query_text: str, phrases: List[str]) -> float:
    q_tokens = _tokenize(query_text)
    if not q_tokens:
        return 0.0
    matched: List[str] = []
    for phrase in phrases or []:
        matched.extend(_tokenize(phrase))
    if not matched:
        return 0.0
    q_counter: Dict[str, int] = {}
    for token in q_tokens:
        q_counter[token] = q_counter.get(token, 0) + 1
    used: Dict[str, int] = {}
    kept = 0
    for token in matched:
        if used.get(token, 0) >= q_counter.get(token, 0):
            continue
        used[token] = used.get(token, 0) + 1
        kept += 1
    return min(1.0, kept / max(1, len(q_tokens)))


def _best_evidence_text(query_text: str, phrases: List[str]) -> str:
    cleaned = _filter_evidence_phrases([prepare_text_for_similarity(p) for p in (phrases or [])])
    if cleaned:
        return max(cleaned, key=len)
    return ""


def _longest_phrase_tokens(phrases: List[str]) -> int:
    best = 0
    for phrase in phrases or []:
        best = max(best, len(_tokenize(phrase)))
    return best


def _window_texts(text: str, *, window_sentences: int, overlap: int, min_chars: int = 60, max_chars: int = 420) -> List[str]:
    cleaned = prepare_text_for_similarity(text)
    if not cleaned:
        return []

    sents = [s.strip() for s in split_sentences(cleaned) if s and s.strip()]
    if not sents:
        return [cleaned]

    windows: List[str] = []
    step = max(1, window_sentences - overlap)
    for start in range(0, len(sents), step):
        part = sents[start : start + window_sentences]
        if not part:
            continue
        merged = " ".join(part).strip()
        if len(merged) < min_chars and start > 0:
            continue
        if len(merged) > max_chars and len(part) > 1:
            partial = []
            current = 0
            for sent in part:
                if partial and current + len(sent) + 1 > max_chars:
                    break
                partial.append(sent)
                current += len(sent) + 1
            merged = " ".join(partial).strip() or merged[:max_chars].strip()
        if merged:
            windows.append(merged)
        if start + window_sentences >= len(sents):
            break

    if not windows:
        windows = [cleaned]
    return windows


def _alignment_core_score(sequence: float, lexical: float, phrase_cov: float, longest_phrase_tokens: int) -> float:
    token_bonus = min(1.0, float(longest_phrase_tokens) / 12.0)
    return max(0.0, min(1.0, 0.42 * sequence + 0.28 * lexical + 0.20 * phrase_cov + 0.10 * token_bonus))


def _pairwise_semantic_similarity(pairs: List[Tuple[str, str]]) -> List[float]:
    if not pairs:
        return []
    try:
        query_texts = [prepare_text_for_similarity(a) for a, _ in pairs]
        source_texts = [prepare_text_for_similarity(b) for _, b in pairs]
        embeddings = embed_texts(query_texts + source_texts)
        n = len(pairs)
        q_emb = embeddings[:n]
        s_emb = embeddings[n:]
        sims = np.sum(q_emb * s_emb, axis=1)
        return [max(0.0, min(1.0, float(x))) for x in sims.tolist()]
    except Exception:
        return [0.0] * len(pairs)


def _semantic_anchor_text(query_text: str, source_text: str, phrases: List[str]) -> str:
    windows = _window_texts(query_text, window_sentences=1, overlap=0, min_chars=35, max_chars=240)
    if not windows:
        return prepare_text_for_similarity(query_text)[:240].strip()
    best_text = windows[0]
    best_key = (-1.0, -1.0, -1.0, -1.0)
    for window in windows:
        key = (
            _containment_ratio(window, source_text),
            _sequence_ratio(window, source_text),
            _phrase_coverage(window, phrases),
            len(_content_tokens(window)),
        )
        if key > best_key:
            best_key = key
            best_text = window
    return best_text[:240].strip()


def _display_query_anchor(cand: _Candidate) -> str:
    exact_anchor = _best_evidence_text(cand.refined_query_text or cand.query_text, cand.shared_phrases)
    if exact_anchor:
        return exact_anchor
    if cand.match_type in {"paraphrase_supported", "semantic_supported"} and (
        cand.pair_semantic_score >= 0.68 or cand.rerank_score >= 0.58
    ):
        semantic_anchor = _semantic_anchor_text(
            cand.refined_query_text or cand.query_text,
            cand.refined_source_text or cand.source_text,
            cand.shared_phrases,
        )
        if len(semantic_anchor) >= 24:
            return semantic_anchor
    fallback = prepare_text_for_similarity(cand.refined_query_text or cand.query_text)
    return fallback[:220].strip() if len(fallback) >= 24 else ""


def _refine_candidate_pair(query_text: str, source_text: str) -> Dict[str, Any]:
    from app.domains.integrity.plagiarism.align import shared_phrases

    min_phrase_tokens = int(os.getenv("PLAG_REFINE_PHRASE_MIN_TOKENS", "4"))
    max_phrases = int(os.getenv("PLAG_REFINE_MAX_PHRASES", "6"))

    whole_query = prepare_text_for_similarity(query_text)
    whole_source = prepare_text_for_similarity(source_text)
    whole_phrases = _filter_evidence_phrases(
        shared_phrases(
            whole_query,
            whole_source,
            min_tokens=min_phrase_tokens,
            max_phrases=max_phrases,
        )
    )
    whole_lexical = _containment_ratio(whole_query, whole_source)
    whole_sequence = _sequence_ratio(whole_query, whole_source)
    whole_phrase_cov = _phrase_coverage(whole_query, whole_phrases)
    whole_longest = _longest_phrase_tokens(whole_phrases)

    if (
        whole_sequence >= 0.90
        or (whole_lexical >= 0.88 and whole_phrase_cov >= 0.50)
        or whole_longest >= 24
    ):
        return {
            "query_text": whole_query,
            "source_text": whole_source,
            "shared_phrases": whole_phrases,
            "lexical_overlap": whole_lexical,
            "sequence_ratio": whole_sequence,
            "phrase_coverage": whole_phrase_cov,
            "longest_phrase_tokens": whole_longest,
            "alignment_score": _alignment_core_score(
                whole_sequence,
                whole_lexical,
                whole_phrase_cov,
                whole_longest,
            ),
        }

    query_windows = _window_texts(
        query_text,
        window_sentences=int(os.getenv("PLAG_REFINE_QUERY_WINDOW_SENTS", "2")),
        overlap=int(os.getenv("PLAG_REFINE_QUERY_WINDOW_OVERLAP", "1")),
        min_chars=int(os.getenv("PLAG_REFINE_MIN_CHARS", "60")),
        max_chars=int(os.getenv("PLAG_REFINE_MAX_CHARS", "420")),
    )
    source_windows = _window_texts(
        source_text,
        window_sentences=int(os.getenv("PLAG_REFINE_SOURCE_WINDOW_SENTS", "2")),
        overlap=int(os.getenv("PLAG_REFINE_SOURCE_WINDOW_OVERLAP", "1")),
        min_chars=int(os.getenv("PLAG_REFINE_MIN_CHARS", "60")),
        max_chars=int(os.getenv("PLAG_REFINE_MAX_CHARS", "420")),
    )

    best: Dict[str, Any] | None = None
    for q_window in query_windows:
        for s_window in source_windows:
            phrases = _filter_evidence_phrases(shared_phrases(q_window, s_window, min_tokens=min_phrase_tokens, max_phrases=max_phrases))
            lexical = _containment_ratio(q_window, s_window)
            sequence = _sequence_ratio(q_window, s_window)
            phrase_cov = _phrase_coverage(q_window, phrases)
            longest = _longest_phrase_tokens(phrases)
            alignment = _alignment_core_score(sequence, lexical, phrase_cov, longest)

            item = {
                "query_text": q_window,
                "source_text": s_window,
                "shared_phrases": phrases,
                "lexical_overlap": lexical,
                "sequence_ratio": sequence,
                "phrase_coverage": phrase_cov,
                "longest_phrase_tokens": longest,
                "alignment_score": alignment,
            }
            if best is None:
                best = item
                continue

            current_key = (
                item["alignment_score"],
                item["longest_phrase_tokens"],
                item["sequence_ratio"],
                item["phrase_coverage"],
                -abs(len(item["query_text"]) - len(item["source_text"])),
            )
            best_key = (
                best["alignment_score"],
                best["longest_phrase_tokens"],
                best["sequence_ratio"],
                best["phrase_coverage"],
                -abs(len(best["query_text"]) - len(best["source_text"])),
            )
            if current_key > best_key:
                best = item

    if best is None:
        phrases = _filter_evidence_phrases(shared_phrases(query_text, source_text, min_tokens=min_phrase_tokens, max_phrases=max_phrases))
        lexical = _containment_ratio(query_text, source_text)
        sequence = _sequence_ratio(query_text, source_text)
        phrase_cov = _phrase_coverage(query_text, phrases)
        longest = _longest_phrase_tokens(phrases)
        best = {
            "query_text": query_text,
            "source_text": source_text,
            "shared_phrases": phrases,
            "lexical_overlap": lexical,
            "sequence_ratio": sequence,
            "phrase_coverage": phrase_cov,
            "longest_phrase_tokens": longest,
            "alignment_score": _alignment_core_score(sequence, lexical, phrase_cov, longest),
        }

    return best


def _match_type(*, sequence: float, lexical: float, phrase_cov: float, longest_phrase_tokens: int, rerank: float, pair_semantic: float) -> str:
    if longest_phrase_tokens >= 10 or sequence >= 0.90 or (lexical >= 0.88 and phrase_cov >= 0.50):
        return "exact_supported"
    if longest_phrase_tokens >= 6 or sequence >= 0.78 or (lexical >= 0.60 and phrase_cov >= 0.25):
        return "near_exact_supported"
    if pair_semantic >= 0.76 and (lexical >= 0.18 or sequence >= 0.34):
        return "paraphrase_supported"
    if rerank >= 0.48 or pair_semantic >= 0.70 or (phrase_cov >= 0.12 and lexical >= 0.30):
        return "semantic_supported"
    return "weak_supported"


def _hybrid_rerank_score(
    *,
    retrieval_score: float,
    min_score: float,
    alignment_score: float,
    lexical_overlap: float,
    sequence_ratio: float,
    phrase_coverage: float,
    longest_phrase_tokens: int,
    cross_encoder_score: float | None,
    pair_semantic_score: float,
    source_bias: float = 0.0,
) -> Tuple[float, float]:
    semantic = _semantic_strength(retrieval_score, min_score)
    token_bonus = min(1.0, float(longest_phrase_tokens) / 14.0)

    local_score = (
        0.18 * semantic
        + 0.18 * alignment_score
        + 0.16 * lexical_overlap
        + 0.14 * sequence_ratio
        + 0.10 * phrase_coverage
        + 0.12 * pair_semantic_score
        + 0.06 * token_bonus
    )

    if longest_phrase_tokens >= 10:
        local_score += 0.12
    elif longest_phrase_tokens >= 6:
        local_score += 0.05
    elif pair_semantic_score >= 0.76 and lexical_overlap >= 0.18:
        local_score += 0.05

    local_score += float(source_bias)
    local_score = max(0.0, min(1.0, local_score))
    if cross_encoder_score is None:
        return local_score, semantic

    blended = 0.48 * local_score + 0.30 * max(0.0, min(1.0, cross_encoder_score)) + 0.22 * pair_semantic_score
    return max(0.0, min(1.0, blended)), semantic


def _evidence_ratio(
    *,
    rerank_score: float,
    semantic_strength: float,
    lexical_overlap: float,
    sequence_ratio: float,
    phrase_coverage: float,
    longest_phrase_tokens: int,
    pair_semantic_score: float,
    source_type: str,
) -> float:
    profile = _source_profile(source_type)

    if longest_phrase_tokens >= 10 or sequence_ratio >= 0.90:
        ratio = max(
            phrase_coverage,
            min(0.99, 0.70 + 0.18 * rerank_score + 0.08 * sequence_ratio + 0.06 * lexical_overlap),
        )
    elif longest_phrase_tokens >= 6 or phrase_coverage >= 0.24 or sequence_ratio >= 0.68:
        ratio = max(
            phrase_coverage * 0.95,
            min(0.88, 0.20 + 0.30 * rerank_score + 0.18 * lexical_overlap + 0.12 * sequence_ratio + 0.08 * pair_semantic_score),
        )
    elif pair_semantic_score >= profile["pair_semantic_floor"] and (lexical_overlap >= profile["lexical_floor"] or sequence_ratio >= profile["sequence_floor"]):
        ratio = min(
            profile["paraphrase_cap"],
            0.10 + 0.22 * rerank_score + 0.20 * pair_semantic_score + 0.10 * semantic_strength + 0.06 * lexical_overlap,
        )
    elif rerank_score >= 0.42 or (phrase_coverage >= 0.08 and lexical_overlap >= 0.22):
        ratio = min(0.62, 0.12 + 0.28 * rerank_score + 0.14 * semantic_strength + 0.10 * lexical_overlap + 0.08 * sequence_ratio)
    else:
        ratio = min(0.28, 0.06 + 0.16 * rerank_score + 0.10 * semantic_strength + 0.06 * lexical_overlap + 0.08 * pair_semantic_score)
        if phrase_coverage < 0.05 and lexical_overlap < 0.18 and sequence_ratio < 0.35 and pair_semantic_score < 0.68:
            ratio *= 0.45

    return max(0.0, min(1.0, ratio))


def _anchored_phrase_coverage(full_text: str, matches: List[SimilarityMatch]) -> float:
    """Estimate visible plagiarism coverage from exact anchored phrases only.

    The user-facing plagiarism percentage should match what can actually be highlighted in the
    extracted text. So we compute coverage from the union of phrase matches that can be anchored
    back into the submission text, instead of inflating the score with semantic-only similarity.
    """
    doc_tokens = _tokenize(prepare_text_for_similarity(full_text))
    if not doc_tokens:
        return 0.0

    first_index: Dict[str, List[int]] = {}
    for idx, tok in enumerate(doc_tokens):
        first_index.setdefault(tok, []).append(idx)

    matched_positions: set[int] = set()
    seen_sequences: set[tuple[str, ...]] = set()

    for match in matches:
        phrases = [p for p in (match.shared_phrases or []) if isinstance(p, str)]

        for phrase in phrases:
            ptoks = tuple(_tokenize(phrase))
            if len(ptoks) < 4:
                continue
            if ptoks in seen_sequences:
                continue
            seen_sequences.add(ptoks)

            starts = first_index.get(ptoks[0], [])
            if not starts:
                continue
            n = len(ptoks)
            for start in starts:
                end = start + n
                if end > len(doc_tokens):
                    continue
                if tuple(doc_tokens[start:end]) == ptoks:
                    matched_positions.update(range(start, end))

    if not matched_positions:
        return 0.0
    return float(len(matched_positions) / max(1, len(doc_tokens)))


def semantic_similarity_search(
    query_chunks: List[tuple[int, str]],
    corpus: List[tuple[str, int, str]] | List[Dict[str, Any]],
    top_k: int = 3,
    min_score: float = 0.75,
    full_text: str | None = None,
) -> PlagiarismResult:
    """Step 2 plagiarism detection with two-stage retrieval and contextual reranking.

    Stage 1: sentence-transformer / hashed embedding retrieval against grouped source indexes.
    Stage 2: local window alignment + optional cross-encoder reranking to confirm the best
    contextual source pair before scoring or highlighting.
    """
    if not query_chunks or not corpus:
        return PlagiarismResult(overall_score=0.0, matches=[], model_name=os.getenv("SBERT_MODEL_NAME", ""), index_type="none")

    normalized_records: List[Dict[str, Any]] = []
    for row in corpus:
        if isinstance(row, dict):
            prepared_text = prepare_text_for_similarity(str(row.get("text", "")))
            if not prepared_text:
                continue
            normalized_records.append(
                {
                    "doc_id": str(row.get("doc_id", "")),
                    "chunk_id": int(row.get("chunk_id", 0) or 0),
                    "text": prepared_text,
                    "source_type": str(row.get("source_type", "submission") or "submission"),
                    "source_name": row.get("source_name"),
                    "source_path": row.get("source_path"),
                    "class_id": row.get("class_id"),
                    "assignment_id": row.get("assignment_id"),
                }
            )
        else:
            doc_id, chunk_id, text = row
            prepared_text = prepare_text_for_similarity(str(text))
            if not prepared_text:
                continue
            normalized_records.append(
                {
                    "doc_id": str(doc_id),
                    "chunk_id": int(chunk_id),
                    "text": prepared_text,
                    "source_type": "submission",
                    "source_name": None,
                    "source_path": None,
                    "class_id": None,
                    "assignment_id": None,
                }
            )

    normalized_queries: List[tuple[int, str, int]] = []
    for cid, text in query_chunks:
        prepared = prepare_text_for_similarity(text)
        word_count = len(_tokenize(prepared))
        if not prepared or word_count < 8:
            continue
        normalized_queries.append((int(cid), prepared, word_count))

    if not normalized_queries or not normalized_records:
        return PlagiarismResult(overall_score=0.0, matches=[], model_name=os.getenv("SBERT_MODEL_NAME", ""), index_type="none")

    q_ids = [cid for cid, _, _ in normalized_queries]
    q_texts = [t for _, t, _ in normalized_queries]
    q_word_counts = {cid: wc for cid, _, wc in normalized_queries}
    q_emb = embed_texts(q_texts)

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for record in normalized_records:
        grouped.setdefault(str(record.get("source_type") or "submission"), []).append(record)

    first_stage_top_k = max(top_k, int(os.getenv("PLAG_FIRST_STAGE_TOP_K", "6")))
    recall_margin = float(os.getenv("PLAG_RECALL_MARGIN", "0.12"))
    retrieval_floor = max(0.0, float(min_score) - recall_margin)
    max_candidates_per_query = int(os.getenv("PLAG_MAX_CANDIDATES_PER_QUERY", "12"))
    max_matches_per_query = int(os.getenv("PLAG_MAX_MATCHES_PER_QUERY", "4"))

    index_types: set[str] = set()
    candidate_pool: Dict[int, List[_Candidate]] = {cid: [] for cid in q_ids}

    for source_type, rows in grouped.items():
        if not rows:
            continue
        cached = _get_cached_index(rows, source_type)
        index_types.add(cached.index_type)
        D, I = _search_cached_index(q_emb, cached, first_stage_top_k)

        for qi, (dists, inds) in enumerate(zip(D, I)):
            qid = q_ids[qi]
            qtext = q_texts[qi]
            for score, idx in zip(dists.tolist(), inds.tolist()):
                if idx < 0:
                    continue
                score_f = float(score)
                source_profile = _source_profile(source_type)
                local_retrieval_floor = min(retrieval_floor, float(source_profile["retrieval_floor"]))
                if score_f < local_retrieval_floor:
                    continue
                meta = cached.metas[idx]
                candidate_pool[qid].append(
                    _Candidate(
                        query_chunk_id=qid,
                        query_text=qtext,
                        source_type=source_type,
                        source_doc_id=cached.doc_ids[idx],
                        source_chunk_id=int(cached.chunk_ids[idx]),
                        source_text=cached.texts[idx],
                        source_name=(meta.get("source_name") if isinstance(meta, dict) else None),
                        source_path=(meta.get("source_path") if isinstance(meta, dict) else None),
                        class_id=(meta.get("class_id") if isinstance(meta, dict) else None),
                        assignment_id=(meta.get("assignment_id") if isinstance(meta, dict) else None),
                        retrieval_score=score_f,
                    )
                )

    candidates: List[_Candidate] = []
    for qid, items in candidate_pool.items():
        if not items:
            continue
        # dedupe on source chunk and keep strongest retrieval candidate first
        deduped: Dict[Tuple[str, str, int], _Candidate] = {}
        for item in sorted(items, key=lambda c: -c.retrieval_score):
            key = (item.source_type, item.source_doc_id, item.source_chunk_id)
            existing = deduped.get(key)
            if existing is None or item.retrieval_score > existing.retrieval_score:
                deduped[key] = item
        refined_items = list(deduped.values())[:max_candidates_per_query]
        candidates.extend(refined_items)

    if not candidates:
        index_label = "grouped_none" if grouped else "none"
        return PlagiarismResult(overall_score=0.0, matches=[], model_name=os.getenv("SBERT_MODEL_NAME", ""), index_type=index_label)

    cross_pairs: List[Tuple[str, str]] = []
    for cand in candidates:
        refined = _refine_candidate_pair(cand.query_text, cand.source_text)
        cand.refined_query_text = refined["query_text"]
        cand.refined_source_text = refined["source_text"]
        cand.shared_phrases = refined["shared_phrases"]
        cand.lexical_overlap = float(refined["lexical_overlap"])
        cand.sequence_ratio = float(refined["sequence_ratio"])
        cand.phrase_coverage = float(refined["phrase_coverage"])
        cand.alignment_score = float(refined["alignment_score"])
        cand.longest_phrase_tokens = int(refined["longest_phrase_tokens"])
        cross_pairs.append((cand.refined_query_text or cand.query_text, cand.refined_source_text or cand.source_text))

    cross_scores = score_pairs_with_plagiarism_reranker(cross_pairs)
    pair_semantic_scores = _pairwise_semantic_similarity(cross_pairs)
    weak_floor = float(os.getenv("PLAG_MIN_RERANK_SCORE", "0.34"))
    exact_only_floor = float(os.getenv("PLAG_MIN_EXACT_GATE", "0.22"))

    filtered_by_query: Dict[int, List[_Candidate]] = {cid: [] for cid in q_ids}
    for idx, cand in enumerate(candidates):
        cross_score = cross_scores[idx] if idx < len(cross_scores) else None
        pair_semantic_score = pair_semantic_scores[idx] if idx < len(pair_semantic_scores) else 0.0
        profile = _source_profile(cand.source_type)
        rerank, semantic = _hybrid_rerank_score(
            retrieval_score=cand.retrieval_score,
            min_score=min_score,
            alignment_score=cand.alignment_score,
            lexical_overlap=cand.lexical_overlap,
            sequence_ratio=cand.sequence_ratio,
            phrase_coverage=cand.phrase_coverage,
            longest_phrase_tokens=cand.longest_phrase_tokens,
            cross_encoder_score=cross_score,
            pair_semantic_score=pair_semantic_score,
            source_bias=float(profile["source_bias"]),
        )
        cand.rerank_score = rerank
        cand.pair_semantic_score = float(pair_semantic_score)
        cand.semantic_strength = semantic
        cand.match_type = _match_type(
            sequence=cand.sequence_ratio,
            lexical=cand.lexical_overlap,
            phrase_cov=cand.phrase_coverage,
            longest_phrase_tokens=cand.longest_phrase_tokens,
            rerank=rerank,
            pair_semantic=pair_semantic_score,
        )

        has_exact_anchor = cand.longest_phrase_tokens >= 4 or cand.phrase_coverage >= 0.10
        semantic_anchor_ready = pair_semantic_score >= float(profile["pair_semantic_floor"]) and cand.alignment_score >= float(profile["alignment_floor"]) and (cand.lexical_overlap >= float(profile["lexical_floor"]) or cand.sequence_ratio >= float(profile["sequence_floor"]))
        if rerank < min(weak_floor, float(profile["weak_floor"])) and not has_exact_anchor and not semantic_anchor_ready:
            continue
        if rerank < min(exact_only_floor, float(profile["exact_floor"])) and cand.sequence_ratio < 0.50 and cand.lexical_overlap < 0.24 and not semantic_anchor_ready:
            continue

        cand.evidence_ratio = _evidence_ratio(
            rerank_score=cand.rerank_score,
            semantic_strength=cand.semantic_strength,
            lexical_overlap=cand.lexical_overlap,
            sequence_ratio=cand.sequence_ratio,
            phrase_coverage=cand.phrase_coverage,
            longest_phrase_tokens=cand.longest_phrase_tokens,
            pair_semantic_score=cand.pair_semantic_score,
            source_type=cand.source_type,
        )
        if cand.evidence_ratio <= 0.0:
            continue
        filtered_by_query[cand.query_chunk_id].append(cand)

    matches: List[SimilarityMatch] = []
    best_ratio_by_query_chunk: Dict[int, float] = {cid: 0.0 for cid in q_ids}

    for qid, items in filtered_by_query.items():
        if not items:
            continue
        best_by_doc: Dict[Tuple[str, str], _Candidate] = {}
        for item in sorted(
            items,
            key=lambda c: (
                -c.evidence_ratio,
                -c.rerank_score,
                -c.longest_phrase_tokens,
                -c.pair_semantic_score,
                -c.retrieval_score,
            ),
        ):
            key = (item.source_type, item.source_doc_id)
            existing = best_by_doc.get(key)
            if existing is None or (
                item.evidence_ratio,
                item.rerank_score,
                item.longest_phrase_tokens,
                item.pair_semantic_score,
                item.retrieval_score,
            ) > (
                existing.evidence_ratio,
                existing.rerank_score,
                existing.longest_phrase_tokens,
                existing.pair_semantic_score,
                existing.retrieval_score,
            ):
                best_by_doc[key] = item

        chosen = sorted(
            best_by_doc.values(),
            key=lambda c: (
                -c.evidence_ratio,
                -c.rerank_score,
                -c.longest_phrase_tokens,
                -c.pair_semantic_score,
                -c.retrieval_score,
            ),
        )[:max_matches_per_query]

        for cand in chosen:
            evidence_text = _display_query_anchor(cand)
            match = SimilarityMatch(
                query_chunk_id=cand.query_chunk_id,
                query_text=evidence_text,
                source_doc_id=cand.source_doc_id,
                source_chunk_id=int(cand.source_chunk_id),
                source_text=cand.refined_source_text or cand.source_text,
                score=float(cand.retrieval_score),
                shared_phrases=cand.shared_phrases,
                source_type=cand.source_type,
                source_name=cand.source_name,
                source_path=cand.source_path,
                class_id=cand.class_id,
                assignment_id=cand.assignment_id,
                evidence_ratio=float(cand.evidence_ratio),
                semantic_strength=float(cand.semantic_strength),
                lexical_overlap=float(cand.lexical_overlap),
                sequence_ratio=float(cand.sequence_ratio),
                phrase_coverage=float(cand.phrase_coverage),
                rerank_score=float(cand.rerank_score),
                alignment_score=float(cand.alignment_score),
                longest_phrase_tokens=int(cand.longest_phrase_tokens),
                query_window_text=cand.refined_query_text or cand.query_text,
                source_window_text=cand.refined_source_text or cand.source_text,
                pair_semantic_score=float(cand.pair_semantic_score),
                match_type=cand.match_type,
            )
            matches.append(match)
            if cand.evidence_ratio > best_ratio_by_query_chunk.get(qid, 0.0):
                best_ratio_by_query_chunk[qid] = cand.evidence_ratio

    total_query_words = sum(q_word_counts.values())
    weighted_plag_words = 0.0
    for qid, ratio in best_ratio_by_query_chunk.items():
        weighted_plag_words += q_word_counts.get(qid, 0) * max(0.0, min(1.0, ratio))
    semantic_overall = 0.0 if total_query_words <= 0 else weighted_plag_words / total_query_words

    anchored_overall = 0.0
    if full_text:
        anchored_overall = _anchored_phrase_coverage(full_text, matches)

    # User-facing plagiarism percent must align with visible highlights.
    # So anchored phrase coverage remains primary, while semantic strength is used as a fallback only.
    overall = anchored_overall if anchored_overall > 0.0 else semantic_overall

    if not index_types:
        index_label = "none"
    elif len(index_types) == 1:
        only = next(iter(index_types))
        index_label = f"step3_grouped_{only}_reranked"
    else:
        index_label = "step3_grouped_mixed_reranked"

    return PlagiarismResult(
        overall_score=float(max(0.0, min(1.0, overall))),
        matches=sorted(
            matches,
            key=lambda item: (
                int(item.query_chunk_id),
                str(item.source_type),
                -float(item.evidence_ratio),
                -float(item.rerank_score),
                -float(item.score),
            ),
        ),
        model_name=os.getenv("SBERT_MODEL_NAME", ""),
        index_type=index_label,
    )
