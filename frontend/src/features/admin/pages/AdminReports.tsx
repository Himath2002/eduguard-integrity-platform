import { useEffect, useMemo, useState } from "react";
import { api, API_BASE_URL } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import {
  renderReportHighlights,
  type AiSpan,
  type IntegrityHighlightMode,
} from "@/shared/lib/reportHighlight";
import {
  applyFilters,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type AdminReportRow = {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  class_code: string;
  class_name: string;
  lecturer_name: string;
  student_name: string;
  student_username: string;
  submitted_at: string;
  attempt_no: number;
  file_name?: string | null;
  storage_provider: string;
  integrity_status: string;
  plagiarism_percent: number;
  ai_detected?: boolean;
  ai_risk_percent?: number | null;
  ai_risk_level?: string | null;
  marked_score?: number | null;
  marked_max_score?: number | null;
  mark_published: boolean;
  has_original_file?: boolean;
  original_file_url?: string | null;
};

const REPORT_PAGE_SIZE = 32;
const REPORT_VISIBLE_BATCH_SIZE = 16;

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
  plagiarism_text?: string;
  type: "lecture" | "submission" | "online" | "multiple";
  sources: DetailedMatch[];
};

type ReportTextPayload = {
  submission_id: number;
  text: string;
  plagiarism_text?: string;
  plagiarised_phrases: string[];
  lecture_phrases: string[];
  submission_phrases: string[];
  online_phrases: string[];
  detailed_matches: DetailedMatch[];
  ai_spans: AiSpan[];
  original_file_url?: string | null;
};

type OrderValue =
  | "submitted_newest"
  | "submitted_oldest"
  | "plagiarism_high"
  | "plagiarism_low"
  | "ai_high"
  | "ai_low"
  | "mark_high"
  | "mark_low"
  | "student_az"
  | "student_za"
  | "assignment_az"
  | "assignment_za";

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function getMarkPercent(row: AdminReportRow) {
  if (
    row.marked_score == null ||
    row.marked_max_score == null ||
    row.marked_max_score <= 0
  ) {
    return null;
  }

  return Math.round((Number(row.marked_score) / Number(row.marked_max_score)) * 100);
}

function getAiRiskPercent(row: AdminReportRow) {
  return typeof row.ai_risk_percent === "number"
    ? row.ai_risk_percent
    : row.ai_detected
      ? 70
      : 0;
}

function getMarkState(row: AdminReportRow) {
  return row.marked_score != null && row.marked_max_score != null ? "marked" : "not_marked";
}

function sortReportRows(rows: AdminReportRow[], order: OrderValue) {
  const next = [...rows];

  next.sort((a, b) => {
    switch (order) {
      case "submitted_oldest":
        return parseDateValue(a.submitted_at) - parseDateValue(b.submitted_at);
      case "plagiarism_high":
        return b.plagiarism_percent - a.plagiarism_percent;
      case "plagiarism_low":
        return a.plagiarism_percent - b.plagiarism_percent;
      case "ai_high":
        return getAiRiskPercent(b) - getAiRiskPercent(a);
      case "ai_low":
        return getAiRiskPercent(a) - getAiRiskPercent(b);
      case "mark_high":
        return (getMarkPercent(b) ?? -1) - (getMarkPercent(a) ?? -1);
      case "mark_low":
        return (getMarkPercent(a) ?? 101) - (getMarkPercent(b) ?? 101);
      case "student_az":
        return a.student_name.localeCompare(b.student_name, undefined, {
          sensitivity: "base",
        });
      case "student_za":
        return b.student_name.localeCompare(a.student_name, undefined, {
          sensitivity: "base",
        });
      case "assignment_az":
        return a.assignment_title.localeCompare(b.assignment_title, undefined, {
          sensitivity: "base",
        });
      case "assignment_za":
        return b.assignment_title.localeCompare(a.assignment_title, undefined, {
          sensitivity: "base",
        });
      case "submitted_newest":
      default:
        return parseDateValue(b.submitted_at) - parseDateValue(a.submitted_at);
    }
  });

  return next;
}

function statusTone(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "done") return "bg-emerald-100 text-emerald-700";
  if (normalized === "failed") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
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

function AiBadge({ r }: { r: AdminReportRow }) {
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



function normChar(ch: string) {
  const c = ch.normalize("NFKC").replace(/ /g, " ");
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
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start);
}

