import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import PortalModal from "@/shared/components/PortalModal";
import {
  applyFilters,
  createFilterRule,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";

type LecturerClass = {
  id: number;
  name: string;
  code: string;
};

type StudentRow = {
  student_username: string;
  student_email: string;
  class_id: number;
  class_code: string;
  class_name: string;
  submitted_count: number;
  total_assignments: number;
};

type StudentProgress = {
  student_id: number;
  student_username: string;
  student_name: string;
  student_email: string;
  classes: Array<{
    class_id: number;
    class_code: string;
    class_name: string;
    completed_assignments: number;
    total_assignments: number;
    assignments: Array<{
      assignment_id: number;
      title: string;
      due_at?: string | null;
      submitted: boolean;
      attempt_no: number;
      submitted_at?: string | null;
      score?: number | null;
      max_score?: number | null;
      published_feedback: boolean;
    }>;
  }>;
};

type StudentAccent = {
  bar: string;
  ringColor: string;
  overlayLight: string;
  overlayDark: string;
  button: string;
  buttonShadow: string;
};

const THEME_KEYS = ["eduguard.lecturer.theme", "eduguard.student.theme"];
const THEME_EVENTS = [
  "eduguard:lecturer-theme-change",
  "eduguard:student-theme-change",
];

function normalizeThemeValue(value: string | null | undefined): "dark" | "light" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";
  return null;
}

