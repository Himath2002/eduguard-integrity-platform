from __future__ import annotations

import os
import re
import tempfile
import unicodedata
from typing import Any, Iterable, Sequence

import fitz

PLAG_COLOR = (0.95, 0.72, 0.14)
AI_COLOR = (0.91, 0.27, 0.27)

# detailed plagiarism colors
LECTURE_COLOR = (1.00, 0.95, 0.55)      # light yellow
SUBMISSION_COLOR = (0.97, 0.82, 0.25)   # darker yellow
ONLINE_COLOR = (0.72, 0.86, 1.00)       # light blue
MULTI_COLOR = (0.86, 0.74, 0.96)        # light purple

# Text-report colours intentionally mirror the React report preview.
TEXT_PLAG_COLOR = (253 / 255, 224 / 255, 71 / 255)
TEXT_AI_COLORS = {
    "very_high": (251 / 255, 113 / 255, 133 / 255),
    "high": (253 / 255, 164 / 255, 175 / 255),
    "medium": (253 / 255, 186 / 255, 116 / 255),
    "low": (253 / 255, 224 / 255, 71 / 255),
}
TEXT_DETAILED_COLORS = {
    "lecture": (254 / 255, 202 / 255, 202 / 255),
    "submission": (254 / 255, 240 / 255, 138 / 255),
    "online": (191 / 255, 219 / 255, 254 / 255),
    "multiple": (221 / 255, 214 / 255, 254 / 255),
}
TEXT_DETAILED_TEXT_COLORS = {
    "lecture": (127 / 255, 29 / 255, 29 / 255),
    "submission": (113 / 255, 63 / 255, 18 / 255),
    "online": (30 / 255, 64 / 255, 175 / 255),
    "multiple": (107 / 255, 33 / 255, 168 / 255),
}
DEFAULT_TEXT_COLOR = (15 / 255, 23 / 255, 42 / 255)
MUTED_TEXT_COLOR = (71 / 255, 85 / 255, 105 / 255)


Range = dict[str, Any]


def is_local_existing_path(value: str | None) -> bool:
    if not value:
        return False
    try:
        return os.path.exists(str(value))
    except Exception:
        return False


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _norm_char(ch: str) -> str:
    """Match the browser report-highlighter normalisation as closely as possible."""
    c = unicodedata.normalize("NFKC", ch or "").replace("\u00A0", " ")
    if re.search(r"[a-zA-Z0-9]", c):
        return c.lower()
    if c.isspace():
        return " "
    return " "


def _normalize_with_map(original: str) -> tuple[str, list[int]]:
    norm = ""
    mapping: list[int] = []
    prev_was_space = True

    for idx, ch in enumerate(original or ""):
        out = _norm_char(ch)
        if out == " ":
            if prev_was_space:
                continue
            prev_was_space = True
            norm += " "
            mapping.append(idx)
        else:
            prev_was_space = False
            norm += out
            mapping.append(idx)

    if norm.endswith(" "):
        norm = norm[:-1]
        if mapping:
            mapping.pop()

    return norm, mapping


def _normalize_plain(value: str) -> str:
    return _normalize_with_map(value or "")[0]


