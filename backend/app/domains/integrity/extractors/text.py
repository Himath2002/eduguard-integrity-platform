from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class ExtractedText:
    source_path: str
    text: str


_WS = re.compile(r"\s+")


def _normalize_text(s: str) -> str:
    s = (s or "").replace("\u00a0", " ")
    s = _WS.sub(" ", s).strip()
    return s


def extract_text(path: str | Path) -> ExtractedText:
    """Extract plain text from .pdf, .docx, or .txt.

    This is used for *terminal-based testing* before the upload pipeline is finished.
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {p}")

    suffix = p.suffix.lower()

    if suffix == ".pdf":
        # Reuse existing PDF extraction (PyMuPDF).
        from app.ai.text_extraction import extract_pdf_text

        extracted = extract_pdf_text(p)
        return ExtractedText(source_path=str(p), text=_normalize_text(extracted.full_text))

    if suffix == ".docx":
        # python-docx is pure python and works on Windows/macOS/Linux.
        try:
            from docx import Document  # type: ignore
        except Exception as e:
            raise RuntimeError(
                "Missing dependency for DOCX extraction. Install: pip install python-docx"
            ) from e

        doc = Document(str(p))
        parts: list[str] = []
        for para in doc.paragraphs:
            t = (para.text or "").strip()
            if t:
                parts.append(t)
        return ExtractedText(source_path=str(p), text=_normalize_text("\n".join(parts)))

    if suffix == ".txt":
        txt = p.read_text(encoding="utf-8", errors="ignore")
        return ExtractedText(source_path=str(p), text=_normalize_text(txt))

    raise ValueError(f"Unsupported file type: {suffix} (expected .pdf/.docx/.txt)")


def iter_document_paths(root: str | Path) -> Iterable[Path]:
    root_p = Path(root)
    if not root_p.exists():
        raise FileNotFoundError(f"Corpus folder not found: {root_p}")

    for p in root_p.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() in {".pdf", ".docx", ".txt"}:
            yield p
