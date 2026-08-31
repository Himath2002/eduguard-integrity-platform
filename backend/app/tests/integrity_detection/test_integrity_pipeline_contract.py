from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.ai import pipeline
from app.ai.ai_detection import AIDetectionResult, AIChunkScore
from app.ai.plagiarism import PlagiarismResult


@dataclass
class FakeExtracted:
    full_text: str
    pages: list[str]


def test_integrity_pipeline_returns_stable_frontend_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        pipeline,
        "extract_pdf_text",
        lambda path: FakeExtracted(
            full_text="Academic integrity evidence appears here. A second sentence supports chunking.",
            pages=["page1"],
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "detect_ai",
        lambda chunks: AIDetectionResult(
            overall_score=0.42,
            chunks=[AIChunkScore(chunk_id=chunks[0][0], label="AI", score=0.42)] if chunks else [],
            model_name="fake-ai",
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "semantic_similarity_search",
        lambda chunks, corpus: PlagiarismResult(overall_score=0.37, matches=[], model_name="fake-plag", index_type="numpy"),
    )

    result = pipeline.run_integrity_pipeline("fake.pdf", corpus=[])

    assert set(result) == {"text_stats", "page_count", "chunk_count", "ai", "plagiarism"}
    assert result["page_count"] == 1
    assert result["chunk_count"] >= 1
    assert result["ai"]["overall"] == pytest.approx(0.42)
    assert result["ai"]["model"] == "fake-ai"
    assert result["plagiarism"]["overall"] == pytest.approx(0.37)
    assert result["plagiarism"]["index"] == "numpy"


def test_pipeline_preserves_ai_detector_error_without_breaking_plagiarism(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "extract_pdf_text", lambda path: FakeExtracted(full_text="Some valid extracted text for integrity checking.", pages=["p"]))
    monkeypatch.setattr(
        pipeline,
        "detect_ai",
        lambda chunks: AIDetectionResult(overall_score=0.0, chunks=[], model_name="", error="AI detector unavailable"),
    )
    monkeypatch.setattr(
        pipeline,
        "semantic_similarity_search",
        lambda chunks, corpus: PlagiarismResult(overall_score=0.25, matches=[], model_name="fake-plag", index_type="numpy"),
    )

    result = pipeline.run_integrity_pipeline("fake.pdf", corpus=[])

    assert result["ai"]["error"] == "AI detector unavailable"
    assert result["plagiarism"]["overall"] == pytest.approx(0.25)
