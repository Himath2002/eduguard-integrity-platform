from __future__ import annotations

import json
import os
import traceback
import hashlib
from pathlib import Path
from dataclasses import asdict
from typing import Any, Dict, Optional, Tuple, List

from sqlalchemy.orm import Session

from app.models.submission import Submission
from app.models.assignment import Assignment
from app.models.integrity import IntegrityJob, IntegrityResult, CorpusChunk

from app.ai.text_extraction import extract_pdf_text
from app.ai.chunking import chunk_text
from app.ai.features import stylometry_features, linguistic_features
from app.ai.plagiarism import semantic_similarity_search
from app.ai.risk import compute_ai_risk
from app.ai.ai_config import get_ai_risk_config, get_ai_model_config
from app.ai.storage import fetch_pdf_to_local
from app.services.realtime import push_realtime_event
from app.services.s3_service import get_bucket_name, has_s3_storage


def _job_get(db: Session, submission_id: int, idempotency_key: str) -> Optional[IntegrityJob]:
    return (
        db.query(IntegrityJob)
        .filter(
            IntegrityJob.submission_id == submission_id,
            IntegrityJob.idempotency_key == idempotency_key,
        )
        .order_by(IntegrityJob.id.desc())
        .first()
    )


def _job_upsert(db: Session, submission_id: int, idempotency_key: str, correlation_id: Optional[str]) -> IntegrityJob:
    job = _job_get(db, submission_id, idempotency_key)
    if job:
        return job
    job = IntegrityJob(
        submission_id=submission_id,
        idempotency_key=idempotency_key,
        status="queued",
        progress=0,
        correlation_id=correlation_id,
        error=None,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _job_update(db: Session, submission_id: int, idempotency_key: str, **updates) -> None:
    job = _job_get(db, submission_id, idempotency_key)
    if not job:
        return
    for k, v in updates.items():
        setattr(job, k, v)
    db.commit()


def queue_plagiarism_for_submission(
    db: Session,
    submission_id: int,
    *,
    idempotency_key: str,
    correlation_id: Optional[str] = None,
) -> IntegrityJob:
    job = _job_upsert(db, submission_id, idempotency_key, correlation_id)
    if job.status not in {"running", "done"}:
        _job_update(
            db,
            submission_id,
            idempotency_key,
            status="queued",
            progress=0,
            error=None,
        )
        job = _job_get(db, submission_id, idempotency_key) or job
    return job


def get_latest_result(db: Session, submission_id: int) -> Optional[IntegrityResult]:
    return (
        db.query(IntegrityResult)
        .filter(IntegrityResult.submission_id == submission_id)
        .order_by(IntegrityResult.id.desc())
        .first()
    )


def _broadcast_job_progress(sub: Submission | None, submission_id: int, *, status: str, progress: int, error: str | None = None) -> None:
    if not sub or getattr(sub, "student_id", None) is None:
        return
    payload = {
        "type": "integrity_job",
        "submission_id": int(submission_id),
        "status": status,
        "progress": int(progress),
        "error": error,
        "assignment_id": int(getattr(sub, "assignment_id", 0) or 0),
    }
    push_realtime_event("student", int(sub.student_id), payload)


def plagiarism_score_to_percent(score: float) -> int:
    try:
        s = float(score)
    except Exception:
        s = 0.0
    if s < 0:
        s = 0.0
    if s > 1:
        s = 1.0
    return int(round(s * 100))


REFERENCE_LECTURE_DIR = (
    Path(__file__).resolve().parents[2] / "uploads" / "reference_lecture_materials"
)
REFERENCE_LECTURE_DIR.mkdir(parents=True, exist_ok=True)

REFERENCE_ONLINE_DIR = (
    Path(__file__).resolve().parents[2] / "uploads" / "reference_online_sources"
)
REFERENCE_ONLINE_DIR.mkdir(parents=True, exist_ok=True)
ONLINE_SOURCES_MANIFEST = REFERENCE_ONLINE_DIR / "sources.json"


def _get_submission_class_id(db: Session, submission: Submission) -> Optional[int]:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == submission.assignment_id)
        .first()
    )
    if not assignment:
        return None
    return int(assignment.class_id)


