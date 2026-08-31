from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from .text_extraction import extract_pdf_text
from .chunking import chunk_text
from .features import stylometry_features
from .ai_detection import detect_ai
from .plagiarism import semantic_similarity_search


def run_integrity_pipeline(pdf_path: str, corpus: list[tuple[str, int, str]]) -> Dict[str, Any]:
    extracted = extract_pdf_text(pdf_path)
    chunks = chunk_text(extracted.full_text)

    chunk_pairs = [(c.chunk_id, c.text) for c in chunks]

    ai_res = detect_ai(chunk_pairs)
    plag_res = semantic_similarity_search(chunk_pairs, corpus=corpus)

    feat = stylometry_features(extracted.full_text)

    ai_dict = {
        "overall": ai_res.overall_score,
        "model": ai_res.model_name,
        "chunks": [asdict(x) for x in ai_res.chunks],
    }
    if ai_res.error:
        ai_dict["error"] = ai_res.error

    payload: Dict[str, Any] = {
        "text_stats": feat,
        "page_count": len(extracted.pages),
        "chunk_count": len(chunks),
        "ai": ai_dict,
        "plagiarism": {
            "overall": plag_res.overall_score,
            "model": plag_res.model_name,
            "index": plag_res.index_type,
            "matches": [asdict(x) for x in plag_res.matches],
        },
    }
    return payload
