from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence
import os
import re
import tempfile
import uuid

import fitz
from sqlalchemy.orm import Session

from app.models.marking import SubmissionMarkReport, MarkAnnotation
from app.models.submission import Submission
from app.services.s3_service import build_marked_report_key, has_s3_storage, upload_file
from app.services.storage_helpers import cleanup_temp_file, resolve_submission_pdf_to_local

MARKED_REPORTS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "marked_reports"
MARKED_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

BLUE = (0.15, 0.43, 0.98)


def _clean_selected_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _candidate_needles(selected_text: str) -> list[str]:
    cleaned = _clean_selected_text(selected_text)
    if not cleaned:
        return []
    candidates: list[str] = [cleaned]
    if len(cleaned) > 140:
        candidates.append(cleaned[:140].rsplit(" ", 1)[0] or cleaned[:140])
    if len(cleaned) > 90:
        candidates.append(cleaned[:90].rsplit(" ", 1)[0] or cleaned[:90])
    parts = [p.strip() for p in re.split(r"[\.;\n]", cleaned) if len(p.strip()) >= 20]
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


def get_mark_report(db: Session, submission_id: int) -> SubmissionMarkReport | None:
    return db.query(SubmissionMarkReport).filter(SubmissionMarkReport.submission_id == submission_id).first()


def get_mark_annotations(db: Session, report_id: int) -> list[MarkAnnotation]:
    return (
        db.query(MarkAnnotation)
        .filter(MarkAnnotation.report_id == report_id)
        .order_by(MarkAnnotation.order_no.asc(), MarkAnnotation.id.asc())
        .all()
    )


def _draw_number_badge(page: fitz.Page, rect: fitz.Rect, label: str) -> None:
    x0 = min(max(rect.x1 + 4, 8), max(8, page.rect.width - 24))
    y0 = max(rect.y0 - 2, 8)
    badge = fitz.Rect(x0, y0, min(x0 + 18, page.rect.width - 4), min(y0 + 16, page.rect.height - 4))
    page.draw_rect(badge, color=BLUE, fill=BLUE, overlay=True)
    page.insert_textbox(badge, label, fontsize=8, color=(1, 1, 1), align=1, overlay=True)


def _apply_annotation_to_pdf(page: fitz.Page, index: int, selected_text: str) -> bool:
    for needle in _candidate_needles(selected_text):
        hits = page.search_for(needle, quads=False)
        if not hits:
            continue
        rect = hits[0]
        annot = page.add_highlight_annot(rect)
        annot.set_colors(stroke=BLUE)
        annot.update(opacity=0.35)
        _draw_number_badge(page, rect, str(index))
        return True
    return False