def _stable_negative_doc_id(namespace: str, *parts: object) -> int:
    raw = "::".join([namespace, *[str(p or "") for p in parts]]).encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()[:15]
    return -int(digest, 16)


def _is_probably_pdf(name: str | None, content_type: str | None = None) -> bool:
    filename = str(name or "").strip().lower()
    mime = str(content_type or "").strip().lower()
    return filename.endswith(".pdf") or mime == "application/pdf"


def _fetch_reference_pdf(reference: Dict[str, Any], *, default_bucket: str | None = None) -> tuple[str, bool]:
    bucket = str(reference.get("s3_bucket") or default_bucket or "").strip() or None
    s3_key = str(reference.get("s3_key") or "").strip() or None
    local_path = str(reference.get("local_path") or reference.get("source_path") or "").strip() or None

    if local_path and Path(local_path).expanduser().exists():
        return fetch_pdf_to_local(local_path=local_path), False

    if s3_key:
        return fetch_pdf_to_local(local_path=None, s3_bucket=bucket, s3_key=s3_key), True

    raise FileNotFoundError("Reference source does not have a valid local path or S3 key")


def _upsert_corpus_document(
    db: Session,
    *,
    doc_id: int,
    chunks: list,
    source_type: str,
    source_name: str | None,
    source_path: str | None,
    class_id: int | None,
    assignment_id: int | None,
) -> int:
    db.query(CorpusChunk).filter(
        CorpusChunk.doc_id == doc_id,
        CorpusChunk.source_type == source_type,
    ).delete()

    inserted = 0
    for ch in chunks:
        db.add(
            CorpusChunk(
                doc_id=doc_id,
                chunk_id=int(ch.chunk_id),
                text=ch.text,
                source_type=source_type,
                source_name=source_name,
                source_path=source_path,
                class_id=class_id,
                assignment_id=assignment_id,
            )
        )
        inserted += 1
    return inserted


def _index_assignment_materials(
    db: Session,
    *,
    class_id: int | None = None,
) -> dict:
    q = db.query(Assignment).filter(Assignment.material_path.isnot(None))
    if class_id is not None:
        q = q.filter(Assignment.class_id == class_id)

    assignments = q.all()
    indexed_files = 0
    indexed_chunks = 0
    skipped_files = 0

    default_bucket = get_bucket_name() if has_s3_storage() else None

    for assignment in assignments:
        material_path = str(getattr(assignment, "material_path", "") or "").strip()
        material_name = getattr(assignment, "material_name", None) or assignment.title or f"assignment_{assignment.id}.pdf"
        material_type = getattr(assignment, "material_type", None)

        if not material_path or not _is_probably_pdf(material_name, material_type):
            skipped_files += 1
            continue

        reference = {
            "source_path": material_path,
            "s3_key": material_path if not Path(material_path).expanduser().exists() else None,
            "s3_bucket": default_bucket,
            "local_path": material_path if Path(material_path).expanduser().exists() else None,
        }

        local_path = None
        cleanup = False
        try:
            local_path, cleanup = _fetch_reference_pdf(reference, default_bucket=default_bucket)
            extracted = extract_pdf_text(local_path)
            chunks = chunk_text(extracted.full_text)
            if not chunks:
                skipped_files += 1
                continue

            doc_id = _stable_negative_doc_id("lecture", assignment.class_id, assignment.id, material_path)
            indexed_chunks += _upsert_corpus_document(
                db,
                doc_id=doc_id,
                chunks=chunks,
                source_type="lecture_material",
                source_name=str(material_name),
                source_path=material_path,
                class_id=int(assignment.class_id) if assignment.class_id is not None else None,
                assignment_id=int(assignment.id) if assignment.id is not None else None,
            )
            indexed_files += 1
        except Exception:
            skipped_files += 1
        finally:
            if cleanup and local_path and os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass

    db.commit()
    return {
        "indexed_files": indexed_files,
        "indexed_chunks": indexed_chunks,
        "skipped_files": skipped_files,
    }