function renderDetailedReportHighlights(
  text: string,
  detailedMatches: DetailedMatch[],
  onSelect: (value: HighlightSourceCard) => void
) {
  if (!text) return null;

  type RawRange = {
    start: number;
    end: number;
    source: DetailedMatch;
  };

  type Segment = {
    start: number;
    end: number;
    sources: DetailedMatch[];
    type: "lecture" | "submission" | "online" | "multiple";
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

  if (!rawRanges.length) {
    return text;
  }

  const boundarySet = new Set<number>([0, text.length]);
  rawRanges.forEach((r) => {
    boundarySet.add(r.start);
    boundarySet.add(r.end);
  });

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const segments: Segment[] = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;

    const covering = rawRanges.filter((r) => r.start < end && r.end > start);
    if (!covering.length) continue;

    const sourceMap = new Map<string, DetailedMatch>();
    covering.forEach((r) => {
      const key = [
        r.source.phrase,
        r.source.source_type,
        r.source.source_name,
        r.source.source_doc_id ?? "",
        r.source.source_chunk_id ?? "",
      ].join("::");
      if (!sourceMap.has(key)) {
        sourceMap.set(key, r.source);
      }
    });

    const sources = Array.from(sourceMap.values());
    const hasLecture = sources.some((s) => s.source_type === "lecture_material");
    const hasSubmission = sources.some((s) => s.source_type === "submission");
    const hasOnline = sources.some((s) => s.source_type === "online_source");
    const activeCount = [hasLecture, hasSubmission, hasOnline].filter(Boolean).length;

    const type: Segment["type"] =
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
    } else {
      segments.push({ start, end, sources, type });
    }
  }

  if (!segments.length) return text;

  const nodes: React.ReactNode[] = [];
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
        ? "rounded px-0.5 cursor-pointer hover:ring-1 hover:ring-red-400"
        : seg.type === "submission"
        ? "rounded px-0.5 cursor-pointer hover:ring-1 hover:ring-yellow-400"
        : seg.type === "online"
        ? "rounded px-0.5 cursor-pointer hover:ring-1 hover:ring-blue-400"
        : "rounded px-0.5 cursor-pointer hover:ring-1 hover:ring-purple-400";

    nodes.push(
      <mark
        key={`mark-${idx}`}
        className={className}
        style={style}
        title="Click to view source"
        onClick={() =>
          onSelect({
            text: text.slice(seg.start, seg.end),
            type: seg.type,
            sources: seg.sources,
          })
        }
      >
        {text.slice(seg.start, seg.end)}
      </mark>
    );

    cursor = seg.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="plain-last">{text.slice(cursor)}</span>);
  }

  return nodes;
}