function resolveLecturerDarkMode() {
  if (typeof window === "undefined") return false;

  const doc = document.documentElement;
  const body = document.body;

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(body.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme"));

  if (explicitTheme) return explicitTheme === "dark";

  for (const key of THEME_KEYS) {
    const storedTheme = normalizeThemeValue(window.localStorage.getItem(key));
    if (storedTheme) return storedTheme === "dark";
  }

  return doc.classList.contains("dark") || body.classList.contains("dark");
}

function formatWhen(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function getStudentAccent(index: number): StudentAccent {
  const accents: StudentAccent[] = [
    {
      bar: "linear-gradient(180deg, #6366f1 0%, #22d3ee 100%)",
      ringColor: "#2563eb",
      overlayLight:
        "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.13), transparent 38%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.14), transparent 42%)",
      overlayDark:
        "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.24), transparent 42%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.18), transparent 46%)",
      button: "linear-gradient(135deg, #6366f1 0%, #2563eb 58%, #06b6d4 100%)",
      buttonShadow: "0 14px 34px rgba(59, 130, 246, 0.24)",
    },
    {
      bar: "linear-gradient(180deg, #0ea5e9 0%, #2563eb 100%)",
      ringColor: "#0ea5e9",
      overlayLight:
        "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.13), transparent 38%), radial-gradient(circle at 100% 100%, rgba(37,99,235,0.12), transparent 42%)",
      overlayDark:
        "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.22), transparent 42%), radial-gradient(circle at 100% 100%, rgba(37,99,235,0.18), transparent 46%)",
      button: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 65%, #4f46e5 100%)",
      buttonShadow: "0 14px 34px rgba(37, 99, 235, 0.24)",
    },
    {
      bar: "linear-gradient(180deg, #8b5cf6 0%, #ec4899 100%)",
      ringColor: "#a855f7",
      overlayLight:
        "radial-gradient(circle at 0% 0%, rgba(139,92,246,0.13), transparent 38%), radial-gradient(circle at 100% 100%, rgba(236,72,153,0.10), transparent 42%)",
      overlayDark:
        "radial-gradient(circle at 0% 0%, rgba(139,92,246,0.22), transparent 42%), radial-gradient(circle at 100% 100%, rgba(236,72,153,0.16), transparent 46%)",
      button: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 52%, #ec4899 100%)",
      buttonShadow: "0 14px 34px rgba(139, 92, 246, 0.23)",
    },
    {
      bar: "linear-gradient(180deg, #10b981 0%, #14b8a6 100%)",
      ringColor: "#10b981",
      overlayLight:
        "radial-gradient(circle at 0% 0%, rgba(16,185,129,0.13), transparent 38%), radial-gradient(circle at 100% 100%, rgba(20,184,166,0.12), transparent 42%)",
      overlayDark:
        "radial-gradient(circle at 0% 0%, rgba(16,185,129,0.20), transparent 42%), radial-gradient(circle at 100% 100%, rgba(20,184,166,0.16), transparent 46%)",
      button: "linear-gradient(135deg, #10b981 0%, #059669 58%, #14b8a6 100%)",
      buttonShadow: "0 14px 34px rgba(16, 185, 129, 0.23)",
    },
  ];

  return accents[index % accents.length];
}

function LocalStyles() {
  return (
    <style>{`
      .lecturer-students-page .student-card-title {
        color: rgba(15, 23, 42, 0.96) !important;
      }

      .lecturer-students-page .student-card-meta {
        color: rgba(71, 85, 105, 0.92) !important;
      }

      .lecturer-students-page .student-remove-button {
        color: rgba(51, 65, 85, 0.95) !important;
        background: rgba(255, 255, 255, 0.72) !important;
        border-color: rgba(148, 163, 184, 0.45) !important;
      }

      .lecturer-students-page .student-remove-button:hover {
        color: rgba(190, 18, 60, 0.95) !important;
        background: rgba(255, 241, 242, 0.95) !important;
        border-color: rgba(251, 113, 133, 0.38) !important;
      }

      html[data-lecturer-theme="dark"] .lecturer-students-page .student-card-title,
      body[data-lecturer-theme="dark"] .lecturer-students-page .student-card-title,
      html[data-student-theme="dark"] .lecturer-students-page .student-card-title,
      body[data-student-theme="dark"] .lecturer-students-page .student-card-title,
      html.dark .lecturer-students-page .student-card-title,
      body.dark .lecturer-students-page .student-card-title,
      .lecturer-students-page.students-dark .student-card-title {
        color: rgba(248, 250, 252, 0.98) !important;
        text-shadow: 0 1px 10px rgba(0, 0, 0, 0.28);
      }

      html[data-lecturer-theme="dark"] .lecturer-students-page .student-card-meta,
      body[data-lecturer-theme="dark"] .lecturer-students-page .student-card-meta,
      html[data-student-theme="dark"] .lecturer-students-page .student-card-meta,
      body[data-student-theme="dark"] .lecturer-students-page .student-card-meta,
      html.dark .lecturer-students-page .student-card-meta,
      body.dark .lecturer-students-page .student-card-meta,
      .lecturer-students-page.students-dark .student-card-meta {
        color: rgba(226, 232, 240, 0.88) !important;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.22);
      }

      html[data-lecturer-theme="dark"] .lecturer-students-page .student-remove-button,
      body[data-lecturer-theme="dark"] .lecturer-students-page .student-remove-button,
      html[data-student-theme="dark"] .lecturer-students-page .student-remove-button,
      body[data-student-theme="dark"] .lecturer-students-page .student-remove-button,
      html.dark .lecturer-students-page .student-remove-button,
      body.dark .lecturer-students-page .student-remove-button,
      .lecturer-students-page.students-dark .student-remove-button {
        color: rgba(248, 250, 252, 0.92) !important;
        background: rgba(255, 255, 255, 0.10) !important;
        border-color: rgba(255, 255, 255, 0.18) !important;
      }

      html[data-lecturer-theme="dark"] .lecturer-students-page .student-remove-button:hover,
      body[data-lecturer-theme="dark"] .lecturer-students-page .student-remove-button:hover,
      html[data-student-theme="dark"] .lecturer-students-page .student-remove-button:hover,
      body[data-student-theme="dark"] .lecturer-students-page .student-remove-button:hover,
      html.dark .lecturer-students-page .student-remove-button:hover,
      body.dark .lecturer-students-page .student-remove-button:hover,
      .lecturer-students-page.students-dark .student-remove-button:hover {
        color: rgba(255, 228, 230, 0.98) !important;
        background: rgba(244, 63, 94, 0.16) !important;
        border-color: rgba(251, 113, 133, 0.34) !important;
      }


      .lecturer-students-page .student-card-bottom-progress {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 4px;
        border-radius: 0 999px 999px 0;
        box-shadow: 0 -6px 18px rgba(59, 130, 246, 0.20);
      }

      .lecturer-students-page .student-progress-ring {
        flex-shrink: 0;
      }

      .lecturer-students-page .student-progress-ring-label {
        color: rgba(15, 23, 42, 0.88) !important;
        font-weight: 800;
      }

      html[data-lecturer-theme="dark"] .lecturer-students-page .student-progress-ring-label,
      body[data-lecturer-theme="dark"] .lecturer-students-page .student-progress-ring-label,
      html[data-student-theme="dark"] .lecturer-students-page .student-progress-ring-label,
      body[data-student-theme="dark"] .lecturer-students-page .student-progress-ring-label,
      html.dark .lecturer-students-page .student-progress-ring-label,
      body.dark .lecturer-students-page .student-progress-ring-label,
      .lecturer-students-page.students-dark .student-progress-ring-label {
        color: rgba(248, 250, 252, 0.98) !important;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.30);
      }
    `}</style>
  );
}

function ProgressRing({
  percent,
  color,
  isDarkMode,
}: {
  percent: number;
  color: string;
  isDarkMode: boolean;
}) {
  const size = 52;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.max(0, Math.min(100, percent));
  const strokeDashoffset = circumference - (safePercent / 100) * circumference;

  return (
    <div
      className="student-progress-ring relative grid h-[52px] w-[52px] place-items-center"
      title={`${safePercent}% submitted`}
      aria-label={`${safePercent}% submitted`}
    >
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isDarkMode ? "rgba(255,255,255,0.16)" : "rgba(148,163,184,0.28)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            filter: `drop-shadow(0 0 8px ${color}55)`,
            transition: "stroke-dashoffset 600ms ease",
          }}
        />
      </svg>

      <span className="student-progress-ring-label text-[11px] leading-none">
        {safePercent}%
      </span>
    </div>
  );
}