def index_lecture_materials_from_folder(
    db: Session,
    *,
    folder_path: str | Path | None = None,
    class_id: int | None = None,
) -> dict:
    """Indexes lecturer reference materials from S3-backed assignment uploads and optional local PDFs.

    Folder layout fallback:
      backend/uploads/reference_lecture_materials/
        global/
        class_1/
        class_2/
    """
    summary = {
        "indexed_files": 0,
        "indexed_chunks": 0,
        "skipped_files": 0,
        "assignment_materials_indexed": 0,
        "folder_materials_indexed": 0,
    }

    assignment_summary = _index_assignment_materials(db, class_id=class_id)
    summary["indexed_files"] += int(assignment_summary["indexed_files"])
    summary["indexed_chunks"] += int(assignment_summary["indexed_chunks"])
    summary["skipped_files"] += int(assignment_summary["skipped_files"])
    summary["assignment_materials_indexed"] = int(assignment_summary["indexed_files"])

    root = Path(folder_path) if folder_path else REFERENCE_LECTURE_DIR
    root.mkdir(parents=True, exist_ok=True)

    candidates = list((root / "global").glob("*.pdf"))
    if class_id is not None:
        candidates += list((root / f"class_{class_id}").glob("*.pdf"))
    else:
        candidates += list(root.glob("class_*/*.pdf"))

    for pdf_path in candidates:
        parent_name = pdf_path.parent.name
        inferred_class_id: int | None = None
        if parent_name.startswith("class_"):
            try:
                inferred_class_id = int(parent_name.split("_", 1)[1])
            except Exception:
                inferred_class_id = None

        try:
            extracted = extract_pdf_text(str(pdf_path))
            chunks = chunk_text(extracted.full_text)
            if not chunks:
                summary["skipped_files"] += 1
                continue

            doc_id = _stable_negative_doc_id("lecture", inferred_class_id or 0, str(pdf_path.resolve()))
            summary["indexed_chunks"] += _upsert_corpus_document(
                db,
                doc_id=doc_id,
                chunks=chunks,
                source_type="lecture_material",
                source_name=pdf_path.name,
                source_path=str(pdf_path.resolve()),
                class_id=inferred_class_id,
                assignment_id=None,
            )
            summary["indexed_files"] += 1
            summary["folder_materials_indexed"] += 1
        except Exception:
            summary["skipped_files"] += 1

    db.commit()
    return summary


