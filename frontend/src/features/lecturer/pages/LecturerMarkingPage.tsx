import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api, API_BASE_URL } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import { applyFilters, type FilterDefinition, type FilterRule } from "@/shared/lib/filtering";
import { renderMarkedReportHighlights, type MarkAnnotationHighlight } from "@/shared/lib/reportHighlight";

type LecturerClass = {
  id: number;
  name: string;
  code: string;
};

type MarkingQueueItem = {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  class_code: string;
  class_name: string;
  student_username: string;
  submitted_at: string;
  plagiarism_percent: number | null;
  ai_detected?: boolean;
  ai_risk_percent?: number | null;
  ai_risk_level?: string | null;
  mark_status?: "new" | "draft" | "published";
  mark_score?: number | null;
  mark_max_score?: number | null;
  mark_published_to_student?: boolean;
  mark_updated_at?: string | null;
  hasFile?: boolean;
  fileName?: string | null;
  fileUrl?: string | null;
};

type MarkingResponse = {
  submission_id: number;
  text: string;
  original_file_url?: string | null;
  mark_report?: {
    id: number;
    score?: number | null;
    max_score?: number | null;
    general_feedback?: string | null;
    published_to_student: boolean;
    generated_pdf_path?: string | null;
    annotation_count?: number;
    annotations?: MarkAnnotationHighlight[];
  } | null;
};

type DraftAnnotation = MarkAnnotationHighlight & { tempId: string };

const MARKING_PAGE_SIZE = 36;

function statusBadge(status: MarkingQueueItem["mark_status"]) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusLabel(status: MarkingQueueItem["mark_status"]) {
  if (status === "published") return "Published";
  if (status === "draft") return "Draft saved";
  return "New to mark";
}

function AiBadge({ item }: { item: MarkingQueueItem }) {
  const pct = typeof item.ai_risk_percent === "number" ? item.ai_risk_percent : item.ai_detected ? 70 : 0;
  const tone = pct >= 70 ? "border-rose-200 bg-rose-50 text-rose-700" : pct >= 40 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>AI risk {Math.round(pct)}%</span>;
}

function ScorePill({ score, maxScore }: { score?: number | null; maxScore?: number | null }) {
  if (score == null) return null;
  return (
    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
      Mark {score}{typeof maxScore === "number" ? ` / ${maxScore}` : ""}
    </span>
  );
}

function getGroupCounts(rows: MarkingQueueItem[]) {
  return rows.reduce(
    (acc, row) => {
      const status = row.mark_status || "new";
      if (status === "published") acc.published += 1;
      else if (status === "draft") acc.draft += 1;
      else acc.new += 1;
      return acc;
    },
    { new: 0, draft: 0, published: 0 }
  );
}

function getGroupAccent(index: number) {
  const palettes = [
    {
      shell: "from-indigo-500/16 via-sky-400/10 to-cyan-300/16",
      border: "border-indigo-200/80",
      line: "from-indigo-500 via-blue-500 to-cyan-400",
      icon: "from-indigo-500 to-blue-600",
      glow: "bg-indigo-400/20",
    },
    {
      shell: "from-violet-500/16 via-fuchsia-400/10 to-rose-300/14",
      border: "border-violet-200/80",
      line: "from-violet-500 via-fuchsia-500 to-rose-400",
      icon: "from-violet-500 to-fuchsia-600",
      glow: "bg-fuchsia-400/18",
    },
    {
      shell: "from-emerald-500/14 via-teal-400/10 to-sky-300/16",
      border: "border-emerald-200/80",
      line: "from-emerald-500 via-teal-500 to-sky-400",
      icon: "from-emerald-500 to-teal-600",
      glow: "bg-emerald-400/18",
    },
    {
      shell: "from-amber-500/16 via-orange-400/10 to-pink-300/14",
      border: "border-amber-200/80",
      line: "from-amber-500 via-orange-500 to-pink-400",
      icon: "from-amber-500 to-orange-600",
      glow: "bg-amber-400/18",
    },
  ];

  return palettes[index % palettes.length];
}


/* ------------------- targeted dark-mode readability helpers ------------------- */
const LECTURER_THEME_KEY = "eduguard.lecturer.theme";
const LECTURER_THEME_EVENT = "eduguard:lecturer-theme-change";
const STUDENT_THEME_KEY = "eduguard.student.theme";
const STUDENT_THEME_EVENT = "eduguard:student-theme-change";

function normalizeThemeValue(value: string | null | undefined): "dark" | "light" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();

  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";

  return null;
}

