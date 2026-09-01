from __future__ import annotations

from app.ai.chunking import chunk_text, split_sentences
from app.ai.normalization import (
    dedupe_preserve_order,
    maybe_strip_reference_section,
    normalize_text,
    prepare_text_for_similarity,
    strip_submission_boilerplate,
)


def test_normalize_text_collapses_unicode_whitespace_and_smart_quotes() -> None:
    raw = "  The\u00a0student’s\twork\r\nuses “quoted” - evidence.  "

    normalized = normalize_text(raw)

    assert normalized == 'The student\'s work\nuses "quoted" - evidence.'


def test_strip_submission_boilerplate_removes_metadata_but_keeps_content() -> None:
    raw = """
    Course Code: IT401
    Student Name: Minaya
    Assignment Title: Integrity Report
    This paragraph explains the actual academic argument with enough context.
    """

    cleaned = strip_submission_boilerplate(raw)

    assert "Course Code" not in cleaned
    assert "Student Name" not in cleaned
    assert "actual academic argument" in cleaned


def test_reference_section_is_stripped_only_when_it_is_a_late_citation_tail() -> None:
    body = " ".join(["The body discusses integrity evidence and source comparison."] * 8)
    references = "\nReferences\n[1] Smith, A. 2022.\n[2] Jones, B. 2023.\n[3] Lee, C. 2024."

    cleaned = maybe_strip_reference_section(body + references)

    assert "References" not in cleaned
    assert "source comparison" in cleaned


def test_reference_word_in_intro_is_not_stripped_when_not_a_bibliography_tail() -> None:
    raw = "References to evidence appear early in this report. The real discussion continues after that sentence."

    cleaned = maybe_strip_reference_section(raw)

    assert "References to evidence" in cleaned
    assert "real discussion" in cleaned


def test_prepare_text_for_similarity_combines_boilerplate_and_reference_cleanup() -> None:
    raw = """
    Student ID: 12345
    Page 1 of 3
    Integrity tools should present visible evidence and clear source labels.
    References
    [1] Example, A. 2022.
    [2] Example, B. 2023.
    [3] Example, C. 2024.
    """

    cleaned = prepare_text_for_similarity(raw)

    assert "Student ID" not in cleaned
    assert "Page 1" not in cleaned
    assert "Integrity tools" in cleaned
    assert "Example, A" not in cleaned


def test_dedupe_preserve_order_normalizes_and_drops_short_items() -> None:
    values = ["  First phrase  ", "first phrase", "x", "Second phrase"]

    result = dedupe_preserve_order(values, min_len=3)

    assert result == ["First phrase", "Second phrase"]


def test_split_sentences_handles_punctuation_based_splitting() -> None:
    text = "One complete idea appears here. Another follows with evidence! Does the splitter work? Yes."

    sentences = split_sentences(text)

    assert len(sentences) == 4
    assert sentences[0].startswith("One complete idea")


def test_split_sentences_falls_back_for_long_pdf_text_without_punctuation() -> None:
    text = "word " * 260

    sentences = split_sentences(text)

    assert len(sentences) >= 2
    assert all(sentence.strip() for sentence in sentences)


def test_chunk_text_creates_stable_non_empty_chunks_with_overlap() -> None:
    text = " ".join([f"Sentence {idx} contains useful academic evidence." for idx in range(1, 18)])

    chunks = chunk_text(text, max_chars=170, overlap_sents=1, min_chunk_chars=40)

    assert len(chunks) >= 2
    assert [chunk.chunk_id for chunk in chunks] == list(range(len(chunks)))
    assert all(len(chunk.text) >= 40 for chunk in chunks)


def test_chunk_text_returns_empty_list_for_empty_or_metadata_only_text() -> None:
    assert chunk_text("") == []
    assert chunk_text("Student Name: A\nStudent ID: B") == []


def test_short_one_page_reference_tail_is_stripped_when_citation_dense() -> None:
    raw = """
    This submission explains why visible evidence matters for integrity decisions.
    References
    [1] Smith, A. 2022.
    [2] Jones, B. 2023.
    [3] Lee, C. 2024.
    """

    cleaned = maybe_strip_reference_section(raw)

    assert "visible evidence matters" in cleaned
    assert "References" not in cleaned
    assert "Smith, A" not in cleaned


def test_reference_heading_with_following_narrative_is_kept() -> None:
    raw = """
    The report introduces evidence handling.
    References
    This section explains how references to prior reports are shown to students and lecturers.
    It continues with a normal discussion instead of a bibliography.
    """

    cleaned = maybe_strip_reference_section(raw)

    assert "References" in cleaned
    assert "normal discussion" in cleaned


def test_bibliography_heading_variants_are_stripped_when_tail_is_dense() -> None:
    body = " ".join(["The body compares AI and plagiarism evidence with lecturer review." for _ in range(5)])
    raw = body + "\nWorks Cited\nBrown, A. Integrity Journal. 2020.\nGreen, B. Education Review. 2021.\nWhite, C. AI Review. 2022.\nhttps://example.edu/source"

    cleaned = maybe_strip_reference_section(raw)

    assert "lecturer review" in cleaned
    assert "Works Cited" not in cleaned
    assert "Education Review" not in cleaned


def test_prepare_text_for_similarity_keeps_content_when_no_reference_heading() -> None:
    raw = "Student ID: 111\nThe assignment references evidence from reports but does not include a bibliography."

    cleaned = prepare_text_for_similarity(raw)

    assert "Student ID" not in cleaned
    assert "references evidence" in cleaned
    assert "bibliography" in cleaned


def test_normalize_text_removes_zero_width_characters() -> None:
    raw = "AI\u200b detection\ufeff should remain readable."

    assert normalize_text(raw) == "AI detection should remain readable."