def _load_online_source_manifest() -> list[dict[str, Any]]:
    if not ONLINE_SOURCES_MANIFEST.exists():
        return []
    try:
        data = json.loads(ONLINE_SOURCES_MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        return []

    if isinstance(data, dict):
        items = data.get("sources") or []
    elif isinstance(data, list):
        items = data
    else:
        items = []

    return [item for item in items if isinstance(item, dict)]


def index_online_sources_from_folder(
    db: Session,
    *,
    folder_path: str | Path | None = None,
    class_id: int | None = None,
) -> dict:
    """Indexes online-source PDFs from a manifest and optional local fallback folders.

    Manifest path:
      backend/uploads/reference_online_sources/sources.json

    Each source entry may contain:
      name, class_id, local_path/source_path, s3_key, s3_bucket
    """
    root = Path(folder_path) if folder_path else REFERENCE_ONLINE_DIR
    root.mkdir(parents=True, exist_ok=True)

    summary = {"indexed_files": 0, "indexed_chunks": 0, "skipped_files": 0, "manifest_sources_indexed": 0, "folder_sources_indexed": 0}
    default_bucket = get_bucket_name() if has_s3_storage() else None

    for entry in _load_online_source_manifest():
        entry_class_id = entry.get("class_id")
        try:
            entry_class_id = int(entry_class_id) if entry_class_id is not None else None
        except Exception:
            entry_class_id = None

        if class_id is not None and entry_class_id not in {None, class_id}:
            continue

        source_name = str(entry.get("name") or entry.get("source_name") or entry.get("s3_key") or entry.get("local_path") or "online_source.pdf")
        if not _is_probably_pdf(source_name, entry.get("content_type")):
            summary["skipped_files"] += 1
            continue

        local_path = None
        cleanup = False
        try:
            local_path, cleanup = _fetch_reference_pdf(entry, default_bucket=default_bucket)
            extracted = extract_pdf_text(local_path)
            chunks = chunk_text(extracted.full_text)
            if not chunks:
                summary["skipped_files"] += 1
                continue

            stable_ref = entry.get("s3_key") or entry.get("local_path") or entry.get("source_path") or source_name
            doc_id = _stable_negative_doc_id("online", entry_class_id or 0, stable_ref)
            summary["indexed_chunks"] += _upsert_corpus_document(
                db,
                doc_id=doc_id,
                chunks=chunks,
                source_type="online_source",
                source_name=source_name,
                source_path=str(stable_ref),
                class_id=entry_class_id,
                assignment_id=None,
            )
            summary["indexed_files"] += 1
            summary["manifest_sources_indexed"] += 1
        except Exception:
            summary["skipped_files"] += 1
        finally:
            if cleanup and local_path and os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass

    candidates = list((root / "global").glob("*.pdf"))
    if class_id is not None:
        candidates += list((root / f"class_{class_id}").glob("*.pdf"))
    else:
        candidates += list(root.glob("class_*/*.pdf"))

    for pdf_path in candidates:
        parent_name = pdf_path.parent.name
        inferred_class_id: int | None = None
        if parent_name.startswith("class_"):
            try:
                inferred_class_id = int(parent_name.split("_", 1)[1])
            except Exception:
                inferred_class_id = None

        try:
            extracted = extract_pdf_text(str(pdf_path))
            chunks = chunk_text(extracted.full_text)
            if not chunks:
                summary["skipped_files"] += 1
                continue

            doc_id = _stable_negative_doc_id("online", inferred_class_id or 0, str(pdf_path.resolve()))
            summary["indexed_chunks"] += _upsert_corpus_document(
                db,
                doc_id=doc_id,
                chunks=chunks,
                source_type="online_source",
                source_name=pdf_path.name,
                source_path=str(pdf_path.resolve()),
                class_id=inferred_class_id,
                assignment_id=None,
            )
            summary["indexed_files"] += 1
            summary["folder_sources_indexed"] += 1
        except Exception:
            summary["skipped_files"] += 1

    db.commit()
    return summary


def _build_ai_payload(full_text: str) -> Dict[str, Any]:
    risk_cfg = get_ai_risk_config()
    model_cfg = get_ai_model_config()

    ai = {
        "approach": "multi_signal_risk_v1",
        "enabled": bool(risk_cfg.enabled),
        "risk_score": 0.0,
        "risk_percent": 0,
        "risk_level": "low",
        "risk_threshold_percent": int(risk_cfg.threshold_percent),
        "spans": [],
        "components": None,
        "error": None,
        "note": None,
        "model_enabled": bool(model_cfg.enabled),
        "model_name": str(model_cfg.model_name),
        "model_percent": None,
        "model_level": None,
        "percent": 0,
        "detected": False,
        "level": "low",
        "overall": 0.0,
        "model": "",
        "chunks": [],
    }

    if not risk_cfg.enabled:
        ai["note"] = "AI analysis disabled."
        return ai

    risk_res = compute_ai_risk(full_text)
    ai["risk_score"] = float(risk_res.risk_score)
    ai["risk_percent"] = int(risk_res.risk_percent)
    ai["risk_level"] = str(risk_res.risk_level)
    ai["components"] = risk_res.components
    ai["note"] = risk_res.note
    ai["error"] = risk_res.error
    ai["spans"] = [
        {
            "start": int(s.start),
            "end": int(s.end),
            "confidence_percent": int(s.confidence_percent),
            "text_preview": s.text_preview,
            "reasons": s.reasons,
            "severity": getattr(s, "severity", "low"),
            "coverage_percent": int(getattr(s, "coverage_percent", 0) or 0),
            "contribution_percent": int(getattr(s, "contribution_percent", 0) or 0),
        }
        for s in risk_res.spans
    ]
    total_len = max(1, len(full_text or ""))
    ai["highlighted_percent"] = int(round(sum(max(0, int(s.end) - int(s.start)) for s in risk_res.spans) * 100 / total_len))
    ai["percent"] = int(risk_res.risk_percent)
    ai["detected"] = bool(risk_res.detected)
    ai["level"] = str(risk_res.risk_level)
    return ai


def _reference_corpus_summary(db: Session, class_id: int | None) -> dict:
    return {
        "lecture_materials": index_lecture_materials_from_folder(db, class_id=class_id),
        "online_sources": index_online_sources_from_folder(db, class_id=class_id),
    }


def run_plagiarism_for_submission(
    db: Session,
    submission_id: int,
    *,
    idempotency_key: str,
    local_path: Optional[str] = None,
    s3_bucket: Optional[str] = None,
    s3_key: Optional[str] = None,
    correlation_id: Optional[str] = None,
    top_k: int = 8,
    min_score: float = 0.60,
) -> Tuple[IntegrityJob, Optional[IntegrityResult]]:
    job = _job_upsert(db, submission_id, idempotency_key, correlation_id)
    if job.status == "done":
        return job, get_latest_result(db, submission_id)

    resolved_local_path: Optional[str] = None
    cleanup_temp_file = False

    try:
        _job_update(db, submission_id, idempotency_key, status="running", progress=5, error=None)

        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        _broadcast_job_progress(sub, submission_id, status="running", progress=5)
        if not sub:
            raise RuntimeError("Submission not found")

        sub.status = "processing"
        db.commit()

        submission_class_id = _get_submission_class_id(db, sub)
        corpus_refresh_summary = _reference_corpus_summary(db, submission_class_id)

        if not local_path and not (s3_bucket and s3_key):
            if (getattr(sub, "storage_provider", "local") or "local") == "s3":
                s3_bucket = getattr(sub, "s3_bucket", None)
                s3_key = getattr(sub, "s3_key", None)
            else:
                local_path = getattr(sub, "file_path", None)

        if not local_path and not (s3_bucket and s3_key):
            raise RuntimeError("No valid file source found for submission")

        resolved_local_path = fetch_pdf_to_local(
            local_path=local_path,
            s3_bucket=s3_bucket,
            s3_key=s3_key,
        )
        cleanup_temp_file = bool(s3_bucket and s3_key and not local_path)

        extracted = extract_pdf_text(resolved_local_path)
        _job_update(db, submission_id, idempotency_key, progress=25)
        _broadcast_job_progress(sub, submission_id, status="running", progress=25)

        chunks = chunk_text(extracted.full_text)
        chunk_pairs: List[tuple[int, str]] = [(c.chunk_id, c.text) for c in chunks]

        corpus_rows = (
            db.query(CorpusChunk)
            .filter(
                (
                    (CorpusChunk.source_type == "submission") &
                    (CorpusChunk.doc_id != submission_id)
                )
                |
                (
                    (CorpusChunk.source_type == "lecture_material") &
                    (
                        (CorpusChunk.class_id == submission_class_id) |
                        (CorpusChunk.class_id.is_(None))
                    )
                )
                |
                (
                    (CorpusChunk.source_type == "online_source") &
                    (
                        (CorpusChunk.class_id == submission_class_id) |
                        (CorpusChunk.class_id.is_(None))
                    )
                )
            )
            .all()
        )

        corpus_records: List[Dict[str, Any]] = [
            {
                "doc_id": str(c.doc_id),
                "chunk_id": int(c.chunk_id),
                "text": c.text,
                "source_type": c.source_type,
                "source_name": c.source_name,
                "source_path": c.source_path,
                "class_id": c.class_id,
                "assignment_id": c.assignment_id,
            }
            for c in corpus_rows
        ]

        _job_update(db, submission_id, idempotency_key, progress=40)
        _broadcast_job_progress(sub, submission_id, status="running", progress=40)

        plag_res = semantic_similarity_search(
            query_chunks=chunk_pairs,
            corpus=corpus_records,
            top_k=top_k,
            min_score=min_score,
            full_text=extracted.full_text,
        )

        _job_update(db, submission_id, idempotency_key, progress=85)
        _broadcast_job_progress(sub, submission_id, status="running", progress=85)

        best_by_chunk_and_type: Dict[tuple[int, str], Dict[str, Any]] = {}

        for m in plag_res.matches:
            source_type = str(m.source_type or "unknown")
            key = (int(m.query_chunk_id), source_type)
            item = asdict(m)
            item["source_type"] = source_type
            existing = best_by_chunk_and_type.get(key)
            if existing is None or float(item.get("evidence_ratio", 0.0)) > float(existing.get("evidence_ratio", 0.0)):
                best_by_chunk_and_type[key] = item

        matches_payload: List[Dict[str, Any]] = sorted(
            best_by_chunk_and_type.values(),
            key=lambda x: (int(x.get("query_chunk_id", 0)), str(x.get("source_type") or ""), -float(x.get("evidence_ratio", 0.0)), -float(x.get("score", 0.0))),
        )
        ai_payload = _build_ai_payload(extracted.full_text)
        ai_score = float(
            ai_payload.get("risk_score")
            or ((ai_payload.get("risk_percent") or ai_payload.get("percent") or 0) / 100.0)
            or 0.0
        )

        payload: Dict[str, Any] = {
            "page_count": len(extracted.pages),
            "chunk_count": len(chunks),
            "text_stats": {
                **stylometry_features(extracted.full_text),
                **linguistic_features(extracted.full_text),
            },
            "ai": ai_payload,
            "plagiarism": {
                "overall": float(plag_res.overall_score),
                "percent": plagiarism_score_to_percent(plag_res.overall_score),
                "model": plag_res.model_name,
                "index": plag_res.index_type,
                "matches": matches_payload,
                "params": {"top_k": int(top_k), "min_score": float(min_score)},
                "corpus": {
                    "total_chunks": len(corpus_records),
                    "submission_chunks": sum(1 for r in corpus_records if r["source_type"] == "submission"),
                    "lecture_chunks": sum(1 for r in corpus_records if r["source_type"] == "lecture_material"),
                    "online_chunks": sum(1 for r in corpus_records if r["source_type"] == "online_source"),
                    "refresh_summary": corpus_refresh_summary,
                },
            },
        }

        res = IntegrityResult(
            submission_id=submission_id,
            ai_score=ai_score,
            plagiarism_score=float(plag_res.overall_score),
            payload=payload,
        )
        db.add(res)

        db.query(CorpusChunk).filter(
            CorpusChunk.doc_id == submission_id,
            CorpusChunk.source_type == "submission",
        ).delete()

        submission_source_path = None
        if (getattr(sub, "storage_provider", "local") or "local") == "s3":
            submission_source_path = getattr(sub, "s3_key", None)
        else:
            submission_source_path = getattr(sub, "file_path", None)

        _upsert_corpus_document(
            db,
            doc_id=int(submission_id),
            chunks=chunks,
            source_type="submission",
            source_name=sub.file_name or f"submission_{submission_id}.pdf",
            source_path=submission_source_path,
            class_id=submission_class_id,
            assignment_id=sub.assignment_id,
        )

        sub.status = "submitted"
        db.commit()
        _job_update(db, submission_id, idempotency_key, status="done", progress=100, error=None)
        _broadcast_job_progress(sub, submission_id, status="done", progress=100)
        return job, res

    except Exception as e:
        err = f"{e}\n{traceback.format_exc()}"
        user_err = str(e).strip() or "Integrity analysis failed. Please check the PDF and try uploading again."
        _job_update(db, submission_id, idempotency_key, status="failed", progress=100, error=err)
        try:
            sub
        except UnboundLocalError:
            sub = None
        if sub is not None:
            try:
                sub.status = "failed"
                db.commit()
            except Exception:
                db.rollback()
        _broadcast_job_progress(sub, submission_id, status="failed", progress=100, error=user_err[:240])
        return job, None

    finally:
        if cleanup_temp_file and resolved_local_path and os.path.exists(resolved_local_path):
            try:
                os.remove(resolved_local_path)
            except Exception:
                pass
