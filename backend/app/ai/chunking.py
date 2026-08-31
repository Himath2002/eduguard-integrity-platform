from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List

from tqdm import tqdm

from .normalization import prepare_text_for_similarity

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


@dataclass
class TextChunk:
    chunk_id: int
    text: str


def _spacy_sentences(text: str) -> List[str]:
    if os.getenv("PLAG_USE_SPACY", "0").strip().lower() not in {"1", "true", "yes", "y", "on"}:
        return []
    try:
        import spacy  # type: ignore
    except Exception:
        return []

    model_name = os.getenv("PLAG_SPACY_MODEL", "en_core_web_sm")
    try:
        nlp = spacy.load(model_name, exclude=["tagger", "ner", "lemmatizer", "textcat"])
    except Exception:
        try:
            nlp = spacy.blank("en")
            nlp.add_pipe("sentencizer")
        except Exception:
            return []

    doc = nlp(text)
    return [sent.text.strip() for sent in doc.sents if sent.text and sent.text.strip()]


def split_sentences(text: str) -> List[str]:
    text = prepare_text_for_similarity(text)
    if not text:
        return []

    sents = _spacy_sentences(text)
    if not sents:
        sents = _SENT_SPLIT.split(text)
        sents = [s.strip() for s in sents if s.strip()]

    # If there are no punctuation-based splits (very common in PDFs), fall back to line-ish splitting
    if len(sents) <= 1 and len(text) > 0:
        step = 500
        sents = [text[i : i + step].strip() for i in range(0, len(text), step) if text[i : i + step].strip()]
    return sents


def chunk_text(text: str, max_chars: int = 1400, overlap_sents: int = 1, min_chunk_chars: int = 80) -> List[TextChunk]:
    """
    Chunk text by grouping sentences until max_chars is reached.
    Includes progress bar when PLAG_PROGRESS=1.
    Applies conservative normalization and removes repeated tiny chunks.
    """
    sents = split_sentences(text)
    if not sents:
        return []

    show_progress = os.getenv("PLAG_PROGRESS", "1").strip().lower() in {"1", "true", "yes", "y", "on"}
    iterator = tqdm(sents, desc="[chunk] building chunks", unit="sent", leave=False) if show_progress else sents

    chunks: List[TextChunk] = []
    cur: List[str] = []
    cur_len = 0
    chunk_id = 0
    seen_chunks: set[str] = set()

    def _flush_current() -> list[str]:
        nonlocal chunk_id, cur, cur_len
        prior = cur[:]
        if not cur:
            return prior
        merged = " ".join(cur).strip()
        allow_short = len(merged) >= max(30, min_chunk_chars // 2)
        if len(merged) >= min_chunk_chars or (allow_short and not chunks):
            norm_key = merged.lower()
            if norm_key not in seen_chunks:
                seen_chunks.add(norm_key)
                chunks.append(TextChunk(chunk_id=chunk_id, text=merged))
                chunk_id += 1
        cur = []
        cur_len = 0
        return prior

    for s in iterator:
        if len(s) > max_chars:
            _flush_current()
            for start in range(0, len(s), max_chars):
                piece = s[start : start + max_chars].strip()
                if piece and len(piece) >= max(30, min_chunk_chars // 2):
                    norm_key = piece.lower()
                    if norm_key in seen_chunks:
                        continue
                    seen_chunks.add(norm_key)
                    chunks.append(TextChunk(chunk_id=chunk_id, text=piece))
                    chunk_id += 1
            continue

        if (cur_len + len(s) + 1 <= max_chars) or not cur:
            cur.append(s)
            cur_len += len(s) + 1
            continue

        prior = _flush_current()

        if overlap_sents > 0:
            overlap_seed = prior[-overlap_sents:] if prior else []
            cur = overlap_seed[:]
            cur_len = sum(len(x) + 1 for x in cur)
        else:
            cur = []
            cur_len = 0

        cur.append(s)
        cur_len += len(s) + 1

    _flush_current()
    return chunks
