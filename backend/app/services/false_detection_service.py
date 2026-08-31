from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unicodedata
from typing import Any, Iterable
from uuid import uuid4

from fastapi import HTTPException

from app.models.integrity import IntegrityReviewLock


def match_key(match: dict[str, Any]) -> str:
    return "::".join(
        [
            str(match.get("phrase") or ""),
            str(match.get("source_type") or ""),
            str(match.get("source_name") or ""),
            str(match.get("source_doc_id") or ""),
            str(match.get("source_chunk_id") or ""),
        ]
    )


def build_occurrence_id(match: dict[str, Any], start: int, end: int) -> str:
    return f"{match_key(match)}::{int(start)}:{int(end)}"


def _norm_char(ch: str) -> str:
    c = unicodedata.normalize("NFKC", str(ch or "")).replace(" ", " ")
    if c.isalnum():
        return c.lower()
    if c.isspace():
        return " "
    return " "


def normalize_with_map(original: str) -> tuple[str, list[int]]:
    norm = ""
    char_map: list[int] = []
    prev_was_space = True
    for idx, ch in enumerate(str(original or "")):
        out = _norm_char(ch)
        if out == " ":
            if prev_was_space:
                continue
            prev_was_space = True
            norm += " "
            char_map.append(idx)
        else:
            prev_was_space = False
            norm += out
            char_map.append(idx)
    if norm.endswith(" "):
        norm = norm[:-1]
        if char_map:
            char_map.pop()
    return norm, char_map


def normalize_plain(value: str) -> str:
    return normalize_with_map(value)[0]


