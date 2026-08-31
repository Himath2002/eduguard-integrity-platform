from __future__ import annotations

import pytest

from app.ai import plagiarism
from app.ai.chunking import chunk_text
from app.ai.plagiarism import (
    _containment_ratio,
    _filter_evidence_phrases,
    _is_generic_phrase,
    _sequence_ratio,
    semantic_similarity_search,
)


def test_exact_copied_paragraph_is_detected_with_source_metadata(
    monkeypatch: pytest.MonkeyPatch,
    copied_paragraph: str,
) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, copied_paragraph)],
        corpus=[
            {
                "doc_id": "lecture-week-2",
                "chunk_id": 7,
                "text": copied_paragraph,
                "source_type": "lecture_material",
                "source_name": "Week 2 notes",
                "source_path": "s3://bucket/week2.pdf",
                "class_id": 10,
                "assignment_id": 33,
            }
        ],
        min_score=0.20,
        full_text=copied_paragraph,
    )

    assert result.overall_score > 0.75
    assert result.index_type.endswith("numpy_reranked")
    assert len(result.matches) >= 1
    match = result.matches[0]
    assert match.source_type == "lecture_material"
    assert match.source_name == "Week 2 notes"
    assert match.class_id == 10
    assert match.assignment_id == 33
    assert match.match_type in {"exact_supported", "near_exact_supported"}
    assert any("visible evidence" in phrase for phrase in match.shared_phrases)


def test_unrelated_corpus_returns_no_high_confidence_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, "The submission discusses privacy, access logs, and automated decisions in university systems.")],
        corpus=[("unrelated", 1, "Cooking recipes, travel planning, and rainy weather are unrelated topics.")],
        min_score=0.65,
    )

    assert result.overall_score == 0.0
    assert result.matches == []


def test_multiple_source_types_are_preserved_in_matches(monkeypatch: pytest.MonkeyPatch, copied_paragraph: str) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, copied_paragraph)],
        corpus=[
            {"doc_id": "student-old", "chunk_id": 1, "text": copied_paragraph, "source_type": "submission", "source_name": "Previous student"},
            {"doc_id": "online-1", "chunk_id": 2, "text": copied_paragraph, "source_type": "online_source", "source_name": "Online article"},
        ],
        min_score=0.20,
        full_text=copied_paragraph,
    )

    source_types = {match.source_type for match in result.matches}
    assert {"submission", "online_source"}.issubset(source_types)


def test_empty_query_or_empty_corpus_is_safe() -> None:
    assert semantic_similarity_search([], corpus=[]).overall_score == 0.0
    assert semantic_similarity_search([(1, "some text")], corpus=[]).matches == []
    assert semantic_similarity_search([], corpus=[("doc", 1, "source text")]).matches == []


def test_short_or_generic_phrases_are_suppressed() -> None:
    phrases = ["in conclusion", "this report", "unique visible evidence source labels exact text range"]

    filtered = _filter_evidence_phrases(phrases)

    assert "in conclusion" not in filtered
    assert "this report" not in filtered
    assert filtered == ["unique visible evidence source labels exact text range"]


@pytest.mark.parametrize("phrase", ["in conclusion", "this report", "step 1", "the and of"])
def test_generic_phrase_detector_blocks_low_value_phrases(phrase: str) -> None:
    assert _is_generic_phrase(phrase) is True


def test_lexical_and_sequence_helpers_measure_similarity_ordering(copied_paragraph: str) -> None:
    near_copy = copied_paragraph.replace("lecturers", "teachers")
    unrelated = "Rainy weather and cooking recipes are not connected to the assignment."

    assert _containment_ratio(copied_paragraph, near_copy) > _containment_ratio(copied_paragraph, unrelated)
    assert _sequence_ratio(copied_paragraph, near_copy) > _sequence_ratio(copied_paragraph, unrelated)


def test_plagiarism_result_uses_visible_anchored_coverage_when_full_text_is_supplied(
    monkeypatch: pytest.MonkeyPatch,
    copied_paragraph: str,
) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    full_text = copied_paragraph + "\n\nA separate original paragraph adds more discussion and should reduce overall coverage."
    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, copied_paragraph)],
        corpus=[{"doc_id": "doc", "chunk_id": 1, "text": copied_paragraph, "source_type": "submission"}],
        min_score=0.20,
        full_text=full_text,
    )

    assert 0.45 < result.overall_score < 1.0


def test_exact_duplicate_long_submission_scores_as_full_plagiarism(
    monkeypatch: pytest.MonkeyPatch,
    copied_paragraph: str,
) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    original_sentence = (
        "A separate original sentence about privacy, access logs, and automated decisions "
        "keeps the document long enough to create multiple chunks."
    )
    full_text = "\n\n".join([copied_paragraph, original_sentence] * 8)
    chunks = chunk_text(full_text)

    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(chunk.chunk_id, chunk.text) for chunk in chunks],
        corpus=[
            {
                "doc_id": "previous-submission",
                "chunk_id": chunk.chunk_id,
                "text": chunk.text,
                "source_type": "submission",
            }
            for chunk in chunks
        ],
        min_score=0.20,
        full_text=full_text,
    )

    assert len(chunks) > 1
    assert result.overall_score > 0.95
    assert {match.match_type for match in result.matches} == {"exact_supported"}


def test_semantic_only_match_does_not_count_entire_query_as_exact_coverage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tests.integrity_detection.conftest import lexical_vectorize

    source = (
        "Academic integrity systems compare submitted work against trusted learning materials and prior "
        "submissions. The strongest reports show visible evidence, source labels, and the exact text range "
        "that caused the score so that lecturers can review the decision fairly."
    )
    query = (
        "Students should submit original work and use source labels when they discuss academic integrity. "
        "A university may use reports to help lecturers review decisions fairly, but the purpose is education and trust."
    )

    monkeypatch.setenv("PLAG_MIN_RERANK_SCORE", "0.28")
    monkeypatch.setattr(plagiarism, "embed_texts", lambda texts: lexical_vectorize(texts))
    monkeypatch.setattr(plagiarism, "score_pairs_with_plagiarism_reranker", lambda pairs: [None] * len(pairs))

    result = semantic_similarity_search(
        [(1, query)],
        corpus=[{"doc_id": "source", "chunk_id": 1, "text": source, "source_type": "submission"}],
        min_score=0.20,
        full_text=query,
    )

    assert result.matches
    assert result.matches[0].shared_phrases == []
    assert 0.0 < result.overall_score < 0.40
