from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

import pytest


@pytest.fixture(autouse=True)
def fast_integrity_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep integrity tests deterministic, offline-safe, and fast.

    These values ensure tests never download large Hugging Face models and never try
    to use FAISS/OpenMP features that can make local student laptops unstable.
    """
    monkeypatch.setenv("PLAG_PROGRESS", "0")
    monkeypatch.setenv("PLAG_USE_SPACY", "0")
    monkeypatch.setenv("PLAG_EMBEDDING", "hash")
    monkeypatch.setenv("PLAG_DISABLE_FAISS", "1")
    monkeypatch.setenv("PLAG_RERANKER_MODE", "off")
    monkeypatch.setenv("ENABLE_AI_MODEL_DETECTION", "0")
    monkeypatch.setenv("AI_ENABLE_PERPLEXITY", "0")
    monkeypatch.setenv("TOKENIZERS_PARALLELISM", "false")


@pytest.fixture()
def human_like_text() -> str:
    return (
        "After comparing the course notes with two library sources, I changed my argument because the "
        "first draft relied too much on a single claim. In practice, the privacy risk depends on who "
        "controls the access log, how long data is retained, and whether students can question an "
        "automated decision. For example, a university system may be useful for feedback, but I would "
        "still ask whether the evidence is accurate before accepting the result."
    )


@pytest.fixture()
def ai_like_text() -> str:
    return (
        "Moreover, it is important to note that digital education systems significantly enhance learning "
        "outcomes. Furthermore, these systems provide scalable, efficient, and comprehensive support for "
        "students. Additionally, the implementation of intelligent analysis promotes academic integrity. "
        "Overall, this report demonstrates that technology creates a robust and optimized educational environment."
    )


@pytest.fixture()
def copied_paragraph() -> str:
    return (
        "Academic integrity systems compare submitted work against trusted learning materials and prior "
        "submissions. The strongest reports show visible evidence, source labels, and the exact text range "
        "that caused the score so that lecturers can review the decision fairly."
    )


@pytest.fixture()
def test_pdf_path(shared_test_data_dir: Path) -> Path:
    return shared_test_data_dir / "valid.pdf"


def lexical_vectorize(texts: Iterable[str]):
    """Small deterministic embedding helper used by plagiarism tests.

    It intentionally avoids transformer downloads while preserving meaningful
    similarity ordering for the controlled fixture texts.
    """
    import math
    import re
    import numpy as np

    vocab = [
        "academic", "integrity", "systems", "compare", "submitted", "trusted", "learning",
        "materials", "prior", "submissions", "reports", "visible", "evidence", "source",
        "labels", "exact", "text", "range", "lecturers", "review", "privacy", "access",
        "decision", "automated", "different", "unrelated", "weather", "cooking", "travel",
    ]
    rows = []
    for text in texts:
        tokens = re.findall(r"[a-z0-9']+", str(text).lower())
        counts = [float(tokens.count(word)) for word in vocab]
        norm = math.sqrt(sum(v * v for v in counts)) or 1.0
        rows.append([v / norm for v in counts])
    return np.asarray(rows, dtype="float32")
