from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from app.services import integrity_report_service as reports


def _blank_pdf(path: Path) -> Path:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Original PDF text should not control text-report downloads.")
    doc.save(path)
    doc.close()
    return path


def _read_pdf_text(path: str) -> str:
    with fitz.open(path) as doc:
        return "\n".join(page.get_text() for page in doc)


def test_phrase_ranges_match_browser_normalization_with_punctuation_and_spacing() -> None:
    text = "Visible\n evidence, source labels, and exact text ranges should match."
    phrase = "visible evidence source labels and exact text ranges"

    ranges = reports._build_phrase_ranges(text, [phrase])

    assert len(ranges) == 1
    assert text[ranges[0]["start"] : ranges[0]["end"]].startswith("Visible")
    assert "exact text ranges" in text[ranges[0]["start"] : ranges[0]["end"]]


def test_phrase_ranges_find_repeated_occurrences_without_merging_separate_hits() -> None:
    text = "Copied evidence appears here. Clean middle sentence. Copied evidence appears here."

    ranges = reports._build_phrase_ranges(text, ["Copied evidence appears here"])

    assert len(ranges) == 2
    assert [text[item["start"] : item["end"]] for item in ranges] == [
        "Copied evidence appears here",
        "Copied evidence appears here",
    ]


def test_phrase_ranges_ignore_short_or_empty_evidence() -> None:
    assert reports._build_phrase_ranges("short phrase here", ["short", "", "phrase"]) == []


def test_ai_ranges_are_clamped_and_invalid_ranges_are_ignored() -> None:
    text = "Short text for AI highlighting."

    ranges = reports._build_ai_ranges(
        text,
        [
            {"start": -10, "end": 5, "severity": "very_high", "confidence_percent": 92},
            {"start": 30, "end": 20, "severity": "high"},
            {"start": 6, "end": 500, "severity": "unknown"},
            {"start": "bad", "end": 9, "severity": "medium"},
        ],
    )

    assert len(ranges) == 2
    assert ranges[0]["start"] == 0
    assert ranges[0]["severity"] == "very_high"
    assert ranges[1]["end"] == len(text)
    assert ranges[1]["severity"] == "low"


def test_runs_from_ranges_split_plain_and_highlighted_text_in_order() -> None:
    text = "Plain highlighted plain again"
    ranges = [{"start": 6, "end": 17, "fill": reports.TEXT_PLAG_COLOR, "color": reports.DEFAULT_TEXT_COLOR}]

    runs = reports._runs_from_ranges(text, ranges)

    assert [item["text"] for item in runs] == ["Plain ", "highlighted", " plain again"]
    assert runs[1]["fill"] == reports.TEXT_PLAG_COLOR
    assert runs[0]["fill"] is None


def test_detailed_segments_identify_single_and_multi_source_overlap() -> None:
    text = "Lecture phrase appears here. Online phrase appears here. Shared evidence overlaps now."

    segments = reports._build_detailed_segments(
        text,
        detailed_matches=[
            {"phrase": "Lecture phrase appears here", "source_type": "lecture_material", "source_name": "Slides"},
            {"phrase": "Online phrase appears here", "source_type": "online_source", "source_name": "Website"},
            {"phrase": "Shared evidence overlaps now", "source_type": "lecture_material", "source_name": "Slides"},
            {"phrase": "Shared evidence overlaps now", "source_type": "submission", "source_name": "Prior work"},
        ],
    )

    segment_types = {item["type"] for item in segments}
    assert {"lecture", "online", "multiple"}.issubset(segment_types)


def test_detailed_segments_support_legacy_phrase_buckets() -> None:
    text = "Lecture evidence appears here. Student evidence appears here. Online evidence appears here."

    segments = reports._build_detailed_segments(
        text,
        lecture_phrases=["Lecture evidence appears here"],
        submission_phrases=["Student evidence appears here"],
        online_phrases=["Online evidence appears here"],
    )

    assert [item["type"] for item in segments] == ["lecture", "submission", "online"]