function AdminReportsCSS() {
  return (
    <style>{`
      .admin-reports-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-reports-page-only.admin-reports-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-reports-light-only .admin-reports-heading {
        color: rgb(15, 23, 42);
      }

      .admin-reports-dark-only .admin-reports-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-reports-light-only .admin-reports-subtext {
        color: rgb(71, 85, 105);
      }

      .admin-reports-dark-only .admin-reports-subtext {
        color: rgb(170, 185, 207);
      }

      .admin-reports-filter-shell > div {
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-reports-light-only .admin-reports-filter-shell > div {
        background: rgba(255, 255, 255, 0.82) !important;
        border-color: rgba(226, 232, 240, 0.9) !important;
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.08) !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-reports-dark-only .admin-reports-filter-shell > div {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.07), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
        box-shadow: 0 18px 50px rgba(2, 6, 23, 0.34) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-reports-dark-only .admin-reports-filter-shell,
      .admin-reports-dark-only .eg-filter-popover {
        color-scheme: dark;
      }

      .admin-reports-light-only .admin-reports-filter-shell,
      .admin-reports-light-only .eg-filter-popover {
        color-scheme: light;
      }

      .admin-reports-dark-only .admin-reports-filter-shell input,
      .admin-reports-dark-only .admin-reports-filter-shell select,
      .admin-reports-dark-only .admin-reports-filter-shell textarea,
      .admin-reports-dark-only .eg-filter-popover input,
      .admin-reports-dark-only .eg-filter-popover select,
      .admin-reports-dark-only .eg-filter-popover textarea {
        background: rgba(8, 15, 29, 0.92) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        color-scheme: dark;
      }

      .admin-reports-dark-only .admin-reports-filter-shell select option,
      .admin-reports-dark-only .eg-filter-popover select option,
      .admin-reports-dark-only select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell select option:checked,
      .admin-reports-dark-only .eg-filter-popover select option:checked,
      .admin-reports-dark-only select option:checked {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22)),
          rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell input::placeholder,
      .admin-reports-dark-only .admin-reports-filter-shell textarea::placeholder,
      .admin-reports-dark-only .eg-filter-popover input::placeholder,
      .admin-reports-dark-only .eg-filter-popover textarea::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell button,
      .admin-reports-dark-only .eg-filter-popover button {
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-900,
      .admin-reports-dark-only .eg-filter-popover .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-800,
      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-700,
      .admin-reports-dark-only .eg-filter-popover .text-slate-800,
      .admin-reports-dark-only .eg-filter-popover .text-slate-700 {
        color: rgb(226, 232, 240) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-600,
      .admin-reports-dark-only .eg-filter-popover .text-slate-600 {
        color: rgb(203, 213, 225) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-500,
      .admin-reports-dark-only .admin-reports-filter-shell .text-slate-400,
      .admin-reports-dark-only .eg-filter-popover .text-slate-500,
      .admin-reports-dark-only .eg-filter-popover .text-slate-400 {
        color: rgb(148, 163, 184) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .bg-white,
      .admin-reports-dark-only .admin-reports-filter-shell .bg-slate-50,
      .admin-reports-dark-only .eg-filter-popover .bg-white,
      .admin-reports-dark-only .eg-filter-popover .bg-slate-50 {
        background: rgba(8, 15, 29, 0.92) !important;
      }

      .admin-reports-dark-only .admin-reports-filter-shell .border-slate-200,
      .admin-reports-dark-only .admin-reports-filter-shell .border-slate-300,
      .admin-reports-dark-only .eg-filter-popover .border-slate-200,
      .admin-reports-dark-only .eg-filter-popover .border-slate-300 {
        border-color: rgba(148, 163, 184, 0.24) !important;
      }

      .admin-reports-dark-only .eg-filter-popover {
        background:
          radial-gradient(110% 110% at 0% 0%, rgba(34, 211, 238, 0.08), transparent 44%),
          radial-gradient(90% 90% at 100% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
          linear-gradient(160deg, rgba(8, 15, 29, 0.98), rgba(12, 22, 40, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.55),
          inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }

      .admin-reports-dark-only .eg-filter-popover label,
      .admin-reports-dark-only .eg-filter-popover .uppercase,
      .admin-reports-dark-only .eg-filter-popover [class*="tracking"] {
        color: rgb(166, 180, 204) !important;
      }

      .admin-report-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.25rem;
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease,
          filter 220ms ease;
      }

      .admin-report-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .admin-reports-light-only .admin-report-card {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.72), transparent 55%),
          rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-reports-light-only .admin-report-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .admin-reports-dark-only .admin-report-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.075), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow:
          0 20px 56px rgba(2, 6, 23, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-reports-dark-only .admin-report-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .admin-report-card-shine {
        position: absolute;
        top: -36%;
        bottom: -36%;
        left: -42%;
        width: 26%;
        transform: rotate(14deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.26),
          transparent
        );
        opacity: 0;
        filter: blur(10px);
        transition:
          left 0.66s ease,
          opacity 0.22s ease;
        pointer-events: none;
        z-index: 3;
      }

      .admin-reports-dark-only .admin-report-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .admin-report-card:hover .admin-report-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .admin-report-card-halo {
        position: absolute;
        inset: -4rem;
        opacity: 0;
        transform: scale(0.96);
        filter: blur(28px);
        pointer-events: none;
        z-index: 0;
        transition:
          opacity 240ms ease,
          transform 240ms ease,
          filter 240ms ease;
      }

      .admin-report-card:hover .admin-report-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .admin-report-card-content {
        position: relative;
        z-index: 4;
      }

      .admin-report-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .admin-reports-light-only .admin-report-title {
        color: rgb(15, 23, 42);
      }

      .admin-reports-dark-only .admin-report-title {
        color: rgb(248, 250, 252);
      }

      .admin-reports-light-only .admin-report-copy {
        color: rgb(71, 85, 105);
      }

      .admin-reports-dark-only .admin-report-copy {
        color: rgb(199, 212, 232);
      }

      .admin-reports-light-only .admin-report-label {
        color: rgb(100, 116, 139);
      }

      .admin-reports-dark-only .admin-report-label {
        color: rgb(148, 163, 184);
      }

      .admin-reports-empty-card {
        border-radius: 1.25rem;
        padding: 1.5rem;
        font-size: 0.875rem;
      }

      .admin-reports-light-only .admin-reports-empty-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        color: rgb(71, 85, 105);
      }

      .admin-reports-dark-only .admin-reports-empty-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.05), transparent 44%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        color: rgb(148, 163, 184);
      }
    `}</style>
  );
}