function resolveIsDarkMode() {
  if (typeof window === "undefined") return false;

  const doc = document.documentElement;
  const body = document.body;

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(body.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-theme")) ??
    normalizeThemeValue(body.getAttribute("data-theme")) ??
    normalizeThemeValue(window.localStorage.getItem(LECTURER_THEME_KEY)) ??
    normalizeThemeValue(window.localStorage.getItem(STUDENT_THEME_KEY)) ??
    normalizeThemeValue(window.localStorage.getItem("eduguard.theme")) ??
    normalizeThemeValue(window.localStorage.getItem("theme"));

  if (explicitTheme) return explicitTheme === "dark";

  return (
    doc.classList.contains("dark") ||
    body.classList.contains("dark") ||
    doc.classList.contains("dark-mode") ||
    body.classList.contains("dark-mode")
  );
}

function LocalMarkingCSS() {
  return (
    <style>{`
      .marking-theme-light .marking-stat-label,
      .marking-theme-light .marking-stat-number,
      .marking-theme-light .marking-report-name {
        color: rgba(15, 23, 42, 0.96) !important;
      }

      .marking-theme-dark .marking-stat-label,
      .marking-theme-dark .marking-stat-number,
      .marking-theme-dark .marking-report-name {
        color: rgba(248, 250, 252, 0.98) !important;
        text-shadow: 0 1px 12px rgba(0, 0, 0, 0.36);
      }

      .marking-theme-dark .marking-modal-surface,
      body.marking-modal-force-dark .marking-modal-surface {
        background: rgba(10, 18, 34, 0.94) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
      }

      .marking-theme-dark .marking-modal-title,
      .marking-theme-dark .marking-modal-heading,
      body.marking-modal-force-dark .marking-modal-title,
      body.marking-modal-force-dark .marking-modal-heading {
        color: rgba(248, 250, 252, 0.98) !important;
        text-shadow: 0 1px 14px rgba(0, 0, 0, 0.35);
      }

      .marking-theme-dark .marking-modal-muted,
      body.marking-modal-force-dark .marking-modal-muted {
        color: rgba(203, 213, 225, 0.90) !important;
      }

      .marking-theme-dark .marking-modal-input,
      .marking-theme-dark .marking-modal-textarea,
      body.marking-modal-force-dark .marking-modal-input,
      body.marking-modal-force-dark .marking-modal-textarea {
        background: rgba(15, 23, 42, 0.76) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        color: rgba(248, 250, 252, 0.96) !important;
      }

      .marking-theme-dark .marking-modal-input::placeholder,
      .marking-theme-dark .marking-modal-textarea::placeholder,
      body.marking-modal-force-dark .marking-modal-input::placeholder,
      body.marking-modal-force-dark .marking-modal-textarea::placeholder {
        color: rgba(148, 163, 184, 0.82) !important;
      }

      .marking-theme-dark .marking-modal-soft-box,
      body.marking-modal-force-dark .marking-modal-soft-box {
        background: rgba(15, 23, 42, 0.68) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        color: rgba(226, 232, 240, 0.96) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal {
        color: rgba(226, 232, 240, 0.96) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        background: #071120 !important;
        box-shadow: 0 34px 100px rgba(0, 0, 0, 0.58) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal-header {
        background: #081426 !important;
        border-bottom-color: rgba(148, 163, 184, 0.18) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal-title {
        color: rgba(248, 250, 252, 0.98) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal-close {
        color: rgba(203, 213, 225, 0.94) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal-close:hover {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.08) !important;
      }

      body.marking-modal-force-dark .eg-portal-modal-body {
        background:
          radial-gradient(circle at top left, rgba(99, 102, 241, 0.10), transparent 34%),
          radial-gradient(circle at top right, rgba(34, 211, 238, 0.08), transparent 30%),
          linear-gradient(180deg, #0b1728 0%, #081120 100%) !important;
        color: rgba(226, 232, 240, 0.96) !important;
        scrollbar-color: rgba(148, 163, 184, 0.48) transparent !important;
      }

      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-950,
      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-900,
      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-800,
      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-700 {
        color: rgba(248, 250, 252, 0.98) !important;
      }

      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-600,
      body.marking-modal-force-dark [data-eg-modal="true"] .text-slate-500 {
        color: rgba(203, 213, 225, 0.88) !important;
      }

      body.marking-modal-force-dark .marking-modal-blue-panel {
        background: linear-gradient(135deg, rgba(30, 64, 175, 0.20), rgba(8, 145, 178, 0.12)) !important;
        border-color: rgba(96, 165, 250, 0.28) !important;
      }

      body.marking-modal-force-dark .marking-modal-accent-text {
        color: rgba(147, 197, 253, 0.98) !important;
      }

      body.marking-modal-force-dark .marking-modal-count-badge,
      body.marking-modal-force-dark .marking-modal-small-badge {
        background: rgba(37, 99, 235, 0.16) !important;
        border-color: rgba(96, 165, 250, 0.30) !important;
        color: rgba(191, 219, 254, 0.98) !important;
        box-shadow: none !important;
      }

      body.marking-modal-force-dark .marking-modal-secondary-button {
        background: rgba(15, 23, 42, 0.72) !important;
        border-color: rgba(148, 163, 184, 0.30) !important;
        color: rgba(226, 232, 240, 0.96) !important;
        box-shadow: none !important;
      }

      body.marking-modal-force-dark .marking-modal-secondary-button:hover {
        background: rgba(30, 41, 59, 0.92) !important;
      }
    `}</style>
  );
}

export default function LecturerMarkingPage() {
  const auth = useSelector((s: RootState) => s.auth) as { userId?: string; username?: string; email?: string };
  const username = auth?.username || auth?.userId || (auth?.email ? String(auth.email).split("@")[0] : "");
  const [isDarkMode, setIsDarkMode] = useState(resolveIsDarkMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(resolveIsDarkMode());

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === LECTURER_THEME_KEY ||
        event.key === STUDENT_THEME_KEY ||
        event.key === "eduguard.theme" ||
        event.key === "theme"
      ) {
        syncTheme();
      }
    };

    const onThemeEvent = () => syncTheme();

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "data-theme", "class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "data-theme", "class"],
    });

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, onThemeEvent as EventListener);
    window.addEventListener(STUDENT_THEME_EVENT, onThemeEvent as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LECTURER_THEME_EVENT, onThemeEvent as EventListener);
      window.removeEventListener(STUDENT_THEME_EVENT, onThemeEvent as EventListener);
    };
  }, []);

  const [classes, setClasses] = useState<LecturerClass[]>([]);
  const [items, setItems] = useState<MarkingQueueItem[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [visibleItemCount, setVisibleItemCount] = useState(18);
  const [hasMoreRemoteItems, setHasMoreRemoteItems] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MarkingQueueItem | null>(null);
  const [markingText, setMarkingText] = useState("");
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([]);
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [publishToStudent, setPublishToStudent] = useState(true);
  const [selectedText, setSelectedText] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [markedPdfUrl, setMarkedPdfUrl] = useState<string | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const className = "marking-modal-force-dark";

    if (open && isDarkMode) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }

    return () => {
      document.body.classList.remove(className);
    };
  }, [open, isDarkMode]);

  const loadAll = async (silent = false) => {
    if (!username) return;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }

    try {
      const classPromise = api<any[]>(`/lecturer/${username}/classes`);
      const reportPromise = api<MarkingQueueItem[]>(
        `/lecturer/${username}/reports?limit=${MARKING_PAGE_SIZE}&offset=0`
      );

      const classRows = await classPromise.catch(() => []);
      setClasses((classRows ?? []).map((item) => ({ id: item.id, name: item.name ?? item.title, code: item.code })));

      const reportRows = await reportPromise;
      const rows = reportRows ?? [];
      setItems(rows);
      setHasMoreRemoteItems(rows.length === MARKING_PAGE_SIZE);
      if (silent) setErr(null);
    } catch (e: any) {
      if (!silent) setErr(e?.message || "Failed to load marking queue");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadAll(true);
    }, 12000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const filterDefinitions = useMemo<FilterDefinition<MarkingQueueItem>[]>(() => [
    {
      key: "keyword",
      label: "Search",
      type: "text",
      hidden: true,
      placeholder: "Search by assignment, student or class",
      match: (item, value) => {
        const q = value.toLowerCase();
        return [item.assignment_title, item.student_username, item.class_code, item.class_name].join(" ").toLowerCase().includes(q);
      },
    },
    {
      key: "classCode",
      label: "Class",
      type: "select",
      options: classes.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` })),
      getValue: (item) => item.class_code,
    },
    {
      key: "status",
      label: "Marking status",
      type: "select",
      options: [
        { value: "new", label: "New to mark" },
        { value: "draft", label: "Draft saved" },
        { value: "published", label: "Published to students" },
      ],
      getValue: (item) => item.mark_status || "new",
    },
    {
      key: "sort",
      label: "Order",
      type: "select",
      options: [
        { value: "newest", label: "Newest submissions first" },
        { value: "oldest", label: "Oldest submissions first" },
        { value: "assignmentAZ", label: "Assignment name: A to Z" },
        { value: "studentAZ", label: "Student: A to Z" },
      ],
      match: () => true,
    },
  ], [classes]);

  const sortOrder = filters.find((rule) => rule.fieldKey === "sort")?.value || "newest";
  const activeFilters = useMemo(() => filters.filter((rule) => rule.fieldKey !== "sort"), [filters]);

  const filteredItems = useMemo(() => {
    const filtered = applyFilters(items, activeFilters, filterDefinitions);
    const copy = [...filtered];
    const safeTime = (iso?: string | null) => {
      const value = new Date(iso || 0).getTime();
      return Number.isNaN(value) ? 0 : value;
    };
    copy.sort((a, b) => {
      if (sortOrder === "oldest") return safeTime(a.submitted_at) - safeTime(b.submitted_at);
      if (sortOrder === "assignmentAZ") return a.assignment_title.localeCompare(b.assignment_title);
      if (sortOrder === "studentAZ") return a.student_username.localeCompare(b.student_username);
      return safeTime(b.submitted_at) - safeTime(a.submitted_at);
    });
    return copy;
  }, [items, activeFilters, filterDefinitions, sortOrder]);
  const visibleFilteredItems = useMemo(
    () => filteredItems.slice(0, visibleItemCount),
    [filteredItems, visibleItemCount]
  );
  const hasMoreItems = visibleFilteredItems.length < filteredItems.length || hasMoreRemoteItems;

  const loadMoreMarkingItems = async () => {
    if (visibleFilteredItems.length < filteredItems.length) {
      setVisibleItemCount((count) => count + 18);
      return;
    }
    if (!username || loading || !hasMoreRemoteItems) return;
    setLoading(true);
    try {
      const rows = await api<MarkingQueueItem[]>(
        `/lecturer/${username}/reports?limit=${MARKING_PAGE_SIZE}&offset=${items.length}`
      );
      const nextRows = rows ?? [];
      setItems((prev) => [...prev, ...nextRows]);
      setVisibleItemCount((count) => count + 18);
      setHasMoreRemoteItems(nextRows.length === MARKING_PAGE_SIZE);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load more submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setVisibleItemCount(18);
  }, [filters, items.length]);

  const groupedItems = useMemo(() => {
    const buckets = new Map<string, { title: string; rows: MarkingQueueItem[] }>();
    for (const item of visibleFilteredItems) {
      const key = item.class_code || "Unknown";
      if (!buckets.has(key)) {
        buckets.set(key, { title: `${item.class_code} - ${item.class_name}`, rows: [] });
      }
      buckets.get(key)!.rows.push(item);
    }
    return Array.from(buckets.entries()).map(([key, value]) => ({ key, ...value }));
  }, [visibleFilteredItems]);

  const groupedKeySignature = groupedItems.map((group) => group.key).join("|");

  useEffect(() => {
    setExpandedGroups((prev) => {
      const validKeys = new Set(groupedItems.map((group) => group.key));
      const next: Record<string, boolean> = {};

      for (const key of Object.keys(prev)) {
        if (validKeys.has(key)) next[key] = prev[key];
      }

      if (groupedItems.length > 0 && !groupedItems.some((group) => next[group.key])) {
        next[groupedItems[0].key] = true;
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedKeySignature]);

  const queueSummary = useMemo(() => {
    const counts = getGroupCounts(filteredItems);
    return {
      total: filteredItems.length,
      classes: groupedItems.length,
      ...counts,
    };
  }, [filteredItems, groupedItems.length]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const openMarking = async (item: MarkingQueueItem) => {
    setSelected(item);
    setOpen(true);
    setDetailLoading(true);
    setDetailErr(null);
    setMarkedPdfUrl(item.mark_status && item.mark_status !== "new" ? `${API_BASE_URL}/lecturer/${username}/submissions/${item.submission_id}/marked-report/pdf` : null);
    try {
      const data = await api<MarkingResponse>(`/lecturer/${username}/submissions/${item.submission_id}/marking`);
      setMarkingText(data?.text || "");
      const report = data?.mark_report;
      const reportAnnotations = (report?.annotations || []).map((annotation, index) => ({
        ...annotation,
        tempId: annotation.id ? `saved-${annotation.id}` : `saved-${index}`,
      }));
      setAnnotations(reportAnnotations);
      setScore(report?.score != null ? String(report.score) : "");
      setMaxScore(report?.max_score != null ? String(report.max_score) : "100");
      setGeneralFeedback(report?.general_feedback || "");
      setPublishToStudent(Boolean(report?.published_to_student ?? true));
    } catch (e: any) {
      setDetailErr(e?.message || "Failed to load marking workspace");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setSelected(null);
    setMarkingText("");
    setAnnotations([]);
    setScore("");
    setMaxScore("100");
    setGeneralFeedback("");
    setPublishToStudent(true);
    setSelectedText("");
    setCommentDraft("");
    setDetailErr(null);
    setMarkedPdfUrl(null);
  };

  const captureSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
    if (!text) return;
    if (selectionRef.current && sel?.anchorNode && !selectionRef.current.contains(sel.anchorNode)) return;
    setSelectedText(text);
  };

  const addAnnotation = () => {
    const trimmedText = selectedText.trim();
    const trimmedComment = commentDraft.trim();
    if (!trimmedText || !trimmedComment) return;
    setAnnotations((prev) => [
      ...prev,
      {
        tempId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        order_no: prev.length + 1,
        selected_text: trimmedText,
        comment: trimmedComment,
        annotation_color: "blue",
      },
    ]);
    setSelectedText("");
    setCommentDraft("");
    const selection = window.getSelection();
    selection?.removeAllRanges();
  };

  const removeAnnotation = (tempId: string) => {
    setAnnotations((prev) => prev.filter((item) => item.tempId !== tempId).map((item, index) => ({ ...item, order_no: index + 1 })));
  };

  const saveMarking = async () => {
    if (!selected || !username) return;
    setSaving(true);
    setDetailErr(null);
    try {
      await api(`/lecturer/${username}/submissions/${selected.submission_id}/marking`, {
        method: "PUT",
        body: {
          score: score.trim() ? Number(score) : null,
          max_score: maxScore.trim() ? Number(maxScore) : null,
          general_feedback: generalFeedback.trim() || null,
          published_to_student: publishToStudent,
          annotations: annotations.map((item, index) => ({
            order_no: index + 1,
            selected_text: item.selected_text,
            comment: item.comment,
          })),
        },
      });
      setMarkedPdfUrl(`${API_BASE_URL}/lecturer/${username}/submissions/${selected.submission_id}/marked-report/pdf`);
      await loadAll(true);
      const refreshed = items.find((item) => item.submission_id === selected.submission_id);
      if (refreshed) {
        setSelected({
          ...refreshed,
          mark_status: publishToStudent ? "published" : "draft",
          mark_score: score.trim() ? Number(score) : null,
          mark_max_score: maxScore.trim() ? Number(maxScore) : null,
        });
      }
    } catch (e: any) {
      setDetailErr(e?.message || "Failed to save marking");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${isDarkMode ? "marking-theme-dark" : "marking-theme-light"} mx-auto max-w-7xl px-6 py-8`}>
      <LocalMarkingCSS />
      <section className="relative overflow-hidden rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-violet-300/20 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-indigo-500">Lecturer workspace</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Marking</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Click a class to expand its submissions.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[34rem]">
            <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/70 px-4 py-3 shadow-sm backdrop-blur-xl">
              <p className="marking-stat-label text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-500">Total</p>
              <p className="marking-stat-number mt-1 text-2xl font-black text-slate-950">{queueSummary.total}</p>
            </div>
            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 shadow-sm backdrop-blur-xl">
              <p className="marking-stat-label text-[10px] font-bold uppercase tracking-[0.22em] text-sky-500">Classes</p>
              <p className="marking-stat-number mt-1 text-2xl font-black text-slate-950">{queueSummary.classes}</p>
            </div>
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 shadow-sm backdrop-blur-xl">
              <p className="marking-stat-label text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">To mark</p>
              <p className="marking-stat-number mt-1 text-2xl font-black text-slate-950">{queueSummary.new}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/75 px-4 py-3 shadow-sm backdrop-blur-xl">
              <p className="marking-stat-label text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-600">Marked</p>
              <p className="marking-stat-number mt-1 text-2xl font-black text-slate-950">{queueSummary.published}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-30 mt-5 overflow-visible rounded-[1.6rem] border border-white/75 bg-white/70 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
        <FilterBuilder
          fields={filterDefinitions}
          rules={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search by assignment, student or class"
        />
      </div>

      {err ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p> : null}
      {loading ? <p className="mt-4 text-sm font-medium text-slate-600">Loading marking queue…</p> : null}

      <div className="mt-6 space-y-5">
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProgressiveCardSkeleton count={4} />
          </div>
        ) : null}

        {!loading && filteredItems.length === 0 ? (
          <div className="rounded-[1.6rem] border border-slate-200 bg-white/75 p-6 text-sm text-slate-600 shadow-sm backdrop-blur-xl">
            No submissions match the current marking filters.
          </div>
        ) : null}

        {groupedItems.map((group, groupIndex) => {
          const counts = getGroupCounts(group.rows);
          const expanded = Boolean(expandedGroups[group.key]);
          const accent = getGroupAccent(groupIndex);

          return (
            <section
              key={group.key}
              className={`relative overflow-hidden rounded-[2rem] border ${accent.border} bg-gradient-to-br ${accent.shell} p-[1px] shadow-[0_24px_80px_rgba(15,23,42,0.08)]`}
            >
              <div className="relative overflow-hidden rounded-[calc(2rem-1px)] bg-white/78 backdrop-blur-2xl">
                <div className={`pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full ${accent.glow} blur-3xl`} />
                <div className={`pointer-events-none absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b ${accent.line}`} />

                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="relative flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/45"
                  aria-expanded={expanded}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${accent.icon} text-base font-black text-white shadow-[0_16px_35px_rgba(79,70,229,0.24)]`}>
                      {group.key.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="marking-report-name truncate text-xl font-black tracking-tight text-slate-950">{group.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {group.rows.length} submission{group.rows.length === 1 ? "" : "s"} • {counts.new} to mark • {counts.draft} draft • {counts.published} published
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden flex-wrap justify-end gap-2 md:flex">
                      <span className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-700">{counts.new} new</span>
                      <span className="rounded-full border border-violet-200 bg-violet-50/90 px-3 py-1 text-xs font-bold text-violet-700">{counts.draft} draft</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-700">{counts.published} marked</span>
                    </div>
                    <span className={`grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white/80 text-lg font-black text-slate-600 shadow-sm transition ${expanded ? "rotate-180" : ""}`}>
                      ˅
                    </span>
                  </div>
                </button>

                {expanded ? (
                  <div className="relative border-t border-white/70 px-5 pb-5 pt-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {group.rows.map((item) => (
                        <div
                          key={item.submission_id}
                          className="group relative overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/72 p-4 shadow-[0_14px_38px_rgba(15,23,42,0.07)] ring-1 ring-white/65 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5 hover:border-indigo-200 hover:bg-white/90 hover:shadow-[0_24px_55px_rgba(79,70,229,0.14)]"
                        >
                          <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-indigo-300/18 blur-2xl transition group-hover:bg-indigo-300/28" />
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="marking-report-name truncate text-lg font-black tracking-tight text-slate-950">{item.assignment_title}</div>
                              <div className="mt-1 text-sm font-medium text-slate-600">Student: {item.student_username}</div>
                              <div className="mt-1 text-sm text-slate-500">Submitted: {item.submitted_at || "-"}</div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(item.mark_status)}`}>{statusLabel(item.mark_status)}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-700">Plagiarism {Math.round(item.plagiarism_percent ?? 0)}%</span>
                            <AiBadge item={item} />
                            <ScorePill score={item.mark_score} maxScore={item.mark_max_score} />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void openMarking(item)}
                              className="rounded-full border border-indigo-300/80 bg-gradient-to-r from-indigo-500/90 to-blue-500/90 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_28px_rgba(59,130,246,0.20)] transition hover:-translate-y-0.5 hover:from-indigo-600 hover:to-blue-600"
                            >
                              {item.mark_status === "new" ? "Mark assignment" : "Continue marking"}
                            </button>
                            {item.fileUrl ? (
                              <a
                                href={`${API_BASE_URL}${item.fileUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white"
                              >
                                Open submitted PDF
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {!loading && hasMoreItems ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreMarkingItems()}
            className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Show more submissions
          </button>
        </div>
      ) : null}

      <PortalModal
        open={open}
        onClose={closeModal}
        title={selected ? `Mark assignment - ${selected.assignment_title}` : "Mark assignment"}
        widthClass="max-w-[96rem]"
      >
        {detailErr ? <p className="text-sm text-red-600">{detailErr}</p> : null}
        {detailLoading ? <p className="text-sm text-slate-600">Loading marking workspace…</p> : null}

        {!detailLoading && selected ? (
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[2rem] border border-indigo-200/70 bg-gradient-to-br from-indigo-500/18 via-sky-400/12 to-cyan-300/18 p-[1px] shadow-[0_24px_75px_rgba(59,130,246,0.16)]">
              <div className="marking-modal-surface relative overflow-hidden rounded-[calc(2rem-1px)] bg-white/86 p-5 backdrop-blur-2xl">
                <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-indigo-400/24 blur-3xl" />
                <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-300/28 blur-3xl" />
                <div className="pointer-events-none absolute bottom-[-5rem] left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-violet-300/20 blur-3xl" />

                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600 shadow-sm backdrop-blur-xl">
                        Marking workspace
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(selected.mark_status)}`}>
                        {statusLabel(selected.mark_status)}
                      </span>
                      <ScorePill score={selected.mark_score} maxScore={selected.mark_max_score} />
                    </div>

                    <h2 className="marking-modal-title truncate text-2xl font-black tracking-tight text-slate-950">
                      {selected.assignment_title}
                    </h2>

                    <div className="marking-modal-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
                      <span>{selected.class_code} • {selected.class_name}</span>
                      <span>Student: {selected.student_username}</span>
                      <span>Submitted: {selected.submitted_at || "-"}</span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-amber-200/90 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">
                        Plagiarism {Math.round(selected.plagiarism_percent ?? 0)}%
                      </span>
                      <AiBadge item={selected} />
                      <span className="rounded-full border border-blue-200/90 bg-blue-50/90 px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">
                        {annotations.length} inline comment{annotations.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-3">
                    {selected.fileUrl ? (
                      <a
                        href={`${API_BASE_URL}${selected.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="marking-modal-secondary-button rounded-full border border-indigo-200/90 bg-white/72 px-4 py-2 text-sm font-bold text-indigo-700 shadow-[0_12px_30px_rgba(79,70,229,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-indigo-50"
                      >
                        Open original PDF
                      </a>
                    ) : null}
                    {markedPdfUrl ? (
                      <a
                        href={markedPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-emerald-300/90 bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_32px_rgba(16,185,129,0.22)] transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-teal-600"
                      >
                        Open marked PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <section className="relative overflow-hidden rounded-[1.8rem] border border-sky-200/75 bg-gradient-to-br from-sky-400/14 via-blue-400/8 to-indigo-400/14 p-[1px] shadow-[0_22px_65px_rgba(59,130,246,0.12)]">
                <div className="marking-modal-surface relative overflow-hidden rounded-[calc(1.8rem-1px)] bg-white/86 p-4 backdrop-blur-2xl">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-300/25 blur-3xl" />
                  <div className="relative mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="marking-modal-heading text-sm font-black uppercase tracking-[0.16em] text-slate-800">Original submission preview</div>
                      <div className="marking-modal-muted mt-1 text-xs text-slate-500">Review the clean PDF here without downloading it.</div>
                    </div>
                    <span className="marking-modal-small-badge hidden rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 text-xs font-bold text-sky-700 sm:inline-flex">
                      PDF view
                    </span>
                  </div>

                  {selected.fileUrl ? (
                    <iframe
                      title="Original submission preview"
                      src={`${API_BASE_URL}${selected.fileUrl}`}
                      className="relative h-[72vh] w-full rounded-2xl border border-slate-200 bg-slate-50 shadow-inner"
                    />
                  ) : (
                    <div className="marking-modal-soft-box rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      PDF preview is unavailable for this submission.
                    </div>
                  )}
                </div>
              </section>

              <div className="space-y-5">
                <section className="relative overflow-hidden rounded-[1.8rem] border border-violet-200/75 bg-gradient-to-br from-violet-500/16 via-blue-400/10 to-cyan-300/14 p-[1px] shadow-[0_22px_65px_rgba(99,102,241,0.14)]">
                  <div className="marking-modal-surface relative overflow-hidden rounded-[calc(1.8rem-1px)] bg-white/88 p-4 backdrop-blur-2xl">
                    <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-violet-300/24 blur-3xl" />
                    <div className="relative flex items-center justify-between gap-3">
                      <div>
                        <div className="marking-modal-heading text-sm font-black uppercase tracking-[0.16em] text-slate-800">Marking workspace</div>
                        <div className="marking-modal-muted mt-1 text-xs text-slate-500">Select text from the extracted submission, then add a lecturer comment to create a blue annotation.</div>
                      </div>
                      <span className="marking-modal-count-badge rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">
                        {annotations.length} comment{annotations.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div
                      ref={selectionRef}
                      onMouseUp={captureSelection}
                      className="marking-modal-soft-box relative mt-3 max-h-[34vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap shadow-inner select-text"
                    >
                      {renderMarkedReportHighlights(markingText || "No extracted text found.", annotations)}
                    </div>

                    <div className="marking-modal-blue-panel relative mt-4 overflow-hidden rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50 via-indigo-50/70 to-cyan-50 p-4 shadow-inner">
                      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-300/24 blur-3xl" />
                      <div className="marking-modal-accent-text relative text-xs font-black uppercase tracking-[0.20em] text-blue-700">Selected text</div>
                      <div className="marking-modal-soft-box relative mt-2 min-h-[56px] rounded-xl border border-white/80 bg-white/76 px-3 py-2 text-sm text-slate-700 shadow-sm backdrop-blur-xl">
                        {selectedText || "Select a sentence or paragraph from the marking workspace to add a comment."}
                      </div>
                      <textarea
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Write lecturer feedback for the selected text"
                        className="marking-modal-textarea relative mt-3 h-24 w-full rounded-2xl border border-blue-200/90 bg-white/86 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                      <div className="relative mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={addAnnotation}
                          disabled={!selectedText.trim() || !commentDraft.trim()}
                          className="rounded-full border border-blue-300/90 bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_rgba(59,130,246,0.22)] transition hover:-translate-y-0.5 hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add inline comment
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <section className="relative overflow-hidden rounded-[1.8rem] border border-emerald-200/75 bg-gradient-to-br from-emerald-400/14 via-teal-300/10 to-cyan-300/14 p-[1px] shadow-[0_20px_60px_rgba(16,185,129,0.12)]">
                    <div className="marking-modal-surface relative overflow-hidden rounded-[calc(1.8rem-1px)] bg-white/88 p-4 backdrop-blur-2xl">
                      <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-emerald-300/24 blur-3xl" />
                      <div className="marking-modal-heading relative text-sm font-black uppercase tracking-[0.16em] text-slate-800">Marks and publishing</div>

                      <div className="relative mt-3 grid grid-cols-2 gap-3">
                        <label className="marking-modal-muted text-sm text-slate-600">
                          <span className="marking-modal-heading mb-1 block font-bold text-slate-700">Score</span>
                          <input
                            type="number"
                            min="0"
                            value={score}
                            onChange={(e) => setScore(e.target.value)}
                            className="marking-modal-input w-full rounded-2xl border border-slate-300 bg-white/88 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                          />
                        </label>
                        <label className="marking-modal-muted text-sm text-slate-600">
                          <span className="marking-modal-heading mb-1 block font-bold text-slate-700">Out of</span>
                          <input
                            type="number"
                            min="0"
                            value={maxScore}
                            onChange={(e) => setMaxScore(e.target.value)}
                            className="marking-modal-input w-full rounded-2xl border border-slate-300 bg-white/88 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                          />
                        </label>
                      </div>

                      <label className="marking-modal-soft-box relative mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-slate-700">
                        <input type="checkbox" checked={publishToStudent} onChange={(e) => setPublishToStudent(e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <span>
                          <span className="marking-modal-heading block font-bold text-slate-800">Publish to students</span>
                          <span className="marking-modal-muted block text-slate-500">Turn this on when the marked report is ready for the student to view in their Lecturer feedback tab.</span>
                        </span>
                      </label>

                      <label className="marking-modal-muted relative mt-4 block text-sm text-slate-600">
                        <span className="marking-modal-heading mb-1 block font-bold text-slate-700">Overall feedback</span>
                        <textarea
                          value={generalFeedback}
                          onChange={(e) => setGeneralFeedback(e.target.value)}
                          placeholder="Add general comments for the full assignment"
                          className="marking-modal-textarea h-28 w-full rounded-2xl border border-slate-300 bg-white/88 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                        />
                      </label>

                      <div className="relative mt-4 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="marking-modal-secondary-button rounded-full border border-slate-200 bg-white/76 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={saveMarking}
                          disabled={saving}
                          className="rounded-full border border-emerald-300/90 bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving ? "Saving…" : publishToStudent ? "Save and publish" : "Save draft"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="relative overflow-hidden rounded-[1.8rem] border border-indigo-200/75 bg-gradient-to-br from-indigo-400/14 via-violet-300/10 to-pink-300/12 p-[1px] shadow-[0_20px_60px_rgba(99,102,241,0.12)]">
                    <div className="marking-modal-surface relative overflow-hidden rounded-[calc(1.8rem-1px)] bg-white/88 p-4 backdrop-blur-2xl">
                      <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-violet-300/24 blur-3xl" />
                      <div className="marking-modal-heading relative text-sm font-black uppercase tracking-[0.16em] text-slate-800">Inline comments</div>
                      <div className="relative mt-3 space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                        {annotations.length === 0 ? (
                          <p className="marking-modal-muted text-sm text-slate-500">No inline comments added yet.</p>
                        ) : (
                          annotations.map((annotation, index) => (
                            <div key={annotation.tempId} className="marking-modal-soft-box rounded-2xl border border-slate-200 bg-slate-50/82 p-3 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-sm">{index + 1}</span>
                                  Inline comment
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAnnotation(annotation.tempId)}
                                  className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-100"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="marking-modal-heading mt-2 text-sm font-bold text-slate-700">{annotation.selected_text}</div>
                              <div className="marking-modal-muted mt-2 text-sm text-slate-600">{annotation.comment}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </PortalModal>
    </div>
  );
}