def test_detailed_segments_dedupe_identical_source_ranges() -> None:
    text = "The same source phrase appears here."

    segments = reports._build_detailed_segments(
        text,
        detailed_matches=[
            {"phrase": "same source phrase appears here", "source_type": "online_source", "source_name": "Site"},
            {"phrase": "same source phrase appears here", "source_type": "online_source", "source_name": "Site"},
        ],
    )

    assert len(segments) == 1
    assert len(segments[0]["sources"]) == 1


def test_highlighted_plagiarism_pdf_download_is_valid_and_uses_report_text(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")
    report_text = "The report includes visible evidence and source labels for review."

    out_path = reports.generate_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        extracted_text="different extracted text should not be used for plagiarism mode",
        report_text=report_text,
        plagiarised_phrases=["visible evidence and source labels"],
        ai_spans=[],
        mode="plagiarism",
    )

    try:
        all_text = _read_pdf_text(out_path)
        assert "EduGuard Plagiarism Report" in all_text
        assert "visible evidence" in all_text
        assert "different extracted text" not in all_text
    finally:
        Path(out_path).unlink(missing_ok=True)


def test_highlighted_ai_pdf_download_is_valid_and_uses_ai_spans(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")
    text = "Human opening. Formulaic AI-like sentence appears here with repeated structure."
    start = text.index("Formulaic")

    out_path = reports.generate_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        extracted_text=text,
        plagiarised_phrases=[],
        ai_spans=[{"start": start, "end": len(text), "severity": "high", "confidence_percent": 88}],
        mode="ai",
    )

    try:
        all_text = _read_pdf_text(out_path)
        assert "EduGuard AI Report" in all_text
        assert "Formulaic AI-like" in all_text
    finally:
        Path(out_path).unlink(missing_ok=True)


def test_invalid_highlight_mode_falls_back_to_plagiarism_pdf(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")

    out_path = reports.generate_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        extracted_text="Visible plagiarism evidence appears here.",
        report_text="Visible plagiarism evidence appears here.",
        plagiarised_phrases=["Visible plagiarism evidence"],
        ai_spans=[],
        mode="unknown",
    )

    try:
        assert "EduGuard Plagiarism Report" in _read_pdf_text(out_path)
    finally:
        Path(out_path).unlink(missing_ok=True)


def test_pdf_generation_handles_empty_report_text_gracefully(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")

    out_path = reports.generate_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        extracted_text="",
        report_text="",
        plagiarised_phrases=["missing phrase"],
        ai_spans=[],
        mode="plagiarism",
    )

    try:
        all_text = _read_pdf_text(out_path)
        assert "No extracted text found" in all_text
    finally:
        Path(out_path).unlink(missing_ok=True)


def test_detailed_plagiarism_pdf_download_is_valid_with_source_legend(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")
    text = "Lecture evidence appears here. Online evidence appears here. Student evidence appears here."

    out_path = reports.generate_detailed_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        lecture_phrases=[],
        submission_phrases=[],
        online_phrases=[],
        report_text=text,
        detailed_matches=[
            {"phrase": "Lecture evidence appears here", "source_type": "lecture_material", "source_name": "Week 1 slides"},
            {"phrase": "Online evidence appears here", "source_type": "online_source", "source_name": "Research site"},
            {"phrase": "Student evidence appears here", "source_type": "submission", "source_name": "Prior submission"},
        ],
    )

    try:
        all_text = _read_pdf_text(out_path)
        assert "EduGuard Detailed Plagiarism Report" in all_text
        assert "Lecture note match" in all_text
        assert "Online source match" in all_text
        assert "Student submission match" in all_text
    finally:
        Path(out_path).unlink(missing_ok=True)


def test_detailed_pdf_uses_report_text_not_original_pdf_text(tmp_path: Path) -> None:
    dummy_pdf = _blank_pdf(tmp_path / "source.pdf")
    report_text = "Detailed source evidence should appear in the downloaded report."

    out_path = reports.generate_detailed_integrity_highlight_pdf_from_local(
        str(dummy_pdf),
        lecture_phrases=["Detailed source evidence"],
        submission_phrases=[],
        online_phrases=[],
        report_text=report_text,
    )

    try:
        all_text = _read_pdf_text(out_path)
        assert "Detailed source evidence" in all_text
        assert "Original PDF text should not control" not in all_text
    finally:
        Path(out_path).unlink(missing_ok=True)