def _find_all_occurrences(haystack: str, needle: str) -> list[dict[str, int]]:
    if not needle or len(needle) < 6:
        return []

    out: list[dict[str, int]] = []
    idx = 0
    while True:
        at = haystack.find(needle, idx)
        if at == -1:
            break
        out.append({"start": at, "end": at + len(needle)})
        idx = at + max(1, len(needle) // 2)
    return out


def _merge_ranges(ranges: Sequence[dict[str, int]]) -> list[dict[str, int]]:
    if not ranges:
        return []

    sorted_ranges = sorted(
        ({"start": int(r["start"]), "end": int(r["end"])} for r in ranges),
        key=lambda item: (item["start"], item["end"]),
    )
    merged = [dict(sorted_ranges[0])]

    for cur in sorted_ranges[1:]:
        last = merged[-1]
        if cur["start"] <= last["end"]:
            last["end"] = max(last["end"], cur["end"])
        else:
            merged.append(dict(cur))

    return merged


def _build_phrase_ranges(original_text: str, phrases: Sequence[str]) -> list[dict[str, int]]:
    clean = [str(p or "").strip() for p in phrases or [] if len(str(p or "").strip()) >= 10]
    if not clean:
        return []

    norm_text, mapping = _normalize_with_map(original_text or "")
    if not norm_text or not mapping:
        return []

    unique_phrases = sorted(set(clean), key=lambda item: (-len(item), item))[:80]
    norm_ranges: list[dict[str, int]] = []

    for phrase in unique_phrases:
        norm_phrase = _normalize_plain(phrase)
        if len(norm_phrase) < 10:
            continue
        norm_ranges.extend(_find_all_occurrences(norm_text, norm_phrase))

    if not norm_ranges:
        return []

    original_ranges: list[dict[str, int]] = []
    for range_item in norm_ranges:
        start_norm = int(range_item["start"])
        end_norm = int(range_item["end"])
        if start_norm < 0 or start_norm >= len(mapping):
            continue
        start_orig = mapping[start_norm]
        end_orig = mapping[min(end_norm - 1, len(mapping) - 1)] + 1
        if start_orig >= 0 and end_orig > start_orig:
            original_ranges.append({"start": start_orig, "end": end_orig})

    return _merge_ranges(original_ranges)


def _build_ai_ranges(original_text: str, ai_spans: Sequence[dict]) -> list[dict[str, Any]]:
    max_len = len(original_text or "")
    ranges: list[dict[str, Any]] = []
    for span in ai_spans or []:
        if not isinstance(span, dict):
            continue
        try:
            start = max(0, min(max_len, int(span.get("start") or 0)))
            end = max(0, min(max_len, int(span.get("end") or 0)))
        except Exception:
            continue
        if end <= start:
            continue
        severity = str(span.get("severity") or "low")
        if severity not in TEXT_AI_COLORS:
            severity = "low"
        ranges.append(
            {
                "start": start,
                "end": end,
                "severity": severity,
                "confidence_percent": int(span.get("confidence_percent") or 0),
            }
        )

    return sorted(ranges, key=lambda item: (item["start"], item["end"]))


def _source_key(source: dict[str, Any]) -> str:
    return "::".join(
        [
            str(source.get("phrase") or ""),
            str(source.get("source_type") or ""),
            str(source.get("source_name") or ""),
            str(source.get("source_doc_id") or ""),
            str(source.get("source_chunk_id") or ""),
        ]
    )


def _segment_sources_equal(left: Sequence[dict[str, Any]], right: Sequence[dict[str, Any]]) -> bool:
    if len(left) != len(right):
        return False
    right_keys = {_source_key(item) for item in right}
    return all(_source_key(item) in right_keys for item in left)


def _to_original_ranges(text: str, phrase: str) -> list[dict[str, int]]:
    norm_text, mapping = _normalize_with_map(text or "")
    norm_phrase = _normalize_plain(phrase or "")
    if len(norm_phrase) < 6 or not mapping:
        return []

    ranges: list[dict[str, int]] = []
    for norm_range in _find_all_occurrences(norm_text, norm_phrase):
        start_norm = int(norm_range["start"])
        end_norm = int(norm_range["end"])
        if start_norm < 0 or start_norm >= len(mapping):
            continue
        start_orig = mapping[start_norm]
        end_orig = mapping[min(end_norm - 1, len(mapping) - 1)] + 1
        if start_orig >= 0 and end_orig > start_orig:
            ranges.append({"start": start_orig, "end": end_orig})
    return ranges


def _build_detailed_segments(
    text: str,
    detailed_matches: Sequence[dict[str, Any]] | None = None,
    *,
    lecture_phrases: Sequence[str] | None = None,
    submission_phrases: Sequence[str] | None = None,
    online_phrases: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    raw_ranges: list[dict[str, Any]] = []

    matches: list[dict[str, Any]] = []
    if detailed_matches:
        matches = [dict(item) for item in detailed_matches if isinstance(item, dict)]
    else:
        for phrase in lecture_phrases or []:
            matches.append({"phrase": phrase, "source_type": "lecture_material"})
        for phrase in submission_phrases or []:
            matches.append({"phrase": phrase, "source_type": "submission"})
        for phrase in online_phrases or []:
            matches.append({"phrase": phrase, "source_type": "online_source"})

    for match in matches:
        phrase = str(match.get("phrase") or "").strip()
        if len(phrase) < 8:
            continue
        for anchored in _to_original_ranges(text, phrase):
            raw_ranges.append({"start": anchored["start"], "end": anchored["end"], "source": match})

    if not raw_ranges:
        return []

    boundaries = {0, len(text or "")}
    for raw in raw_ranges:
        boundaries.add(int(raw["start"]))
        boundaries.add(int(raw["end"]))

    sorted_boundaries = sorted(boundaries)
    segments: list[dict[str, Any]] = []

    for idx in range(len(sorted_boundaries) - 1):
        start = sorted_boundaries[idx]
        end = sorted_boundaries[idx + 1]
        if end <= start:
            continue

        covering = [raw for raw in raw_ranges if int(raw["start"]) < end and int(raw["end"]) > start]
        if not covering:
            continue

        source_map: dict[str, dict[str, Any]] = {}
        for raw in covering:
            source = raw["source"]
            source_map.setdefault(_source_key(source), source)
        sources = list(source_map.values())

        has_lecture = any(str(src.get("source_type") or "") == "lecture_material" for src in sources)
        has_submission = any(str(src.get("source_type") or "") == "submission" for src in sources)
        has_online = any(str(src.get("source_type") or "") == "online_source" for src in sources)
        active_count = sum([has_lecture, has_submission, has_online])
        segment_type = (
            "multiple"
            if active_count > 1
            else "lecture"
            if has_lecture
            else "submission"
            if has_submission
            else "online"
        )

        last = segments[-1] if segments else None
        if (
            last
            and int(last["end"]) == start
            and str(last["type"]) == segment_type
            and _segment_sources_equal(last.get("sources") or [], sources)
        ):
            last["end"] = end
        else:
            segments.append({"start": start, "end": end, "type": segment_type, "sources": sources})

    return segments


def _candidate_needles(value: str) -> list[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return []

    candidates: list[str] = [cleaned]
    if len(cleaned) > 160:
        candidates.append(cleaned[:160].rsplit(" ", 1)[0] or cleaned[:160])
    if len(cleaned) > 110:
        candidates.append(cleaned[:110].rsplit(" ", 1)[0] or cleaned[:110])
    if len(cleaned) > 75:
        candidates.append(cleaned[:75].rsplit(" ", 1)[0] or cleaned[:75])

    parts = [p.strip() for p in re.split(r"[\.;\n]", cleaned) if len(p.strip()) >= 18]
    candidates.extend(parts[:3])

    uniq: list[str] = []
    seen = set()
    for item in candidates:
        key = item.lower()
        if key in seen or len(item) < 8:
            continue
        seen.add(key)
        uniq.append(item)
    return uniq


def _build_ai_needles(extracted_text: str, ai_spans: Sequence[dict]) -> list[str]:
    out: list[str] = []
    text_len = len(extracted_text or "")
    for span in ai_spans or []:
        try:
            start = max(0, min(text_len, int((span or {}).get("start") or 0)))
            end = max(0, min(text_len, int((span or {}).get("end") or 0)))
        except Exception:
            start = end = 0

        if end > start:
            snippet = _clean_text(extracted_text[start:end])
            if len(snippet) >= 8:
                out.extend(_candidate_needles(snippet))
                continue

        preview = _clean_text(str((span or {}).get("text_preview") or ""))
        if len(preview) >= 8:
            out.extend(_candidate_needles(preview))

    uniq: list[str] = []
    seen = set()
    for item in out:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(item)
    return uniq[:240]


def _build_plag_needles(phrases: Iterable[str]) -> list[str]:
    out: list[str] = []
    for phrase in phrases or []:
        out.extend(_candidate_needles(str(phrase or "")))
    uniq: list[str] = []
    seen = set()
    for item in out:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(item)
    return uniq[:160]


def _highlight_candidates(
    page: fitz.Page,
    needles: Sequence[str],
    color: tuple[float, float, float],
    *,
    per_page_limit: int = 80,
    seen: set[tuple[float, float, float, float]] | None = None,
) -> int:
    if not needles:
        return 0

    local_seen = seen if seen is not None else set()
    count = 0

    for needle in needles:
        hits = page.search_for(needle, quads=False)
        if not hits:
            continue

        for rect in hits:
            key = (
                round(rect.x0, 1),
                round(rect.y0, 1),
                round(rect.x1, 1),
                round(rect.y1, 1),
            )
            if key in local_seen:
                continue

            local_seen.add(key)
            annot = page.add_highlight_annot(rect)
            annot.set_colors(stroke=color)
            annot.update(opacity=0.35)
            count += 1

            if count >= per_page_limit:
                return count

    return count


def _find_rects_for_needles(
    page: fitz.Page,
    needles: Sequence[str],
    *,
    per_page_limit: int = 120,
) -> list[tuple[tuple[float, float, float, float], fitz.Rect]]:
    results: list[tuple[tuple[float, float, float, float], fitz.Rect]] = []
    seen: set[tuple[float, float, float, float]] = set()

    for needle in needles:
        hits = page.search_for(needle, quads=False)
        if not hits:
            continue

        for rect in hits:
            key = (
                round(rect.x0, 1),
                round(rect.y0, 1),
                round(rect.x1, 1),
                round(rect.y1, 1),
            )
            if key in seen:
                continue
            seen.add(key)
            results.append((key, rect))

            if len(results) >= per_page_limit:
                return results

    return results


def _new_text_page(doc: fitz.Document, *, title: str | None = None, subtitle: str | None = None) -> tuple[fitz.Page, float, float, float]:
    page = doc.new_page(width=595, height=842)  # A4 portrait in points.
    left = 54.0
    right = 541.0
    y = 54.0

    if title:
        page.insert_text((left, y), title, fontsize=16, fontname="helv", color=DEFAULT_TEXT_COLOR)
        y += 22
    if subtitle:
        page.insert_text((left, y), subtitle, fontsize=9, fontname="helv", color=MUTED_TEXT_COLOR)
        y += 18
    if title or subtitle:
        page.draw_line((left, y), (right, y), color=(226 / 255, 232 / 255, 240 / 255), width=0.7)
        y += 18

    return page, left, right, y


def _tokenize_for_pdf(text: str) -> list[str]:
    return re.findall(r"\n|[^\S\n]+|\S+", text or "")


def _split_long_token(token: str, fontname: str, fontsize: float, max_width: float) -> list[str]:
    if fitz.get_text_length(token, fontname=fontname, fontsize=fontsize) <= max_width:
        return [token]

    parts: list[str] = []
    current = ""
    for ch in token:
        trial = current + ch
        if current and fitz.get_text_length(trial, fontname=fontname, fontsize=fontsize) > max_width:
            parts.append(current)
            current = ch
        else:
            current = trial
    if current:
        parts.append(current)
    return parts or [token]


def _render_text_runs_to_pdf(
    *,
    title: str,
    subtitle: str,
    runs: Sequence[dict[str, Any]],
    legend: Sequence[tuple[str, tuple[float, float, float], tuple[float, float, float] | None]],
) -> str:
    doc = fitz.open()
    try:
        page, left, right, y = _new_text_page(doc, title=title, subtitle=subtitle)
        x = left
        bottom = 800.0
        fontname = "helv"
        fontsize = 10.5
        line_height = 15.0
        max_width = right - left

        if legend:
            legend_x = left
            for label, fill, text_color in legend:
                label_width = fitz.get_text_length(label, fontname=fontname, fontsize=8.5) + 30
                if legend_x + label_width > right:
                    legend_x = left
                    y += 16
                rect = fitz.Rect(legend_x, y - 9, legend_x + 20, y + 1)
                page.draw_rect(rect, color=None, fill=fill, overlay=True)
                page.insert_text((legend_x + 24, y), label, fontsize=8.5, fontname=fontname, color=text_color or DEFAULT_TEXT_COLOR)
                legend_x += label_width
            y += 22

        def ensure_page(extra: float = line_height) -> None:
            nonlocal page, x, y
            if y + extra <= bottom:
                return
            page, _, _, y = _new_text_page(doc)
            x = left

        def newline() -> None:
            nonlocal x, y
            x = left
            y += line_height
            ensure_page()

        for run in runs:
            text = str(run.get("text") or "")
            fill = run.get("fill")
            text_color = run.get("color") or DEFAULT_TEXT_COLOR
            for raw_token in _tokenize_for_pdf(text):
                if raw_token == "\n":
                    newline()
                    continue

                for token in _split_long_token(raw_token, fontname, fontsize, max_width):
                    is_space = token.strip() == ""
                    token_width = fitz.get_text_length(token, fontname=fontname, fontsize=fontsize)
                    if x + token_width > right and not is_space:
                        newline()
                    elif x + token_width > right and is_space:
                        newline()
                        continue

                    if is_space and x == left:
                        continue

                    ensure_page()
                    if fill and token.strip():
                        page.draw_rect(
                            fitz.Rect(x - 1.0, y - fontsize - 1.5, x + token_width + 1.0, y + 3.0),
                            color=None,
                            fill=fill,
                            overlay=True,
                        )
                    if token:
                        page.insert_text((x, y), token, fontsize=fontsize, fontname=fontname, color=text_color)
                    x += token_width

        fd, temp_path = tempfile.mkstemp(suffix="_integrity_text_report.pdf", prefix="eduguard_integrity_")
        os.close(fd)
        doc.save(temp_path, garbage=4, deflate=True)
        return temp_path
    finally:
        doc.close()


def _runs_from_ranges(text: str, ranges: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    if not text:
        return [{"text": "No extracted text found.", "fill": None, "color": DEFAULT_TEXT_COLOR}]
    if not ranges:
        return [{"text": text, "fill": None, "color": DEFAULT_TEXT_COLOR}]

    boundaries = {0, len(text)}
    for item in ranges:
        boundaries.add(max(0, min(len(text), int(item["start"]))))
        boundaries.add(max(0, min(len(text), int(item["end"]))))

    sorted_points = sorted(boundaries)
    runs: list[dict[str, Any]] = []
    for idx in range(len(sorted_points) - 1):
        start = sorted_points[idx]
        end = sorted_points[idx + 1]
        if end <= start:
            continue
        active = next((item for item in ranges if int(item["start"]) < end and int(item["end"]) > start), None)
        if active:
            runs.append(
                {
                    "text": text[start:end],
                    "fill": active.get("fill"),
                    "color": active.get("color") or DEFAULT_TEXT_COLOR,
                }
            )
        else:
            runs.append({"text": text[start:end], "fill": None, "color": DEFAULT_TEXT_COLOR})

    return runs or [{"text": text, "fill": None, "color": DEFAULT_TEXT_COLOR}]


def _legacy_generate_integrity_highlight_pdf_from_local(
    local_pdf_path: str,
    *,
    extracted_text: str,
    plagiarised_phrases: Sequence[str],
    ai_spans: Sequence[dict],
    mode: str,
) -> str:
    """
    Original PDF-overlay implementation kept only as a private fallback/reference.

    The public download endpoints now use the text-report generator below because
    the browser preview is text/range based. Searching the uploaded PDF for
    shortened phrase needles could highlight repeated text in the wrong place.
    """
    normalized_mode = (mode or "plagiarism").strip().lower()
    if normalized_mode not in {"plagiarism", "ai"}:
        normalized_mode = "plagiarism"

    doc = fitz.open(str(local_pdf_path))
    try:
        if normalized_mode == "ai":
            needles = _build_ai_needles(extracted_text, ai_spans)
            color = AI_COLOR
        else:
            needles = _build_plag_needles(plagiarised_phrases)
            color = PLAG_COLOR

        for page in doc:
            _highlight_candidates(page, needles, color)

        fd, temp_path = tempfile.mkstemp(
            suffix=f"_{normalized_mode}_integrity.pdf",
            prefix="eduguard_integrity_",
        )
        os.close(fd)
        doc.save(temp_path, garbage=4, deflate=True)
        return temp_path
    finally:
        doc.close()


def generate_integrity_highlight_pdf_from_local(
    local_pdf_path: str,
    *,
    extracted_text: str,
    plagiarised_phrases: Sequence[str],
    ai_spans: Sequence[dict],
    mode: str,
    report_text: str | None = None,
) -> str:
    """Generate the downloadable report from the same text/range model as the UI.

    The previous implementation searched inside the original PDF. That caused
    downloaded reports to show different colours/positions from the online report
    whenever the same phrase occurred in multiple places, punctuation differed, or
    candidate snippets were shortened. This function now mirrors the React
    highlighter and produces a clean report PDF whose highlights match the modal.
    """
    normalized_mode = (mode or "plagiarism").strip().lower()
    if normalized_mode not in {"plagiarism", "ai"}:
        normalized_mode = "plagiarism"

    del local_pdf_path  # The download must match extracted report text, not PDF-search heuristics.

    if normalized_mode == "ai":
        text = extracted_text or ""
        ai_ranges = _build_ai_ranges(text, ai_spans)
        ranges = [
            {
                "start": item["start"],
                "end": item["end"],
                "fill": TEXT_AI_COLORS.get(str(item.get("severity") or "low"), TEXT_AI_COLORS["low"]),
                "color": DEFAULT_TEXT_COLOR,
            }
            for item in ai_ranges
        ]
        title = "EduGuard AI Report"
        subtitle = "Downloaded PDF generated from the same AI span ranges used in the online report preview."
        legend = [
            ("Very high AI risk", TEXT_AI_COLORS["very_high"], DEFAULT_TEXT_COLOR),
            ("High", TEXT_AI_COLORS["high"], DEFAULT_TEXT_COLOR),
            ("Medium", TEXT_AI_COLORS["medium"], DEFAULT_TEXT_COLOR),
            ("Low", TEXT_AI_COLORS["low"], DEFAULT_TEXT_COLOR),
        ]
    else:
        text = report_text if report_text is not None else extracted_text or ""
        ranges = [
            {"start": item["start"], "end": item["end"], "fill": TEXT_PLAG_COLOR, "color": DEFAULT_TEXT_COLOR}
            for item in _build_phrase_ranges(text, plagiarised_phrases)
        ]
        title = "EduGuard Plagiarism Report"
        subtitle = "Downloaded PDF generated from the same normalized phrase ranges used in the online report preview."
        legend = [("Plagiarism match", TEXT_PLAG_COLOR, DEFAULT_TEXT_COLOR)]

    runs = _runs_from_ranges(text or "No extracted text found.", ranges)
    return _render_text_runs_to_pdf(title=title, subtitle=subtitle, runs=runs, legend=legend)


def generate_detailed_integrity_highlight_pdf_from_local(
    local_pdf_path: str,
    *,
    lecture_phrases: Sequence[str],
    submission_phrases: Sequence[str],
    online_phrases: Sequence[str],
    report_text: str | None = None,
    detailed_matches: Sequence[dict[str, Any]] | None = None,
) -> str:
    """Generate detailed plagiarism PDF matching the detailed online text report.

    When report_text is provided, the output is range-based and aligned with the
    UI. If older code calls this without report_text, it falls back to the legacy
    PDF-overlay behaviour for backward compatibility.
    """
    if report_text is None:
        doc = fitz.open(str(local_pdf_path))
        try:
            lecture_needles = _build_plag_needles(lecture_phrases)
            submission_needles = _build_plag_needles(submission_phrases)
            online_needles = _build_plag_needles(online_phrases)

            for page in doc:
                lecture_hits = _find_rects_for_needles(page, lecture_needles)
                submission_hits = _find_rects_for_needles(page, submission_needles)
                online_hits = _find_rects_for_needles(page, online_needles)

                lecture_map = {key: rect for key, rect in lecture_hits}
                submission_map = {key: rect for key, rect in submission_hits}
                online_map = {key: rect for key, rect in online_hits}

                all_keys = set(lecture_map.keys()) | set(submission_map.keys()) | set(online_map.keys())

                for key in all_keys:
                    has_lecture = key in lecture_map
                    has_submission = key in submission_map
                    has_online = key in online_map

                    active_count = sum([has_lecture, has_submission, has_online])

                    rect = (
                        lecture_map.get(key)
                        or submission_map.get(key)
                        or online_map.get(key)
                    )

                    if rect is None:
                        continue

                    if active_count > 1:
                        color = MULTI_COLOR
                        opacity = 0.45
                    elif has_lecture:
                        color = LECTURE_COLOR
                        opacity = 0.35
                    elif has_submission:
                        color = SUBMISSION_COLOR
                        opacity = 0.35
                    else:
                        color = ONLINE_COLOR
                        opacity = 0.35

                    annot = page.add_highlight_annot(rect)
                    annot.set_colors(stroke=color)
                    annot.update(opacity=opacity)

            fd, temp_path = tempfile.mkstemp(
                suffix="_detailed_integrity.pdf",
                prefix="eduguard_integrity_",
            )
            os.close(fd)
            doc.save(temp_path, garbage=4, deflate=True)
            return temp_path
        finally:
            doc.close()

    del local_pdf_path

    text = report_text or ""
    detailed_segments = _build_detailed_segments(
        text,
        detailed_matches,
        lecture_phrases=lecture_phrases,
        submission_phrases=submission_phrases,
        online_phrases=online_phrases,
    )

    ranges = [
        {
            "start": int(item["start"]),
            "end": int(item["end"]),
            "fill": TEXT_DETAILED_COLORS.get(str(item.get("type") or "online"), TEXT_DETAILED_COLORS["online"]),
            "color": TEXT_DETAILED_TEXT_COLORS.get(str(item.get("type") or "online"), DEFAULT_TEXT_COLOR),
        }
        for item in detailed_segments
    ]

    runs = _runs_from_ranges(text or "No extracted text found.", ranges)
    legend = [
        ("Lecture note match", TEXT_DETAILED_COLORS["lecture"], TEXT_DETAILED_TEXT_COLORS["lecture"]),
        ("Student submission match", TEXT_DETAILED_COLORS["submission"], TEXT_DETAILED_TEXT_COLORS["submission"]),
        ("Online source match", TEXT_DETAILED_COLORS["online"], TEXT_DETAILED_TEXT_COLORS["online"]),
        ("Multiple source match", TEXT_DETAILED_COLORS["multiple"], TEXT_DETAILED_TEXT_COLORS["multiple"]),
    ]
    return _render_text_runs_to_pdf(
        title="EduGuard Detailed Plagiarism Report",
        subtitle="Downloaded PDF generated from the same detailed source ranges used in the online report preview.",
        runs=runs,
        legend=legend,
    )