export default function AdminReports() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  const [rows, setRows] = useState<AdminReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(
    REPORT_VISIBLE_BATCH_SIZE
  );

  const [openDetails, setOpenDetails] = useState(false);
  const [openDetailed, setOpenDetailed] = useState(false);
  const [selected, setSelected] = useState<AdminReportRow | null>(null);

  const [reportText, setReportText] = useState("");
  const [plagiarismReportText, setPlagiarismReportText] = useState("");
  const [plagPhrases, setPlagPhrases] = useState<string[]>([]);
  const [lecturePhrases, setLecturePhrases] = useState<string[]>([]);
  const [submissionPhrases, setSubmissionPhrases] = useState<string[]>([]);
  const [onlinePhrases, setOnlinePhrases] = useState<string[]>([]);
  const [detailedMatches, setDetailedMatches] = useState<DetailedMatch[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightSourceCard | null>(null);
  const [aiSpans, setAiSpans] = useState<AiSpan[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textErr, setTextErr] = useState<string | null>(null);
  const [integrityMode, setIntegrityMode] = useState<IntegrityHighlightMode>("plagiarism");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<AdminReportRow[]>(
          `/admin/reports?limit=${REPORT_PAGE_SIZE}&offset=0`
        );
        const nextRows = Array.isArray(data) ? data : [];
        setRows(nextRows);
        setHasMoreRows(nextRows.length === REPORT_PAGE_SIZE);
      } catch (e: any) {
        setError(e?.message || "Failed to load institution reports");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const reportFilterDefinitions = useMemo<FilterDefinition<AdminReportRow>[]>(() => {
    const lecturerNames = Array.from(
      new Set(rows.map((row) => row.lecturer_name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const classOptions = Array.from(
      new Map(
        rows
          .filter((row) => row.class_code)
          .map((row) => [
            row.class_code,
            {
              value: row.class_code,
              label: row.class_name
                ? `${row.class_code} — ${row.class_name}`
                : row.class_code,
            },
          ])
      ).values()
    ).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    const integrityStates = Array.from(
      new Set(rows.map((row) => row.integrity_status).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const storageProviders = Array.from(
      new Set(rows.map((row) => row.storage_provider).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by student, class, lecturer, assignment or file",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [
            item.student_name,
            item.student_username,
            item.assignment_title,
            item.class_code,
            item.class_name,
            item.lecturer_name,
            item.file_name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        },
      },
      {
        key: "classCode",
        label: "Class",
        type: "select",
        options: classOptions,
        getValue: (item) => item.class_code,
      },
      {
        key: "lecturer",
        label: "Lecturer",
        type: "select",
        options: lecturerNames.map((name) => ({ value: name, label: name })),
        getValue: (item) => item.lecturer_name,
      },
      {
        key: "integrityStatus",
        label: "Integrity status",
        type: "select",
        options: integrityStates.map((status) => ({ value: status, label: status })),
        getValue: (item) => item.integrity_status,
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
          const pct = getAiRiskPercent(item);
          if (value === "low") return pct < 40;
          if (value === "medium") return pct >= 40 && pct < 70;
          if (value === "high") return pct >= 70;
          return true;
        },
      },
      {
        key: "markState",
        label: "Mark state",
        type: "select",
        options: [
          { value: "not_marked", label: "Not marked yet" },
          { value: "marked", label: "Marked" },
        ],
        match: (item, value) => getMarkState(item) === value,
      },
      {
        key: "markBand",
        label: "Mark band",
        type: "select",
        options: [
          { value: "excellent", label: "Excellent (80%+)" },
          { value: "good", label: "Good (60–79%)" },
          { value: "developing", label: "Developing (<60%)" },
        ],
        match: (item, value) => {
          const pct = getMarkPercent(item);
          if (pct == null) return false;
          if (value === "excellent") return pct >= 80;
          if (value === "good") return pct >= 60 && pct < 80;
          if (value === "developing") return pct < 60;
          return true;
        },
      },
      {
        key: "published",
        label: "Published",
        type: "select",
        options: [
          { value: "published", label: "Published to student" },
          { value: "not_published", label: "Not published" },
        ],
        match: (item, value) =>
          value === "published" ? Boolean(item.mark_published) : !item.mark_published,
      },
      {
        key: "storage",
        label: "Storage",
        type: "select",
        options: storageProviders.map((storage) => ({
          value: storage,
          label: storage.toUpperCase(),
        })),
        getValue: (item) => item.storage_provider,
      },
      {
        key: "order",
        label: "Order",
        type: "select",
        options: [
          { value: "submitted_newest", label: "Submitted: newest first" },
          { value: "submitted_oldest", label: "Submitted: oldest first" },
          { value: "plagiarism_high", label: "Plagiarism: high to low" },
          { value: "plagiarism_low", label: "Plagiarism: low to high" },
          { value: "ai_high", label: "AI risk: high to low" },
          { value: "ai_low", label: "AI risk: low to high" },
          { value: "mark_high", label: "Mark: high to low" },
          { value: "mark_low", label: "Mark: low to high" },
          { value: "student_az", label: "Student name: A to Z" },
          { value: "student_za", label: "Student name: Z to A" },
          { value: "assignment_az", label: "Assignment: A to Z" },
          { value: "assignment_za", label: "Assignment: Z to A" },
        ],
      },
    ];
  }, [rows]);

  const displayedRows = useMemo(() => {
    const orderRule = filters.find((rule) => rule.fieldKey === "order");
    const nonOrderRules = filters.filter((rule) => rule.fieldKey !== "order");
    const baseFiltered = applyFilters(rows, nonOrderRules, reportFilterDefinitions);
    const sortValue = (orderRule?.value as OrderValue | undefined) || "submitted_newest";
    return sortReportRows(baseFiltered, sortValue);
  }, [rows, filters, reportFilterDefinitions]);

  useEffect(() => {
    setVisibleRowCount(REPORT_VISIBLE_BATCH_SIZE);
  }, [filters]);

  const visibleRows = displayedRows.slice(0, visibleRowCount);
  const hasHiddenLoadedRows = visibleRows.length < displayedRows.length;

  const loadMoreRows = async () => {
    if (hasHiddenLoadedRows) {
      setVisibleRowCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const data = await api<AdminReportRow[]>(
        `/admin/reports?limit=${REPORT_PAGE_SIZE}&offset=${rows.length}`
      );
      const nextRows = Array.isArray(data) ? data : [];
      setRows((prev) => [...prev, ...nextRows]);
      setVisibleRowCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      setHasMoreRows(nextRows.length === REPORT_PAGE_SIZE);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load more reports");
    } finally {
      setLoading(false);
    }
  };

  const loadReportText = async (row: AdminReportRow) => {
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
      const data = await api<ReportTextPayload>(`/admin/submissions/${row.submission_id}/report-text`);
      setReportText(data?.text ?? "");
      setPlagiarismReportText(data?.plagiarism_text ?? data?.text ?? "");
      setPlagPhrases(data?.plagiarised_phrases ?? []);
      setLecturePhrases(data?.lecture_phrases ?? []);
      setSubmissionPhrases(data?.submission_phrases ?? []);
      setOnlinePhrases(data?.online_phrases ?? []);
      setDetailedMatches(data?.detailed_matches ?? []);
      setAiSpans(data?.ai_spans ?? []);
      setIntegrityMode("plagiarism");
    } catch (e: any) {
      setTextErr(e?.message || "Failed to load report text");
    } finally {
      setTextLoading(false);
    }
  };

  const openReport = async (row: AdminReportRow) => {
    setSelected(row);
    setOpenDetails(true);
    setOpenDetailed(false);
    setSelectedHighlight(null);
    await loadReportText(row);
  };

  const closeReport = () => {
    setOpenDetails(false);
    setOpenDetailed(false);
    setSelected(null);
    setSelectedHighlight(null);
    setReportText("");
    setPlagPhrases([]);
    setLecturePhrases([]);
    setSubmissionPhrases([]);
    setOnlinePhrases([]);
    setDetailedMatches([]);
    setAiSpans([]);
    setTextErr(null);
    setTextLoading(false);
    setIntegrityMode("plagiarism");
  };

  const switchIntegrityMode = (next: IntegrityHighlightMode) => {
    try {
      window.getSelection?.()?.removeAllRanges?.();
    } catch {
      // Selection cleanup is best-effort and must not block mode changes.
    }
    setIntegrityMode(next);
  };

  const selectedOriginalPdfUrl = selected?.original_file_url
    ? `${API_BASE_URL}${selected.original_file_url}`
    : null;

  const selectedPlagiarismPdfUrl = selected
    ? `${API_BASE_URL}/admin/submissions/${selected.submission_id}/integrity-highlighted-pdf?mode=plagiarism`
    : null;

  const selectedAiPdfUrl = selected
    ? `${API_BASE_URL}/admin/submissions/${selected.submission_id}/integrity-highlighted-pdf?mode=ai`
    : null;

  const selectedDetailedPdfUrl = selected
    ? `${API_BASE_URL}/admin/submissions/${selected.submission_id}/integrity-detailed-pdf`
    : null;

  const selectedReportPdfUrl = integrityMode === "ai" ? selectedAiPdfUrl : selectedPlagiarismPdfUrl;
  const selectedReportPdfLabel = integrityMode === "ai" ? "AI" : "Plagiarism";
  const selectedAiPct = selected ? getAiRiskPercent(selected) : 0;

  return (
    <div
      className={[
        "admin-reports-page-only relative min-h-[calc(100vh-160px)] space-y-6",
        isDark ? "admin-reports-dark-only" : "admin-reports-light-only",
      ].join(" ")}
    >
      <AdminReportsCSS />

      <div className="mt-8">
        <h1 className="admin-reports-heading text-3xl font-semibold">Institution reports</h1>
        <p className="admin-reports-subtext mt-1 text-sm">
          Monitor submission integrity results, detailed plagiarism sources, and published marking feedback across all classes.
        </p>
      </div>

      <div className="admin-reports-filter-shell">
        <FilterBuilder
          fields={reportFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search by student, class, lecturer, assignment or file"
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}
      {loading && <div className={isDark ? "text-sm text-slate-300" : "text-sm text-slate-600"}>Loading institution reports…</div>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading && rows.length === 0 ? (
          <ProgressiveCardSkeleton count={4} />
        ) : !loading && displayedRows.length === 0 ? (
          <div className="admin-reports-empty-card">
            No reports match the current filters.
          </div>
        ) : (
          visibleRows.map((row, idx) => (
            <div
              key={row.submission_id}
              className="admin-report-card p-5"
            >
              <div
                className="admin-report-stripe"
                style={{
                  background:
                    idx % 2 === 0
                      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
                      : "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(16,185,129))",
                }}
              />
              <div
                className="admin-report-card-halo"
                style={{
                  background:
                    idx % 2 === 0
                      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
                      : "radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(16,185,129,.13), transparent 72%)",
                }}
              />
              <div className="admin-report-card-shine" />

              <div className="admin-report-card-content pl-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="admin-report-title text-lg font-semibold">
                    Assignment: {row.assignment_title} ({row.student_username})
                  </h2>

                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(row.integrity_status)}`}>
                    {row.integrity_status}
                  </span>
                </div>

                <div className="admin-report-copy mt-2 space-y-1 text-sm">
                  <div>
                    Course: {row.class_code} — {row.class_name}
                  </div>
                  <div>Lecturer: {row.lecturer_name}</div>
                  <div>Submitted: {row.submitted_at || "—"}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Plagiarism: {row.plagiarism_percent}%
                  </span>
                  <AiBadge r={row} />

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      row.marked_score != null
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {row.marked_score != null && row.marked_max_score != null
                      ? `Marked: ${row.marked_score}/${row.marked_max_score}`
                      : "Not marked yet"}
                  </span>

                  {row.mark_published ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                      Published to student
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-indigo-600 px-4 py-2 text-white shadow transition hover:bg-indigo-700"
                    onClick={() => void openReport(row)}
                  >
                    View Details
                  </button>

                  {row.original_file_url ? (
                    <a
                      className="rounded-full bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
                      href={`${API_BASE_URL}${row.original_file_url}`}
                      target="_blank"
                      rel="noreferrer"
                      title={row.file_name || "Open original submission"}
                    >
                      Download PDF
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="cursor-not-allowed rounded-full bg-slate-200 px-4 py-2 text-slate-600"
                      disabled
                    >
                      No file
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && (hasHiddenLoadedRows || hasMoreRows) ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreRows()}
            className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
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
            ? `Submission #${selected.submission_id} — ${selected.assignment_title}`
            : "Submission Details"
        }
        widthClass="max-w-6xl"
        topClass="mt-12"
      >
        {!selected ? (
          <div className="text-slate-700">No submission selected.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-white/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {integrityMode === "ai"
                        ? "AI report content (highlighted)"
                        : "Plagiarism report content (highlighted)"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {integrityMode === "ai"
                        ? "Red / orange / yellow highlights show exact AI-flagged spans. Hover a highlight to see confidence, reasons, and contribution."
                        : "Yellow highlights show plagiarism-matched phrases. Use Detailed Report to compare lecture-note, student-submission, and online-source matches in different colors."}
                    </div>
                  </div>

                  {selectedReportPdfUrl ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <a
                        className="whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
                        href={selectedReportPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open / Download {selectedReportPdfLabel} PDF
                      </a>

                      <button
                        type="button"
                        onClick={() => setOpenDetailed(true)}
                        className="whitespace-nowrap rounded-full bg-amber-500 px-4 py-2 text-white shadow hover:bg-amber-600"
                      >
                        Detailed Report
                      </button>

                      {selectedOriginalPdfUrl ? (
                        <a
                          className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
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
              </div>

              {textErr ? (
                <div className="p-6 text-sm text-red-600">{textErr}</div>
              ) : textLoading ? (
                <div className="p-6 text-sm text-slate-600">Loading highlighted content…</div>
              ) : (
                <div className="h-[70vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text">
                  <div key={`integrity-${selected.submission_id}-${integrityMode}`}>
                    {renderReportHighlights(
                      (integrityMode === "plagiarism" ? (plagiarismReportText || reportText) : reportText) || "No extracted text found.",
                      integrityMode === "ai" ? [] : plagPhrases,
                      integrityMode === "plagiarism" ? [] : aiSpans,
                      integrityMode
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/75 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">Similarity &amp; AI Risk</div>

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
                    value={selected.plagiarism_percent}
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
                    value={selectedAiPct}
                    stroke="rgb(99,102,241)"
                  />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-600">
                Click a circle to switch between plagiarism and AI views.
              </div>

              <div className="mt-6 space-y-1 text-xs text-slate-600">
                <div>
                  Student: <span className="font-medium text-slate-800">{selected.student_username}</span>
                </div>
                <div>
                  Name: <span className="font-medium text-slate-800">{selected.student_name}</span>
                </div>
                <div>
                  Course: <span className="font-medium text-slate-800">{selected.class_code}</span>
                </div>
                <div>
                  Lecturer: <span className="font-medium text-slate-800">{selected.lecturer_name}</span>
                </div>
                <div>
                  Submitted: <span className="font-medium text-slate-800">{selected.submitted_at || "—"}</span>
                </div>
                <div>
                  Attempt: <span className="font-medium text-slate-800">{selected.attempt_no}</span>
                </div>
                {selected.file_name ? (
                  <div>
                    File: <span className="font-medium text-slate-800">{selected.file_name}</span>
                  </div>
                ) : null}
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
            ? `Detailed Report — Submission #${selected.submission_id}`
            : "Detailed Report"
        }
        widthClass="max-w-6xl"
        topClass="mt-16"
      >
        {!selected ? (
          <div className="text-slate-700">No submission selected.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
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
                <div className="text-xs text-slate-500">Click a highlighted section to view its source.</div>
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

                {selectedDetailedPdfUrl ? (
                  <a
                    className="whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
                    href={selectedDetailedPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open / Download Detailed PDF
                  </a>
                ) : null}
              </div>

              {textErr ? (
                <div className="p-6 text-sm text-red-600">{textErr}</div>
              ) : textLoading ? (
                <div className="p-6 text-sm text-slate-600">Loading detailed report…</div>
              ) : (
                <div className="h-[72vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text">
                  {renderDetailedReportHighlights(
                    (plagiarismReportText || reportText) || "No extracted text found.",
                    detailedMatches,
                    setSelectedHighlight
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
                    <div className="text-sm leading-6 text-slate-800">{selectedHighlight.text}</div>
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
                            <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}>
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
                              <div className="break-all text-xs text-slate-500">{source.source_path}</div>
                            ) : null}
                            {source.source_doc_id ? (
                              <div className="text-xs text-slate-500">Source doc id: {source.source_doc_id}</div>
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
