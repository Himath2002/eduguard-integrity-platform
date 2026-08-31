from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import List, Tuple

import numpy as np

from app.ai.chunking import chunk_text

from app.domains.integrity.extractors.text import extract_text, iter_document_paths
from app.domains.integrity.plagiarism.index import (
    CorpusChunkMeta,
    CorpusManifest,
    build_index,
    embed_texts,
    save_index,
    save_manifest,
    save_metadata,
)


def _doc_id_for_path(root: Path, p: Path) -> str:
    """Stable doc_id based on relative path + sha1 to avoid collisions."""
    rel = str(p.relative_to(root)).replace("\\", "/")
    digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:10]
    return f"{rel}#{digest}"


def build_corpus(
    corpus_root: str | Path,
    out_dir: str | Path,
    max_chars_per_chunk: int = 1400,
    overlap_sents: int = 1,
) -> CorpusManifest:
    root = Path(corpus_root)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    all_meta: List[CorpusChunkMeta] = []
    all_texts: List[str] = []

    doc_paths = list(iter_document_paths(root))
    print(f"[corpus] found {len(doc_paths)} documents under {root}", flush=True)
    if not doc_paths:
        raise RuntimeError(f"No .pdf/.docx/.txt files found under: {root}")

    for p in doc_paths:
        print(f"[corpus] extracting: {p.name}", flush=True)
        extracted = extract_text(p)
        print(f"[corpus] extracted chars: {len(extracted.text)}", flush=True)
        if not extracted.text:
            continue

        chunks = chunk_text(extracted.text, max_chars=max_chars_per_chunk, overlap_sents=overlap_sents)
        print(f"[corpus] chunks: {len(chunks)}", flush=True)
        if not chunks:
            continue

        doc_id = _doc_id_for_path(root, p)
        for ch in chunks:
            txt = ch.text.strip()
            if not txt:
                continue
            all_texts.append(txt)
            all_meta.append(
                CorpusChunkMeta(
                    doc_id=doc_id,
                    doc_path=str(p),
                    chunk_id=int(ch.chunk_id),
                    text=txt,
                    word_count=len(txt.split()),
                )
            )

    if not all_texts:
        raise RuntimeError("Corpus build produced 0 chunks. Are the documents text-based?")

    print(f"[corpus] total chunks to embed: {len(all_texts)}", flush=True)
    embeddings = embed_texts(all_texts)
    print(f"[corpus] embeddings shape: {embeddings.shape}", flush=True)
    index_type, index_obj = build_index(embeddings)
    save_index(out, index_type=index_type, index_obj=index_obj)
    save_metadata(out, all_meta)

    manifest = CorpusManifest(
        version=1,
        model_name=os.getenv("SBERT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"),
        normalize_embeddings=True,
        index_type=index_type,
        total_docs=len({m.doc_id for m in all_meta}),
        total_chunks=len(all_meta),
    )
    save_manifest(out, manifest)
    return manifest
