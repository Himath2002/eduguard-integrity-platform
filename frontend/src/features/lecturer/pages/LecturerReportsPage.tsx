import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api, API_BASE_URL } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import {
  applyFilters,
  createFilterRule,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import {
  renderReportHighlights,
  type AiSpan,
  type IntegrityHighlightMode,
} from "@/shared/lib/reportHighlight";

type LecturerClass = {
  id: number;
  name: string;
  code: string;
};

const REPORT_PAGE_SIZE = 24;
const REPORT_VISIBLE_BATCH_SIZE = 12;
const REPORT_REFRESH_THROTTLE_MS = 25_000;

type ReportItem = {
  submission_id: number;
  assignment_title: string;
  class_code: string;
  class_name: string;
  student_username: string;
  submitted_at: string;
  plagiarism_percent: number | null;
  false_detection_reviewed?: boolean;
  ai_detected?: boolean;
  ai_risk_percent?: number | null;
  ai_risk_level?: string | null;
  submission_status?: string | null;
  integrity_status?: string | null;
  report_ready?: boolean;
  report_error?: string | null;
  hasFile?: boolean;
  fileName?: string | null;
  fileUrl?: string | null;
};

type DetailedMatch = {
  phrase: string;
  source_type: string;
  source_name: string;
  source_path?: string;
  score?: number;
  source_doc_id?: string;
  source_chunk_id?: number;
};

type HighlightSourceCard = {
  text: string;
  type: "lecture" | "submission" | "online" | "multiple";
  sources: DetailedMatch[];
};

type HighlightOccurrence = HighlightSourceCard & {
  occurrenceId: string;
  start: number;
  end: number;
};

type DetailedSegment = {
  occurrenceId: string;
  start: number;
  end: number;
  text: string;
  type: "lecture" | "submission" | "online" | "multiple";
  sources: DetailedMatch[];
};

type RemovedFalseRange = {
  id: string;
  occurrenceId: string;
  start: number;
  end: number;
  text: string;
  sources: DetailedMatch[];
};


const LECTURER_THEME_KEY = "eduguard.lecturer.theme";
const STUDENT_THEME_KEY = "eduguard.student.theme";
const LECTURER_THEME_EVENT = "eduguard:lecturer-theme-change";
const STUDENT_THEME_EVENT = "eduguard:student-theme-change";

function normalizeThemeValue(value: string | null | undefined): "dark" | "light" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";
  return null;
}

function resolveReportsDarkMode() {
  if (typeof window === "undefined") return false;

  const doc = document.documentElement;
  const body = document.body;

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(body.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme"));

  if (explicitTheme) return explicitTheme === "dark";

  const storedTheme =
    normalizeThemeValue(window.localStorage.getItem(LECTURER_THEME_KEY)) ??
    normalizeThemeValue(window.localStorage.getItem(STUDENT_THEME_KEY));

  if (storedTheme) return storedTheme === "dark";

  return doc.classList.contains("dark") || body.classList.contains("dark");
}

const ReportsLocalCSS = () => (
  <style>{`
    .reports-page-light {
      color: rgba(15, 23, 42, 0.96);
    }

    .reports-page-dark {
      color: rgba(248, 250, 252, 0.96);
    }

    .reports-report-card {
      transform: translateZ(0);
      will-change: transform, box-shadow;
    }

    .reports-report-card:hover {
      transform: translateY(-7px) scale(1.015) !important;
    }

    .reports-page-light .reports-report-card:hover {
      box-shadow: 0 30px 70px rgba(99, 102, 241, 0.18), 0 12px 26px rgba(15, 23, 42, 0.10) !important;
    }

    .reports-page-dark .reports-report-card {
      background: linear-gradient(135deg, rgba(8, 15, 32, 0.96), rgba(10, 20, 42, 0.92), rgba(6, 16, 30, 0.96)) !important;
      border-color: rgba(148, 163, 184, 0.18) !important;
      box-shadow: 0 20px 46px rgba(2, 6, 23, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
    }

    .reports-page-dark .reports-report-card:hover {
      border-color: rgba(96, 165, 250, 0.44) !important;
      box-shadow: 0 34px 76px rgba(2, 6, 23, 0.58), 0 0 38px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.07) !important;
    }

    .reports-page-dark .reports-report-title,
    .reports-page-dark .reports-report-meta {
      color: rgba(248, 250, 252, 0.97) !important;
    }

    .reports-page-dark .reports-report-subtext {
      color: rgba(203, 213, 225, 0.92) !important;
    }

    .reports-modal-light {
      color: rgba(15, 23, 42, 0.96);
    }

    .reports-modal-dark {
      color: rgba(248, 250, 252, 0.96);
    }

    .reports-modal-dark .bg-white,
    .reports-modal-dark .bg-white\\/75,
    .reports-modal-dark .bg-white\\/70,
    .reports-modal-dark .bg-slate-50,
    .reports-modal-dark .bg-slate-50\\/70 {
      background-color: rgba(8, 15, 32, 0.94) !important;
    }

    .reports-modal-dark .border-slate-200,
    .reports-modal-dark .border-slate-300,
    .reports-modal-dark .border-dashed {
      border-color: rgba(148, 163, 184, 0.22) !important;
    }

    .reports-modal-dark .text-slate-900,
    .reports-modal-dark .text-slate-800,
    .reports-modal-dark .text-slate-700 {
      color: rgba(248, 250, 252, 0.96) !important;
    }

    .reports-modal-dark .text-slate-600,
    .reports-modal-dark .text-slate-500 {
      color: rgba(203, 213, 225, 0.86) !important;
    }

    .reports-modal-dark .report-reader-panel {
      background: linear-gradient(180deg, rgba(8, 15, 32, 0.96), rgba(4, 9, 20, 0.96)) !important;
      color: rgba(248, 250, 252, 0.94) !important;
    }

    .reports-modal-dark textarea,
    .reports-modal-dark input {
      background-color: rgba(2, 6, 23, 0.68) !important;
      border-color: rgba(148, 163, 184, 0.24) !important;
      color: rgba(248, 250, 252, 0.96) !important;
    }

    .reports-modal-dark textarea::placeholder,
    .reports-modal-dark input::placeholder {
      color: rgba(148, 163, 184, 0.72) !important;
    }

    .reports-modal-dark .bg-amber-50\\/70,
    .reports-modal-dark .bg-rose-50\\/70 {
      background-color: rgba(30, 41, 59, 0.72) !important;
    }



    body.reports-modal-force-dark .eg-portal-modal {
      background:
        radial-gradient(circle at top left, rgba(99, 102, 241, 0.12), transparent 34%),
        radial-gradient(circle at top right, rgba(34, 211, 238, 0.09), transparent 30%),
        linear-gradient(180deg, #081120 0%, #050b16 100%) !important;
      color: rgba(248, 250, 252, 0.98) !important;
      border-color: rgba(148, 163, 184, 0.22) !important;
      box-shadow: 0 36px 110px rgba(0, 0, 0, 0.62) !important;
    }

    body.reports-modal-force-dark .eg-portal-modal-header {
      background: rgba(7, 14, 28, 0.96) !important;
      border-bottom-color: rgba(148, 163, 184, 0.20) !important;
    }

    body.reports-modal-force-dark .eg-portal-modal-title {
      color: rgba(248, 250, 252, 0.98) !important;
    }

    body.reports-modal-force-dark .eg-portal-modal-close {
      color: rgba(226, 232, 240, 0.95) !important;
    }

    body.reports-modal-force-dark .eg-portal-modal-close:hover {
      color: rgba(255, 255, 255, 1) !important;
      background: rgba(255, 255, 255, 0.08) !important;
    }

    body.reports-modal-force-dark .eg-portal-modal-body {
      background:
        radial-gradient(circle at 12% 0%, rgba(59, 130, 246, 0.10), transparent 32%),
        radial-gradient(circle at 92% 0%, rgba(16, 185, 129, 0.08), transparent 34%),
        linear-gradient(180deg, #0b1728 0%, #081120 100%) !important;
      color: rgba(248, 250, 252, 0.96) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark,
    body.reports-modal-force-dark .reports-modal-dark .bg-white,
    body.reports-modal-force-dark .reports-modal-dark [class~="bg-white/75"],
    body.reports-modal-force-dark .reports-modal-dark [class~="bg-white/70"],
    body.reports-modal-force-dark .reports-modal-dark .bg-slate-50,
    body.reports-modal-force-dark .reports-modal-dark [class~="bg-slate-50/70"] {
      background-color: rgba(8, 15, 32, 0.88) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .border-slate-200,
    body.reports-modal-force-dark .reports-modal-dark .border-slate-300,
    body.reports-modal-force-dark .reports-modal-dark .border-dashed {
      border-color: rgba(148, 163, 184, 0.22) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .text-slate-900,
    body.reports-modal-force-dark .reports-modal-dark .text-slate-800,
    body.reports-modal-force-dark .reports-modal-dark .text-slate-700 {
      color: rgba(248, 250, 252, 0.97) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .text-slate-600,
    body.reports-modal-force-dark .reports-modal-dark .text-slate-500 {
      color: rgba(203, 213, 225, 0.88) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .report-reader-panel {
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 30%),
        linear-gradient(180deg, rgba(8, 15, 32, 0.98), rgba(4, 9, 20, 0.98)) !important;
      color: rgba(248, 250, 252, 0.95) !important;
      border-color: rgba(148, 163, 184, 0.18) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark textarea,
    body.reports-modal-force-dark .reports-modal-dark input {
      background-color: rgba(2, 6, 23, 0.76) !important;
      border-color: rgba(148, 163, 184, 0.28) !important;
      color: rgba(248, 250, 252, 0.96) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark textarea::placeholder,
    body.reports-modal-force-dark .reports-modal-dark input::placeholder {
      color: rgba(148, 163, 184, 0.72) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .bg-amber-50,
    body.reports-modal-force-dark .reports-modal-dark [class~="bg-amber-50/70"] {
      background-color: rgba(120, 53, 15, 0.32) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .bg-rose-50,
    body.reports-modal-force-dark .reports-modal-dark [class~="bg-rose-50/70"] {
      background-color: rgba(127, 29, 29, 0.26) !important;
    }

    body.reports-modal-force-dark .reports-modal-dark .hover\\:bg-slate-50:hover {
      background-color: rgba(30, 41, 59, 0.58) !important;
    }

    .reports-modal-light .report-reader-panel {
      background: rgba(255, 255, 255, 0.98);
      color: rgba(15, 23, 42, 0.94);
    }
  `}</style>
);

function AiBadge({ r }: { r: ReportItem }) {
  const pct = typeof r.ai_risk_percent === "number" ? r.ai_risk_percent : null;
  const lvlRaw = (r.ai_risk_level || "").toLowerCase();
  const lvl =
    lvlRaw === "high" || lvlRaw === "medium" || lvlRaw === "low" ? lvlRaw : null;

  if (pct !== null) {
    const finalLevel = lvl ?? (pct >= 70 ? "high" : pct >= 40 ? "medium" : "low");
    const cls =
      finalLevel === "high"
        ? "bg-orange-100 text-orange-800"
        : finalLevel === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";

    return (
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
        AI Risk: {pct}% ({finalLevel})
      </span>
    );
  }

  if (r.ai_detected) {
    return (
      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">
        AI detected
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
      No AI detected
    </span>
  );
}

function SubmissionStatusBadge({ r, isDarkMode }: { r: ReportItem; isDarkMode: boolean }) {
  const integrity = String(r.integrity_status || "").toLowerCase();
  const submission = String(r.submission_status || "").toLowerCase();

  if (integrity === "failed" || submission === "failed") {
    const failedClass = isDarkMode
      ? "border border-red-400/25 bg-red-500/10 text-red-200 shadow-none"
      : "bg-red-100 text-red-700";

    return (
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${failedClass}`}>
        Report failed
      </span>
    );
  }

  if (
    !r.report_ready ||
    integrity === "queued" ||
    integrity === "running" ||
    submission === "processing"
  ) {
    const processingClass = isDarkMode
      ? "border border-amber-400/25 bg-amber-500/10 text-amber-200 shadow-none"
      : "bg-amber-100 text-amber-800";

    return (
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${processingClass}`}>
        Processing report
      </span>
    );
  }

  const readyClass = isDarkMode
    ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-200 shadow-none"
    : "bg-emerald-100 text-emerald-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${readyClass}`}>
      Report ready
    </span>
  );
}