def _append_summary_pages(doc: fitz.Document, *, score: int | None, max_score: int | None, general_feedback: str | None, annotations: Sequence[MarkAnnotation]) -> None:
    page = doc.new_page()
    y = 48
    page.insert_text((40, y), "Lecturer feedback report", fontsize=20, fontname="helv")
    y += 28
    if score is not None:
        score_text = f"Mark: {score}"
        if max_score is not None and max_score > 0:
            score_text += f" / {max_score}"
        page.insert_text((40, y), score_text, fontsize=12, fontname="helv")
        y += 22
    if general_feedback:
        page.insert_text((40, y), "Overall feedback", fontsize=13, fontname="helv")
        y += 18
        for line in general_feedback.splitlines() or [general_feedback]:
            if y > page.rect.height - 60:
                page = doc.new_page()
                y = 48
            page.insert_textbox(fitz.Rect(40, y, page.rect.width - 40, y + 48), line, fontsize=11, fontname="helv")
            y += 20
        y += 8

    page.insert_text((40, y), "Annotated comments", fontsize=13, fontname="helv")
    y += 22

    if not annotations:
        page.insert_text((40, y), "No inline annotations were added.", fontsize=11, fontname="helv")
        return

    for idx, annotation in enumerate(annotations, start=1):
        block = f"{idx}. {annotation.comment}"
        height = max(44, 24 + 12 * (len(block) // 90 + 1))
        if y + height > page.rect.height - 50:
            page = doc.new_page()
            y = 48
        page.draw_rect(fitz.Rect(40, y - 12, page.rect.width - 40, y + height - 6), color=(0.85, 0.9, 1), fill=(0.95, 0.97, 1), overlay=True)
        page.insert_text((52, y + 2), f"Comment {idx}", fontsize=11, fontname="helv")
        page.insert_textbox(fitz.Rect(52, y + 10, page.rect.width - 52, y + height), block, fontsize=10, fontname="helv")
        y += height + 12


def generate_marked_pdf(
    submission: Submission,
    *,
    score: int | None,
    max_score: int | None,
    general_feedback: str | None,
    annotations: Sequence[MarkAnnotation],
    lecturer_id: int,
) -> str | None:
    local_pdf_path, should_cleanup_submission = resolve_submission_pdf_to_local(submission)

    out_path: str | None = None
    try:
        doc = fitz.open(str(local_pdf_path))
        try:
            for idx, annotation in enumerate(annotations, start=1):
                for page in doc:
                    if _apply_annotation_to_pdf(page, idx, annotation.selected_text):
                        break

            _append_summary_pages(doc, score=score, max_score=max_score, general_feedback=general_feedback, annotations=annotations)

            if has_s3_storage():
                fd, temp_path = tempfile.mkstemp(suffix=".pdf", prefix=f"marked_{submission.id}_")
                os.close(fd)
                doc.save(temp_path, garbage=4, deflate=True)
                key = build_marked_report_key(int(submission.id), int(lecturer_id))
                upload_file(temp_path, key, content_type="application/pdf")
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
                out_path = key
            else:
                out_file = MARKED_REPORTS_DIR / f"submission_{int(submission.id)}_marked.pdf"
                doc.save(str(out_file), garbage=4, deflate=True)
                out_path = str(out_file)
        finally:
            doc.close()
    finally:
        cleanup_temp_file(local_pdf_path, should_cleanup_submission)

    return out_path


def save_marking(
    db: Session,
    *,
    submission: Submission,
    lecturer_id: int,
    score: int | None,
    max_score: int | None,
    general_feedback: str | None,
    published_to_student: bool,
    annotations_payload: Iterable[dict],
) -> SubmissionMarkReport:
    report = get_mark_report(db, int(submission.id))
    if not report:
        report = SubmissionMarkReport(submission_id=int(submission.id), lecturer_id=int(lecturer_id))
        db.add(report)
        db.flush()

    report.score = score
    report.max_score = max_score
    report.general_feedback = (general_feedback or "").strip() or None
    report.published_to_student = bool(published_to_student)

    existing_annotations = {int(item.order_no): item for item in get_mark_annotations(db, int(report.id))}
    retained_ids: set[int] = set()
    materialized_annotations: list[MarkAnnotation] = []

    for idx, item in enumerate(list(annotations_payload or []), start=1):
        selected_text = _clean_selected_text(str((item or {}).get("selected_text") or ""))
        comment = str((item or {}).get("comment") or "").strip()
        if len(selected_text) < 4 or not comment:
            continue

        annotation = existing_annotations.get(idx)
        if not annotation:
            annotation = MarkAnnotation(report_id=report.id, order_no=idx, conversation_key=uuid.uuid4().hex)
            db.add(annotation)

        annotation.order_no = idx
        annotation.selected_text = selected_text
        annotation.comment = comment
        annotation.annotation_color = "blue"
        if not annotation.conversation_key:
            annotation.conversation_key = uuid.uuid4().hex

        db.flush()
        if annotation.id:
            retained_ids.add(int(annotation.id))
        materialized_annotations.append(annotation)

    stale_annotations = db.query(MarkAnnotation).filter(MarkAnnotation.report_id == report.id).all()
    for stale in stale_annotations:
        if stale.id and int(stale.id) not in retained_ids:
            db.delete(stale)

    db.flush()
    db.refresh(report)

    pdf_path = generate_marked_pdf(
        submission,
        score=report.score,
        max_score=report.max_score,
        general_feedback=report.general_feedback,
        annotations=materialized_annotations,
        lecturer_id=int(lecturer_id),
    )
    report.generated_pdf_path = pdf_path

    db.commit()
    db.refresh(report)
    return report


def serialize_mark_report(report: SubmissionMarkReport | None, annotations: Sequence[MarkAnnotation] | None = None) -> dict | None:
    if not report:
        return None
    annotations = list(annotations or [])
    return {
        "id": int(report.id),
        "submission_id": int(report.submission_id),
        "score": report.score,
        "max_score": report.max_score,
        "general_feedback": report.general_feedback,
        "published_to_student": bool(report.published_to_student),
        "generated_pdf_ready": bool(report.generated_pdf_path),
        "annotation_count": len(annotations),
        "annotations": [
            {
                "id": int(annotation.id),
                "order_no": int(annotation.order_no),
                "selected_text": annotation.selected_text,
                "comment": annotation.comment,
                "annotation_color": annotation.annotation_color,
                "conversation_key": annotation.conversation_key,
            }
            for annotation in annotations
        ],
    }