export default function LecturerStudentsPage() {
  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string;
    username?: string;
    email?: string;
  };

  const username =
    auth?.username ||
    auth?.userId ||
    (auth?.email ? String(auth.email).split("@")[0] : "");

  const [classes, setClasses] = useState<LecturerClass[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(resolveLecturerDarkMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(resolveLecturerDarkMode());

    const onStorage = (event: StorageEvent) => {
      if (!event.key || THEME_KEYS.includes(event.key)) syncTheme();
    };

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
    THEME_EVENTS.forEach((eventName) =>
      window.addEventListener(eventName, syncTheme as EventListener)
    );

    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      THEME_EVENTS.forEach((eventName) =>
        window.removeEventListener(eventName, syncTheme as EventListener)
      );
    };
  }, []);

  const loadAll = async (silent = false) => {
    if (!username) return;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }

    try {
      const cls = await api<any[]>(`/lecturer/${username}/classes`);
      setClasses(
        (cls ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
        }))
      );

      const data = await api<StudentRow[]>(`/lecturer/${username}/students`);
      setStudents(data ?? []);
      if (silent) setErr(null);
    } catch (e: any) {
      if (!silent) setErr(e?.message || "Failed to load students");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // Reload when the authenticated lecturer changes; loadAll is scoped to that identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const studentFilterDefinitions = useMemo<FilterDefinition<StudentRow>[]>(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by class, student username or email",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [
            item.class_code,
            item.class_name,
            item.student_username,
            item.student_email,
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
        options: classes.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` })),
        getValue: (item) => item.class_code,
      },
      {
        key: "progress",
        label: "Submission progress",
        type: "select",
        options: [
          { value: "none", label: "No submissions yet" },
          { value: "partial", label: "Partially submitted" },
          { value: "complete", label: "Fully submitted" },
        ],
        match: (item, value) => {
          if (value === "none") return item.submitted_count === 0;
          if (value === "partial") {
            return item.submitted_count > 0 && item.submitted_count < item.total_assignments;
          }
          if (value === "complete") {
            return item.total_assignments > 0 && item.submitted_count >= item.total_assignments;
          }
          return true;
        },
      },
      {
        key: "studentName",
        label: "Student",
        type: "text",
        placeholder: "Search by username or email",
        match: (item, value) => {
          const q = value.toLowerCase();
          return (
            item.student_username.toLowerCase().includes(q) ||
            item.student_email.toLowerCase().includes(q)
          );
        },
      },
    ],
    [classes]
  );

  const filteredStudents = useMemo(
    () => applyFilters(students, filters, studentFilterDefinitions),
    [students, filters, studentFilterDefinitions]
  );

  const onRemove = async (row: StudentRow) => {
    if (!username) return;
    const ok = confirm(`Remove ${row.student_username} from ${row.class_code}?`);
    if (!ok) return;

    try {
      await api(
        `/lecturer/${username}/classes/${row.class_id}/students/${encodeURIComponent(
          row.student_username
        )}`,
        {
          method: "DELETE",
        }
      );
      await loadAll();
    } catch (e: any) {
      alert(e?.message || "Failed to remove student");
    }
  };

  const openProgress = async (row: StudentRow) => {
    if (!username) return;
    setProgressOpen(true);
    setProgressLoading(true);
    try {
      const data = await api<StudentProgress>(
        `/lecturer/${username}/students/${encodeURIComponent(
          row.student_username
        )}/progress?class_id=${row.class_id}`
      );
      setProgress(data);
    } catch (e: any) {
      alert(e?.message || "Failed to load student progress");
      setProgressOpen(false);
    } finally {
      setProgressLoading(false);
    }
  };

  return (
    <div
      className={`lecturer-students-page ${
        isDarkMode ? "students-dark" : "students-light"
      } mx-auto max-w-6xl px-6 py-8`}
    >
      <LocalStyles />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Students</h1>
        </div>
      </div>

      <div className="mt-4">
        <FilterBuilder
          title="Student filters"
          fields={studentFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onAdd={() =>
            setFilters((prev) => [
              ...prev,
              createFilterRule<StudentRow>(studentFilterDefinitions),
            ])
          }
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search class, username or email"
        />
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600">Loading…</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {!loading && filteredStudents.length === 0 ? (
          <div
            className={[
              "rounded-2xl border p-6 shadow-sm",
              isDarkMode
                ? "border-white/15 bg-white/10 text-slate-100"
                : "border-white/60 bg-white/70 text-slate-700",
            ].join(" ")}
          >
            {students.length === 0
              ? "No students enrolled yet."
              : "No students match the current filters."}
          </div>
        ) : (
          filteredStudents.map((s, i) => {
            const accent = getStudentAccent(i);
            const progressPercent =
              s.total_assignments > 0
                ? Math.min(100, Math.round((s.submitted_count / s.total_assignments) * 100))
                : 0;

            return (
              <div
                key={`${s.class_id}-${s.student_username}`}
                className={[
                  "group relative transform-gpu overflow-hidden rounded-2xl border px-6 pb-7 pt-6 ring-1 transition-all duration-300 ease-out",
                  "hover:-translate-y-[5px] hover:scale-[1.01]",
                  isDarkMode
                    ? "border-white/15 bg-slate-950/55 ring-white/10 shadow-[0_18px_42px_rgba(2,6,23,0.28)] hover:border-white/25 hover:shadow-[0_28px_70px_rgba(2,6,23,0.42)]"
                    : "border-slate-200/75 bg-white/85 ring-black/5 shadow-md hover:border-slate-300/80 hover:shadow-[0_24px_58px_rgba(15,23,42,0.14)]",
                ].join(" ")}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-100"
                  style={{ background: isDarkMode ? accent.overlayDark : accent.overlayLight }}
                />

                <div
                  className="absolute left-0 top-0 h-full w-[6px] rounded-l-2xl"
                  style={{ background: accent.bar }}
                />

                <div
                  className="student-card-bottom-progress"
                  style={{ width: `${progressPercent}%`, background: accent.bar }}
                />

                <div className="relative z-10">
                  <h2 className="student-card-title text-lg font-semibold">
                    {s.student_username}
                  </h2>

                  <div className="student-card-meta mt-2 flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0 space-y-1">
                      <div>
                        {s.class_name} ({s.class_code})
                      </div>
                      <div>
                        {s.submitted_count}/{s.total_assignments} assignments submitted
                      </div>
                    </div>

                    <ProgressRing
                      percent={progressPercent}
                      color={accent.ringColor}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="rounded-full px-4 py-2 font-semibold text-white shadow transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300/60"
                      style={{ background: accent.button, boxShadow: accent.buttonShadow }}
                      onClick={() => void openProgress(s)}
                    >
                      View Progress
                    </button>

                    <button
                      className="student-remove-button rounded-full border px-4 py-2 font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-rose-200/70"
                      onClick={() => void onRemove(s)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <PortalModal
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        title={progress ? `${progress.student_name} · progress` : "Student progress"}
        widthClass="max-w-4xl"
      >
        {progressLoading || !progress ? (
          <div className="text-sm text-slate-600">Loading progress…</div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <span className="text-slate-500">Student:</span> {progress.student_name} (
                {progress.student_username})
              </div>
              <div className="mt-1">
                <span className="text-slate-500">Email:</span> {progress.student_email}
              </div>
            </div>

            {progress.classes.map((classItem) => (
              <div
                key={classItem.class_id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {classItem.class_code} - {classItem.class_name}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {classItem.completed_assignments}/{classItem.total_assignments} assignments submitted
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {classItem.assignments.map((assignment) => (
                    <div
                      key={assignment.assignment_id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="font-medium text-slate-900">{assignment.title}</div>
                      <div className="mt-1">Due: {formatWhen(assignment.due_at)}</div>
                      <div className="mt-1">
                        Status:{" "}
                        {assignment.submitted
                          ? `Submitted (attempt ${assignment.attempt_no})`
                          : "Not submitted yet"}
                      </div>
                      <div className="mt-1">
                        Submitted at: {formatWhen(assignment.submitted_at)}
                      </div>
                      <div className="mt-1">
                        Mark:{" "}
                        {assignment.score != null && assignment.max_score != null
                          ? `${assignment.score}/${assignment.max_score}`
                          : "Not marked yet"}
                      </div>
                      <div className="mt-1">
                        Feedback:{" "}
                        {assignment.published_feedback
                          ? "Published to student"
                          : "Not published"}
                      </div>
                    </div>
                  ))}
                  {classItem.assignments.length === 0 && (
                    <div className="text-sm text-slate-600">
                      No assignments in this class yet.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PortalModal>
    </div>
  );
}
