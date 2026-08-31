from __future__ import annotations

import json
import os
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np

from app.ai.models import get_sbert_model


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


def _faiss_enabled() -> bool:
    if _env_true("PLAG_FORCE_FAISS", "0"):
        return True
    if _env_true("PLAG_DISABLE_FAISS", "0"):
        return False
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


@dataclass(frozen=True)
class CorpusChunkMeta:
    doc_id: str
    doc_path: str
    chunk_id: int
    text: str
    word_count: int


@dataclass(frozen=True)
class CorpusManifest:
    version: int
    model_name: str
    normalize_embeddings: bool
    index_type: str
    total_docs: int
    total_chunks: int


def embed_texts(texts: List[str]) -> np.ndarray:
    mode = os.getenv("PLAG_EMBEDDING", "sbert").strip().lower()

    if mode in {"hash", "lexical", "tfidf"}:
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
        print(f"[embed] mode=hash dim={dim} texts={len(texts)}", flush=True)
        return X.astype("float32").toarray()

    try:
        model = get_sbert_model()
        print(f"[embed] mode=sbert texts={len(texts)}", flush=True)
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

        dim = int(os.getenv("HASH_EMBED_DIM", "2048"))
        hv = HashingVectorizer(
            n_features=dim,
            alternate_sign=False,
            norm=None,
            ngram_range=(1, 2),
        )
        X = hv.transform(texts)
        X = normalize(X, norm="l2")
        print(f"[embed] fallback=hash dim={dim} texts={len(texts)}", flush=True)
        return X.astype("float32").toarray()


def save_manifest(out_dir: Path, manifest: CorpusManifest) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest.__dict__, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_manifest(out_dir: Path) -> CorpusManifest:
    p = out_dir / "manifest.json"
    if not p.exists():
        raise FileNotFoundError(f"Corpus manifest not found: {p}")
    data = json.loads(p.read_text(encoding="utf-8"))
    return CorpusManifest(**data)


def save_metadata(out_dir: Path, rows: List[CorpusChunkMeta]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path = out_dir / "meta.jsonl"
    with meta_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(
                json.dumps(
                    {
                        "doc_id": r.doc_id,
                        "doc_path": r.doc_path,
                        "chunk_id": r.chunk_id,
                        "text": r.text,
                        "word_count": r.word_count,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )


def load_metadata(out_dir: Path) -> List[CorpusChunkMeta]:
    meta_path = out_dir / "meta.jsonl"
    if not meta_path.exists():
        raise FileNotFoundError(f"Corpus metadata not found: {meta_path}")

    rows: List[CorpusChunkMeta] = []
    with meta_path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            d = json.loads(line)
            rows.append(
                CorpusChunkMeta(
                    doc_id=str(d["doc_id"]),
                    doc_path=str(d["doc_path"]),
                    chunk_id=int(d["chunk_id"]),
                    text=str(d["text"]),
                    word_count=int(d.get("word_count", 0)),
                )
            )
    return rows


def build_index(embeddings: np.ndarray) -> Tuple[str, Any]:
    """Create an in-memory index. Returns (index_type, index_object_or_array)."""
    faiss = _try_faiss()
    if faiss is not None:
        dim = int(embeddings.shape[1])
        index = faiss.IndexFlatIP(dim)  # cosine via normalized vectors
        index.add(embeddings)
        return "faiss", index

    # Fallback: store embeddings and do numpy dot-product search.
    return "numpy", embeddings


def save_index(out_dir: Path, index_type: str, index_obj: Any) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    if index_type == "faiss":
        faiss = _try_faiss()
        if faiss is None:
            raise RuntimeError("FAISS not available but index_type=faiss")
        faiss.write_index(index_obj, str(out_dir / "index.faiss"))
        return

    if index_type == "numpy":
        np.save(out_dir / "embeddings.npy", index_obj)
        return

    raise ValueError(f"Unknown index_type: {index_type}")


def load_index(out_dir: Path, manifest: CorpusManifest) -> Tuple[str, Any]:
    if manifest.index_type == "faiss":
        faiss = _try_faiss()
        if faiss is None:
            raise RuntimeError(
                "This corpus was built with FAISS, but FAISS is not installed. "
                "On Windows, use WSL2 or conda, or rebuild the corpus without FAISS."
            )
        p = out_dir / "index.faiss"
        if not p.exists():
            raise FileNotFoundError(f"FAISS index not found: {p}")
        return "faiss", faiss.read_index(str(p))

    if manifest.index_type == "numpy":
        p = out_dir / "embeddings.npy"
        if not p.exists():
            raise FileNotFoundError(f"Embeddings file not found: {p}")
        return "numpy", np.load(p)

    raise ValueError(f"Unknown index_type: {manifest.index_type}")


def search(
    query_embeddings: np.ndarray,
    index_type: str,
    index_obj: Any,
    top_k: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """Return (scores, indices) arrays shaped [n_query, top_k]."""
    if index_type == "faiss":
        D, I = index_obj.search(query_embeddings, top_k)
        return D, I

    if index_type == "numpy":
        corpus_embeddings: np.ndarray = index_obj
        sims = query_embeddings @ corpus_embeddings.T
        # argsort descending
        I = np.argsort(-sims, axis=1)[:, :top_k]
        D = np.take_along_axis(sims, I, axis=1)
        return D.astype("float32"), I.astype("int64")

    raise ValueError(f"Unknown index_type: {index_type}")
