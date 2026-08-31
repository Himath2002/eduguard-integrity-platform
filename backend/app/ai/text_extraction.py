from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import List

import fitz  # PyMuPDF

from .normalization import normalize_text
from .storage import resolve_safe_pdf_path


@dataclass
class ExtractedDocument:
    pages: List[str]
    full_text: str


def _strip_common_headers_footers(page_texts: List[str], top_lines: int = 2, bottom_lines: int = 2) -> List[str]:
    """Remove repeated header/footer lines across pages using a simple frequency heuristic.

    This is intentionally conservative to avoid deleting content.
    """
    tops = []
    bottoms = []
    for t in page_texts:
        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
        tops.append("\n".join(lines[:top_lines]) if lines else "")
        bottoms.append("\n".join(lines[-bottom_lines:]) if lines else "")

    top_counts = Counter([x for x in tops if x])
    bottom_counts = Counter([x for x in bottoms if x])

    # Consider a line common if it appears on >= 60% of pages (at least 3 pages).
    n = max(1, len(page_texts))
    min_common = max(3, int(0.6 * n))

    common_tops = {k for k, v in top_counts.items() if v >= min_common}
    common_bottoms = {k for k, v in bottom_counts.items() if v >= min_common}

    cleaned = []
    for raw, top, bottom in zip(page_texts, tops, bottoms):
        lines = raw.splitlines()
        # Remove top block if matches common header
        if top and top in common_tops:
            # remove first `top_lines` non-empty lines
            new_lines = []
            removed = 0
            for ln in lines:
                if ln.strip() and removed < top_lines:
                    removed += 1
                    continue
                new_lines.append(ln)
            lines = new_lines

        # Remove bottom block if matches common footer
        if bottom and bottom in common_bottoms:
            # remove last `bottom_lines` non-empty lines
            new_lines = []
            removed = 0
            for ln in reversed(lines):
                if ln.strip() and removed < bottom_lines:
                    removed += 1
                    continue
                new_lines.append(ln)
            lines = list(reversed(new_lines))

        cleaned.append(normalize_text("\n".join(lines).strip()))
    return cleaned


def extract_pdf_text(path: str | Path) -> ExtractedDocument:
    p = resolve_safe_pdf_path(path)

    doc = fitz.open(p.as_posix())
    pages = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        pages.append(page.get_text("text") or "")
    doc.close()

    pages = _strip_common_headers_footers(pages)
    full_text = normalize_text("\n\n".join([t for t in pages if t]).strip())
    return ExtractedDocument(pages=pages, full_text=full_text)
