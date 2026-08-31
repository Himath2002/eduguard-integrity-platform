from __future__ import annotations

import pytest

from app.ai import plagiarism
from app.ai.ai_detection import detect_ai
from app.ai.chunking import chunk_text
from app.ai.models import _pick_ai_probability
from app.ai.normalization import prepare_text_for_similarity
from app.ai.plagiarism import _filter_evidence_phrases, semantic_similarity_search


class _FailingDetector:
    model = type("FakeModel", (), {"name_or_path": "broken-model"})()

    def __call__(self, texts):
        raise RuntimeError("detector crashed")


class _PartialDetector:
    model = type("FakeModel", (), {"name_or_path": "partial-model"})()

    def __call__(self, texts):
        return [{"label": "AI", "score": 0.81} for _ in texts]


def test_ai_detector_runtime_failure_is_visible_and_does_not_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.ai.ai_detection.get_ai_detector", lambda: _FailingDetector())

    result = detect_ai([(1, "Generated looking content")])

    assert result.overall_score == 0.0
    assert result.chunks == []
    assert result.model_name == "broken-model"
    assert "AI detector failed" in str(result.error)


def test_pick_ai_probability_clamps_invalid_scores() -> None:
    assert _pick_ai_probability({"label": "AI", "score": 1.8}) == pytest.approx(1.0)
    assert _pick_ai_probability({"label": "HUMAN", "score": -0.4}) == pytest.approx(1.0)
    assert _pick_ai_probability({"label": "AI", "score": "not-a-number"}) == pytest.approx(0.0)


def test_chunking_drops_header_only_material_after_preprocessing() -> None:
    text = "Student ID: 123\nCourse Code: IT401\nAssignment Title: Report\nPage 1 of 1"

    assert prepare_text_for_similarity(text) == ""
    assert chunk_text(text) == []


def test_chunking_preserves_order_and_overlap_for_real_content() -> None:
    text = " ".join([f"Sentence {idx} describes integrity evidence clearly." for idx in range(1, 12)])

    chunks = chunk_text(text, max_chars=120, overlap_sents=1, min_chunk_chars=35)

    assert len(chunks) >= 3
    assert chunks[0].chunk_id == 0
    assert all(chunks[idx].chunk_id == idx for idx in range(len(chunks)))
    assert "Sentence 1" in chunks[0].text
    assert "Sentence 11" in chunks[-1].text


def test_evidence_phrase_filter_removes_duplicates_after_normalization() -> None:
    phrases = [
        "Visible evidence source labels exact text range",
        " visible evidence source labels exact text range ",
        "this essay",
        "Another unique integrity phrase with enough substance",
    ]

    assert _filter_evidence_phrases(phrases) == [
        "Visible evidence source labels exact text range",
        "Another unique integrity phrase with enough substance",
    ]


def test_similarity_search_keeps_best_source_metadata_for_duplicate_source_text(monkeypatch: pytest.MonkeyPatch, copied_paragraph: str) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, copied_paragraph)],
        corpus=[
            {"doc_id": "lecture-a", "chunk_id": 1, "text": copied_paragraph, "source_type": "lecture_material", "source_name": "Lecture A"},
            {"doc_id": "lecture-b", "chunk_id": 2, "text": copied_paragraph, "source_type": "lecture_material", "source_name": "Lecture B"},
        ],
        min_score=0.20,
        full_text=copied_paragraph,
    )

    assert result.matches
    assert all(match.source_type == "lecture_material" for match in result.matches)
    assert {match.source_name for match in result.matches}.issubset({"Lecture A", "Lecture B"})


def test_similarity_search_handles_mixed_tuple_and_dict_corpus_records(monkeypatch: pytest.MonkeyPatch, copied_paragraph: str) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, copied_paragraph)],
        corpus=[
            ("legacy-doc", 1, copied_paragraph),
            {"doc_id": "online", "chunk_id": 2, "text": copied_paragraph, "source_type": "online_source", "source_name": "Article"},
        ],
        min_score=0.20,
        full_text=copied_paragraph,
    )

    assert result.overall_score > 0.50
    assert any(match.source_doc_id == "legacy-doc" for match in result.matches)
    assert any(match.source_type == "online_source" for match in result.matches)