function clampPct(v: unknown) {
  const n = typeof v === "number" ? v : 0;
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function CircularPercent({
  label,
  value,
  stroke = "rgb(99,102,241)",
}: {
  label: string;
  value: number;
  stroke?: string;
}) {
  const pct = clampPct(value);
  const size = 120;
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
          aria-label={`${label}: ${pct}%`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="transparent"
            stroke="rgba(15,23,42,0.10)"
            strokeWidth="10"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="transparent"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-2xl font-semibold text-slate-900">{pct}%</div>
            <div className="text-xs text-slate-600">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function normChar(ch: string) {
  const c = ch.normalize("NFKC");
  if (/[a-zA-Z0-9]/.test(c)) return c.toLowerCase();
  if (/\s/.test(c)) return " ";
  return " ";
}

function normalizeWithMap(original: string) {
  let norm = "";
  const map: number[] = [];
  let prevWasSpace = true;

  for (let i = 0; i < original.length; i += 1) {
    const out = normChar(original[i]);
    if (out === " ") {
      if (prevWasSpace) continue;
      prevWasSpace = true;
      norm += " ";
      map.push(i);
    } else {
      prevWasSpace = false;
      norm += out;
      map.push(i);
    }
  }

  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }

  return { norm, map };
}

function normalizePlain(value: string) {
  return normalizeWithMap(value).norm;
}

function findAllOccurrences(hay: string, needle: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  if (!needle || needle.length < 8) return ranges;

  let idx = 0;
  while (true) {
    const at = hay.indexOf(needle, idx);
    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    idx = at + Math.max(1, Math.floor(needle.length / 2));
  }

  return ranges;
}

function toOriginalRanges(text: string, phrase: string) {
  const clean = String(phrase || "").trim();
  if (clean.length < 8) return [] as Array<{ start: number; end: number }>;

  const { norm: normText, map } = normalizeWithMap(text);
  const normPhrase = normalizePlain(clean);
  if (normPhrase.length < 8) return [] as Array<{ start: number; end: number }>;

  return findAllOccurrences(normText, normPhrase)
    .map((range) => ({
      start: map[range.start],
      end: map[Math.min(range.end - 1, map.length - 1)] + 1,
    }))
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.end > range.start
    );
}

function makeRangeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  const sorted = [...ranges]
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) return [];

  const merged = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function totalRangeLength(ranges: Array<{ start: number; end: number }>) {
  return mergeRanges(ranges).reduce((sum, r) => sum + (r.end - r.start), 0);
}

