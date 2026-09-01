import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api, API_BASE_URL, uploadToPresignedPost } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import UploadProgressRing from "@/shared/components/UploadProgressRing";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import {
  applyFilters,
  createFilterRule,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import { useNavigate, useSearchParams } from "react-router-dom";
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

type AssignmentListItem = {
  id: number;
  title: string;
  className: string;
  classCode: string;
  instructor?: string;
  due: string;
  status: "pending" | "submitted";
  mark_score?: number | null;
  mark_max_score?: number | null;
  marked_submission_id?: number | null;
  has_marked_report?: boolean;
};

type SubmissionInfo = {
  id?: number;
  attempt_no: number;
  status: string;
  submitted_at: string | null;
  file_name: string | null;
  download_url: string | null;
  integrity_status?: string | null;
  error?: string | null;
};

type SubmitAssignmentResponse = {
  ok: boolean;
  submission_id: number;
  attempt_no: number;
  file_name: string | null;
  download_url: string | null;
  integrity_job_status: string;
  integrity_job_progress: number;
  idempotency_key: string;
  plagiarism_percent?: number;
  error?: string | null;
};

type PresignResponse = {
  bucket: string;
  key: string;
  upload: {
    url: string;
    fields: Record<string, string>;
  };
};

type AssignmentDetail = {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  class: { id: number; name: string; code: string };
  allow_resubmission: boolean;
  max_attempts: number;
  attempts_used: number;
  attempts_left: number;
  can_submit: boolean;
  submission_closed_reason?: string | null;
  locked_by_marking?: boolean;
  latest_submission?: SubmissionInfo | null;
  submission?: SubmissionInfo | null;
  mark_report?: {
    submission_id: number;
    score?: number | null;
    max_score?: number | null;
    general_feedback?: string | null;
    annotation_count?: number;
    has_pdf?: boolean;
  } | null;
};

const ASSIGNMENT_REFRESH_THROTTLE_MS = 25_000;

function isoToDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function StudentAssignmentCardCSS() {
  return (
    <style>{`
      .student-assignment-card {
        isolation: isolate;
        background: rgba(255, 255, 255, 0.96);
        border-color: rgba(226, 232, 240, 0.78);
      }

      .student-assignment-card-content {
        position: relative;
        z-index: 4;
      }

      .student-assignment-card-stripe {
        z-index: 5;
      }

      .student-assignment-card-base-halo {
        opacity: 0.42;
        transition:
          opacity 0.28s ease,
          transform 0.28s ease,
          filter 0.28s ease;
      }

      .student-assignment-card-hover-halo {
        opacity: 0;
        transform: scale(0.94);
        filter: blur(28px);
        transition:
          opacity 0.28s ease,
          transform 0.28s ease,
          filter 0.28s ease;
      }

      .student-assignment-card-shine {
        position: absolute;
        top: -30%;
        bottom: -30%;
        left: -40%;
        width: 28%;
        z-index: 2;
        pointer-events: none;
        opacity: 0;
        transform: rotate(12deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.26),
          transparent
        );
        filter: blur(12px);
        transition:
          left 0.55s ease,
          opacity 0.25s ease;
      }

      .student-assignment-card:hover {
        transform: translateY(-4px) scale(1.01);
      }

      .student-assignment-card:hover .student-assignment-card-base-halo {
        opacity: 0.62;
        transform: scale(1.02);
      }

      .student-assignment-card:hover .student-assignment-card-hover-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .student-assignment-card:hover .student-assignment-card-shine {
        opacity: 0.65;
        left: 110%;
      }

      body[data-student-theme="dark"] .student-assignment-card,
      html[data-student-theme="dark"] .student-assignment-card {
        background:
          radial-gradient(circle at 18% 18%, rgba(34, 211, 238, 0.035), transparent 32%),
          linear-gradient(180deg, rgba(9, 16, 31, 0.98), rgba(7, 14, 27, 0.96)) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        box-shadow:
          0 18px 42px rgba(0, 0, 0, 0.24),
          inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card:hover,
      html[data-student-theme="dark"] .student-assignment-card:hover {
        border-color: rgba(34, 211, 238, 0.32) !important;
        box-shadow:
          0 22px 56px rgba(0, 0, 0, 0.34),
          0 0 34px rgba(34, 211, 238, 0.055),
          inset 0 1px 0 rgba(255, 255, 255, 0.045) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card-base-halo,
      html[data-student-theme="dark"] .student-assignment-card-base-halo {
        opacity: 0.12 !important;
        filter: blur(24px);
      }

      body[data-student-theme="dark"] .student-assignment-card-hover-halo,
      html[data-student-theme="dark"] .student-assignment-card-hover-halo {
        background:
          radial-gradient(55% 55% at 42% 36%, rgba(34, 211, 238, 0.18), transparent 70%),
          radial-gradient(48% 48% at 70% 44%, rgba(99, 102, 241, 0.14), transparent 72%) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-base-halo,
      html[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-base-halo {
        opacity: 0.2 !important;
      }

      body[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-hover-halo,
      html[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-hover-halo {
        opacity: 0.82 !important;
      }

      body[data-student-theme="dark"] .student-assignment-card-shine,
      html[data-student-theme="dark"] .student-assignment-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(34, 211, 238, 0.11),
          transparent
        ) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-shine,
      html[data-student-theme="dark"] .student-assignment-card:hover .student-assignment-card-shine {
        opacity: 0.55 !important;
      }

      body[data-student-theme="dark"] .student-assignment-card .text-slate-900,
      html[data-student-theme="dark"] .student-assignment-card .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card .text-slate-800,
      html[data-student-theme="dark"] .student-assignment-card .text-slate-800 {
        color: rgb(226, 232, 240) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card .text-slate-600,
      html[data-student-theme="dark"] .student-assignment-card .text-slate-600 {
        color: rgb(190, 203, 220) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card .text-slate-500,
      html[data-student-theme="dark"] .student-assignment-card .text-slate-500 {
        color: rgb(148, 163, 184) !important;
      }

      body[data-student-theme="dark"] .student-assignment-card .text-indigo-600,
      html[data-student-theme="dark"] .student-assignment-card .text-indigo-600 {
        color: rgb(147, 197, 253) !important;
      }

      body[data-student-theme="dark"] .student-status-pill.bg-emerald-100,
      html[data-student-theme="dark"] .student-status-pill.bg-emerald-100 {
        background: rgba(5, 150, 105, 0.22) !important;
        border-color: rgba(52, 211, 153, 0.28) !important;
        color: rgb(167, 243, 208) !important;
      }

      body[data-student-theme="dark"] .student-status-pill.bg-amber-100,
      html[data-student-theme="dark"] .student-status-pill.bg-amber-100 {
        background: rgba(180, 83, 9, 0.22) !important;
        border-color: rgba(251, 191, 36, 0.28) !important;
        color: rgb(253, 230, 138) !important;
      }

      body[data-student-theme="dark"] .student-mark-pill,
      html[data-student-theme="dark"] .student-mark-pill {
        background: rgba(37, 99, 235, 0.18) !important;
        border-color: rgba(96, 165, 250, 0.28) !important;
        color: rgb(147, 197, 253) !important;
      }
    `}</style>
  );
}

function StudentAssignmentModalCSS() {
  return (
    <style>{`
      .student-assignment-upload-modal {
        color: #0f172a;
      }

      .student-assignment-upload-modal .assignment-title {
        color: #0f172a;
      }

      .student-assignment-upload-modal .assignment-muted {
        color: #475569;
      }

      .student-assignment-upload-modal .assignment-panel {
        border: 1px solid rgba(203, 213, 225, 0.85);
        background: rgba(248, 250, 252, 0.92);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      }

      .student-assignment-upload-modal .assignment-file-input {
        color: #0f172a;
        background: #ffffff;
        border-color: rgba(148, 163, 184, 0.75);
      }

      .student-assignment-upload-modal .assignment-file-input::file-selector-button {
        margin-right: 0.85rem;
        border: 0;
        border-radius: 0.7rem;
        background: #eef2ff;
        color: #3730a3;
        padding: 0.5rem 0.8rem;
        font-weight: 700;
        cursor: pointer;
      }

      .student-assignment-upload-modal .assignment-file-input:disabled::file-selector-button {
        cursor: not-allowed;
        opacity: 0.7;
      }

      .student-assignment-upload-modal .assignment-feedback-card {
        border: 1px solid rgba(147, 197, 253, 0.75);
        background: rgba(239, 246, 255, 0.9);
      }

      .student-assignment-upload-modal .assignment-actions {
        border-top: 1px solid rgba(226, 232, 240, 0.9);
        background: linear-gradient(
          180deg,
          rgba(255,255,255,0),
          rgba(255,255,255,0.96) 34%
        );
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal,
      html[data-student-theme="dark"] .student-assignment-upload-modal {
        color: #e5edf8;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-title,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-title {
        color: #f8fafc;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-muted,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-muted {
        color: #b8c6d9;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-panel,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-panel {
        border-color: rgba(148, 163, 184, 0.24);
        background: linear-gradient(
          180deg,
          rgba(15, 23, 42, 0.96),
          rgba(10, 18, 32, 0.94)
        );
        box-shadow: 0 18px 38px rgba(0, 0, 0, 0.28);
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-file-input,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-file-input {
        color: #e5edf8;
        background: rgba(15, 23, 42, 0.96);
        border-color: rgba(148, 163, 184, 0.34);
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-file-input::file-selector-button,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-file-input::file-selector-button {
        background: rgba(34, 211, 238, 0.15);
        color: #a5f3fc;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-feedback-card,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-feedback-card {
        border-color: rgba(96, 165, 250, 0.35);
        background: rgba(30, 64, 175, 0.16);
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-actions,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-actions {
        border-top-color: rgba(148, 163, 184, 0.20);
        background: linear-gradient(
          180deg,
          rgba(8,15,32,0),
          rgba(8,15,32,0.98) 38%
        );
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal a,
      html[data-student-theme="dark"] .student-assignment-upload-modal a {
        color: #93c5fd;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-success,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-success {
        color: #6ee7b7;
      }

      body[data-student-theme="dark"] .student-assignment-upload-modal .assignment-danger,
      html[data-student-theme="dark"] .student-assignment-upload-modal .assignment-danger {
        color: #fca5a5;
      }
    `}</style>
  );
}

function AssignmentCard({
  status,
  children,
}: {
  status: "pending" | "submitted";
  children: React.ReactNode;
}) {
  const stripe =
    status === "submitted"
      ? "linear-gradient(180deg, rgb(16,185,129), rgb(34,197,94), rgb(20,184,166))"
      : "linear-gradient(180deg, rgb(251,191,36), rgb(245,158,11), rgb(249,115,22))";

  const baseHalo =
    status === "submitted"
      ? "radial-gradient(55% 55% at 30% 15%, rgba(16,185,129,.16), transparent 70%)"
      : "radial-gradient(55% 55% at 30% 15%, rgba(245,158,11,.16), transparent 70%)";

  const hoverHalo =
    status === "submitted"
      ? "radial-gradient(60% 60% at 42% 34%, rgba(16,185,129,.20), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.14), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(245,158,11,.22), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(251,146,60,.14), transparent 72%)";

  return (
    <div
      className={[
        "student-assignment-card group relative flex h-full min-h-[164px] overflow-hidden rounded-3xl p-6 text-left",
        "border border-slate-200/70",
        "shadow-[0_10px_30px_rgba(15,23,42,0.08)]",
        "transition-all duration-200",
        "hover:shadow-[0_18px_55px_rgba(15,23,42,0.12)]",
      ].join(" ")}
    >
      <div
        className="student-assignment-card-stripe pointer-events-none absolute left-0 top-0 h-full w-[6px]"
        style={{ background: stripe }}
      />

      <div
        className="student-assignment-card-base-halo pointer-events-none absolute -inset-10 z-0"
        style={{ background: baseHalo }}
      />

      <div
        className="student-assignment-card-hover-halo pointer-events-none absolute -inset-10 z-[1]"
        style={{ background: hoverHalo }}
      />

      <div className="student-assignment-card-shine" />

      <div className="student-assignment-card-content flex h-full min-h-0 flex-1 flex-col pl-2">{children}</div>
    </div>
  );
}

export default function StudentAssignmentsPage() {
  const auth = useSelector((s: RootState) => (s as any).auth);
  const ident = resolveAuthIdent(auth);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classCodeParam = searchParams.get("class_code");

  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [visibleAssignmentCount, setVisibleAssignmentCount] = useState(12);
  const classesRef = useRef<JoinedClass[]>([]);
  const assignmentsRef = useRef<AssignmentListItem[]>([]);
  const assignmentDetailCacheRef = useRef<Map<number, AssignmentDetail>>(
    new Map()
  );
  const selectedIdRef = useRef<number | null>(null);
  const lastAssignmentsRefreshAt = useRef(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadTotalBytes, setUploadTotalBytes] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<
    "uploading" | "waiting" | "processing" | "completed" | "failed"
  >("uploading");
  const [finalizingProgress, setFinalizingProgress] = useState(0);
  const [finalizingStatus, setFinalizingStatus] = useState<string | null>(null);
  const [activeJobSubmissionId, setActiveJobSubmissionId] = useState<
    number | null
  >(null);
  const [activeJobKey, setActiveJobKey] = useState<string | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState<string | null>(
    null
  );

  const { beginTask, updateTask, finishTask } = useRefreshIndicator();

  useEffect(() => {
    classesRef.current = classes;
  }, [classes]);

  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  useEffect(() => {
    if (!classCodeParam) return;

    setFilters((prev) => {
      const withoutClass = prev.filter((rule) => rule.fieldKey !== "classCode");

      return [
        createFilterRule<AssignmentListItem>(
          assignmentFilterDefinitions,
          "classCode",
          classCodeParam
        ),
        ...withoutClass,
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCodeParam]);

  const loadList = useCallback(
    async (silent = false, force = false) => {
      if (!ident) return;

      const now = Date.now();
      if (
        silent &&
        !force &&
        now - lastAssignmentsRefreshAt.current < ASSIGNMENT_REFRESH_THROTTLE_MS
      ) {
        return;
      }
      lastAssignmentsRefreshAt.current = now;

      const taskId = beginTask(
        silent ? "Refreshing assignments" : "Loading assignments",
        silent ? 20 : 12
      );

      if (!silent) {
        setLoading(true);
        setErr(null);
      }

      try {
        updateTask(taskId, 35);

        const joinedPromise = api<JoinedClass[]>(`/student/${ident}/classes`);
        const assignmentsPromise = api<AssignmentListItem[]>(`/student/${ident}/assignments`);

        const joined = await joinedPromise.catch(() => classesRef.current);
        const joinedClasses = joined ?? classesRef.current;

        setClasses(joinedClasses);
        updateTask(taskId, 50);

        const instructorByClassCode = new Map(
          joinedClasses.map((item) => [item.code, item.instructor])
        );

        const assignmentRows = await assignmentsPromise.catch(
          () => assignmentsRef.current
        );

        updateTask(taskId, 78);

        setAssignments(
          (assignmentRows ?? []).map((item) => ({
            ...item,
            instructor:
              instructorByClassCode.get(item.classCode) ||
              item.instructor ||
              "",
          }))
        );

        if (silent) setErr(null);
      } catch (e: any) {
        if (!silent) {
          setErr(e?.message || "Failed to load assignments");
        }
      } finally {
        updateTask(taskId, 100);
        finishTask(taskId);

        if (!silent) {
          setLoading(false);
        }
      }
    },
    [ident, beginTask, updateTask, finishTask]
  );

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadList(true);
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadList]);

  const clearAssignmentDetailCache = useCallback((assignmentId?: number | null) => {
    if (assignmentId == null) {
      assignmentDetailCacheRef.current.clear();
      return;
    }
    assignmentDetailCacheRef.current.delete(Number(assignmentId));
  }, []);

  const refreshAssignmentDetail = useCallback(
    async (
      assignmentId: number,
      options: { showLoading?: boolean; surfaceError?: boolean } = {}
    ) => {
      if (!ident) return null;

      if (options.showLoading) {
        setDetailLoading(true);
      }

      try {
        const d = await api<AssignmentDetail>(
          `/student/${ident}/assignments/${assignmentId}`
        );
        assignmentDetailCacheRef.current.set(assignmentId, d);
        if (selectedIdRef.current === assignmentId) {
          setDetail(d);
          setDetailErr(null);
        }
        return d;
      } catch (e: any) {
        if (options.surfaceError && selectedIdRef.current === assignmentId) {
          setDetailErr(e?.message || "Failed to load assignment");
        }
        return null;
      } finally {
        if (options.showLoading && selectedIdRef.current === assignmentId) {
          setDetailLoading(false);
        }
      }
    },
    [ident]
  );

  const openAssignment = async (assignmentId: number) => {
    if (!ident) return;

    setOpen(true);
    setSelectedId(assignmentId);
    selectedIdRef.current = assignmentId;
    const cachedDetail = assignmentDetailCacheRef.current.get(assignmentId);
    setDetail(cachedDetail ?? null);
    setDetailErr(null);
    setSubmitMsg(null);
    setFile(null);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadTotalBytes(null);
    setUploadPhase("uploading");
    setFinalizingProgress(0);
    setFinalizingStatus(null);
    setActiveJobSubmissionId(null);
    setActiveJobKey(null);
    setUploadDisplayName(null);

    if (cachedDetail) {
      setDetailLoading(false);
      void refreshAssignmentDetail(assignmentId);
      return;
    }

    await refreshAssignmentDetail(assignmentId, {
      showLoading: true,
      surfaceError: true,
    });
  };

  const close = () => {
    setOpen(false);
    setSelectedId(null);
    selectedIdRef.current = null;
    setDetail(null);
    setDetailErr(null);
    setFile(null);
    setSubmitMsg(null);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadTotalBytes(null);
    setUploadPhase("uploading");
    setFinalizingProgress(0);
    setFinalizingStatus(null);
    setActiveJobSubmissionId(null);
    setActiveJobKey(null);
    setUploadDisplayName(null);
  };

  const handleRealtime = useCallback(
    (event: RealtimeEvent) => {
      if (
        event.type === "integrity_job" &&
        activeJobSubmissionId &&
        Number(event.submission_id) === Number(activeJobSubmissionId)
      ) {
        const progress = Math.max(
          0,
          Math.min(100, Number(event.progress ?? 0))
        );

        setFinalizingProgress(progress);
        setFinalizingStatus(event.status || null);

        if (event.status === "done") {
          setUploadPhase("completed");
          setSubmitMsg(
            "Submission uploaded successfully. Finalization is complete."
          );
          setActiveJobSubmissionId(null);
          setActiveJobKey(null);

          if (selectedId) {
            clearAssignmentDetailCache(selectedId);
            void refreshAssignmentDetail(selectedId);
          }

          void loadList(true, true);
        } else if (event.status === "failed") {
          setUploadPhase("failed");
          setSubmitMsg(
            event.error ||
              "Submission uploaded, but server-side finalization failed. The failed attempt will not count, so you can retry."
          );
          setActiveJobSubmissionId(null);
          setActiveJobKey(null);

          if (selectedId) {
            clearAssignmentDetailCache(selectedId);
            void refreshAssignmentDetail(selectedId);
          }

          void loadList(true, true);
        } else {
          setUploadPhase("processing");
        }
      }

      if (
        [
          "submission_updated",
          "mark_report_updated",
          "class_membership_changed",
        ].includes(event.type)
      ) {
        void loadList(true);

        if (selectedId) {
          clearAssignmentDetailCache(selectedId);
          void refreshAssignmentDetail(selectedId);
        }
      }
    },
    [
      activeJobSubmissionId,
      clearAssignmentDetailCache,
      loadList,
      refreshAssignmentDetail,
      selectedId,
    ]
  );

  const { connected: realtimeConnected } = useRealtimeEvents(
    "student",
    ident,
    handleRealtime
  );

  useEffect(() => {
    if (!activeJobSubmissionId || realtimeConnected) return;

    let stopped = false;

    const poll = async () => {
      try {
        const jobs = await api<
          Array<{
            submission_id: number;
            idempotency_key: string;
            status: string;
            progress: number;
            error?: string | null;
          }>
        >(`/integrity/jobs/${activeJobSubmissionId}`);

        if (stopped) return;

        const matchingJob =
          jobs.find((job) =>
            activeJobKey ? job.idempotency_key === activeJobKey : true
          ) || jobs[0];

        if (!matchingJob) return;

        setFinalizingProgress(
          Math.max(0, Math.min(100, matchingJob.progress ?? 0))
        );

        setFinalizingStatus(
          matchingJob.status === "failed"
            ? matchingJob.error ||
                "Finalization failed. Please try again or reopen the submission later."
            : matchingJob.status || null
        );

        if (matchingJob.status === "done") {
          setUploadPhase("completed");
          setSubmitMsg(
            "Submission uploaded successfully. Finalization is complete."
          );
          setFinalizingProgress(100);
          setActiveJobSubmissionId(null);
          setActiveJobKey(null);

          if (!selectedId) {
            await loadList(true, true);
            return;
          }

          clearAssignmentDetailCache(selectedId);
          const d = await refreshAssignmentDetail(selectedId);

          if (!stopped && d) {
            setDetail(d);
            await loadList(true, true);
          }

          return;
        }

        if (matchingJob.status === "failed") {
          setUploadPhase("failed");
          setSubmitMsg(
            matchingJob.error ||
              "Submission uploaded, but server-side finalization failed. The failed attempt will not count, so you can retry."
          );
          setActiveJobSubmissionId(null);
          setActiveJobKey(null);

          if (!selectedId) {
            await loadList(true, true);
            return;
          }

          clearAssignmentDetailCache(selectedId);
          const d = await refreshAssignmentDetail(selectedId);

          if (!stopped && d) {
            setDetail(d);
            await loadList(true, true);
          }
        }
      } catch {
        // Keep last visible state; transient polling errors should not break the upload UI.
      }
    };

    void poll();

    const timer = window.setInterval(() => {
      void poll();
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    activeJobSubmissionId,
    activeJobKey,
    ident,
    realtimeConnected,
    selectedId,
    loadList,
    clearAssignmentDetailCache,
    refreshAssignmentDetail,
  ]);

  const submitPdf = async () => {
    if (!ident || !selectedId) return;

    if (!detail?.can_submit) {
      setSubmitMsg(
        detail?.submission_closed_reason ||
          (detail?.attempts_left === 0
            ? "No attempts left for this assignment."
            : "This submission is closed.")
      );
      return;
    }

    if (!file) {
      setSubmitMsg("Please choose a PDF file first.");
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setSubmitMsg("Only PDF files are allowed.");
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadTotalBytes(file.size || null);
    setUploadPhase("uploading");
    setFinalizingProgress(0);
    setFinalizingStatus(null);
    setActiveJobSubmissionId(null);
    setActiveJobKey(null);
    setUploadDisplayName(file.name);

    try {
      const presign = await api<PresignResponse>(
        `/student/${ident}/submissions/presign`,
        {
          method: "POST",
          body: {
            class_id: detail?.class.id,
            assignment_id: selectedId,
            filename: file.name,
            content_type: file.type || "application/pdf",
          },
        }
      );

      await uploadToPresignedPost(
        presign.upload,
        file,
        ({ loaded, total, percent }) => {
          setUploadedBytes(loaded);
          setUploadTotalBytes(total ?? file.size ?? null);
          setUploadProgress(percent);

          if (percent >= 100) {
            setUploadPhase("waiting");
          }
        }
      );

      const response = await api<SubmitAssignmentResponse>(
        `/student/${ident}/submissions/finalize`,
        {
          method: "POST",
          body: {
            class_id: detail?.class.id,
            assignment_id: selectedId,
            filename: file.name,
            content_type: file.type || "application/pdf",
            file_size: file.size,
            s3_bucket: presign.bucket,
            s3_key: presign.key,
          },
        }
      );

      setUploadedBytes(file.size);
      setUploadTotalBytes(file.size);
      setUploadProgress(100);

      if (response.ok === false || response.integrity_job_status === "failed") {
        setUploadPhase("failed");
        setFinalizingProgress(100);
        setFinalizingStatus("failed");
        setSubmitMsg(
          response.error ||
            "Finalization failed. Please try again or reopen the submission later."
        );
        setActiveJobSubmissionId(response.submission_id ?? null);
        setActiveJobKey(response.idempotency_key ?? null);
      } else {
        setUploadPhase("processing");
        setSubmitMsg(
          "Upload complete. Server-side finalization has started. You can close this page now."
        );
        setFinalizingProgress(
          Math.max(0, Math.min(100, response.integrity_job_progress ?? 0))
        );
        setFinalizingStatus(response.integrity_job_status || "queued");
        setActiveJobSubmissionId(response.submission_id);
        setActiveJobKey(response.idempotency_key);
      }

      clearAssignmentDetailCache(selectedId);
      const d = await refreshAssignmentDetail(selectedId);
      if (d) setDetail(d);
      await loadList(true, true);
      setFile(null);
    } catch (e: any) {
      setUploadPhase("failed");
      setFinalizingStatus(null);
      setSubmitMsg(e?.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const latestSubmission = useMemo(
    () => detail?.latest_submission ?? detail?.submission ?? null,
    [detail]
  );

  const assignmentFilterDefinitions = useMemo<
    FilterDefinition<AssignmentListItem>[]
  >(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder:
          "Search by assignment name, class code, unit, lecturer or due date",
        match: (item, value) => {
          const q = value.toLowerCase();

          return [
            item.title,
            item.classCode,
            item.className,
            item.instructor || "",
            item.due,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        },
      },
      {
        key: "classCode",
        label: "Class / unit",
        type: "select",
        options: classes.map((c) => ({
          value: c.code,
          label: `${c.code} - ${c.title}`,
        })),
        getValue: (item) => item.classCode,
      },
      {
        key: "lecturer",
        label: "Lecturer",
        type: "select",
        options: Array.from(
          new Set(classes.map((c) => c.instructor).filter(Boolean))
        ).map((name) => ({ value: name, label: name })),
        getValue: (item) => item.instructor || "",
      },
      {
        key: "status",
        label: "Submission status",
        type: "select",
        options: [
          { value: "pending", label: "Pending" },
          { value: "submitted", label: "Submitted" },
        ],
        getValue: (item) => item.status,
      },
      {
        key: "dueWindow",
        label: "Due time",
        type: "select",
        options: [
          { value: "today", label: "Due today" },
          { value: "tomorrow", label: "Due tomorrow" },
          { value: "thisWeek", label: "Due this week" },
          { value: "upcoming", label: "Upcoming" },
          { value: "overdue", label: "Overdue" },
        ],
        match: (item, value) => {
          const dueDate = item.due ? new Date(`${item.due}T23:59:59`) : null;

          if (!dueDate || Number.isNaN(dueDate.getTime())) return false;

          const today = new Date();
          const startOfToday = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
          );
          const startOfTomorrow = new Date(startOfToday);
          startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

          const endOfTomorrow = new Date(startOfTomorrow);
          endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

          const endOfWeek = new Date(startOfToday);
          endOfWeek.setDate(endOfWeek.getDate() + 7);

          if (value === "today") {
            return dueDate >= startOfToday && dueDate < startOfTomorrow;
          }

          if (value === "tomorrow") {
            return dueDate >= startOfTomorrow && dueDate < endOfTomorrow;
          }

          if (value === "thisWeek") {
            return dueDate >= startOfToday && dueDate < endOfWeek;
          }

          if (value === "overdue") {
            return dueDate < startOfToday;
          }

          if (value === "upcoming") {
            return dueDate >= startOfToday;
          }

          return true;
        },
      },
      {
        key: "sortOrder",
        label: "Order",
        type: "select",
        options: [
          { value: "dueSoon", label: "Due date: nearest first" },
          { value: "dueLater", label: "Due date: farthest first" },
          { value: "titleAZ", label: "Assignment name: A to Z" },
          { value: "titleZA", label: "Assignment name: Z to A" },
        ],
        match: () => true,
      },
    ],
    [classes]
  );

  const sortOrder =
    filters.find((rule) => rule.fieldKey === "sortOrder")?.value || "";

  const activeFilterRules = useMemo(
    () => filters.filter((rule) => rule.fieldKey !== "sortOrder"),
    [filters]
  );

  useEffect(() => {
    setVisibleAssignmentCount(12);
  }, [filters, assignments.length]);

  const filteredAssignments = useMemo(() => {
    const filtered = applyFilters(
      assignments,
      activeFilterRules,
      assignmentFilterDefinitions
    );

    const items = [...filtered];

    const safeDueValue = (value: string) => {
      const t = value
        ? new Date(`${value}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;

      return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };

    if (sortOrder === "dueSoon") {
      items.sort((a, b) => safeDueValue(a.due) - safeDueValue(b.due));
    } else if (sortOrder === "dueLater") {
      items.sort((a, b) => safeDueValue(b.due) - safeDueValue(a.due));
    } else if (sortOrder === "titleAZ") {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOrder === "titleZA") {
      items.sort((a, b) => b.title.localeCompare(a.title));
    }

    return items;
  }, [
    assignments,
    activeFilterRules,
    assignmentFilterDefinitions,
    sortOrder,
  ]);

  const visibleAssignments = filteredAssignments.slice(0, visibleAssignmentCount);
  const hasMoreAssignments = visibleAssignments.length < filteredAssignments.length;

  const showUploadProgress =
    submitting ||
    uploadProgress > 0 ||
    uploadPhase === "processing" ||
    uploadPhase === "completed" ||
    uploadPhase === "failed";

  const attemptsLeft = Math.max(0, Number(detail?.attempts_left ?? 0));
  const canSubmit = Boolean(detail?.can_submit);

  const attemptsLeftLabel =
    attemptsLeft === 0
      ? "No attempts left"
      : attemptsLeft === 1
      ? "1 attempt left"
      : `${attemptsLeft} attempts left`;

  const submissionClosedLabel =
    detail?.locked_by_marking
      ? "Marked submission locked"
      : attemptsLeft === 0
      ? "Submission closed"
      : "Resubmission closed";

  const latestSubmissionFailed =
    String(latestSubmission?.status || latestSubmission?.integrity_status || "").toLowerCase() ===
      "failed" || Boolean(latestSubmission?.error);

  const openMarkedReport = (submissionId?: number | null) => {
    if (!submissionId) return;

    close();
    navigate(`/student/reports?tab=feedback&submission_id=${submissionId}&open=1`);
  };

  return (
    <div className="space-y-5">
      <StudentAssignmentCardCSS />

      <h1 className="eg-title">Assignments</h1>

      <FilterBuilder
        title="Assignment filters"
        subtitle="Combine class, lecturer, status and due-time filters. Search updates the list live while you type."
        fields={assignmentFilterDefinitions}
        rules={filters}
        onChange={setFilters}
        onAdd={() =>
          setFilters((prev) => [
            ...prev,
            createFilterRule<AssignmentListItem>(assignmentFilterDefinitions),
          ])
        }
        onClear={() => setFilters([])}
        quickFieldKey="keyword"
        quickPlaceholder="Search assignments, unit code, lecturer or due date"
      />

      {err && <div className="text-sm text-red-600">{err}</div>}

      {loading && <div className="text-sm text-slate-500">Loading assignments…</div>}

      {loading && assignments.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProgressiveCardSkeleton count={4} />
        </div>
      ) : !loading && filteredAssignments.length === 0 ? (
        <AssignmentCard status="pending">
          <div className="font-semibold text-slate-900">
            {assignments.length === 0
              ? "No assignments yet."
              : "No assignments match the current filters."}
          </div>

          <div className="mt-1 text-sm text-slate-600">
            {assignments.length === 0
              ? "Join a class and wait for your lecturer to post assignments."
              : "Try removing one or more filters to see more assignments."}
          </div>
        </AssignmentCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {visibleAssignments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openAssignment(a.id)}
              className="text-left"
            >
              <AssignmentCard status={a.status}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">
                      {a.title}
                    </div>

                    <div className="mt-0.5 text-sm text-slate-600">
                      {a.classCode} • {a.className}
                    </div>

                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">Due:</span>{" "}
                      <span className="font-medium text-slate-800">
                        {a.due || "-"}
                      </span>
                    </div>

                    {a.has_marked_report && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        Marked: {a.mark_score ?? "-"}
                        {typeof a.mark_max_score === "number"
                          ? ` / ${a.mark_max_score}`
                          : ""}
                      </div>
                    )}
                  </div>

                  <span
                    className={[
                      "student-status-pill rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                      a.status === "submitted"
                        ? "border border-emerald-200/70 bg-emerald-100 text-emerald-700"
                        : "border border-amber-200/70 bg-amber-100 text-amber-800",
                    ].join(" ")}
                  >
                    {a.status}
                  </span>
                </div>

                <div className="mt-4 text-sm font-semibold text-indigo-600 transition group-hover:translate-x-[2px]">
                  View details →
                </div>
              </AssignmentCard>
            </button>
            ))}
          </div>
          {hasMoreAssignments ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleAssignmentCount((count) => count + 12)}
                className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
              >
                Show more assignments ({filteredAssignments.length - visibleAssignments.length} remaining)
              </button>
            </div>
          ) : null}
        </>
      )}

      <PortalModal
        open={open}
        title="Assignment"
        onClose={close}
        widthClass="max-w-[760px]"
        topClass=""
      >
        <StudentAssignmentModalCSS />

        <div className="student-assignment-upload-modal">
          {detailErr && <div className="text-sm text-red-600">{detailErr}</div>}

          {detailLoading && (
            <div className="text-sm assignment-muted">Loading…</div>
          )}

          {!detailLoading && detail && (
            <div className="space-y-4">
              <div>
                <div className="text-xl font-semibold assignment-title">
                  {detail.title}
                </div>

                <div className="mt-1 text-sm assignment-muted">
                  {detail.class.code} • {detail.class.name}
                </div>

                <div className="mt-1 text-sm assignment-muted">
                  Due: {isoToDate(detail.due_at) || "-"}
                </div>
              </div>

              <div className="assignment-panel rounded-2xl p-4">
                <div className="text-sm font-semibold assignment-title">
                  Instructions
                </div>

                <div className="mt-2 whitespace-pre-wrap text-sm assignment-muted">
                  {detail.description || "No description provided."}
                </div>
              </div>

              <div className="assignment-panel rounded-2xl p-4">
                <div className="text-sm font-semibold assignment-title">
                  Submission
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm assignment-muted">
                  <span>
                    Attempts used: {detail.attempts_used} /{" "}
                    {detail.max_attempts}
                  </span>

                  <span className="text-slate-400">•</span>

                  <span
                    className={
                      attemptsLeft === 0
                        ? "assignment-danger font-semibold text-red-600"
                        : "assignment-success font-medium text-emerald-700"
                    }
                  >
                    {attemptsLeftLabel}
                  </span>

                  <span className="text-slate-400">•</span>

                  <span>
                    {detail.allow_resubmission
                      ? "Resubmission allowed"
                      : "No resubmission"}
                  </span>
                </div>

                {!canSubmit && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {submissionClosedLabel}. {detail?.submission_closed_reason ||
                      (attemptsLeft === 0
                        ? "You have used all allowed attempts."
                        : "Further uploads are not allowed for this assignment.")}
                  </div>
                )}

                {latestSubmissionFailed && canSubmit && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    The previous upload could not be finalized, so it was not counted as a valid attempt.
                    {latestSubmission?.error ? ` ${latestSubmission.error}` : " Please upload the PDF again."}
                  </div>
                )}

                {latestSubmission?.download_url ? (
                  <div className="mt-2 text-sm assignment-muted">
                    Last submission:{" "}
                    <a
                      className="text-indigo-600 underline"
                      href={`${API_BASE_URL}${latestSubmission.download_url}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download {latestSubmission.file_name || "submission"}
                    </a>
                  </div>
                ) : (
                  <div className="mt-2 text-sm assignment-muted">
                    No submission uploaded yet.
                  </div>
                )}

                {detail.mark_report ? (
                  <div className="assignment-feedback-card mt-4 rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold assignment-title">
                          Lecturer feedback is available
                        </div>

                        <div className="mt-1 text-sm assignment-muted">
                          Mark:{" "}
                          <span className="font-semibold text-blue-700">
                            {detail.mark_report.score ?? "-"}
                            {typeof detail.mark_report.max_score === "number"
                              ? ` / ${detail.mark_report.max_score}`
                              : ""}
                          </span>
                        </div>

                        {detail.mark_report.general_feedback ? (
                          <div className="mt-2 whitespace-pre-wrap text-sm assignment-muted">
                            {detail.mark_report.general_feedback}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openMarkedReport(detail.mark_report?.submission_id)
                        }
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        View full marked report
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <label className="block text-sm font-medium assignment-title">
                    Upload PDF
                  </label>

                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={submitting || !canSubmit}
                    className="assignment-file-input mt-1 w-full rounded-xl border px-4 py-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] ?? null;
                      setFile(nextFile);
                      setSubmitMsg(null);

                      if (!submitting) {
                        setUploadProgress(0);
                        setUploadedBytes(0);
                        setUploadTotalBytes(nextFile?.size ?? null);
                        setUploadPhase("uploading");
                        setFinalizingProgress(0);
                        setFinalizingStatus(null);
                        setActiveJobSubmissionId(null);
                        setActiveJobKey(null);
                      }
                    }}
                  />

                  {file && (
                    <div className="mt-1 text-xs assignment-muted">
                      Selected: {file.name}
                    </div>
                  )}

                  {!canSubmit && (
                    <div className="mt-1 text-xs text-red-600">
                      {detail?.submission_closed_reason ||
                        "Uploads are disabled because this submission is closed."}
                    </div>
                  )}
                </div>

                {showUploadProgress && (
                  <UploadProgressRing
                    progress={uploadProgress}
                    loadedBytes={uploadedBytes}
                    totalBytes={uploadTotalBytes}
                    phase={uploadPhase}
                    label={
                      uploadDisplayName
                        ? `Uploading ${uploadDisplayName}`
                        : file
                        ? `Uploading ${file.name}`
                        : "Uploading PDF"
                    }
                    finalizingProgress={finalizingProgress}
                    finalizingStatus={finalizingStatus}
                  />
                )}

                {submitMsg && (
                  <div className="mt-3 text-sm assignment-muted">
                    {submitMsg}
                  </div>
                )}

                <div className="assignment-actions sticky bottom-0 -mx-4 mt-4 flex flex-wrap justify-end gap-3 px-4 py-3 sm:-mx-4">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={submitPdf}
                    disabled={submitting || !canSubmit}
                    className={[
                      "rounded-full px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-70",
                      canSubmit
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-red-600 hover:bg-red-600",
                    ].join(" ")}
                  >
                    {submitting
                      ? uploadPhase === "waiting" ||
                        uploadPhase === "processing"
                        ? "Finalizing..."
                        : "Uploading..."
                      : canSubmit
                      ? detail?.attempts_used && detail.attempts_used > 0
                        ? "Re-submit"
                        : "Submit"
                      : "Closed"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PortalModal>
    </div>
  );
}
