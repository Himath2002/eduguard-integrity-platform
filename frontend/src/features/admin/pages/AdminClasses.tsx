import { useEffect, useMemo, useState } from "react";
import { api } from "@/shared/lib/api";
import PortalModal from "@/shared/components/PortalModal";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  applyFilters,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type AdminClassRow = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  lecturer_name: string;
  lecturer_username: string;
  enrolled_count: number;
  assignment_count: number;
  submission_count: number;
  created_at?: string | null;
  is_active: boolean;
};

type ClassStudent = {
  id: number;
  name: string;
  username: string;
  email: string;
  enrolled_at?: string | null;
};

type ClassAssignment = {
  id: number;
  title: string;
  due_at?: string | null;
  max_attempts: number;
};

type ClassDetail = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  lecturer_name: string;
  lecturer_username: string;
  students: ClassStudent[];
  assignments: ClassAssignment[];
};

type StudentOption = {
  id: number;
  full_name: string;
  username: string;
  email: string;
};

type OrderValue =
  | "created_newest"
  | "created_oldest"
  | "name_az"
  | "name_za"
  | "students_high"
  | "students_low"
  | "assignments_high"
  | "assignments_low"
  | "submissions_high"
  | "submissions_low";

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function sortClassRows(rows: AdminClassRow[], order: OrderValue) {
  const next = [...rows];

  next.sort((a, b) => {
    switch (order) {
      case "created_oldest":
        return parseDateValue(a.created_at) - parseDateValue(b.created_at);

      case "name_az":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

      case "name_za":
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });

      case "students_high":
        return b.enrolled_count - a.enrolled_count;

      case "students_low":
        return a.enrolled_count - b.enrolled_count;

      case "assignments_high":
        return b.assignment_count - a.assignment_count;

      case "assignments_low":
        return a.assignment_count - b.assignment_count;

      case "submissions_high":
        return b.submission_count - a.submission_count;

      case "submissions_low":
        return a.submission_count - b.submission_count;

      case "created_newest":
      default:
        return parseDateValue(b.created_at) - parseDateValue(a.created_at);
    }
  });

  return next;
}

