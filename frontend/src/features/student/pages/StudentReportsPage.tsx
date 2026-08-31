import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { RootState } from "@/app/store";
import { api, API_BASE_URL } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import PortalModal from "@/shared/components/PortalModal";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import {
  applyFilters,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import {
  renderMarkedReportHighlights,
  renderReportHighlights,
  type AiSpan,
  type IntegrityHighlightMode,
  type MarkAnnotationHighlight,
} from "@/shared/lib/reportHighlight";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";
import {
  useRealtimeEvents,
  type RealtimeEvent,
} from "@/shared/hooks/useRealtimeEvents";
import { useRefreshIndicator } from "@/shared/lib/refreshIndicator";

type JoinedClass = {
  id: number;
  title: string;
  instructor: string;
  code: string;
};

const REPORT_PAGE_SIZE = 20;
const REPORT_VISIBLE_BATCH_SIZE = 10;
const REPORT_REFRESH_THROTTLE_MS = 25_000;

type IntegrityReportItem = {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  class_code: string;
  class_name: string;
  submitted_at: string;
  plagiarism_percent: number | null;
  ai_detected?: boolean;
  ai_risk_percent?: number | null;
  ai_risk_level?: string | null;
  hasFile?: boolean;
  fileName?: string | null;
  fileUrl?: string | null;
};

type MarkedReportItem = {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  class_code: string;
  class_name: string;
  submitted_at: string;
  score?: number | null;
  max_score?: number | null;
  general_feedback?: string | null;
  annotation_count?: number;
  fileName?: string | null;
  fileUrl?: string | null;
  marked_pdf_url?: string | null;
};

type MarkReportDetail = {
  id: number;
  submission_id: number;
  score?: number | null;
  max_score?: number | null;
  general_feedback?: string | null;
  published_to_student: boolean;
  generated_pdf_ready: boolean;
  annotation_count: number;
  annotations: MarkAnnotationHighlight[];
};

function StudentReportsPageCSS() {
  return (
    <style>{`
      .student-report-card,
      .student-report-empty {
        isolation: isolate;
      }

      .student-report-card {
        position: relative;
        overflow: hidden;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(226, 232, 240, 0.9);
        transition:
          transform 0.22s ease,
          box-shadow 0.22s ease,
          border-color 0.22s ease,
          background 0.22s ease;
      }

      .student-report-card:hover {
        transform: translateY(-4px);
        border-color: rgba(129, 140, 248, 0.34);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.13),
          0 8px 20px rgba(15, 23, 42, 0.06);
      }

      .student-report-card-glow {
        position: absolute;
        inset: -35%;
        z-index: 0;
        pointer-events: none;
        border-radius: 2rem;
        opacity: 0;
        filter: blur(32px);
        transform: scale(0.96);
        transition: opacity 0.22s ease, transform 0.22s ease;
        background: radial-gradient(
          55% 55% at 50% 35%,
          rgba(99, 102, 241, 0.16),
          rgba(59, 130, 246, 0.10) 42%,
          rgba(16, 185, 129, 0.07) 62%,
          transparent 76%
        );
      }

      .student-report-card:hover .student-report-card-glow {
        opacity: 1;
        transform: scale(1.02);
      }

      .student-report-card-inner {
        position: relative;
        z-index: 2;
      }

      .student-report-stripe {
        position: absolute;
        left: 0;
        top: 0;
        z-index: 3;
        height: 100%;
        width: 6px;
        border-radius: 1rem 0 0 1rem;
      }

      .report-card-link {
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease,
          background 0.2s ease;
      }

      .student-report-card:hover .report-card-link {
        transform: translateY(-1px);
      }

      .student-report-tabs {
        background: rgba(255, 255, 255, 0.92);
        border-color: rgba(226, 232, 240, 0.88);
      }

      .student-report-tab-active {
        background: rgb(15, 23, 42);
        color: white;
      }

      .student-report-tab-inactive {
        color: rgb(71, 85, 105);
      }

      .student-report-tab-inactive:hover {
        background: rgb(248, 250, 252);
      }

      body[data-student-theme="dark"] .student-report-card,
      html[data-student-theme="dark"] .student-report-card {
        background:
          radial-gradient(circle at 18% 16%, rgba(34, 211, 238, 0.04), transparent 34%),
          linear-gradient(180deg, rgba(11, 18, 32, 0.98), rgba(7, 14, 27, 0.96)) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        box-shadow:
          0 18px 42px rgba(0, 0, 0, 0.24),
          inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
      }

      body[data-student-theme="dark"] .student-report-card:hover,
      html[data-student-theme="dark"] .student-report-card:hover {
        border-color: rgba(34, 211, 238, 0.28) !important;
        box-shadow:
          0 22px 56px rgba(0, 0, 0, 0.34),
          0 0 30px rgba(34, 211, 238, 0.05) !important;
      }

      body[data-student-theme="dark"] .student-report-card-glow,
      html[data-student-theme="dark"] .student-report-card-glow {
        background: radial-gradient(
          55% 55% at 50% 35%,
          rgba(34, 211, 238, 0.14),
          rgba(99, 102, 241, 0.10) 42%,
          rgba(16, 185, 129, 0.08) 62%,
          transparent 76%
        );
      }

      body[data-student-theme="dark"] .student-report-card .text-slate-900,
      html[data-student-theme="dark"] .student-report-card .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      body[data-student-theme="dark"] .student-report-card .text-slate-800,
      html[data-student-theme="dark"] .student-report-card .text-slate-800 {
        color: rgb(226, 232, 240) !important;
      }

      body[data-student-theme="dark"] .student-report-card .text-slate-700,
      html[data-student-theme="dark"] .student-report-card .text-slate-700 {
        color: rgb(203, 213, 225) !important;
      }

      body[data-student-theme="dark"] .student-report-card .text-slate-600,
      html[data-student-theme="dark"] .student-report-card .text-slate-600 {
        color: rgb(190, 203, 220) !important;
      }

      body[data-student-theme="dark"] .student-report-card .text-slate-500,
      html[data-student-theme="dark"] .student-report-card .text-slate-500 {
        color: rgb(148, 163, 184) !important;
      }

      body[data-student-theme="dark"] .student-report-empty,
      html[data-student-theme="dark"] .student-report-empty {
        background: rgba(8, 15, 32, 0.88) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        color: rgb(203, 213, 225) !important;
      }

      body[data-student-theme="dark"] .student-plagiarism-badge,
      html[data-student-theme="dark"] .student-plagiarism-badge {
        background: rgba(180, 83, 9, 0.24) !important;
        color: rgb(253, 230, 138) !important;
      }

      body[data-student-theme="dark"] .student-ai-badge.bg-orange-100,
      html[data-student-theme="dark"] .student-ai-badge.bg-orange-100 {
        background: rgba(194, 65, 12, 0.24) !important;
        color: rgb(254, 215, 170) !important;
      }

      body[data-student-theme="dark"] .student-ai-badge.bg-amber-100,
      html[data-student-theme="dark"] .student-ai-badge.bg-amber-100 {
        background: rgba(180, 83, 9, 0.24) !important;
        color: rgb(253, 230, 138) !important;
      }

      body[data-student-theme="dark"] .student-ai-badge.bg-slate-200,
      html[data-student-theme="dark"] .student-ai-badge.bg-slate-200 {
        background: rgba(71, 85, 105, 0.34) !important;
        color: rgb(226, 232, 240) !important;
      }

      body[data-student-theme="dark"] .student-mark-box,
      html[data-student-theme="dark"] .student-mark-box {
        background: rgba(37, 99, 235, 0.16) !important;
        border-color: rgba(96, 165, 250, 0.28) !important;
        color: rgb(191, 219, 254) !important;
      }

      body[data-student-theme="dark"] .student-report-tabs,
      html[data-student-theme="dark"] .student-report-tabs {
        background: rgba(8, 15, 32, 0.86) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      body[data-student-theme="dark"] .student-report-tab-active,
      html[data-student-theme="dark"] .student-report-tab-active {
        background: rgba(34, 211, 238, 0.16) !important;
        color: rgb(165, 243, 252) !important;
        box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.22);
      }

      body[data-student-theme="dark"] .student-report-tab-inactive,
      html[data-student-theme="dark"] .student-report-tab-inactive {
        color: rgb(190, 203, 220) !important;
      }

      body[data-student-theme="dark"] .student-report-tab-inactive:hover,
      html[data-student-theme="dark"] .student-report-tab-inactive:hover {
        background: rgba(15, 23, 42, 0.78) !important;
        color: rgb(248, 250, 252) !important;
      }
    `}</style>
  );
}

function StudentReportModalVisualCSS() {
  return (
    <style>{`
      .student-report-risk-panel {
        background: rgba(255, 255, 255, 0.78);
        border-color: rgba(226, 232, 240, 0.88);
      }

      .student-report-risk-title {
        color: rgb(30, 41, 59);
      }

      .student-report-mode-button {
        border: 1px solid transparent;
        background: transparent;
      }

      .student-report-mode-button:hover {
        background: rgba(248, 250, 252, 0.85);
      }

      .student-report-mode-button.is-active-plagiarism {
        background: rgba(254, 243, 199, 0.85);
        border-color: rgba(252, 211, 77, 0.9);
        box-shadow: 0 0 0 2px rgba(252, 211, 77, 0.28);
      }

      .student-report-mode-button.is-active-ai {
        background: rgba(255, 241, 242, 0.9);
        border-color: rgba(253, 164, 175, 0.9);
        box-shadow: 0 0 0 2px rgba(253, 164, 175, 0.28);
      }

      .student-report-meter {
        --report-meter-track: rgba(15, 23, 42, 0.10);
      }

      .student-report-meter-value {
        color: rgb(15, 23, 42);
      }

      .student-report-meter-label {
        color: rgb(71, 85, 105);
      }

      .student-report-risk-hint {
        background: rgb(248, 250, 252);
        border-color: rgb(226, 232, 240);
        color: rgb(71, 85, 105);
      }

      .student-report-risk-meta {
        color: rgb(71, 85, 105);
      }

      .student-report-risk-meta span {
        color: rgb(30, 41, 59);
      }

      body[data-student-theme="dark"] .student-report-risk-panel,
      html[data-student-theme="dark"] .student-report-risk-panel {
        background: rgba(8, 15, 32, 0.82) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
      }

      body[data-student-theme="dark"] .student-report-risk-title,
      html[data-student-theme="dark"] .student-report-risk-title {
        color: rgb(248, 250, 252) !important;
      }

      body[data-student-theme="dark"] .student-report-mode-button,
      html[data-student-theme="dark"] .student-report-mode-button {
        background: rgba(15, 23, 42, 0.46);
        border-color: rgba(148, 163, 184, 0.16);
      }

      body[data-student-theme="dark"] .student-report-mode-button:hover,
      html[data-student-theme="dark"] .student-report-mode-button:hover {
        background: rgba(15, 23, 42, 0.78);
      }

      body[data-student-theme="dark"] .student-report-mode-button.is-active-plagiarism,
      html[data-student-theme="dark"] .student-report-mode-button.is-active-plagiarism {
        background: rgba(245, 158, 11, 0.15) !important;
        border-color: rgba(245, 158, 11, 0.58) !important;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.16) !important;
      }

      body[data-student-theme="dark"] .student-report-mode-button.is-active-ai,
      html[data-student-theme="dark"] .student-report-mode-button.is-active-ai {
        background: rgba(99, 102, 241, 0.16) !important;
        border-color: rgba(129, 140, 248, 0.58) !important;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.16) !important;
      }

      body[data-student-theme="dark"] .student-report-meter,
      html[data-student-theme="dark"] .student-report-meter {
        --report-meter-track: rgba(148, 163, 184, 0.18);
      }

      body[data-student-theme="dark"] .student-report-meter-value,
      html[data-student-theme="dark"] .student-report-meter-value {
        color: rgb(248, 250, 252) !important;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
      }

      body[data-student-theme="dark"] .student-report-meter-label,
      html[data-student-theme="dark"] .student-report-meter-label {
        color: rgb(203, 213, 225) !important;
      }

      body[data-student-theme="dark"] .student-report-risk-hint,
      html[data-student-theme="dark"] .student-report-risk-hint {
        background: rgba(15, 23, 42, 0.7) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        color: rgb(203, 213, 225) !important;
      }

      body[data-student-theme="dark"] .student-report-risk-meta,
      html[data-student-theme="dark"] .student-report-risk-meta {
        color: rgb(190, 203, 220) !important;
      }

      body[data-student-theme="dark"] .student-report-risk-meta span,
      html[data-student-theme="dark"] .student-report-risk-meta span {
        color: rgb(248, 250, 252) !important;
      }

      body[data-student-theme="dark"] .student-report-modal-surface,
      html[data-student-theme="dark"] .student-report-modal-surface {
        background: rgba(8, 15, 32, 0.92) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      body[data-student-theme="dark"] .student-report-modal-header,
      html[data-student-theme="dark"] .student-report-modal-header {
        background: rgba(8, 15, 32, 0.86) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
      }
    `}</style>
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
    <div className="student-report-meter flex flex-col items-center gap-2">
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
            strokeWidth="10"
            style={{ stroke: "var(--report-meter-track)" }}
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
            <div className="student-report-meter-value text-2xl font-semibold">
              {pct}%
            </div>

            <div className="student-report-meter-label text-xs">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiBadge({ r }: { r: IntegrityReportItem }) {
  const pct = typeof r.ai_risk_percent === "number" ? r.ai_risk_percent : null;
  const lvlRaw = (r.ai_risk_level || "").toLowerCase();
  const lvl =
    lvlRaw === "high" || lvlRaw === "medium" || lvlRaw === "low"
      ? lvlRaw
      : null;

  if (pct !== null) {
    const finalLevel =
      lvl ?? (pct >= 70 ? "high" : pct >= 40 ? "medium" : "low");

    const cls =
      finalLevel === "high"
        ? "bg-orange-100 text-orange-800"
        : finalLevel === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";

    return (
      <span
        className={`student-ai-badge rounded-full px-3 py-1 text-xs font-medium ${cls}`}
      >
        AI Risk: {pct}% ({finalLevel})
      </span>
    );
  }

  if (r.ai_detected) {
    return (
      <span className="student-ai-badge rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">
        AI detected
      </span>
    );
  }

  return (
    <span className="student-ai-badge rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
      No AI detected
    </span>
  );
}

function MainTabs({
  active,
  onChange,
}: {
  active: "integrity" | "feedback";
  onChange: (next: "integrity" | "feedback") => void;
}) {
  return (
    <div className="student-report-tabs inline-flex rounded-2xl border p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("integrity")}
        className={[
          "rounded-xl px-4 py-2 text-sm font-semibold transition",
          active === "integrity"
            ? "student-report-tab-active"
            : "student-report-tab-inactive",
        ].join(" ")}
      >
        Integrity reports
      </button>

      <button
        type="button"
        onClick={() => onChange("feedback")}
        className={[
          "rounded-xl px-4 py-2 text-sm font-semibold transition",
          active === "feedback"
            ? "student-report-tab-active"
            : "student-report-tab-inactive",
        ].join(" ")}
      >
        Marked feedback
      </button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="student-report-empty rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      {text}
    </div>
  );
}

export default function StudentReportsPage() {
  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string;
    username?: string;
    email?: string;
  };

  const username = resolveAuthIdent(auth);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTab =
    searchParams.get("tab") === "feedback" ? "feedback" : "integrity";

  const [activeTab, setActiveTab] = useState<"integrity" | "feedback">(
    requestedTab
  );

  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [integrityReports, setIntegrityReports] = useState<
    IntegrityReportItem[]
  >([]);
  const [markedReports, setMarkedReports] = useState<MarkedReportItem[]>([]);
  const [integrityFilters, setIntegrityFilters] = useState<FilterRule[]>([]);
  const [feedbackFilters, setFeedbackFilters] = useState<FilterRule[]>([]);
  const [hasMoreIntegrityReports, setHasMoreIntegrityReports] = useState(false);
  const [hasMoreMarkedReports, setHasMoreMarkedReports] = useState(false);
  const [visibleIntegrityCount, setVisibleIntegrityCount] = useState(
    REPORT_VISIBLE_BATCH_SIZE
  );
  const [visibleMarkedCount, setVisibleMarkedCount] = useState(
    REPORT_VISIBLE_BATCH_SIZE
  );
  const [loading, setLoading] = useState(false);
  const [integrityListLoading, setIntegrityListLoading] = useState(false);
  const [feedbackListLoading, setFeedbackListLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [openIntegrityDetails, setOpenIntegrityDetails] = useState(false);
  const [selectedIntegrity, setSelectedIntegrity] =
    useState<IntegrityReportItem | null>(null);
  const [integrityText, setIntegrityText] = useState("");
  const [plagiarismIntegrityText, setPlagiarismIntegrityText] = useState("");
  const [plagPhrases, setPlagPhrases] = useState<string[]>([]);
  const [aiSpans, setAiSpans] = useState<AiSpan[]>([]);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityErr, setIntegrityErr] = useState<string | null>(null);
  const [integrityMode, setIntegrityMode] =
    useState<IntegrityHighlightMode>("plagiarism");

  const [openMarkedDetails, setOpenMarkedDetails] = useState(false);
  const [selectedMarked, setSelectedMarked] = useState<MarkedReportItem | null>(
    null
  );
  const [markedText, setMarkedText] = useState("");
  const [markedDetail, setMarkedDetail] = useState<MarkReportDetail | null>(
    null
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    number | undefined
  >(undefined);
  const [markedLoading, setMarkedLoading] = useState(false);
  const [markedErr, setMarkedErr] = useState<string | null>(null);

  const hasAutoOpened = useRef(false);
  const lastReportsRefreshAt = useRef(0);
  const { beginTask, updateTask, finishTask } = useRefreshIndicator();

  const loadAll = useCallback(
    async (silent = false, force = false) => {
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

      const taskId = beginTask(
        silent ? "Refreshing reports" : "Loading reports",
        silent ? 18 : 12
      );

      if (!silent) {
        setLoading(true);
        setIntegrityListLoading(true);
        setFeedbackListLoading(true);
        setErr(null);
      }

      try {
        const loadClasses = api<JoinedClass[]>(`/student/${username}/classes`)
          .then((value) => setClasses(value ?? []))
          .catch(() => undefined);

        const loadIntegrity = api<IntegrityReportItem[]>(
          `/student/${username}/reports?limit=${REPORT_PAGE_SIZE}&offset=0`
        )
          .then((value) => {
            const rows = value ?? [];
            setIntegrityReports(rows);
            setHasMoreIntegrityReports(rows.length === REPORT_PAGE_SIZE);
          })
          .finally(() => {
            if (!silent) setIntegrityListLoading(false);
          });

        const loadFeedback = api<MarkedReportItem[]>(
          `/student/${username}/marked-reports?limit=${REPORT_PAGE_SIZE}&offset=0`
        )
          .then((value) => {
            const rows = value ?? [];
            setMarkedReports(rows);
            setHasMoreMarkedReports(rows.length === REPORT_PAGE_SIZE);
          })
          .finally(() => {
            if (!silent) setFeedbackListLoading(false);
          });

        updateTask(taskId, 35);

        if (activeTab === "feedback") {
          await Promise.allSettled([loadClasses, loadFeedback]);
          updateTask(taskId, 70);
          await Promise.allSettled([loadIntegrity]);
        } else {
          await Promise.allSettled([loadClasses, loadIntegrity]);
          updateTask(taskId, 70);
          await Promise.allSettled([loadFeedback]);
        }

        if (silent) setErr(null);
      } catch (e: any) {
        if (!silent) setErr(e?.message || "Failed to load reports");
      } finally {
        updateTask(taskId, 100);
        finishTask(taskId);

        if (!silent) {
          setIntegrityListLoading(false);
          setFeedbackListLoading(false);
          setLoading(false);
        }
      }
    },
    [username, activeTab, beginTask, updateTask, finishTask]
  );

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  useRealtimeEvents(
    "student",
    username,
    useCallback(
      (event: RealtimeEvent) => {
        if (
          [
            "submission_updated",
            "integrity_job",
            "mark_report_updated",
            "class_membership_changed",
            "new_message",
            "thread_updated",
          ].includes(event.type)
        ) {
          void loadAll(true);
        }
      },
      [loadAll]
    )
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadAll(true);
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadAll]);

  const integrityFilterDefinitions = useMemo<
    FilterDefinition<IntegrityReportItem>[]
  >(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by assignment, class or submission",
        match: (item, value) => {
          const q = value.toLowerCase();

          return [
            item.assignment_title,
            item.class_code,
            item.class_name,
            String(item.submission_id),
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
        options: classes.map((c) => ({
          value: c.code,
          label: `${c.code} — ${c.title}`,
        })),
        getValue: (item) => item.class_code,
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

  const feedbackFilterDefinitions = useMemo<
    FilterDefinition<MarkedReportItem>[]
  >(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by assignment, class or feedback",
        match: (item, value) => {
          const q = value.toLowerCase();

          return [
            item.assignment_title,
            item.class_code,
            item.class_name,
            item.general_feedback || "",
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
        options: classes.map((c) => ({
          value: c.code,
          label: `${c.code} — ${c.title}`,
        })),
        getValue: (item) => item.class_code,
      },
      {
        key: "scoreBand",
        label: "Mark band",
        type: "select",
        options: [
          { value: "excellent", label: "Excellent (80%+)" },
          { value: "good", label: "Good (60–79%)" },
          { value: "developing", label: "Developing (<60%)" },
        ],
        match: (item, value) => {
          const score = Number(item.score ?? 0);
          const max = Number(item.max_score ?? 100) || 100;
          const pct = (score / max) * 100;

          if (value === "excellent") return pct >= 80;
          if (value === "good") return pct >= 60 && pct < 80;
          if (value === "developing") return pct < 60;

          return true;
        },
      },
    ],
    [classes]
  );

  const filteredIntegrityReports = useMemo(
    () =>
      applyFilters(
        integrityReports,
        integrityFilters,
        integrityFilterDefinitions
      ),
    [integrityReports, integrityFilters, integrityFilterDefinitions]
  );

  const filteredMarkedReports = useMemo(
    () =>
      applyFilters(markedReports, feedbackFilters, feedbackFilterDefinitions),
    [markedReports, feedbackFilters, feedbackFilterDefinitions]
  );

  useEffect(() => {
    setVisibleIntegrityCount(REPORT_VISIBLE_BATCH_SIZE);
  }, [integrityFilters]);

  useEffect(() => {
    setVisibleMarkedCount(REPORT_VISIBLE_BATCH_SIZE);
  }, [feedbackFilters]);

  const visibleIntegrityReports = filteredIntegrityReports.slice(
    0,
    visibleIntegrityCount
  );
  const visibleMarkedReports = filteredMarkedReports.slice(0, visibleMarkedCount);
  const hasHiddenLoadedIntegrityReports =
    visibleIntegrityReports.length < filteredIntegrityReports.length;
  const hasHiddenLoadedMarkedReports =
    visibleMarkedReports.length < filteredMarkedReports.length;

  const openIntegrityReport = async (report: IntegrityReportItem) => {
    setSelectedIntegrity(report);
    setOpenIntegrityDetails(true);
    setIntegrityLoading(true);
    setIntegrityErr(null);
    setIntegrityText("");
    setPlagiarismIntegrityText("");
    setPlagPhrases([]);
    setAiSpans([]);

    try {
      const data = await api<{
        submission_id: number;
        text: string;
        plagiarism_text?: string;
        plagiarised_phrases: string[];
        ai_spans: AiSpan[];
      }>(`/student/${username}/submissions/${report.submission_id}/report-text`);

      setIntegrityText(data?.text ?? "");
      setPlagiarismIntegrityText(data?.plagiarism_text ?? data?.text ?? "");
      setPlagPhrases(data?.plagiarised_phrases ?? []);
      setAiSpans(data?.ai_spans ?? []);
      setIntegrityMode("plagiarism");
    } catch (e: any) {
      setIntegrityErr(e?.message || "Failed to load report details");
    } finally {
      setIntegrityLoading(false);
    }
  };

  const openMarkedReport = async (report: MarkedReportItem) => {
    setSelectedMarked(report);
    setOpenMarkedDetails(true);
    setMarkedLoading(true);
    setMarkedErr(null);
    setMarkedText("");
    setMarkedDetail(null);
    setSelectedAnnotationId(undefined);

    try {
      const data = await api<{
        submission_id: number;
        text: string;
        mark_report: MarkReportDetail;
        pdf_url?: string | null;
        original_file_url?: string | null;
      }>(`/student/${username}/submissions/${report.submission_id}/marked-report`);

      setMarkedText(data?.text ?? "");
      setMarkedDetail(data?.mark_report ?? null);
      setSelectedAnnotationId(data?.mark_report?.annotations?.[0]?.id);
    } catch (e: any) {
      setMarkedErr(e?.message || "Failed to load lecturer feedback");
    } finally {
      setMarkedLoading(false);
    }
  };

  useEffect(() => {
    if (hasAutoOpened.current || loading) return;

    const shouldOpen = searchParams.get("open") === "1";
    const submissionId = Number(searchParams.get("submission_id") || 0);

    if (!shouldOpen || !submissionId) return;

    if (requestedTab === "feedback") {
      const target = markedReports.find(
        (item) => item.submission_id === submissionId
      );

      if (target) {
        hasAutoOpened.current = true;
        void openMarkedReport(target);
      }

      return;
    }

    const target = integrityReports.find(
      (item) => item.submission_id === submissionId
    );

    if (target) {
      hasAutoOpened.current = true;
      void openIntegrityReport(target);
    }
    // Deep-link opening is driven by route and report data, not handler identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams, requestedTab, markedReports, integrityReports]);

  const closeIntegrityModal = () => {
    setOpenIntegrityDetails(false);
    setSelectedIntegrity(null);
    setIntegrityText("");
    setPlagiarismIntegrityText("");
    setPlagPhrases([]);
    setAiSpans([]);
    setIntegrityErr(null);
    setIntegrityLoading(false);
    setIntegrityMode("plagiarism");
  };

  const closeMarkedModal = () => {
    setOpenMarkedDetails(false);
    setSelectedMarked(null);
    setMarkedText("");
    setMarkedDetail(null);
    setMarkedErr(null);
    setMarkedLoading(false);
    setSelectedAnnotationId(undefined);
  };

  const switchIntegrityMode = (next: IntegrityHighlightMode) => {
    try {
      window.getSelection?.()?.removeAllRanges?.();
    } catch {
      // Ignore browser selection cleanup errors.
    }

    setIntegrityMode(next);
  };

  const selectedIntegrityOriginalPdfUrl = selectedIntegrity?.fileUrl
    ? `${API_BASE_URL}${selectedIntegrity.fileUrl}`
    : null;

  const selectedIntegrityReportPdfUrl = selectedIntegrity
    ? `${API_BASE_URL}/student/${username}/submissions/${
        selectedIntegrity.submission_id
      }/integrity-highlighted-pdf?mode=${
        integrityMode === "ai" ? "ai" : "plagiarism"
      }&ts=${Date.now()}`
    : null;

  const selectedMarkedPdfUrl = selectedMarked?.marked_pdf_url
    ? `${API_BASE_URL}${selectedMarked.marked_pdf_url}`
    : null;

  const selectedFeedbackAnnotation = useMemo(
    () =>
      markedDetail?.annotations?.find(
        (item) => item.id === selectedAnnotationId
      ) || markedDetail?.annotations?.[0],
    [markedDetail, selectedAnnotationId]
  );

  const selectedAiPct =
    typeof selectedIntegrity?.ai_risk_percent === "number"
      ? selectedIntegrity.ai_risk_percent
      : selectedIntegrity?.ai_detected
      ? 70
      : 0;
  const activeListLoading =
    activeTab === "integrity" ? integrityListLoading : feedbackListLoading;

  const updateTab = (next: "integrity" | "feedback") => {
    setActiveTab(next);

    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("open");
    params.delete("submission_id");
    setSearchParams(params, { replace: true });
  };

  const loadMoreIntegrityReports = async () => {
    if (hasHiddenLoadedIntegrityReports) {
      setVisibleIntegrityCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      return;
    }
    if (!username || integrityListLoading) return;
    setIntegrityListLoading(true);
    try {
      const rows = await api<IntegrityReportItem[]>(
        `/student/${username}/reports?limit=${REPORT_PAGE_SIZE}&offset=${integrityReports.length}`
      );
      const nextRows = rows ?? [];
      setIntegrityReports((prev) => [...prev, ...nextRows]);
      setVisibleIntegrityCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      setHasMoreIntegrityReports(nextRows.length === REPORT_PAGE_SIZE);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load more integrity reports");
    } finally {
      setIntegrityListLoading(false);
    }
  };

  const loadMoreMarkedReports = async () => {
    if (hasHiddenLoadedMarkedReports) {
      setVisibleMarkedCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      return;
    }
    if (!username || feedbackListLoading) return;
    setFeedbackListLoading(true);
    try {
      const rows = await api<MarkedReportItem[]>(
        `/student/${username}/marked-reports?limit=${REPORT_PAGE_SIZE}&offset=${markedReports.length}`
      );
      const nextRows = rows ?? [];
      setMarkedReports((prev) => [...prev, ...nextRows]);
      setVisibleMarkedCount((count) => count + REPORT_VISIBLE_BATCH_SIZE);
      setHasMoreMarkedReports(nextRows.length === REPORT_PAGE_SIZE);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load more marked reports");
    } finally {
      setFeedbackListLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <StudentReportsPageCSS />
      <StudentReportModalVisualCSS />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>

          <p className="mt-1 text-sm text-slate-600">
            Open automatic integrity reports or lecturer-marked feedback for each
            submission.
          </p>
        </div>

        <MainTabs active={activeTab} onChange={updateTab} />
      </div>

      <div className="mt-4">
        {activeTab === "integrity" ? (
          <FilterBuilder
            fields={integrityFilterDefinitions}
            rules={integrityFilters}
            onChange={setIntegrityFilters}
            onClear={() => setIntegrityFilters([])}
            quickFieldKey="keyword"
            quickPlaceholder="Search assignment title, class or report"
          />
        ) : (
          <FilterBuilder
            fields={feedbackFilterDefinitions}
            rules={feedbackFilters}
            onChange={setFeedbackFilters}
            onClear={() => setFeedbackFilters([])}
            quickFieldKey="keyword"
            quickPlaceholder="Search marked feedback"
          />
        )}
      </div>

      {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}
      {activeListLoading ? (
        <p className="mt-4 text-sm text-slate-600">
          Loading {activeTab === "integrity" ? "integrity reports" : "marked feedback"}…
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {activeListLoading && (activeTab === "integrity" ? integrityReports.length === 0 : markedReports.length === 0) ? (
          <ProgressiveCardSkeleton count={4} />
        ) : null}

        {!activeListLoading &&
        activeTab === "integrity" &&
        filteredIntegrityReports.length === 0 ? (
          <EmptyState
            text={
              integrityReports.length === 0
                ? "No integrity reports are visible yet."
                : "No integrity reports match the current filters."
            }
          />
        ) : null}

        {!activeListLoading &&
        activeTab === "feedback" &&
        filteredMarkedReports.length === 0 ? (
          <EmptyState
            text={
              markedReports.length === 0
                ? "No lecturer feedback has been published yet."
                : "No lecturer feedback matches the current filters."
            }
          />
        ) : null}

        {activeTab === "integrity"
          ? visibleIntegrityReports.map((report, index) => (
              <div
                key={report.submission_id}
                className="student-report-card p-6"
              >
                <div
                  className="student-report-stripe"
                  style={{
                    background:
                      index % 2 === 0
                        ? "rgb(99,102,241)"
                        : "rgb(59,130,246)",
                  }}
                />

                <div className="student-report-card-glow" />

                <div className="student-report-card-inner pl-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Assignment: {report.assignment_title}
                  </h2>

                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <div>
                      Course: {report.class_code} — {report.class_name}
                    </div>

                    <div>Submitted: {report.submitted_at}</div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="student-plagiarism-badge rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                      Plagiarism: {report.plagiarism_percent ?? 0}%
                    </span>

                    <AiBadge r={report} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void openIntegrityReport(report)}
                      className="report-card-link rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                      View report
                    </button>

                    {report.hasFile && report.fileUrl ? (
                      <a
                        className="report-card-link rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                        href={`${API_BASE_URL}${report.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download submission
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          : null}

        {activeTab === "feedback"
          ? visibleMarkedReports.map((report, index) => (
              <div
                key={report.submission_id}
                className="student-report-card p-5"
              >
                <div
                  className="student-report-stripe"
                  style={{
                    background:
                      index % 2 === 0
                        ? "rgb(59,130,246)"
                        : "rgb(16,185,129)",
                  }}
                />

                <div className="student-report-card-glow" />

                <div className="student-report-card-inner pl-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {report.assignment_title}
                      </h2>

                      <p className="mt-1 text-sm text-slate-600">
                        {report.class_code} • {report.class_name}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Published feedback for your submission
                      </p>
                    </div>

                    <div className="student-mark-box rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-blue-700">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em]">
                        Mark
                      </div>

                      <div className="text-2xl font-semibold">
                        {report.score ?? "—"}
                        {typeof report.max_score === "number"
                          ? ` / ${report.max_score}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      {report.annotation_count || 0} inline comment
                      {report.annotation_count === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void openMarkedReport(report)}
                      className="report-card-link rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      View marked report
                    </button>

                    {report.marked_pdf_url ? (
                      <a
                        href={`${API_BASE_URL}${report.marked_pdf_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="report-card-link rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Download marked PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          : null}
      </div>

      {!activeListLoading &&
      activeTab === "integrity" &&
      (hasHiddenLoadedIntegrityReports || hasMoreIntegrityReports) ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreIntegrityReports()}
            className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Show more integrity reports
          </button>
        </div>
      ) : null}

      {!activeListLoading &&
      activeTab === "feedback" &&
      (hasHiddenLoadedMarkedReports || hasMoreMarkedReports) ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreMarkedReports()}
            className="rounded-full border border-blue-200 bg-white/80 px-5 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50"
          >
            Show more marked reports
          </button>
        </div>
      ) : null}

      <PortalModal
        open={openIntegrityDetails}
        onClose={closeIntegrityModal}
        title={
          selectedIntegrity
            ? `${selectedIntegrity.assignment_title} — Integrity report`
            : "Integrity report"
        }
        widthClass="max-w-6xl"
        topClass="mt-12"
      >
        {!selectedIntegrity ? (
          <div className="text-slate-700">No report selected.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="student-report-modal-surface overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="student-report-modal-header flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {integrityMode === "ai"
                      ? "AI report content"
                      : "Plagiarism report content"}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {integrityMode === "ai"
                      ? "Red / orange / yellow highlights show exact AI-flagged spans. Hover a highlight to see confidence, reasons, and how much it contributes to the document AI score."
                      : "Yellow highlights show the exact plagiarism-matched phrases."}
                  </div>
                </div>

                {selectedIntegrityReportPdfUrl ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <a
                      className="whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
                      href={selectedIntegrityReportPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open / Download{" "}
                      {integrityMode === "ai" ? "AI" : "Plagiarism"} PDF
                    </a>

                    {selectedIntegrityOriginalPdfUrl ? (
                      <a
                        className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
                        href={selectedIntegrityOriginalPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Original PDF
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {integrityErr ? (
                <div className="p-6 text-sm text-red-600">{integrityErr}</div>
              ) : integrityLoading ? (
                <div className="p-6 text-sm text-slate-600">
                  Loading report details…
                </div>
              ) : (
                <div
                  className="h-[70vh] overflow-auto whitespace-pre-wrap p-6 leading-7 text-slate-800 select-text"
                  key={`integrity-${selectedIntegrity?.submission_id}-${integrityMode}`}
                >
                  {renderReportHighlights(
                    (integrityMode === "plagiarism"
                      ? plagiarismIntegrityText || integrityText
                      : integrityText) || "No extracted text found.",
                    integrityMode === "ai" ? [] : plagPhrases,
                    integrityMode === "plagiarism" ? [] : aiSpans,
                    integrityMode
                  )}
                </div>
              )}
            </div>

            <div className="student-report-risk-panel rounded-2xl border p-5 shadow-sm">
              <div className="student-report-risk-title text-sm font-semibold">
                Similarity &amp; AI Risk
              </div>

              <div className="mt-4 grid grid-cols-2 place-items-center gap-6 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => switchIntegrityMode("plagiarism")}
                  className={[
                    "student-report-mode-button rounded-3xl p-2 transition",
                    integrityMode === "plagiarism"
                      ? "is-active-plagiarism"
                      : "",
                  ].join(" ")}
                >
                  <CircularPercent
                    label="Plagiarism"
                    value={selectedIntegrity.plagiarism_percent ?? 0}
                    stroke="rgb(245,158,11)"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => switchIntegrityMode("ai")}
                  className={[
                    "student-report-mode-button rounded-3xl p-2 transition",
                    integrityMode === "ai" ? "is-active-ai" : "",
                  ].join(" ")}
                >
                  <CircularPercent
                    label="AI Risk"
                    value={selectedAiPct}
                    stroke="rgb(99,102,241)"
                  />
                </button>
              </div>

              <div className="student-report-risk-hint mt-4 rounded-2xl border px-3 py-2 text-center text-xs font-medium">
                Click a circle to switch between plagiarism and AI views.
              </div>

              <div className="student-report-risk-meta mt-6 space-y-1 text-xs">
                <div>
                  Course:{" "}
                  <span className="font-medium">
                    {selectedIntegrity.class_code}
                  </span>
                </div>

                <div>
                  Submitted:{" "}
                  <span className="font-medium">
                    {selectedIntegrity.submitted_at}
                  </span>
                </div>

                <div>
                  AI spans found:{" "}
                  <span className="font-medium">{aiSpans.length}</span>
                </div>

                <div>
                  Matched plagiarism phrases:{" "}
                  <span className="font-medium">{plagPhrases.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </PortalModal>

      <PortalModal
        open={openMarkedDetails}
        onClose={closeMarkedModal}
        title={
          selectedMarked
            ? `Marked feedback — ${selectedMarked.assignment_title}`
            : "Marked feedback"
        }
        widthClass="max-w-6xl"
      >
        {markedErr ? <p className="text-sm text-red-600">{markedErr}</p> : null}

        {markedLoading ? (
          <p className="text-sm text-slate-600">Loading lecturer feedback…</p>
        ) : null}

        {!markedLoading && selectedMarked && markedDetail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {selectedMarked.assignment_title}
                </div>

                <div className="mt-1 text-sm text-slate-600">
                  {selectedMarked.class_code} • {selectedMarked.class_name}
                </div>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-blue-700">
                <div className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Mark awarded
                </div>

                <div className="text-2xl font-semibold">
                  {markedDetail.score ?? "—"}
                  {typeof markedDetail.max_score === "number"
                    ? ` / ${markedDetail.max_score}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {selectedFeedbackAnnotation?.id ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/student/messages?submission_id=${selectedMarked?.submission_id}&annotation_id=${selectedFeedbackAnnotation.id}&intent=reply`
                    )
                  }
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Reply / appeal about selected comment
                </button>
              ) : null}

              {selectedMarkedPdfUrl ? (
                <a
                  href={selectedMarkedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Download marked PDF
                </a>
              ) : null}

              {selectedMarked.fileUrl ? (
                <a
                  href={`${API_BASE_URL}${selectedMarked.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open submitted PDF
                </a>
              ) : null}
            </div>

            {markedDetail.general_feedback ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">
                  Overall lecturer feedback
                </div>

                <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {markedDetail.general_feedback}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-800">
                  Online marked report
                </div>

                <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {renderMarkedReportHighlights(
                    markedText,
                    markedDetail.annotations,
                    (annotation) => {
                      if (annotation.id) setSelectedAnnotationId(annotation.id);
                    }
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">
                  Inline comments
                </div>

                <div className="mt-3 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                  {markedDetail.annotations.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No inline comments were added to this marked report.
                    </p>
                  ) : (
                    markedDetail.annotations.map((annotation, index) => {
                      const active =
                        selectedFeedbackAnnotation?.id === annotation.id;

                      return (
                        <div
                          key={annotation.id || index}
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            active
                              ? "border-blue-300 bg-blue-50"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedAnnotationId(annotation.id)
                            }
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white">
                                {annotation.order_no ?? index + 1}
                              </span>
                              Lecturer comment
                            </div>

                            <div className="mt-2 text-sm font-medium text-slate-700">
                              {annotation.selected_text}
                            </div>

                            <div className="mt-2 text-sm text-slate-600">
                              {annotation.comment}
                            </div>
                          </button>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/student/messages?submission_id=${selectedMarked?.submission_id}&annotation_id=${annotation.id}&intent=reply`
                                )
                              }
                              className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Reply / appeal
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </PortalModal>
    </div>
  );
}
