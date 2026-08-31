from __future__ import annotations

import os
import time
from tqdm import tqdm
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List

from app.ai.chunking import chunk_text
from app.domains.integrity.extractors.text import extract_text
from app.domains.integrity.plagiarism.align import shared_phrases
from app.domains.integrity.plagiarism.index import (
    CorpusChunkMeta,
    CorpusManifest,
    embed_texts,
    load_index,
    load_manifest,
    load_metadata,
    search,
)


def _env_true(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "y", "on"}


_DEBUG = _env_true("PLAG_DEBUG", "1")
_DISABLE_PHRASES = _env_true("PLAG_DISABLE_PHRASES", "1")  # default ON for speed in terminal
_MAX_EVIDENCE = int(os.getenv("PLAG_MAX_EVIDENCE", "40"))


def _log(msg: str) -> None:
    if _DEBUG:
        print(msg, flush=True)


@dataclass
class EvidenceMatch:
    query_chunk_id: int
    query_text: str
    source_doc_id: str
    source_doc_path: str
    source_chunk_id: int
    source_text: str
    score: float
    shared_phrases: List[str]


@dataclass
class PlagiarismReport:
    query_file: str
    corpus_dir: str
    model_name: str
    index_type: str
    overall_similarity: float
    per_source: List[Dict[str, Any]]
    matches: List[EvidenceMatch]


def analyze_file(
    file_path: str | Path,
    corpus_dir: str | Path,
    top_k: int = 5,
    min_score: float = 0.75,
    evidence_phrases_min_tokens: int = 8,
) -> PlagiarismReport:
    t0 = time.time()

    corpus_dir_p = Path(corpus_dir)
    _log(f"[analyze] loading manifest: {corpus_dir_p / 'manifest.json'}")
    manifest: CorpusManifest = load_manifest(corpus_dir_p)

    _log("[analyze] loading index")
    index_type, index_obj = load_index(corpus_dir_p, manifest)

    _log("[analyze] loading metadata")
    meta: List[CorpusChunkMeta] = load_metadata(corpus_dir_p)
    _log(f"[analyze] meta chunks: {len(meta)}  index_type={index_type}")

    _log(f"[analyze] extracting query: {file_path}")
    extracted = extract_text(file_path)
    _log(f"[analyze] extracted chars: {len(extracted.text)}")

    _log("[analyze] chunking query")
    chunks = chunk_text(extracted.text)
    _log(f"[analyze] query chunks: {len(chunks)}")

    q_pairs = [(c.chunk_id, c.text) for c in chunks]
    if not q_pairs or not meta:
        _log("[analyze] nothing to compare (empty query or empty corpus)")
        return PlagiarismReport(
            query_file=str(file_path),
            corpus_dir=str(corpus_dir),
            model_name=manifest.model_name,
            index_type=index_type,
            overall_similarity=0.0,
            per_source=[],
            matches=[],
        )

    _log("[analyze] embedding query chunks")
    q_emb = embed_texts([t for _, t in q_pairs])  # will print [embed] mode=hash if your env is set

    _log("[analyze] searching")
    D, I = search(q_emb, index_type=index_type, index_obj=index_obj, top_k=top_k)
    _log(f"[analyze] search done: D{tuple(D.shape)} I{tuple(I.shape)}")

    matches: List[EvidenceMatch] = []

    assigned_words_total = 0
    plag_words_total = 0
    per_source_words: Dict[str, int] = {}
    evidence_count = 0

    _log(f"[analyze] building matches (disable_phrases={_DISABLE_PHRASES})")
    for qi, (q_chunk_id, q_text) in enumerate(tqdm(q_pairs, desc='[analyze] scanning chunks', unit='chunk', leave=False)):
        q_words = len(q_text.split())
        assigned_words_total += q_words

        best_score = float(D[qi][0]) if D.shape[1] > 0 else 0.0
        best_idx = int(I[qi][0]) if I.shape[1] > 0 else -1

        if best_idx >= 0 and best_score >= min_score:
            plag_words_total += q_words
            src = meta[best_idx]
            per_source_words[src.doc_id] = per_source_words.get(src.doc_id, 0) + q_words

        for rank in range(min(top_k, D.shape[1])):
            score = float(D[qi][rank])
            idx = int(I[qi][rank])
            if idx < 0 or score < min_score:
                continue

            src = meta[idx]

            phrases: List[str] = []
            if not _DISABLE_PHRASES:
                # Phrase matching can be expensive; keep it capped.
                phrases = shared_phrases(q_text, src.text, min_tokens=evidence_phrases_min_tokens)

            matches.append(
                EvidenceMatch(
                    query_chunk_id=int(q_chunk_id),
                    query_text=q_text,
                    source_doc_id=src.doc_id,
                    source_doc_path=src.doc_path,
                    source_chunk_id=int(src.chunk_id),
                    source_text=src.text,
                    score=score,
                    shared_phrases=phrases,
                )
            )
            evidence_count += 1
            if evidence_count >= _MAX_EVIDENCE:
                break

        if evidence_count >= _MAX_EVIDENCE:
            break

    overall = 0.0 if assigned_words_total == 0 else plag_words_total / assigned_words_total

    per_source_list: List[Dict[str, Any]] = []
    for doc_id, words in sorted(per_source_words.items(), key=lambda x: x[1], reverse=True):
        doc_path = next((m.doc_path for m in meta if m.doc_id == doc_id), "")
        per_source_list.append(
            {
                "doc_id": doc_id,
                "doc_path": doc_path,
                "matched_word_count": words,
                "matched_percent": 0.0 if plag_words_total == 0 else words / plag_words_total,
            }
        )

    _log(f"[analyze] done in {time.time()-t0:.2f}s  overall={overall:.2%}  matches={len(matches)}")

    return PlagiarismReport(
        query_file=str(file_path),
        corpus_dir=str(corpus_dir),
        model_name=manifest.model_name,
        index_type=index_type,
        overall_similarity=float(overall),
        per_source=per_source_list,
        matches=matches,
    )


def report_to_json_dict(report: PlagiarismReport) -> Dict[str, Any]:
    return asdict(report)
