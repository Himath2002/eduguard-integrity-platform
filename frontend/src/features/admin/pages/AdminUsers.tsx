import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveTableRowsSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import {
  applyFilters,
  createFilterRule,
  type FilterDefinition,
  type FilterRule,
} from "@/shared/lib/filtering";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type Role = "Instructor" | "Student";

type UserRow = {
  id: number;
  name: string;
  username: string;
  email: string;
  role: Role;
};

type ApiRole = "student" | "lecturer" | "admin";

type ApiUser = {
  id: number;
  full_name: string;
  username: string;
  email: string;
  role: ApiRole;
};

function toApiRole(role: Role): "student" | "lecturer" {
  return role === "Instructor" ? "lecturer" : "student";
}

function fromApiRole(role: ApiRole): Role {
  return role === "lecturer" ? "Instructor" : "Student";
}

function mapApiToRow(user: ApiUser): UserRow {
  return {
    id: user.id,
    name: user.full_name,
    username: user.username,
    email: user.email,
    role: fromApiRole(user.role),
  };
}

function normalizeEmail(email: string) {
  return email.trim();
}

function AdminUsersCSS() {
  return (
    <style>{`
      .admin-users-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-users-page-only.admin-users-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-users-page-only.admin-users-light-only .admin-users-heading {
        color: rgb(15, 23, 42);
      }

      .admin-users-page-only .admin-users-filter-shell > div {
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-filter-shell > div {
        background: rgba(255, 255, 255, 0.82) !important;
        border-color: rgba(226, 232, 240, 0.9) !important;
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.08) !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell > div {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.07), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
        box-shadow: 0 18px 50px rgba(2, 6, 23, 0.34) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover {
        color-scheme: dark;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-filter-shell,
      .admin-users-page-only.admin-users-light-only .eg-filter-popover {
        color-scheme: light;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell input,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell select,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell textarea,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover input,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover select,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover textarea {
        background: rgba(8, 15, 29, 0.92) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        color-scheme: dark;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell select option,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover select option,
      .admin-users-page-only.admin-users-dark-only select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell select option:checked,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover select option:checked,
      .admin-users-page-only.admin-users-dark-only select option:checked {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22)),
          rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell select option:hover,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover select option:hover,
      .admin-users-page-only.admin-users-dark-only select option:hover {
        background-color: rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell input::placeholder,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell textarea::placeholder,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover input::placeholder,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover textarea::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell button,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover button {
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-900,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-800,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-700,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-800,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-700 {
        color: rgb(226, 232, 240) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-600,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-600 {
        color: rgb(203, 213, 225) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-500,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .text-slate-400,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-500,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .text-slate-400 {
        color: rgb(148, 163, 184) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .bg-white,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .bg-slate-50,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .bg-white,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .bg-slate-50 {
        background: rgba(8, 15, 29, 0.92) !important;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .border-slate-200,
      .admin-users-page-only.admin-users-dark-only .admin-users-filter-shell .border-slate-300,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .border-slate-200,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .border-slate-300 {
        border-color: rgba(148, 163, 184, 0.24) !important;
      }

      .admin-users-page-only.admin-users-dark-only .eg-filter-popover {
        background:
          radial-gradient(110% 110% at 0% 0%, rgba(34, 211, 238, 0.08), transparent 44%),
          radial-gradient(90% 90% at 100% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
          linear-gradient(160deg, rgba(8, 15, 29, 0.98), rgba(12, 22, 40, 0.98)) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.55),
          inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }

      .admin-users-page-only.admin-users-dark-only .eg-filter-popover label,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover .uppercase,
      .admin-users-page-only.admin-users-dark-only .eg-filter-popover [class*="tracking"] {
        color: rgb(166, 180, 204) !important;
      }

      .admin-users-table-card {
        overflow: hidden;
        border-radius: 1.25rem;
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-table-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.85);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.055), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.07), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow:
          0 22px 62px rgba(2, 6, 23, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-users-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-table thead {
        background: rgba(241, 245, 249, 0.88);
        color: rgb(51, 65, 85);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table thead {
        background:
          linear-gradient(90deg, rgba(15, 23, 42, 0.94), rgba(19, 31, 53, 0.94));
        color: rgb(203, 213, 225);
      }

      .admin-users-table th {
        padding: 1rem 1.5rem;
        text-align: left;
        font-weight: 700;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }

      .admin-users-table td {
        padding: 1rem 1.5rem;
        vertical-align: middle;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-table tbody tr {
        color: rgb(51, 65, 85);
        border-top: 1px solid rgba(226, 232, 240, 0.82);
      }

      .admin-users-page-only.admin-users-light-only .admin-users-table tbody tr:nth-child(odd) {
        background: rgba(255, 255, 255, 0.62);
      }

      .admin-users-page-only.admin-users-light-only .admin-users-table tbody tr:nth-child(even) {
        background: rgba(248, 250, 252, 0.74);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table tbody tr {
        color: rgb(226, 232, 240);
        border-top: 1px solid rgba(148, 163, 184, 0.13);
        transition:
          background 180ms ease,
          color 180ms ease,
          transform 180ms ease;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table tbody tr:nth-child(odd) {
        background: rgba(15, 23, 42, 0.62);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table tbody tr:nth-child(even) {
        background: rgba(11, 20, 38, 0.74);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-table tbody tr:hover {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.075), rgba(129, 140, 248, 0.06)),
          rgba(15, 23, 42, 0.78);
        color: rgb(248, 250, 252);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-name {
        color: rgb(248, 250, 252);
        font-weight: 600;
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-email,
      .admin-users-page-only.admin-users-dark-only .admin-users-role {
        color: rgb(203, 213, 225);
      }

      .admin-users-role-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.35rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
      }

      .admin-users-page-only.admin-users-light-only .admin-users-role-pill {
        background: rgba(99, 102, 241, 0.09);
        color: rgb(67, 56, 202);
        border: 1px solid rgba(99, 102, 241, 0.16);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-role-pill {
        background: rgba(34, 211, 238, 0.1);
        color: rgb(165, 243, 252);
        border: 1px solid rgba(34, 211, 238, 0.18);
      }

      .admin-users-page-only.admin-users-dark-only .admin-users-empty {
        color: rgb(148, 163, 184);
      }

      .admin-users-modal-card {
        transition:
          background 220ms ease,
          border-color 220ms ease,
          color 220ms ease;
      }

      .admin-users-modal-card.admin-users-modal-light {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.68);
        color: rgb(15, 23, 42);
      }

      .admin-users-modal-card.admin-users-modal-dark {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.065), transparent 42%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.98), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: rgb(226, 232, 240);
      }

      .admin-users-modal-dark .admin-users-modal-title {
        color: rgb(248, 250, 252);
      }

      .admin-users-modal-dark .admin-users-modal-border {
        border-color: rgba(148, 163, 184, 0.18);
      }

      .admin-users-modal-dark label,
      .admin-users-modal-dark p {
        color: rgb(203, 213, 225) !important;
      }

      .admin-users-modal-dark input,
      .admin-users-modal-dark select {
        background: rgba(8, 15, 29, 0.88) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.24) !important;
        color-scheme: dark;
      }

      .admin-users-modal-dark select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-users-modal-dark input::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-users-modal-dark .admin-users-soft-button {
        background: rgba(15, 23, 42, 0.78) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
      }
    `}</style>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
  isDark,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  isDark: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 sm:p-6">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-[3px]"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div
        className={[
          "admin-users-modal-card relative mt-24 w-[92%] max-w-lg rounded-2xl backdrop-blur-xl shadow-[0_30px_90px_rgba(0,0,0,0.28)]",
          isDark ? "admin-users-modal-dark" : "admin-users-modal-light",
        ].join(" ")}
      >
        <div className="admin-users-modal-border flex items-center justify-between border-b px-6 py-4">
          <div className="admin-users-modal-title font-semibold">{title}</div>
          <button
            className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default function AdminUsers() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("Student");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("Student");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");

  const loadUsers = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");

    try {
      const data = await api<ApiUser[]>("/admin/users");
      setRows(data.map(mapApiToRow));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      if (cancelled) return;
      await loadUsers(true);
    };

    void initialLoad();

    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      void loadUsers(false);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadUsers]);

  const userFilterDefinitions = useMemo<FilterDefinition<UserRow>[]>(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by name, username or email",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [item.name, item.username, item.email, item.role]
            .join(" ")
            .toLowerCase()
            .includes(q);
        },
      },
      {
        key: "role",
        label: "Role",
        type: "select",
        options: [
          { value: "Instructor", label: "Instructor" },
          { value: "Student", label: "Student" },
        ],
        getValue: (item) => item.role,
      },
      {
        key: "email",
        label: "Email",
        type: "text",
        placeholder: "Search by email",
        match: (item, value) => item.email.toLowerCase().includes(value.toLowerCase()),
      },
      {
        key: "name",
        label: "Name or username",
        type: "text",
        placeholder: "Search by full name or username",
        match: (item, value) => {
          const q = value.toLowerCase();
          return item.name.toLowerCase().includes(q) || item.username.toLowerCase().includes(q);
        },
      },
    ],
    []
  );

  const filteredRows = useMemo(
    () => applyFilters(rows, filters, userFilterDefinitions),
    [rows, filters, userFilterDefinitions]
  );
  const visibleRows = filteredRows.slice(0, visibleRowCount);
  const hasMoreRows = visibleRows.length < filteredRows.length;

  useEffect(() => {
    setVisibleRowCount(25);
  }, [filters, rows.length]);

  const openEdit = (user: UserRow) => {
    setEditError("");
    setEditing(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditing(null);
    setEditName("");
    setEditEmail("");
    setEditRole("Student");
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editing) return;

    const trimmedName = editName.trim();
    const normalizedEmail = normalizeEmail(editEmail);

    if (!trimmedName) {
      setEditError("Name is required.");
      return;
    }

    if (!normalizedEmail) {
      setEditError("Email is required.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setEditError("Please enter a valid email address.");
      return;
    }

    setSavingEdit(true);
    setEditError("");

    try {
      const updated = await api<ApiUser>(`/admin/users/${editing.id}`, {
        method: "PATCH",
        body: {
          full_name: trimmedName,
          email: normalizedEmail,
          role: toApiRole(editRole),
        },
      });

      setRows((prev) => prev.map((row) => (row.id === editing.id ? mapApiToRow(updated) : row)));
      await loadUsers(false);
      closeEdit();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openDelete = (user: UserRow) => {
    setDeleteError("");
    setDeleting(user);
  };

  const closeDelete = () => {
    if (deletingBusy) return;
    setDeleting(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deleting) return;

    setDeletingBusy(true);
    setDeleteError("");

    try {
      await api<{ ok: boolean }>(`/admin/users/${deleting.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((row) => row.id !== deleting.id));
      await loadUsers(false);
      closeDelete();
    } catch (e: any) {
      setDeleteError(e?.message ?? "Failed to delete user.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const openAdd = () => {
    setAddError("");
    setAdding(true);
    setNewName("");
    setNewUsername("");
    setNewEmail("");
    setNewRole("Student");
    setNewPassword("");
  };

  const closeAdd = () => {
    if (creating) return;
    setAdding(false);
    setNewName("");
    setNewUsername("");
    setNewEmail("");
    setNewRole("Student");
    setNewPassword("");
    setAddError("");
  };

  const createUser = async () => {
    const trimmedName = newName.trim();
    const trimmedUsername = newUsername.trim();
    const normalizedEmail = normalizeEmail(newEmail);
    const trimmedPassword = newPassword.trim();

    if (!trimmedName) {
      setAddError("Name is required.");
      return;
    }

    if (!trimmedUsername) {
      setAddError("Username is required.");
      return;
    }

    if (!normalizedEmail) {
      setAddError("Email is required.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setAddError("Please enter a valid email address.");
      return;
    }

    if (trimmedPassword.length < 8) {
      setAddError("Temp password must be at least 8 characters.");
      return;
    }

    setCreating(true);
    setAddError("");

    try {
      const created = await api<ApiUser>("/admin/users", {
        method: "POST",
        body: {
          full_name: trimmedName,
          username: trimmedUsername,
          email: normalizedEmail,
          role: toApiRole(newRole),
          password: trimmedPassword,
        },
      });

      setRows((prev) => [mapApiToRow(created), ...prev]);
      await loadUsers(false);
      closeAdd();
    } catch (e: any) {
      setAddError(e?.message ?? "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  const emptyMsg = useMemo(() => {
    return filters.length ? "No users match the current filters." : "No users found.";
  }, [filters.length]);

  return (
    <div
      className={[
        "admin-users-page-only relative min-h-[calc(100vh-160px)]",
        isDark ? "admin-users-dark-only" : "admin-users-light-only",
      ].join(" ")}
    >
      <AdminUsersCSS />

      <h1 className="admin-users-heading mt-8 mb-6 text-center text-3xl font-semibold">
        Manage Users
      </h1>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <button
          className="rounded-full bg-emerald-500 px-4 py-2 text-white shadow transition hover:bg-emerald-600"
          onClick={openAdd}
        >
          + Add User
        </button>
      </div>

      <div className="admin-users-filter-shell mb-4">
        <FilterBuilder
          title="User filters"
          subtitle="Combine role-based filters and search by name, username or email live."
          fields={userFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onAdd={() => setFilters((prev) => [...prev, createFilterRule<UserRow>(userFilterDefinitions)])}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search users by name, username or email"
        />
      </div>

      {(loading || error) && (
        <div className="mb-3 text-sm">
          {loading && (
            <span className={isDark ? "text-slate-300" : "text-slate-600"}>
              Loading users…
            </span>
          )}
          {error && <span className="text-red-500">{error}</span>}
        </div>
      )}

      <div className="admin-users-table-card">
        <div className="overflow-x-auto">
          <table className="admin-users-table text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && rows.length === 0 ? (
                <ProgressiveTableRowsSkeleton rows={5} columns={4} />
              ) : null}

              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="admin-users-name">{row.name}</span>
                  </td>

                  <td>
                    <span className="admin-users-email">{row.email}</span>
                  </td>

                  <td>
                    <span className="admin-users-role-pill">{row.role}</span>
                  </td>

                  <td>
                    <div className="flex items-center gap-3">
                      <button
                        className="rounded-full bg-blue-600 px-5 py-2 text-white shadow transition hover:bg-blue-700"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>

                      <button
                        className={[
                          "rounded-full border px-5 py-2 transition",
                          isDark
                            ? "border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                            : "border-white/60 bg-white/70 text-slate-700 hover:bg-white",
                        ].join(" ")}
                        onClick={() => openDelete(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td className="admin-users-empty px-6 py-8" colSpan={4}>
                    {emptyMsg}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && hasMoreRows ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleRowCount((count) => count + 25)}
            className="rounded-full border border-indigo-200 bg-white/80 px-5 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Show more users ({filteredRows.length - visibleRows.length} remaining)
          </button>
        </div>
      ) : null}

      <Modal open={adding} title="Add User" onClose={closeAdd} isDark={isDark}>
        <div className="space-y-4">
          {addError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {addError}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-slate-600">Name</label>
            <input
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter name"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Username</label>
            <input
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. jane.doe"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Enter email"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Role</label>
            <select
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="Instructor">Instructor</option>
              <option value="Student">Student</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Temp Password</label>
            <input
              type="password"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              className="admin-users-soft-button rounded-full border border-white/60 bg-white/70 px-5 py-2 text-slate-700 transition hover:bg-white"
              onClick={closeAdd}
              disabled={creating}
            >
              Cancel
            </button>

            <button
              className="rounded-full bg-emerald-600 px-6 py-2 text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
              onClick={createUser}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} title="Edit User" onClose={closeEdit} isDark={isDark}>
        <div className="space-y-4">
          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {editError}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-slate-600">Name</label>
            <input
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter name"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Enter email"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-600">Role</label>
            <select
              className="w-full rounded-xl border border-white/60 bg-white/70 px-4 py-3 outline-none"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as Role)}
            >
              <option value="Instructor">Instructor</option>
              <option value="Student">Student</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              className="admin-users-soft-button rounded-full border border-white/60 bg-white/70 px-5 py-2 text-slate-700 transition hover:bg-white"
              onClick={closeEdit}
              disabled={savingEdit}
            >
              Cancel
            </button>

            <button
              className="rounded-full bg-blue-600 px-6 py-2 text-white shadow transition hover:bg-blue-700 disabled:opacity-60"
              onClick={saveEdit}
              disabled={savingEdit}
            >
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} title="Delete User" onClose={closeDelete} isDark={isDark}>
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}

          <p className="text-slate-700">
            Are you sure you want to delete{" "}
            <span className="font-semibold">{deleting?.name}</span> (
            <span className="text-slate-600">{deleting?.email}</span>)?
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              className="admin-users-soft-button rounded-full border border-white/60 bg-white/70 px-5 py-2 text-slate-700 transition hover:bg-white"
              onClick={closeDelete}
              disabled={deletingBusy}
            >
              Cancel
            </button>

            <button
              className="rounded-full bg-red-600 px-6 py-2 text-white shadow transition hover:bg-red-700 disabled:opacity-60"
              onClick={confirmDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