function AdminClassesCSS() {
  return (
    <style>{`
      .admin-classes-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-classes-page-only.admin-classes-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-classes-heading {
        transition: color 220ms ease, text-shadow 220ms ease;
      }

      .admin-classes-light-only .admin-classes-heading {
        color: rgb(15, 23, 42);
      }

      .admin-classes-dark-only .admin-classes-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-classes-light-only .admin-classes-subtext {
        color: rgb(71, 85, 105);
      }

      .admin-classes-dark-only .admin-classes-subtext {
        color: rgb(170, 185, 207);
      }

      .admin-classes-filter-shell > div {
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-classes-light-only .admin-classes-filter-shell > div {
        background: rgba(255, 255, 255, 0.82) !important;
        border-color: rgba(226, 232, 240, 0.9) !important;
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.08) !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-classes-dark-only .admin-classes-filter-shell > div {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.07), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
        box-shadow: 0 18px 50px rgba(2, 6, 23, 0.34) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-classes-dark-only .admin-classes-filter-shell,
      .admin-classes-dark-only .eg-filter-popover {
        color-scheme: dark;
      }

      .admin-classes-light-only .admin-classes-filter-shell,
      .admin-classes-light-only .eg-filter-popover {
        color-scheme: light;
      }

      .admin-classes-dark-only .admin-classes-filter-shell input,
      .admin-classes-dark-only .admin-classes-filter-shell select,
      .admin-classes-dark-only .admin-classes-filter-shell textarea,
      .admin-classes-dark-only .eg-filter-popover input,
      .admin-classes-dark-only .eg-filter-popover select,
      .admin-classes-dark-only .eg-filter-popover textarea {
        background: rgba(8, 15, 29, 0.92) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        color-scheme: dark;
      }

      .admin-classes-dark-only .admin-classes-filter-shell select option,
      .admin-classes-dark-only .eg-filter-popover select option,
      .admin-classes-dark-only select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell select option:checked,
      .admin-classes-dark-only .eg-filter-popover select option:checked,
      .admin-classes-dark-only select option:checked {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22)),
          rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell select option:hover,
      .admin-classes-dark-only .eg-filter-popover select option:hover,
      .admin-classes-dark-only select option:hover {
        background-color: rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell input::placeholder,
      .admin-classes-dark-only .admin-classes-filter-shell textarea::placeholder,
      .admin-classes-dark-only .eg-filter-popover input::placeholder,
      .admin-classes-dark-only .eg-filter-popover textarea::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell button,
      .admin-classes-dark-only .eg-filter-popover button {
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-900,
      .admin-classes-dark-only .eg-filter-popover .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-800,
      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-700,
      .admin-classes-dark-only .eg-filter-popover .text-slate-800,
      .admin-classes-dark-only .eg-filter-popover .text-slate-700 {
        color: rgb(226, 232, 240) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-600,
      .admin-classes-dark-only .eg-filter-popover .text-slate-600 {
        color: rgb(203, 213, 225) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-500,
      .admin-classes-dark-only .admin-classes-filter-shell .text-slate-400,
      .admin-classes-dark-only .eg-filter-popover .text-slate-500,
      .admin-classes-dark-only .eg-filter-popover .text-slate-400 {
        color: rgb(148, 163, 184) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .bg-white,
      .admin-classes-dark-only .admin-classes-filter-shell .bg-slate-50,
      .admin-classes-dark-only .eg-filter-popover .bg-white,
      .admin-classes-dark-only .eg-filter-popover .bg-slate-50 {
        background: rgba(8, 15, 29, 0.92) !important;
      }

      .admin-classes-dark-only .admin-classes-filter-shell .border-slate-200,
      .admin-classes-dark-only .admin-classes-filter-shell .border-slate-300,
      .admin-classes-dark-only .eg-filter-popover .border-slate-200,
      .admin-classes-dark-only .eg-filter-popover .border-slate-300 {
        border-color: rgba(148, 163, 184, 0.24) !important;
      }

      .admin-classes-dark-only .eg-filter-popover {
        background:
          radial-gradient(110% 110% at 0% 0%, rgba(34, 211, 238, 0.08), transparent 44%),
          radial-gradient(90% 90% at 100% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
          linear-gradient(160deg, rgba(8, 15, 29, 0.98), rgba(12, 22, 40, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.55),
          inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }

      .admin-classes-dark-only .eg-filter-popover label,
      .admin-classes-dark-only .eg-filter-popover .uppercase,
      .admin-classes-dark-only .eg-filter-popover [class*="tracking"] {
        color: rgb(166, 180, 204) !important;
      }

      .admin-class-card {
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

      .admin-class-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .admin-classes-light-only .admin-class-card {
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

      .admin-classes-light-only .admin-class-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .admin-classes-dark-only .admin-class-card {
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

      .admin-classes-dark-only .admin-class-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .admin-class-card-shine {
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

      .admin-classes-dark-only .admin-class-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .admin-class-card:hover .admin-class-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .admin-class-card-halo {
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

      .admin-class-card:hover .admin-class-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .admin-class-card-content {
        position: relative;
        z-index: 4;
      }

      .admin-class-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .admin-classes-light-only .admin-class-title {
        color: rgb(15, 23, 42);
      }

      .admin-classes-dark-only .admin-class-title {
        color: rgb(248, 250, 252);
      }

      .admin-classes-light-only .admin-class-code {
        color: rgb(71, 85, 105);
      }

      .admin-classes-dark-only .admin-class-code {
        color: rgb(165, 180, 202);
      }

      .admin-classes-light-only .admin-class-description {
        color: rgb(71, 85, 105);
      }

      .admin-classes-dark-only .admin-class-description {
        color: rgb(199, 212, 232);
      }

      .admin-classes-light-only .admin-class-detail {
        color: rgb(51, 65, 85);
      }

      .admin-classes-dark-only .admin-class-detail {
        color: rgb(203, 213, 225);
      }

      .admin-classes-light-only .admin-class-label {
        color: rgb(100, 116, 139);
      }

      .admin-classes-dark-only .admin-class-label {
        color: rgb(148, 163, 184);
      }

      .admin-class-status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.35rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
      }

      .admin-class-status-active.admin-classes-light-pill {
        background: rgba(16, 185, 129, 0.12);
        color: rgb(4, 120, 87);
        border: 1px solid rgba(16, 185, 129, 0.2);
      }

      .admin-class-status-active.admin-classes-dark-pill {
        background: rgba(16, 185, 129, 0.15);
        color: rgb(167, 243, 208);
        border: 1px solid rgba(52, 211, 153, 0.22);
      }

      .admin-class-status-inactive.admin-classes-light-pill {
        background: rgba(100, 116, 139, 0.12);
        color: rgb(71, 85, 105);
        border: 1px solid rgba(100, 116, 139, 0.18);
      }

      .admin-class-status-inactive.admin-classes-dark-pill {
        background: rgba(100, 116, 139, 0.16);
        color: rgb(203, 213, 225);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }

      .admin-classes-empty-card {
        border-radius: 1.25rem;
        padding: 1.5rem;
        font-size: 0.875rem;
      }

      .admin-classes-light-only .admin-classes-empty-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        color: rgb(71, 85, 105);
      }

      .admin-classes-dark-only .admin-classes-empty-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.05), transparent 44%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        color: rgb(148, 163, 184);
      }

      .admin-classes-modal-content.admin-classes-modal-dark {
        color: rgb(226, 232, 240);
      }

      .admin-classes-modal-content.admin-classes-modal-dark .admin-modal-panel {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.055), transparent 42%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.96), rgba(9, 19, 37, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark .admin-modal-subpanel {
        background: rgba(8, 15, 29, 0.72) !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark .admin-modal-title {
        color: rgb(248, 250, 252) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark .admin-modal-copy {
        color: rgb(203, 213, 225) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark .admin-modal-muted {
        color: rgb(148, 163, 184) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark input,
      .admin-classes-modal-content.admin-classes-modal-dark select {
        background: rgba(8, 15, 29, 0.86) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        color-scheme: dark;
      }

      .admin-classes-modal-content.admin-classes-modal-dark select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-classes-modal-content.admin-classes-modal-dark input::placeholder {
        color: rgb(125, 140, 163) !important;
      }
    `}</style>
  );
}

