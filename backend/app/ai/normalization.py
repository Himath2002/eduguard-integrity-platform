from __future__ import annotations

import re
import unicodedata
from typing import Iterable

_ZERO_WIDTH = re.compile(r"[\u200B-\u200D\uFEFF]")
_MULTI_SPACE = re.compile(r"[ \t]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_REFERENCE_HEADING = re.compile(
    r"(^|\n)\s*(references|bibliography|works cited|reference list)\s*[:\-]?\s*(\n|$)",
    re.IGNORECASE,
)
_CITATION_LINE = re.compile(
    r"(^|\n)\s*(\[[0-9]+\]|\([A-Za-z][A-Za-z\-]+,?\s*\d{4}\)|[A-Z][A-Za-z\-]+,\s*[A-Z]\.)",
    re.MULTILINE,
)

_BOILERPLATE_LINE = re.compile(
    r"^\s*(?:"
    r"course\s*code|module\s*code|subject\s*code|course|module|assignment\s*title|assignment|"
    r"student\s*declaration|declaration|student\s*name|student\s*id|registration\s*number|index\s*number|"
    r"submitted\s*by|submission\s*date|date\s*submitted|due\s*date|lecturer|instructor|department|faculty|semester"
    r")\s*:\s*.*$",
    re.IGNORECASE,
)
_PAGE_LINE = re.compile(r"^\s*page\s+\d+(?:\s+of\s+\d+)?\s*$", re.IGNORECASE)
_COURSE_CODE_ONLY = re.compile(r"^[A-Z]{2,}[A-Z0-9\-]*\d{2,}[A-Z0-9\-]*$", re.IGNORECASE)
_DECLARATION_LINE = re.compile(
    r"^\s*i\s+confirm\s+that\s+this\s+submission\s+is\s+prepared\s+for\s+academic\s+evaluation\.?\s*$",
    re.IGNORECASE,
)


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", str(text or ""))
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\u2018", "'").replace("\u2019", "'")
    value = value.replace("\u201c", '"').replace("\u201d", '"')
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    value = _ZERO_WIDTH.sub("", value)

    lines = []
    for line in value.split("\n"):
        collapsed = _MULTI_SPACE.sub(" ", line).strip()
        lines.append(collapsed)

    value = "\n".join(lines)
    value = _MULTI_NEWLINE.sub("\n\n", value)
    return value.strip()


def _is_boilerplate_line(line: str) -> bool:
    cleaned = normalize_text(line)
    if not cleaned:
        return False
    if _BOILERPLATE_LINE.match(cleaned):
        return True
    if _PAGE_LINE.match(cleaned):
        return True
    if _DECLARATION_LINE.match(cleaned):
        return True
    if len(cleaned) <= 24 and _COURSE_CODE_ONLY.match(cleaned):
        return True
    return False


def strip_submission_boilerplate(text: str) -> str:
    """Remove common assignment metadata lines that should not affect plagiarism scoring.

    This is conservative and only strips well-known header-style lines.
    """
    value = normalize_text(text)
    if not value:
        return value

    lines = [line for line in value.split("\n")]
    cleaned_lines: list[str] = []
    removed_count = 0

    for idx, line in enumerate(lines):
        if _is_boilerplate_line(line):
            removed_count += 1
            continue

        # If the document starts with a dense block of label/value metadata, drop it.
        if idx < 8 and ":" in line and len(line) <= 140:
            label = line.split(":", 1)[0].strip().lower()
            if label in {
                "course code",
                "assignment title",
                "student declaration",
                "student name",
                "student id",
                "submitted by",
                "submission date",
                "module code",
                "lecturer",
            }:
                removed_count += 1
                continue

        cleaned_lines.append(line)

    result = "\n".join(cleaned_lines).strip()
    if removed_count == 0:
        return value
    return normalize_text(result)


def _reference_tail_stats(tail: str) -> tuple[int, int, int]:
    lines = [line.strip() for line in normalize_text(tail).split("\n") if line.strip()]
    if not lines:
        return 0, 0, 0

    citation_markers = len(_CITATION_LINE.findall("\n" + "\n".join(lines)))
    citation_like_lines = 0
    narrative_lines = 0
    for line in lines:
        if _REFERENCE_HEADING.match(line + "\n"):
            continue
        if _CITATION_LINE.match("\n" + line):
            citation_like_lines += 1
            continue
        if re.search(r"\b(?:doi|https?://|retrieved|accessed|journal|conference|proceedings|publisher)\b", line, re.IGNORECASE):
            citation_like_lines += 1
            continue
        if len(line.split()) >= 6:
            narrative_lines += 1

    return citation_markers, citation_like_lines, narrative_lines


def _looks_like_reference_tail(value: str, heading_idx: int) -> bool:
    body = value[:heading_idx].strip()
    tail = value[heading_idx:].strip()
    if not body or not tail:
        return False

    citation_markers, citation_like_lines, narrative_lines = _reference_tail_stats(tail)
    tail_lines = [line for line in tail.split("\n") if line.strip()]
    tail_line_count = len(tail_lines)
    body_word_count = len(re.findall(r"[A-Za-z0-9']+", body))
    heading_ratio = heading_idx / max(len(value), 1)

    if citation_markers >= 3:
        return heading_ratio >= 0.35 or body_word_count >= 8
    if citation_like_lines >= 3 and tail_line_count >= 4:
        return narrative_lines <= 1
    if tail_line_count >= 8 and citation_like_lines >= max(2, tail_line_count // 3):
        return narrative_lines <= max(1, tail_line_count // 4)
    return False


def maybe_strip_reference_section(text: str) -> str:
    """Conservatively drop bibliography-heavy tails that create noisy matches.

    A standalone reference heading is removed only when the trailing section looks
    citation-dense. This handles both long reports and short one-page submissions,
    while keeping normal sentences that merely use the word "references".
    """
    value = normalize_text(text)
    if not value:
        return value

    best_heading_idx: int | None = None
    for match in _REFERENCE_HEADING.finditer(value):
        heading_idx = int(match.start())
        if _looks_like_reference_tail(value, heading_idx):
            best_heading_idx = heading_idx
            break

    if best_heading_idx is None:
        return value

    return value[:best_heading_idx].strip()


def prepare_text_for_similarity(text: str) -> str:
    value = normalize_text(text)
    value = strip_submission_boilerplate(value)
    value = maybe_strip_reference_section(value)
    return value.strip()


def dedupe_preserve_order(values: Iterable[str], *, min_len: int = 1) -> list[str]:
    out: list[str] = []
    seen = set()
    for value in values:
        item = normalize_text(str(value or ""))
        if len(item) < min_len:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out