def _find_all_occurrences(haystack: str, needle: str) -> list[dict[str, int]]:
    ranges: list[dict[str, int]] = []
    if not needle or len(needle) < 8:
        return ranges
    idx = 0
    while True:
        at = haystack.find(needle, idx)
        if at == -1:
            break
        ranges.append({"start": at, "end": at + len(needle)})
        idx = at + max(1, len(needle) // 2)
    return ranges


def to_original_ranges(text: str, phrase: str) -> list[dict[str, int]]:
    clean = str(phrase or "").strip()
    if len(clean) < 8:
        return []
    norm_text, char_map = normalize_with_map(text)
    norm_phrase = normalize_plain(clean)
    if len(norm_phrase) < 8 or not char_map:
        return []
    out: list[dict[str, int]] = []
    for rng in _find_all_occurrences(norm_text, norm_phrase):
        start = char_map[rng["start"]]
        end = char_map[min(rng["end"] - 1, len(char_map) - 1)] + 1
        if end > start:
            out.append({"start": start, "end": end})
    return out


def merge_ranges(ranges: Iterable[dict[str, int]]) -> list[dict[str, int]]:
    sorted_ranges = sorted(
        [
            {"start": int(r["start"]), "end": int(r["end"])}
            for r in ranges or []
            if int(r["end"]) > int(r["start"])
        ],
        key=lambda r: (r["start"], r["end"]),
    )

    if not sorted_ranges:
        return []

    merged = [sorted_ranges[0]]
    for current in sorted_ranges[1:]:
        last = merged[-1]
        if current["start"] <= last["end"]:
            last["end"] = max(last["end"], current["end"])
        else:
            merged.append(current)
    return merged


def total_range_length(ranges: Iterable[dict[str, int]]) -> int:
    return sum(int(r["end"]) - int(r["start"]) for r in merge_ranges(ranges))


def build_allowed_removed_ranges(text: str, detailed_matches: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    allowed: list[dict[str, Any]] = []
    seen: set[tuple[int, int, str]] = set()
    safe_text = str(text or "")

    for match in detailed_matches or []:
        if not isinstance(match, dict):
            continue

        phrase = str(match.get("phrase") or "").strip()
        if len(phrase) < 8:
            continue

        for rng in to_original_ranges(safe_text, phrase):
            occurrence_id = build_occurrence_id(match, rng["start"], rng["end"])
            key = (int(rng["start"]), int(rng["end"]), occurrence_id)
            if key in seen:
                continue
            seen.add(key)

            allowed.append(
                {
                    "occurrenceId": occurrence_id,
                    "start": int(rng["start"]),
                    "end": int(rng["end"]),
                    "text": safe_text[rng["start"]:rng["end"]],
                    "match_key": match_key(match),
                }
            )

    return sorted(allowed, key=lambda item: (item["start"], item["end"], item["occurrenceId"]))


def _raw_get(raw: Any, key: str, default: Any = None) -> Any:
    if raw is None:
        return default
    if isinstance(raw, dict):
        return raw.get(key, default)
    if hasattr(raw, key):
        return getattr(raw, key)
    if hasattr(raw, "model_dump"):
        data = raw.model_dump()
        return data.get(key, default)
    if hasattr(raw, "dict"):
        data = raw.dict()
        return data.get(key, default)
    return default


def normalize_removed_ranges(removed_ranges: Iterable[Any]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int, str]] = set()
    for raw in removed_ranges or []:
        occurrence_id = str(_raw_get(raw, "occurrenceId", "") or "").strip()
        try:
            start = int(_raw_get(raw, "start", 0))
            end = int(_raw_get(raw, "end", 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid removed range")

        text = str(_raw_get(raw, "text", "") or "")
        key = (occurrence_id, start, end, text)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({"occurrenceId": occurrence_id, "start": start, "end": end, "text": text})
    return sorted(cleaned, key=lambda item: (item["start"], item["end"], item["occurrenceId"]))


def recalculate_adjusted_plagiarism_percent(
    *,
    original_percent: int | float | None,
    detailed_matches: Iterable[dict[str, Any]],
    removed_ranges: Iterable[dict[str, Any]],
    plagiarism_text: str,
) -> int:
    original = int(round(float(original_percent or 0)))
    all_matches = [m for m in (detailed_matches or []) if isinstance(m, dict)]
    safe_text = str(plagiarism_text or "")

    allowed_ranges = build_allowed_removed_ranges(safe_text, all_matches)
    total_highlighted_chars = total_range_length(
        [{"start": int(item["start"]), "end": int(item["end"])} for item in allowed_ranges]
    )

    if total_highlighted_chars <= 0:
        return max(0, min(100, original))

    normalized_removed = normalize_removed_ranges(removed_ranges)
    removed_highlighted_chars = total_range_length(
        [{"start": int(item["start"]), "end": int(item["end"])} for item in normalized_removed]
    )

    remaining_ratio = max(
        0.0,
        (total_highlighted_chars - removed_highlighted_chars) / total_highlighted_chars,
    )

    adjusted = round(max(0, min(100, original)) * remaining_ratio)
    return max(0, min(100, int(adjusted)))


def validate_false_detection_review(
    *,
    justification_note: str,
    removed_ranges: Iterable[Any],
    plagiarism_text: str,
    detailed_matches: Iterable[dict[str, Any]],
    existing_removed_ranges: Iterable[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not str(justification_note or "").strip():
        raise HTTPException(status_code=400, detail="A justification note is required")

    raw_removed_ranges = list(removed_ranges or [])
    seen_raw_ranges: set[tuple[str, int, int, str]] = set()
    for raw in raw_removed_ranges:
        try:
            raw_key = (
                str(_raw_get(raw, "occurrenceId", "") or "").strip(),
                int(_raw_get(raw, "start", 0)),
                int(_raw_get(raw, "end", 0)),
                str(_raw_get(raw, "text", "") or ""),
            )
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid removed range")
        if raw_key in seen_raw_ranges:
            raise HTTPException(status_code=400, detail="Duplicate removed range in request")
        seen_raw_ranges.add(raw_key)

    normalized = normalize_removed_ranges(raw_removed_ranges)
    safe_text = str(plagiarism_text or "")
    allowed = build_allowed_removed_ranges(safe_text, detailed_matches)
    allowed_intervals = [{"start": int(item["start"]), "end": int(item["end"])} for item in allowed]

    existing_normalized = normalize_removed_ranges(existing_removed_ranges or [])
    existing_keys = {
        (int(item["start"]), int(item["end"]), normalize_plain(str(item.get("text") or "")))
        for item in existing_normalized
    }

    request_keys: set[tuple[int, int, str]] = set()

    for item in normalized:
        start = int(item["start"])
        end = int(item["end"])
        text = str(item.get("text") or "")
        occurrence_id = str(item.get("occurrenceId") or "").strip()

        if end <= start:
            raise HTTPException(status_code=400, detail="Invalid removed range")

        if start < 0 or end > len(safe_text):
            raise HTTPException(status_code=400, detail="Removed range is outside the report text")

        actual_text = safe_text[start:end]
        if text and normalize_plain(text) != normalize_plain(actual_text):
            raise HTTPException(status_code=400, detail="Removed range text does not match the report content")

        normalized_text_key = normalize_plain(actual_text)
        key = (start, end, normalized_text_key)

        if key in request_keys:
            raise HTTPException(status_code=400, detail="Duplicate removed range in request")
        request_keys.add(key)

        # Allow reopening/saving existing removed ranges again
        if key in existing_keys:
            continue

        # Partial ranges are allowed as long as they are fully inside at least one highlighted segment
        inside_any_highlight = any(start >= rng["start"] and end <= rng["end"] for rng in allowed_intervals)
        if not inside_any_highlight:
            raise HTTPException(
                status_code=400,
                detail="Removed range does not map to a highlighted plagiarism segment",
            )

        # occurrenceId can be the parent highlighted segment id from frontend; do not hard-require exact range match
        if not occurrence_id:
            raise HTTPException(status_code=400, detail="occurrenceId is required")

    return normalized


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def acquire_false_detection_lock(db, *, submission_id: int, user_id: int, ttl_seconds: int = 120, now: datetime | None = None) -> dict[str, Any]:
    now = now or utc_now()
    lock = db.query(IntegrityReviewLock).filter(IntegrityReviewLock.submission_id == int(submission_id)).first()
    expires_at = now + timedelta(seconds=max(1, int(ttl_seconds)))
    if lock and lock.expires_at and lock.expires_at > now and int(lock.locked_by) != int(user_id):
        return {"acquired": False, "read_only": True, "locked_by": int(lock.locked_by), "lock_token": None, "expires_at": lock.expires_at}
    token = uuid4().hex
    if lock:
        lock.locked_by = int(user_id)
        lock.lock_token = token
        lock.expires_at = expires_at
    else:
        lock = IntegrityReviewLock(submission_id=int(submission_id), locked_by=int(user_id), lock_token=token, expires_at=expires_at)
        db.add(lock)
    if hasattr(db, "commit"):
        db.commit()
    return {"acquired": True, "read_only": False, "locked_by": int(user_id), "lock_token": token, "expires_at": expires_at}


def enforce_false_detection_lock(db, *, submission_id: int, user_id: int, lock_token: str | None = None, now: datetime | None = None) -> None:
    now = now or utc_now()
    lock = db.query(IntegrityReviewLock).filter(IntegrityReviewLock.submission_id == int(submission_id)).first()
    if not lock:
        return
    if lock.expires_at and lock.expires_at <= now:
        return
    if int(lock.locked_by) == int(user_id) and (not lock_token or str(lock.lock_token) == str(lock_token)):
        return
    raise HTTPException(status_code=423, detail="Report is currently being reviewed by another lecturer")