function falseDetectionMatchKey(match: DetailedMatch) {
  return [
    match.phrase ?? "",
    match.source_type ?? "",
    match.source_name ?? "",
    match.source_doc_id ?? "",
    match.source_chunk_id ?? "",
  ].join("::");
}

function falseDetectionOccurrenceId(
  match: DetailedMatch | undefined,
  start: number,
  end: number,
  fallbackIndex: number
) {
  if (!match) return `seg-${start}-${end}-${fallbackIndex}`;
  return `${falseDetectionMatchKey(match)}::${start}:${end}`;
}

function createFalseDetectionIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `fd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildDetailedHighlightSegments(
  text: string,
  detailedMatches: DetailedMatch[]
): DetailedSegment[] {
  if (!text) return [];

  type RawRange = {
    start: number;
    end: number;
    source: DetailedMatch;
  };

  const rawRanges: RawRange[] = [];

  for (const match of detailedMatches) {
    const cleaned = String(match.phrase || "").trim();
    if (cleaned.length < 8) continue;

    const anchoredRanges = toOriginalRanges(text, cleaned);
    for (const range of anchoredRanges) {
      rawRanges.push({
        start: range.start,
        end: range.end,
        source: match,
      });
    }
  }

  if (!rawRanges.length) return [];

  const boundarySet = new Set<number>([0, text.length]);
  rawRanges.forEach((r) => {
    boundarySet.add(r.start);
    boundarySet.add(r.end);
  });

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const segments: DetailedSegment[] = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;

    const covering = rawRanges.filter((r) => r.start < end && r.end > start);
    if (!covering.length) continue;

    const sourceMap = new Map<string, DetailedMatch>();
    covering.forEach((r) => {
      const key = falseDetectionMatchKey(r.source);
      if (!sourceMap.has(key)) {
        sourceMap.set(key, r.source);
      }
    });

    const sources = Array.from(sourceMap.values());
    const hasLecture = sources.some((s) => s.source_type === "lecture_material");
    const hasSubmission = sources.some((s) => s.source_type === "submission");
    const hasOnline = sources.some((s) => s.source_type === "online_source");
    const activeCount = [hasLecture, hasSubmission, hasOnline].filter(Boolean).length;

    const type: DetailedSegment["type"] =
      activeCount > 1
        ? "multiple"
        : hasLecture
        ? "lecture"
        : hasSubmission
        ? "submission"
        : "online";

    const last = segments[segments.length - 1];
    const sameSources =
      last &&
      last.type === type &&
      last.sources.length === sources.length &&
      last.sources.every((s) =>
        sources.some(
          (t) =>
            s.phrase === t.phrase &&
            s.source_type === t.source_type &&
            s.source_name === t.source_name &&
            (s.source_doc_id ?? "") === (t.source_doc_id ?? "") &&
            (s.source_chunk_id ?? 0) === (t.source_chunk_id ?? 0)
        )
      );

    if (last && last.end === start && sameSources) {
      last.end = end;
      last.text = text.slice(last.start, last.end);
    } else {
      segments.push({
        occurrenceId: falseDetectionOccurrenceId(sources[0], start, end, segments.length),
        start,
        end,
        text: text.slice(start, end),
        type,
        sources,
      });
    }
  }

  return segments;
}

function renderDetailedReportHighlights(
  text: string,
  segments: DetailedSegment[],
  removedRanges: RemovedFalseRange[],
  onSelect: (value: HighlightOccurrence) => void
) {
  if (!text) return null;
  if (!segments.length) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  segments.forEach((seg, idx) => {
    if (cursor < seg.start) {
      nodes.push(<span key={`plain-${idx}`}>{text.slice(cursor, seg.start)}</span>);
    }

    const style =
      seg.type === "lecture"
        ? { backgroundColor: "rgba(254, 202, 202, 0.95)", color: "rgb(127, 29, 29)" }
        : seg.type === "submission"
        ? { backgroundColor: "rgba(254, 240, 138, 0.98)", color: "rgb(113, 63, 18)" }
        : seg.type === "online"
        ? { backgroundColor: "rgba(191, 219, 254, 0.98)", color: "rgb(30, 64, 175)" }
        : { backgroundColor: "rgba(221, 214, 254, 0.98)", color: "rgb(107, 33, 168)" };

    const className =
      seg.type === "lecture"
        ? "cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-red-400"
        : seg.type === "submission"
        ? "cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-yellow-400"
        : seg.type === "online"
        ? "cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-blue-400"
        : "cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-purple-400";

    const cuts = removedRanges
      .filter((r) => r.end > seg.start && r.start < seg.end)
      .map((r) => ({
        start: Math.max(seg.start, r.start),
        end: Math.min(seg.end, r.end),
      }));

    const normalizedCuts = mergeRanges(cuts);
    const boundaries = Array.from(
      new Set([
        seg.start,
        seg.end,
        ...normalizedCuts.flatMap((cut) => [cut.start, cut.end]),
      ])
    )
      .filter((point) => point >= seg.start && point <= seg.end)
      .sort((a, b) => a - b);

    let assignedHighlightTestId = false;

    for (let partIdx = 0; partIdx < boundaries.length - 1; partIdx += 1) {
      const start = boundaries[partIdx];
      const end = boundaries[partIdx + 1];
      if (end <= start) continue;

      const isRemoved = normalizedCuts.some((cut) => cut.start < end && cut.end > start);

      if (isRemoved) {
        nodes.push(
          <span
            key={`removed-${idx}-${partIdx}`}
            data-testid={`false-detection-removed-${idx}-${partIdx}`}
            className="rounded bg-slate-200 px-0.5 text-slate-400 line-through"
            title="Removed from false-detection review"
          >
            {text.slice(start, end)}
          </span>
        );
        continue;
      }

      nodes.push(
        <mark
          key={`mark-${idx}-${partIdx}`}
          data-testid={
            assignedHighlightTestId ? undefined : `false-detection-highlight-${idx}`
          }
          className={className}
          style={style}
          title="Click to review this highlighted part"
          onClick={() =>
            onSelect({
              occurrenceId: seg.occurrenceId,
              start: seg.start,
              end: seg.end,
              text: text.slice(seg.start, seg.end),
              type: seg.type,
              sources: seg.sources,
            })
          }
        >
          {text.slice(start, end)}
        </mark>
      );
      assignedHighlightTestId = true;
    }

    cursor = seg.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="plain-last">{text.slice(cursor)}</span>);
  }

  return nodes;
}

export default function LecturerReportsPage() {
  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string;
    username?: string;
    email?: string;
  };

  const username =
    auth?.username ||
    auth?.userId ||
    (auth?.email ? String(auth.email).split("@")[0] : "");

  const [isDarkMode, setIsDarkMode] = useState(resolveReportsDarkMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(resolveReportsDarkMode());

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === LECTURER_THEME_KEY ||
        event.key === STUDENT_THEME_KEY
      ) {
        syncTheme();
      }
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "class"],
    });

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, syncTheme as EventListener);
    window.addEventListener(STUDENT_THEME_EVENT, syncTheme as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LECTURER_THEME_EVENT, syncTheme as EventListener);
      window.removeEventListener(STUDENT_THEME_EVENT, syncTheme as EventListener);
    };
  }, []);

  const pageThemeClass = isDarkMode ? "reports-page-dark" : "reports-page-light";
  const modalThemeClass = isDarkMode ? "reports-modal-dark" : "reports-modal-light";


  const [classes, setClasses] = useState<LecturerClass[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [visibleReportCount, setVisibleReportCount] = useState(
    REPORT_VISIBLE_BATCH_SIZE
  );
  const lastReportsRefreshAt = useRef(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [openDetails, setOpenDetails] = useState(false);
  const [openDetailed, setOpenDetailed] = useState(false);
  const [openFalseDetection, setOpenFalseDetection] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const hasOpenReportModal = openDetails || openDetailed || openFalseDetection;
    const className = "reports-modal-force-dark";

    if (hasOpenReportModal && isDarkMode) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }

    return () => {
      document.body.classList.remove(className);
    };
  }, [isDarkMode, openDetails, openDetailed, openFalseDetection]);

  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [reportText, setReportText] = useState<string>("");
  const [plagiarismReportText, setPlagiarismReportText] = useState<string>("");
  const [plagPhrases, setPlagPhrases] = useState<string[]>([]);
  const [lecturePhrases, setLecturePhrases] = useState<string[]>([]);
  const [submissionPhrases, setSubmissionPhrases] = useState<string[]>([]);
  const [onlinePhrases, setOnlinePhrases] = useState<string[]>([]);
  const [detailedMatches, setDetailedMatches] = useState<DetailedMatch[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightSourceCard | null>(
    null
  );
  const [aiSpans, setAiSpans] = useState<AiSpan[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textErr, setTextErr] = useState<string | null>(null);
  const [integrityMode, setIntegrityMode] =
    useState<IntegrityHighlightMode>("plagiarism");

  const [falseSelected, setFalseSelected] = useState<HighlightOccurrence | null>(null);
  const [removedFalseRanges, setRemovedFalseRanges] = useState<RemovedFalseRange[]>([]);
  const [undoStack, setUndoStack] = useState<RemovedFalseRange[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [basePlagiarismPercent, setBasePlagiarismPercent] = useState<number>(0);
  const [savingReview, setSavingReview] = useState(false);
  const [saveReviewMessage, setSaveReviewMessage] = useState<string | null>(null);
  const [justificationNote, setJustificationNote] = useState("");
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const [lastSaveKey, setLastSaveKey] = useState<string | null>(null);

  const loadAll = useCallback(async (silent = false, force = false) => {
    if (!username) return;

    const now = Date.now();
    if (
      silent &&
      !force &&
      now - lastReportsRefreshAt.current < REPORT_REFRESH_THROTTLE_MS
    ) {
      return;
    }
    lastReportsRefreshAt.current = now;

    if (!silent) {
      setLoading(true);
      setErr(null);
    }

    try {
      const classPromise = api<any[]>(`/lecturer/${username}/classes`);
      const reportPromise = api<ReportItem[]>(
        `/lecturer/${username}/reports?limit=${REPORT_PAGE_SIZE}&offset=0`
      );

      const cls = await classPromise.catch(() => []);
      setClasses(
        (cls ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
        }))
      );

      const data = await reportPromise;
      const rows = data ?? [];
      setReports(rows);
      setHasMoreReports(rows.length === REPORT_PAGE_SIZE);
      if (silent) setErr(null);
    } catch (e: any) {
      if (!silent) setErr(e?.message || "Failed to load reports");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadAll(true);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadAll]);

  const reportFilterDefinitions = useMemo<FilterDefinition<ReportItem>[]>(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by class, student or assignment",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [item.class_code, item.student_username, item.assignment_title]
            .join(" ")
            .toLowerCase()
            .includes(q);
        },
      },
      {
        key: "classCode",
        label: "Class",
        type: "select",
        options: classes.map((c) => ({
          value: c.code,
          label: `${c.code} - ${c.name}`,
        })),
        getValue: (item) => item.class_code,
      },
      {
        key: "student",
        label: "Student",
        type: "text",
        placeholder: "Search by student username",
        match: (item, value) =>
          item.student_username.toLowerCase().includes(value.toLowerCase()),
      },
      {
        key: "plagiarismBand",
        label: "Plagiarism band",
        type: "select",
        options: [
          { value: "low", label: "Low (0–29%)" },
          { value: "medium", label: "Medium (30–69%)" },
          { value: "high", label: "High (70%+)" },
        ],
        match: (item, value) => {
          const pct = Number(item.plagiarism_percent ?? 0);
          if (value === "low") return pct < 30;
          if (value === "medium") return pct >= 30 && pct < 70;
          if (value === "high") return pct >= 70;
          return true;
        },
      },
      {
        key: "aiRisk",
        label: "AI risk",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        match: (item, value) => {
          const pct =
            typeof item.ai_risk_percent === "number"
              ? item.ai_risk_percent
              : item.ai_detected
              ? 70
              : 0;
          if (value === "low") return pct < 40;
          if (value === "medium") return pct >= 40 && pct < 70;
          if (value === "high") return pct >= 70;
          return true;
        },
      },
    ],
    [classes]
  );

  const filteredReports = useMemo(
    () => applyFilters(reports, filters, reportFilterDefinitions),
    [reports, filters, reportFilterDefinitions]
  );

  useEffect(() => {
    setVisibleReportCount(REPORT_VISIBLE_BATCH_SIZE);
  }, [filters]);

  const visibleReports = filteredReports.slice(0, visibleReportCount);
  const hasHiddenLoadedReports = visibleReports.length < filteredReports.length;

  const loadMoreReports = async () => {
    if (hasHiddenLoadedReports) {
      setVisibleReportCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      return;
    }
    if (!username || loading) return;
    setLoading(true);
    try {
      const rows = await api<ReportItem[]>(
        `/lecturer/${username}/reports?limit=${REPORT_PAGE_SIZE}&offset=${reports.length}`
      );
      const nextRows = rows ?? [];
      setReports((prev) => [...prev, ...nextRows]);
      setVisibleReportCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      setHasMoreReports(nextRows.length === REPORT_PAGE_SIZE);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load more reports");
    } finally {
      setLoading(false);
    }
  };

  const loadReportText = async (r: ReportItem) => {
    setTextLoading(true);
    setTextErr(null);
    setReportText("");
    setPlagiarismReportText("");
    setPlagPhrases([]);
    setLecturePhrases([]);
    setSubmissionPhrases([]);
    setOnlinePhrases([]);
    setDetailedMatches([]);
    setAiSpans([]);

    try {
      const data = await api<{
        submission_id: number;
        text: string;
        plagiarism_text?: string;
        plagiarised_phrases: string[];
        lecture_phrases: string[];
        submission_phrases: string[];
        online_phrases: string[];
        detailed_matches: DetailedMatch[];
        ai_spans: AiSpan[];
        original_plagiarism_percent?: number | null;
        saved_removed_ranges?: Array<{
          occurrenceId: string;
          start: number;
          end: number;
          text?: string;
        }>;
        saved_adjusted_plagiarism_percent?: number | null;
        saved_justification_note?: string | null;
        saved_review_version?: number | null;
        saved_idempotency_key?: string | null;
      }>(`/lecturer/${username}/submissions/${r.submission_id}/report-text`);

      setReportText(data?.text ?? "");
      setPlagiarismReportText(data?.plagiarism_text ?? data?.text ?? "");
      setPlagPhrases(data?.plagiarised_phrases ?? []);
      setLecturePhrases(data?.lecture_phrases ?? []);
      setSubmissionPhrases(data?.submission_phrases ?? []);
      setOnlinePhrases(data?.online_phrases ?? []);
      setDetailedMatches(data?.detailed_matches ?? []);
      setAiSpans(data?.ai_spans ?? []);
      setIntegrityMode("plagiarism");
      setBasePlagiarismPercent(
        typeof data?.original_plagiarism_percent === "number"
          ? data.original_plagiarism_percent
          : clampPct(r.plagiarism_percent ?? 0)
      );

      setRemovedFalseRanges(
        (data?.saved_removed_ranges ?? []).map((item, index) => ({
          id: `saved-${index}-${item.start}-${item.end}`,
          occurrenceId: item.occurrenceId,
          start: item.start,
          end: item.end,
          text: item.text ?? (data?.plagiarism_text ?? data?.text ?? "").slice(item.start, item.end),
          sources: [],
        }))
      );

      setUndoStack([]);
      setJustificationNote(data?.saved_justification_note ?? "");
      setReviewVersion(
        typeof data?.saved_review_version === "number" ? data.saved_review_version : null
      );
      setLastSaveKey(data?.saved_idempotency_key ?? null);

    } catch (e: any) {
      setTextErr(e?.message || "Failed to load report text");
    } finally {
      setTextLoading(false);
    }
  };

  const openReport = async (r: ReportItem) => {
    setSelected(r);
    setOpenDetails(true);
    setOpenDetailed(false);
    setOpenFalseDetection(false);
    setSelectedHighlight(null);
    setFalseSelected(null);
    setRemovedFalseRanges([]);
    setUndoStack([]);
    setSelectionError(null);
    setSaveReviewMessage(null);
    setSavingReview(false);
    setReviewVersion(null);
    setLastSaveKey(null);
    await loadReportText(r);
  };

  const openFalseDetectionReview = async (r: ReportItem) => {
    setSelected(r);
    setOpenDetails(false);
    setOpenDetailed(false);
    setOpenFalseDetection(true);
    setSelectedHighlight(null);
    setFalseSelected(null);
    setRemovedFalseRanges([]);
    setUndoStack([]);
    setSelectionError(null);
    setSaveReviewMessage(null);
    setSavingReview(false);
    setReviewVersion(null);
    setLastSaveKey(null);
    await loadReportText(r);
  };

  const closeReport = () => {
    setOpenDetails(false);
    setOpenDetailed(false);
    setOpenFalseDetection(false);
    setSelected(null);
    setSelectedHighlight(null);
    setFalseSelected(null);
    setReportText("");
    setPlagiarismReportText("");
    setPlagPhrases([]);
    setLecturePhrases([]);
    setSubmissionPhrases([]);
    setOnlinePhrases([]);
    setDetailedMatches([]);
    setAiSpans([]);
    setTextErr(null);
    setTextLoading(false);
    setIntegrityMode("plagiarism");
    setRemovedFalseRanges([]);
    setUndoStack([]);
    setSelectionError(null);
    setBasePlagiarismPercent(0);
    setSaveReviewMessage(null);
    setSavingReview(false);
    setJustificationNote("");
    setReviewVersion(null);
    setLastSaveKey(null);
  };

  const switchIntegrityMode = (next: IntegrityHighlightMode) => {
    try {
      window.getSelection?.()?.removeAllRanges?.();
    } catch {
      // Selection cleanup is best-effort and must not block mode changes.
    }
    setIntegrityMode(next);
  };

  const detailedReportText =
    (plagiarismReportText || reportText) || "No extracted text found.";

  const detailedSegments = useMemo(
    () => buildDetailedHighlightSegments(detailedReportText, detailedMatches),
    [detailedReportText, detailedMatches]
  );

  const falseReviewText =
    (plagiarismReportText || reportText) || "No extracted text found.";

  const falseDetectionSegments = useMemo(
    () => buildDetailedHighlightSegments(falseReviewText, detailedMatches),
    [falseReviewText, detailedMatches]
  );

  const adjustedPlagiarismPercent = useMemo(() => {
    const totalHighlightedChars = totalRangeLength(
      falseDetectionSegments.map((s) => ({ start: s.start, end: s.end }))
    );

    const removedHighlightedChars = totalRangeLength(
      removedFalseRanges.map((r) => ({ start: r.start, end: r.end }))
    );

    if (totalHighlightedChars <= 0) {
      return clampPct(basePlagiarismPercent);
    }

    const remainingRatio = Math.max(
      0,
      (totalHighlightedChars - removedHighlightedChars) / totalHighlightedChars
    );

    return clampPct(Math.round(basePlagiarismPercent * remainingRatio));
  }, [falseDetectionSegments, removedFalseRanges, basePlagiarismPercent]);

  const removeSelectedFalseDetection = () => {
    setSelectionError(null);

    if (!falseSelected) {
      setSelectionError("Click a highlighted chunk first.");
      return;
    }

    const selectedText = window.getSelection?.();
    const raw = selectedText?.toString?.() ?? "";
    const trimmed = raw.trim();

    let absoluteStart = falseSelected.start;
    let absoluteEnd = falseSelected.end;

    if (trimmed) {
      const segmentText = falseReviewText.slice(falseSelected.start, falseSelected.end);
      const normalizeSelectedText = (value: string) => value.replace(/\s+/g, " ").trim();
      const normalizedSegment = normalizeSelectedText(segmentText);
      const normalizedSelection = normalizeSelectedText(trimmed);
      const selectionLooksLikeWholeChunk =
        normalizedSelection === normalizedSegment ||
        (
          normalizedSegment.includes(normalizedSelection) &&
          normalizedSelection.length >= Math.max(1, normalizedSegment.length * 0.92)
        );

      if (selectionLooksLikeWholeChunk) {
        absoluteStart = falseSelected.start;
        absoluteEnd = falseSelected.end;
      } else {
        const localStart = segmentText.indexOf(trimmed);

        if (localStart === -1) {
          setSelectionError("Selected text must be inside the clicked highlighted chunk.");
          return;
        }

        absoluteStart = falseSelected.start + localStart;
        absoluteEnd = absoluteStart + trimmed.length;
      }
    }

    const newRange: RemovedFalseRange = {
      id: makeRangeId(),
      occurrenceId: falseSelected.occurrenceId,
      start: absoluteStart,
      end: absoluteEnd,
      text: falseReviewText.slice(absoluteStart, absoluteEnd),
      sources: falseSelected.sources,
    };

    setRemovedFalseRanges((prev) => [...prev, newRange]);
    setUndoStack((prev) => [...prev, newRange]);

    try {
      window.getSelection?.()?.removeAllRanges?.();
    } catch {
      // Selection cleanup is best-effort and must not block review updates.
    }

    setSelectionError(null);
  };

  const undoFalseDetection = () => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;

      const last = prev[prev.length - 1];
      const nextStack = prev.slice(0, -1);

      setRemovedFalseRanges((current) => current.filter((r) => r.id !== last.id));
      return nextStack;
    });
  };

  const saveFalseDetectionReview = async () => {
    if (!selected) return;

    const trimmedNote = justificationNote.trim();

    if (!trimmedNote) {
      setSaveReviewMessage(null);
      setSelectionError("A justification note is required.");
      return;
    }

    setSavingReview(true);
    setSaveReviewMessage(null);
    setSelectionError(null);

    const idempotencyKey = createFalseDetectionIdempotencyKey();

    try {
      const saved = await api<{
        ok?: boolean;
        submission_id?: number;
        adjusted_plagiarism_percent?: number;
        removed_ranges?: Array<{
          occurrenceId: string;
          start: number;
          end: number;
          text?: string;
        }>;
        justification_note?: string | null;
        version_no?: number | null;
        idempotency_key?: string | null;
      }>(`/lecturer/${username}/submissions/${selected.submission_id}/false-detection-review`, {
        method: "PUT",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: {
          removed_ranges: removedFalseRanges.map((r) => ({
            occurrenceId: r.occurrenceId,
            start: r.start,
            end: r.end,
            text: r.text,
          })),
          adjusted_plagiarism_percent: adjustedPlagiarismPercent,
          justification_note: trimmedNote,
        },
      });

      const nextPercent =
        typeof saved?.adjusted_plagiarism_percent === "number"
          ? saved.adjusted_plagiarism_percent
          : adjustedPlagiarismPercent;

      setSelected((prev) =>
        prev
          ? {
              ...prev,
              plagiarism_percent: nextPercent,
              false_detection_reviewed: true,
            }
          : prev
      );

      setReports((prev) =>
        prev.map((item) =>
          item.submission_id === selected.submission_id
            ? {
                ...item,
                plagiarism_percent: nextPercent,
                false_detection_reviewed: true,
              }
            : item
        )
      );

      setReviewVersion(typeof saved?.version_no === "number" ? saved.version_no : null);
      setLastSaveKey(saved?.idempotency_key ?? idempotencyKey);
      setJustificationNote(saved?.justification_note ?? trimmedNote);
      setSaveReviewMessage("False-detection review saved successfully.");

      await loadAll(true, true);
    } catch (e: any) {
      setSaveReviewMessage(e?.message || "Failed to save false-detection review.");
    } finally {
      setSavingReview(false);
    }
  };

  const selectedReportPdfUrl = selected
    ? `${API_BASE_URL}/lecturer/${username}/submissions/${selected.submission_id}/integrity-highlighted-pdf?mode=${
        integrityMode === "ai" ? "ai" : "plagiarism"
      }`
    : null;

  const selectedOriginalPdfUrl = selected?.fileUrl
    ? `${API_BASE_URL}${selected.fileUrl}`
    : null;

  const aiPct =
    typeof selected?.ai_risk_percent === "number"
      ? selected.ai_risk_percent
      : selected?.ai_detected
      ? 70
      : 0;

  const reportCardClass =
    "reports-report-card group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white/95 via-white/86 to-indigo-50/55 p-6 shadow-[0_16px_42px_rgba(99,102,241,0.08)] ring-1 ring-indigo-100/60 backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-[7px] hover:scale-[1.015] hover:border-indigo-200/80 hover:from-white hover:via-indigo-50/55 hover:to-sky-50/70 hover:shadow-[0_26px_66px_rgba(99,102,241,0.16)]";

  const actionBase =
    "inline-flex min-h-[2.45rem] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-2xl transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2";

  const disabledAction = isDarkMode
    ? `${actionBase} cursor-not-allowed border-slate-700/70 bg-slate-900/55 text-slate-500 shadow-none focus:ring-slate-700/70 focus:ring-offset-slate-950`
    : `${actionBase} cursor-not-allowed border-slate-200/70 bg-slate-100/55 text-slate-400 shadow-none focus:ring-slate-200/70`;

  const viewAction = isDarkMode
    ? `${actionBase} border-indigo-400/35 bg-indigo-500/12 text-indigo-100 shadow-[0_12px_30px_rgba(99,102,241,0.12)] hover:-translate-y-0.5 hover:border-indigo-300/70 hover:bg-indigo-500/20 hover:text-white hover:shadow-[0_16px_38px_rgba(99,102,241,0.22)] focus:ring-indigo-400/35 focus:ring-offset-slate-950`
    : `${actionBase} border-indigo-300/55 bg-gradient-to-r from-indigo-500/16 via-violet-500/12 to-sky-500/16 text-indigo-700 shadow-[0_12px_30px_rgba(99,102,241,0.14)] hover:-translate-y-0.5 hover:border-indigo-400/75 hover:from-indigo-500/24 hover:via-violet-500/18 hover:to-sky-500/24 hover:text-indigo-800 hover:shadow-[0_16px_38px_rgba(99,102,241,0.20)] focus:ring-indigo-200/80`;

  const falseDetectionAction = isDarkMode
    ? `${actionBase} border-rose-400/35 bg-rose-500/12 text-rose-100 shadow-[0_12px_30px_rgba(244,63,94,0.12)] hover:-translate-y-0.5 hover:border-rose-300/70 hover:bg-rose-500/20 hover:text-white hover:shadow-[0_16px_38px_rgba(244,63,94,0.24)] focus:ring-rose-400/35 focus:ring-offset-slate-950`
    : `${actionBase} border-rose-300/55 bg-gradient-to-r from-rose-500/15 via-pink-500/12 to-orange-400/14 text-rose-700 shadow-[0_12px_30px_rgba(244,63,94,0.13)] hover:-translate-y-0.5 hover:border-rose-400/75 hover:from-rose-500/23 hover:via-pink-500/18 hover:to-orange-400/22 hover:text-rose-800 hover:shadow-[0_16px_38px_rgba(244,63,94,0.19)] focus:ring-rose-200/80`;

  const downloadAction = isDarkMode
    ? `${actionBase} border-emerald-400/35 bg-emerald-500/12 text-emerald-100 shadow-[0_12px_30px_rgba(16,185,129,0.12)] hover:-translate-y-0.5 hover:border-emerald-300/70 hover:bg-emerald-500/20 hover:text-white hover:shadow-[0_16px_38px_rgba(16,185,129,0.22)] focus:ring-emerald-400/35 focus:ring-offset-slate-950`
    : `${actionBase} border-emerald-300/55 bg-gradient-to-r from-emerald-500/16 via-teal-500/12 to-cyan-500/16 text-emerald-800 shadow-[0_12px_30px_rgba(16,185,129,0.13)] hover:-translate-y-0.5 hover:border-emerald-400/75 hover:from-emerald-500/24 hover:via-teal-500/18 hover:to-cyan-500/24 hover:text-emerald-900 hover:shadow-[0_16px_38px_rgba(16,185,129,0.19)] focus:ring-emerald-200/80`;

  const amberAction = isDarkMode
    ? `${actionBase} border-amber-400/35 bg-amber-500/12 text-amber-100 shadow-[0_12px_30px_rgba(245,158,11,0.12)] hover:-translate-y-0.5 hover:border-amber-300/70 hover:bg-amber-500/20 hover:text-white focus:ring-amber-400/35 focus:ring-offset-slate-950`
    : `${actionBase} border-amber-300/55 bg-gradient-to-r from-amber-400/18 via-orange-400/13 to-rose-400/13 text-amber-800 shadow-[0_12px_30px_rgba(245,158,11,0.13)] hover:-translate-y-0.5 hover:border-amber-400/75 hover:from-amber-400/26 hover:via-orange-400/20 hover:to-rose-400/20 hover:text-amber-900 focus:ring-amber-200/80`;

  const neutralAction = isDarkMode
    ? `${actionBase} border-slate-500/35 bg-slate-800/60 text-slate-100 hover:-translate-y-0.5 hover:border-slate-300/60 hover:bg-slate-700/70 hover:text-white focus:ring-slate-400/35 focus:ring-offset-slate-950`
    : `${actionBase} border-slate-300/55 bg-gradient-to-r from-slate-100/80 via-white/70 to-slate-50/80 text-slate-700 hover:-translate-y-0.5 hover:border-slate-400/70 hover:from-white hover:to-slate-100 hover:text-slate-900 focus:ring-slate-200/80`;

  return (
    <div className={`${pageThemeClass} mx-auto max-w-6xl px-6 py-8`}>
      <ReportsLocalCSS />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
        </div>
      </div>

      <div className="mt-4">
        <FilterBuilder
          title="Report filters"
          subtitle="Combine class, student, plagiarism and AI filters. Search updates the reports live."
          fields={reportFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onAdd={() =>
            setFilters((prev) => [
              ...prev,
              createFilterRule<ReportItem>(reportFilterDefinitions),
            ])
          }
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search class, student or assignment"
        />
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600 reports-report-subtext">Loading…</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading && reports.length === 0 ? (
          <ProgressiveCardSkeleton count={4} />
        ) : !loading && filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/70 p-6 text-slate-700 shadow">
            {reports.length === 0
              ? "No reports yet."
              : "No reports match the current filters."}
          </div>
        ) : (
          visibleReports.map((r, i) => (
            <div
              key={r.submission_id}
              className={reportCardClass}
            >
              {r.false_detection_reviewed ? (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2"
              title="False-detection correction applied"
            >
              <img
                src="/corrected-emblem.png"
                alt="Corrected false detection"
                className="h-10 w-10 object-contain drop-shadow-sm"
              />
            </div>
          ) : null}
              <div
                className="absolute left-0 top-0 h-full w-[6px] rounded-l-2xl"
                style={{
                  background:
                    i % 4 === 0
                      ? "linear-gradient(180deg, rgba(99,102,241,.80), rgba(34,211,238,.42))"
                      : i % 4 === 1
                      ? "linear-gradient(180deg, rgba(59,130,246,.82), rgba(168,85,247,.38))"
                      : i % 4 === 2
                      ? "linear-gradient(180deg, rgba(16,185,129,.78), rgba(34,211,238,.38))"
                      : "linear-gradient(180deg, rgba(236,72,153,.72), rgba(245,158,11,.38))",
                }}
              />

              <div
                className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  opacity: 0.5,
                  background:
                    i % 4 === 0
                      ? "rgba(99,102,241,.18)"
                      : i % 4 === 1
                      ? "rgba(59,130,246,.18)"
                      : i % 4 === 2
                      ? "rgba(16,185,129,.16)"
                      : "rgba(236,72,153,.15)",
                }}
              />

              <h2 className="reports-report-title relative text-lg font-semibold text-slate-900">
                Assignment: {r.assignment_title} ({r.student_username})
              </h2>

              <div className="reports-report-subtext relative mt-2 space-y-1 text-sm text-slate-600">
                <div>
                  Course: {r.class_code} - {r.class_name}
                </div>
                <div>Submitted: {r.submitted_at}</div>
              </div>

              <div className="relative mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  Plagiarism: {r.plagiarism_percent ?? 0}%
                </span>
                <AiBadge r={r} />
                <SubmissionStatusBadge r={r} isDarkMode={isDarkMode} />
              </div>

              {r.report_error ? (
                <p className="mt-2 line-clamp-2 text-xs text-red-600">{r.report_error}</p>
              ) : null}

              <div className="relative mt-4 flex flex-wrap gap-3">
                <button
                  className={r.report_ready ? viewAction : disabledAction}
                  onClick={() => r.report_ready && openReport(r)}
                  disabled={!r.report_ready}
                  title={
                    r.report_ready
                      ? "View report details"
                      : r.report_error || "Report is still processing"
                  }
                >
                  View Details
                </button>

                <button
                  className={r.report_ready ? falseDetectionAction : disabledAction}
                  onClick={() => r.report_ready && openFalseDetectionReview(r)}
                  disabled={!r.report_ready}
                  title={
                    r.report_ready
                      ? "Review false detections"
                      : r.report_error || "Report is still processing"
                  }
                >
                  <span aria-hidden="true">✎</span>
                  <span>False Detection</span>
                </button>

                {r.fileUrl ? (
                  <a
                    className={downloadAction}
                    href={`${API_BASE_URL}${r.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    title={r.fileName || "Download submission"}
                  >
                    Download PDF
                  </a>
                ) : (
                  <button
                    className={disabledAction}
                    disabled
                  >
                    No file
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && (hasHiddenLoadedReports || hasMoreReports) ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreReports()}
            className={isDarkMode
              ? "rounded-full border border-slate-700/70 bg-slate-900/70 px-5 py-2 text-sm font-bold text-cyan-100 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
              : "rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"}
          >
            Show more reports
          </button>
        </div>
      ) : null}

      <PortalModal
        open={openDetails}
        onClose={closeReport}
        title={
          selected
            ? `Submission #${selected.submission_id} - ${selected.assignment_title}`
            : "Submission Details"
        }
        widthClass="max-w-6xl"
        topClass="mt-12"
      >
        {!selected ? (
          <div className="text-slate-700">No submission selected.</div>
        ) : (
          <div className={`${modalThemeClass} grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]`}>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/70 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {integrityMode === "ai"
                      ? "AI report content (highlighted)"
                      : "Plagiarism report content (highlighted)"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {integrityMode === "ai"
                      ? "Red / orange / yellow highlights show exact AI-flagged spans. Hover a highlight to see confidence, reasons, and how much it contributes to the document AI score."
                      : "Yellow highlights show plagiarism-matched phrases. Use Detailed Report to compare student-submission matches, lecture-note matches, and online-source matches in different colors."}
                  </div>
                </div>

                {selectedReportPdfUrl ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <a
                      className={`${downloadAction} whitespace-nowrap`}
                      href={selectedReportPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open / Download {integrityMode === "ai" ? "AI" : "Plagiarism"} PDF
                    </a>

                    <button
                      type="button"
                      onClick={() => setOpenDetailed(true)}
                      className={`${amberAction} whitespace-nowrap`}
                    >
                      Detailed Report
                    </button>

                    {selectedOriginalPdfUrl ? (
                      <a
                        className={`${neutralAction} whitespace-nowrap`}
                        href={selectedOriginalPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Original PDF
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {textErr ? (
                <div className="p-6 text-sm text-red-600">{textErr}</div>
              ) : textLoading ? (
                <div className="p-6 text-sm text-slate-600">
                  Loading highlighted content…
                </div>
              ) : (
                <div className="report-reader-panel h-[70vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text">
                  <div key={`integrity-${selected?.submission_id}-${integrityMode}`}>
                    {renderReportHighlights(
                      (integrityMode === "plagiarism"
                        ? plagiarismReportText || reportText
                        : reportText) || "No extracted text found.",
                      integrityMode === "ai" ? [] : plagPhrases,
                      integrityMode === "plagiarism" ? [] : aiSpans,
                      integrityMode
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">
                Similarity & AI Risk
              </div>

              <div className="mt-4 grid grid-cols-2 place-items-center gap-6 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => switchIntegrityMode("plagiarism")}
                  className={`rounded-3xl p-2 transition ${
                    integrityMode === "plagiarism"
                      ? "bg-amber-50/70 ring-2 ring-amber-300"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <CircularPercent
                    label="Plagiarism"
                    value={selected.plagiarism_percent ?? 0}
                    stroke="rgb(245,158,11)"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => switchIntegrityMode("ai")}
                  className={`rounded-3xl p-2 transition ${
                    integrityMode === "ai"
                      ? "bg-rose-50/70 ring-2 ring-rose-300"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <CircularPercent
                    label="AI Risk"
                    value={aiPct}
                    stroke="rgb(99,102,241)"
                  />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-600">
                Click a circle to switch between plagiarism and AI views.
              </div>

              <div className="mt-6 space-y-1 text-xs text-slate-600">
                <div>
                  Student:{" "}
                  <span className="font-medium text-slate-800">
                    {selected.student_username}
                  </span>
                </div>
                <div>
                  Course:{" "}
                  <span className="font-medium text-slate-800">
                    {selected.class_code}
                  </span>
                </div>
                <div>
                  Submitted:{" "}
                  <span className="font-medium text-slate-800">
                    {selected.submitted_at}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </PortalModal>

      <PortalModal
        open={openDetailed}
        onClose={() => {
          setOpenDetailed(false);
          setSelectedHighlight(null);
        }}
        title={
          selected
            ? `Detailed Report - Submission #${selected.submission_id}`
            : "Detailed Report"
        }
        widthClass="max-w-6xl"
        topClass="mt-16"
      >
        {!selected ? (
          <div className="text-slate-700">No submission selected.</div>
        ) : (
          <div className={`${modalThemeClass} grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]`}>
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white/70 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-6 rounded bg-yellow-200" />
                  <span className="text-slate-700">Student submission match</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-6 rounded bg-red-200" />
                  <span className="text-slate-700">Lecture note match</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-6 rounded bg-blue-200" />
                  <span className="text-slate-700">Online source match</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-6 rounded bg-purple-200" />
                  <span className="text-slate-700">Multiple source match</span>
                </div>
                <div className="text-xs text-slate-500">
                  Click a highlighted section to view its source.
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">
                    Lecture: {lecturePhrases.length}
                  </span>
                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-800">
                    Submission: {submissionPhrases.length}
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
                    Online: {onlinePhrases.length}
                  </span>
                </div>
              </div>

              {textErr ? (
                <div className="p-6 text-sm text-red-600">{textErr}</div>
              ) : textLoading ? (
                <div className="p-6 text-sm text-slate-600">
                  Loading detailed report…
                </div>
              ) : (
                <div className="report-reader-panel h-[72vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text">
                  {renderDetailedReportHighlights(
                    detailedReportText,
                    detailedSegments,
                    [],
                    (value) =>
                      setSelectedHighlight({
                        text: value.text,
                        type: value.type,
                        sources: value.sources,
                      })
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">Highlight Source</div>

              {!selectedHighlight ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  Click any red, yellow, blue, or purple highlight to see its source.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Selected text
                    </div>
                    <div className="text-sm leading-6 text-slate-800">
                      {selectedHighlight.text}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedHighlight.sources.map((source, idx) => {
                      const badgeClass =
                        source.source_type === "lecture_material"
                          ? "bg-red-100 text-red-800"
                          : source.source_type === "submission"
                          ? "bg-yellow-100 text-yellow-800"
                          : source.source_type === "online_source"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-700";

                      return (
                        <div
                          key={`${source.source_type}-${source.source_name}-${source.source_chunk_id ?? idx}`}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                            >
                              {source.source_type === "lecture_material"
                                ? "Lecture note"
                                : source.source_type === "submission"
                                ? "Student submission"
                                : source.source_type === "online_source"
                                ? "Online source"
                                : source.source_type || "Source"}
                            </span>

                            {typeof source.score === "number" ? (
                              <span className="text-xs text-slate-500">
                                Score: {Math.round(source.score * 100)}%
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div>
                              <span className="font-medium text-slate-900">File:</span>{" "}
                              {source.source_name || "Unknown"}
                            </div>
                            {source.source_path ? (
                              <div className="break-all text-xs text-slate-500">
                                {source.source_path}
                              </div>
                            ) : null}
                            {source.source_doc_id ? (
                              <div className="text-xs text-slate-500">
                                Source doc id: {source.source_doc_id}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </PortalModal>

      <PortalModal
        open={openFalseDetection}
        onClose={closeReport}
        title={
          selected
            ? `False Detection Review - Submission #${selected.submission_id}`
            : "False Detection Review"
        }
        widthClass="max-w-6xl"
        topClass="mt-16"
      >
        {!selected ? (
          <div className="text-slate-700">No submission selected.</div>
        ) : (
          <div className={`${modalThemeClass} grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]`}>
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/70 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Plagiarism false-detection review
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Click a highlighted chunk, then remove the whole highlight or drag-select the exact sentence or
                    phrase you want to exclude.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Original: {clampPct(basePlagiarismPercent)}%
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                    Adjusted: {adjustedPlagiarismPercent}%
                  </span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
                    Removed: {removedFalseRanges.length}
                  </span>
                </div>
              </div>

              {textErr ? (
                <div className="p-6 text-sm text-red-600">{textErr}</div>
              ) : textLoading ? (
                <div className="p-6 text-sm text-slate-600">
                  Loading false-detection review…
                </div>
              ) : (
                <div className="report-reader-panel h-[72vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text">
                  {renderDetailedReportHighlights(
                    falseReviewText,
                    falseDetectionSegments,
                    removedFalseRanges,
                    setFalseSelected
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">Review actions</div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={removeSelectedFalseDetection}
                  disabled={!falseSelected}
                  className={falseSelected ? falseDetectionAction : disabledAction}
                >
                  Remove Highlight
                </button>

                <button
                  type="button"
                  onClick={undoFalseDetection}
                  disabled={!undoStack.length}
                  className={undoStack.length ? neutralAction : disabledAction}
                >
                  Undo
                </button>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={saveFalseDetectionReview}
                  disabled={savingReview || !selected}
                  className={savingReview || !selected ? disabledAction : downloadAction}
                >
                  {savingReview ? "Saving..." : "Save Review"}
                </button>
              </div>

              {selectionError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {selectionError}
                </div>
              ) : null}

              {saveReviewMessage ? (
                <div
                  className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                    saveReviewMessage.toLowerCase().includes("failed") ||
                    saveReviewMessage.toLowerCase().includes("not found") ||
                    saveReviewMessage.toLowerCase().includes("currently being reviewed")
                      ? "border border-red-200 bg-red-50 text-red-800"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {saveReviewMessage}
                </div>
              ) : null}

              {reviewVersion || lastSaveKey ? (
                <div className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {reviewVersion ? <div>Version: {reviewVersion}</div> : null}
                  {lastSaveKey ? <div>Last save key: {lastSaveKey}</div> : null}
                </div>
              ) : null}

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Justification note
                </label>
                <textarea
                  value={justificationNote}
                  onChange={(e) => setJustificationNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Explain why the selected highlighted range is a false detection."
                />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                This review can be saved. The adjusted plagiarism percentage is calculated from the original highlighted characters minus the exact text you remove.
              </div>

              {!falseSelected ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  Click a highlighted chunk first. You can remove the full highlight or select exact text inside it
                  that should be removed.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Selected text
                    </div>
                    <div className="text-sm leading-6 text-slate-800">
                      {falseSelected.text}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {falseSelected.sources.map((source, idx) => {
                      const badgeClass =
                        source.source_type === "lecture_material"
                          ? "bg-red-100 text-red-800"
                          : source.source_type === "submission"
                          ? "bg-yellow-100 text-yellow-800"
                          : source.source_type === "online_source"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-700";

                      return (
                        <div
                          key={`${source.source_type}-${source.source_name}-${source.source_chunk_id ?? idx}`}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                            >
                              {source.source_type === "lecture_material"
                                ? "Lecture note"
                                : source.source_type === "submission"
                                ? "Student submission"
                                : source.source_type === "online_source"
                                ? "Online source"
                                : source.source_type || "Source"}
                            </span>

                            {typeof source.score === "number" ? (
                              <span className="text-xs text-slate-500">
                                Score: {Math.round(source.score * 100)}%
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div>
                              <span className="font-medium text-slate-900">File:</span>{" "}
                              {source.source_name || "Unknown"}
                            </div>
                            {source.source_path ? (
                              <div className="break-all text-xs text-slate-500">
                                {source.source_path}
                              </div>
                            ) : null}
                            {source.source_doc_id ? (
                              <div className="text-xs text-slate-500">
                                Source doc id: {source.source_doc_id}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </PortalModal>
    </div>
  );
}