function ClassCard({
  row,
  index,
  isDark,
  onOpen,
}: {
  row: AdminClassRow;
  index: number;
  isDark: boolean;
  onOpen: () => void;
}) {
  const stripe =
    index % 2 === 0
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(16,185,129))";

  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(16,185,129,.13), transparent 72%)";

  return (
    <div className="admin-class-card p-6">
      <div className="admin-class-stripe" style={{ background: stripe }} />
      <div className="admin-class-card-halo" style={{ background: halo }} />
      <div className="admin-class-card-shine" />

      <div className="admin-class-card-content pl-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="admin-class-title break-words text-lg font-semibold">
              {row.name}
            </h2>
            <p className="admin-class-code mt-1 text-sm">{row.code}</p>
          </div>

          <span
            className={[
              "admin-class-status-pill shrink-0",
              row.is_active
                ? "admin-class-status-active"
                : "admin-class-status-inactive",
              isDark ? "admin-classes-dark-pill" : "admin-classes-light-pill",
            ].join(" ")}
          >
            {row.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <p className="admin-class-description mt-4 min-h-[44px] text-sm leading-7">
          {row.description || "No class description provided yet."}
        </p>

        <div className="admin-class-detail mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="admin-class-label">Lecturer:</span>{" "}
            {row.lecturer_name}
          </div>
          <div>
            <span className="admin-class-label">Created:</span>{" "}
            {formatWhen(row.created_at)}
          </div>
          <div>
            <span className="admin-class-label">Students:</span>{" "}
            {row.enrolled_count}
          </div>
          <div>
            <span className="admin-class-label">Assignments:</span>{" "}
            {row.assignment_count}
          </div>
          <div>
            <span className="admin-class-label">Submissions:</span>{" "}
            {row.submission_count}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onOpen}>View class</Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminClasses() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  const [rows, setRows] = useState<AdminClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(12);

  const [selected, setSelected] = useState<ClassDetail | null>(null);
  const [open, setOpen] = useState(false);

  const [studentSearch, setStudentSearch] = useState("");
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<ClassStudent | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadClasses = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    try {
      const data = await api<AdminClassRow[]>("/admin/classes");
      setRows(data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load classes");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const reloadSelectedClass = async (classId: number) => {
    const detail = await api<ClassDetail>(`/admin/classes/${classId}`);
    setSelected(detail);
  };

  const openClass = async (classId: number) => {
    try {
      const data = await api<ClassDetail>(`/admin/classes/${classId}`);
      setSelected(data);
      setStudentSearch("");
      setStudentOptions([]);
      setRemoveTarget(null);
      setRemoveError(null);
      setOpen(true);
    } catch (e: any) {
      setError(e?.message || "Failed to open class");
    }
  };

  useEffect(() => {
    void loadClasses(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const term = studentSearch.trim();

      if (!term) {
        setStudentOptions([]);
        return;
      }

      try {
        const data = await api<StudentOption[]>(
          `/admin/users?role=student&q=${encodeURIComponent(term)}`
        );

        const enrolledIds = new Set((selected?.students ?? []).map((s) => s.id));
        setStudentOptions((data ?? []).filter((item) => !enrolledIds.has(item.id)));
      } catch {
        setStudentOptions([]);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [studentSearch, selected]);

  const classFilterDefinitions = useMemo<FilterDefinition<AdminClassRow>[]>(() => {
    const classOptions = [...rows]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((row) => ({
        value: String(row.id),
        label: `${row.code} — ${row.name}`,
      }));

    const lecturerMap = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const key = row.lecturer_username;
      if (!lecturerMap.has(key)) {
        lecturerMap.set(key, {
          value: row.lecturer_username,
          label: row.lecturer_name,
        });
      }
    });

    const lecturerOptions = [...lecturerMap.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );

    return [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search class, code, lecturer or description",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [
            item.name,
            item.code,
            item.lecturer_name,
            item.lecturer_username,
            item.description || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        },
      },
      {
        key: "class",
        label: "Class",
        type: "select",
        options: classOptions,
        getValue: (item) => String(item.id),
      },
      {
        key: "lecturer",
        label: "Lecturer",
        type: "select",
        options: lecturerOptions,
        getValue: (item) => item.lecturer_username,
      },
      {
        key: "student_load",
        label: "Students",
        type: "select",
        options: [
          { value: "none", label: "No enrolled students" },
          { value: "light", label: "1–10 students" },
          { value: "medium", label: "11–30 students" },
          { value: "heavy", label: "31+ students" },
        ],
        match: (item, value) => {
          const count = item.enrolled_count;
          if (value === "none") return count === 0;
          if (value === "light") return count >= 1 && count <= 10;
          if (value === "medium") return count >= 11 && count <= 30;
          if (value === "heavy") return count >= 31;
          return true;
        },
      },
      {
        key: "workload",
        label: "Workload",
        type: "select",
        options: [
          { value: "none", label: "No assignments yet" },
          { value: "light", label: "1–2 assignments" },
          { value: "heavy", label: "3+ assignments" },
        ],
        match: (item, value) => {
          const count = item.assignment_count;
          if (value === "none") return count === 0;
          if (value === "light") return count >= 1 && count <= 2;
          if (value === "heavy") return count >= 3;
          return true;
        },
      },
      {
        key: "submission_activity",
        label: "Submissions",
        type: "select",
        options: [
          { value: "none", label: "No submissions yet" },
          { value: "light", label: "1–5 submissions" },
          { value: "heavy", label: "6+ submissions" },
        ],
        match: (item, value) => {
          const count = item.submission_count;
          if (value === "none") return count === 0;
          if (value === "light") return count >= 1 && count <= 5;
          if (value === "heavy") return count >= 6;
          return true;
        },
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active only" },
          { value: "inactive", label: "Inactive only" },
        ],
        getValue: (item) => (item.is_active ? "active" : "inactive"),
      },
      {
        key: "order",
        label: "Order",
        type: "select",
        options: [
          { value: "created_newest", label: "Created: newest first" },
          { value: "created_oldest", label: "Created: oldest first" },
          { value: "name_az", label: "Class name: A to Z" },
          { value: "name_za", label: "Class name: Z to A" },
          { value: "students_high", label: "Students: high to low" },
          { value: "students_low", label: "Students: low to high" },
          { value: "assignments_high", label: "Assignments: high to low" },
          { value: "assignments_low", label: "Assignments: low to high" },
          { value: "submissions_high", label: "Submissions: high to low" },
          { value: "submissions_low", label: "Submissions: low to high" },
        ],
      },
    ];
  }, [rows]);

  const displayedRows = useMemo(() => {
    const orderRule = filters.find((rule) => rule.fieldKey === "order");
    const nonOrderRules = filters.filter((rule) => rule.fieldKey !== "order");
    const baseFiltered = applyFilters(rows, nonOrderRules, classFilterDefinitions);
    const sortValue = (orderRule?.value as OrderValue | undefined) || "created_newest";
    return sortClassRows(baseFiltered, sortValue);
  }, [rows, filters, classFilterDefinitions]);
  const visibleRows = displayedRows.slice(0, visibleRowCount);
  const hasMoreRows = visibleRows.length < displayedRows.length;

  useEffect(() => {
    setVisibleRowCount(12);
  }, [filters, rows.length]);

  const addStudent = async (studentId: number) => {
    if (!selected) return;

    setSaving(true);
    setRemoveError(null);

    try {
      await api(`/admin/classes/${selected.id}/students`, {
        method: "POST",
        body: { student_id: studentId },
      });

      await reloadSelectedClass(selected.id);
      await loadClasses(false);
      setStudentSearch("");
      setStudentOptions([]);
    } catch (e: any) {
      setError(e?.message || "Failed to add student");
    } finally {
      setSaving(false);
    }
  };

  const askRemoveStudent = (student: ClassStudent) => {
    setRemoveError(null);
    setRemoveTarget(student);
  };

  const cancelRemoveStudent = () => {
    if (saving) return;
    setRemoveTarget(null);
    setRemoveError(null);
  };

  const confirmRemoveStudent = async () => {
    if (!selected || !removeTarget) return;

    setSaving(true);
    setRemoveError(null);

    try {
      await api(`/admin/classes/${selected.id}/students/${removeTarget.id}`, {
        method: "DELETE",
      });

      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.filter((student) => student.id !== removeTarget.id),
        };
      });

      await reloadSelectedClass(selected.id);
      await loadClasses(false);
      setRemoveTarget(null);
    } catch (e: any) {
      setRemoveError(e?.message || "Failed to remove student");
    } finally {
      setSaving(false);
    }
  };

  const closeClassModal = () => {
    if (saving) return;
    setOpen(false);
    setSelected(null);
    setStudentSearch("");
    setStudentOptions([]);
    setRemoveTarget(null);
    setRemoveError(null);
  };

  return (
    <div
      className={[
        "admin-classes-page-only relative min-h-[calc(100vh-160px)] space-y-6",
        isDark ? "admin-classes-dark-only" : "admin-classes-light-only",
      ].join(" ")}
    >
      <AdminClassesCSS />

      <div className="mt-8">
        <h1 className="admin-classes-heading text-3xl font-semibold">Classes</h1>
        <p className="admin-classes-subtext mt-1 text-sm">
          Review institution classes, inspect rosters, and manage enrollments.
        </p>
      </div>

      <div className="admin-classes-filter-shell">
        <FilterBuilder
          fields={classFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search class, code, lecturer or description"
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}
      {loading && (
        <div className={isDark ? "text-sm text-slate-300" : "text-sm text-slate-600"}>
          Loading classes…
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {loading && rows.length === 0 ? (
          <ProgressiveCardSkeleton count={4} />
        ) : null}

        {visibleRows.map((row, idx) => (
          <ClassCard
            key={row.id}
            row={row}
            index={idx}
            isDark={isDark}
            onOpen={() => void openClass(row.id)}
          />
        ))}

        {!loading && displayedRows.length === 0 && (
          <div className="admin-classes-empty-card">
            No classes match the current filters.
          </div>
        )}
      </div>

      {!loading && hasMoreRows ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleRowCount((count) => count + 12)}
            className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Show more classes ({displayedRows.length - visibleRows.length} remaining)
          </button>
        </div>
      ) : null}

      <PortalModal
        open={open}
        onClose={closeClassModal}
        title={selected ? `${selected.name} (${selected.code})` : "Class detail"}
        widthClass="max-w-4xl"
      >
        <div
          className={[
            "admin-classes-modal-content",
            isDark ? "admin-classes-modal-dark" : "admin-classes-modal-light",
          ].join(" ")}
        >
          {!selected ? (
            <div className={isDark ? "text-sm text-slate-300" : "text-sm text-slate-600"}>
              Loading class details…
            </div>
          ) : (
            <div className="space-y-6">
              <div className="admin-modal-panel grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <div>
                  <div className="admin-modal-muted text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lecturer
                  </div>
                  <div className="admin-modal-copy mt-1 text-sm text-slate-700">
                    {selected.lecturer_name} ({selected.lecturer_username})
                  </div>
                </div>

                <div>
                  <div className="admin-modal-muted text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Description
                  </div>
                  <div className="admin-modal-copy mt-1 text-sm text-slate-700">
                    {selected.description || "No description available."}
                  </div>
                </div>
              </div>

              <div className="admin-modal-panel rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="admin-modal-title text-base font-semibold text-slate-900">
                      Enrolled students
                    </h3>
                    <p className="admin-modal-copy text-sm text-slate-600">
                      Add existing student accounts to this class or remove them when needed.
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {selected.students.length} active
                  </span>
                </div>

                <div className="admin-modal-subpanel mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="admin-modal-title text-sm font-medium text-slate-800">
                    Add student
                  </div>

                  <div className="mt-3 flex flex-col gap-3 md:flex-row">
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search by student name, username or email"
                    />
                  </div>

                  {studentOptions.length > 0 && (
                    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                      {studentOptions.map((option) => (
                        <div
                          key={option.id}
                          className="admin-modal-subpanel flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="admin-modal-title font-medium text-slate-900">
                              {option.full_name}
                            </div>
                            <div className="admin-modal-copy text-slate-600">
                              {option.username} · {option.email}
                            </div>
                          </div>

                          <Button disabled={saving} onClick={() => void addStudent(option.id)}>
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {selected.students.map((student) => (
                    <div
                      key={student.id}
                      className="admin-modal-subpanel flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="admin-modal-title font-medium text-slate-900">
                          {student.name}
                        </div>
                        <div className="admin-modal-copy text-sm text-slate-600">
                          {student.username} · {student.email}
                        </div>
                        <div className="admin-modal-muted text-xs text-slate-500">
                          Joined: {formatWhen(student.enrolled_at)}
                        </div>
                      </div>

                      <button
                        className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        disabled={saving}
                        onClick={() => askRemoveStudent(student)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {selected.students.length === 0 && (
                    <div className="admin-modal-copy text-sm text-slate-600">
                      No students are enrolled in this class yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="admin-modal-panel rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="admin-modal-title text-base font-semibold text-slate-900">
                  Assignments in this class
                </h3>

                <div className="mt-4 space-y-3">
                  {selected.assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="admin-modal-subpanel rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="admin-modal-title font-medium text-slate-900">
                        {assignment.title}
                      </div>
                      <div className="admin-modal-copy mt-1">
                        Due: {formatWhen(assignment.due_at)}
                      </div>
                      <div className="admin-modal-copy mt-1">
                        Max attempts: {assignment.max_attempts}
                      </div>
                    </div>
                  ))}

                  {selected.assignments.length === 0 && (
                    <div className="admin-modal-copy text-sm text-slate-600">
                      This class does not have any assignments yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </PortalModal>

      <PortalModal
        open={!!removeTarget}
        onClose={cancelRemoveStudent}
        title="Remove student"
        widthClass="max-w-md"
      >
        <div
          className={[
            "admin-classes-modal-content space-y-4",
            isDark ? "admin-classes-modal-dark" : "admin-classes-modal-light",
          ].join(" ")}
        >
          {removeError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {removeError}
            </div>
          )}

          <p className="admin-modal-copy text-sm text-slate-700">
            Remove <span className="font-semibold">{removeTarget?.name}</span> from
            this class?
          </p>

          <div className="flex items-center justify-end gap-3">
            <button
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={saving}
              onClick={cancelRemoveStudent}
            >
              Cancel
            </button>

            <button
              className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              disabled={saving}
              onClick={() => void confirmRemoveStudent()}
            >
              {saving ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
}
