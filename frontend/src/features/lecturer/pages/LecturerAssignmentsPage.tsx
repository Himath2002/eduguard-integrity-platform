import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api, API_BASE_URL, uploadToPresignedPost } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { ProgressiveCardSkeleton } from "@/shared/components/ProgressiveListSkeleton";
import { applyFilters, createFilterRule, type FilterDefinition, type FilterRule } from "@/shared/lib/filtering";


type LecturerClass = {
  id: number;
  name: string;
  code: string;
};

type AssignmentCard = {
  id: number;
  title: string;
  className: string;
  classCode: string;
  due: string;
  submitted: number;
  totalStudents: number;
};

type AssignmentDetail = {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  allow_resubmission: boolean;
  max_attempts: number;
  student_report_visible: boolean;
  class: { id: number; name: string; code: string };

  hasMaterial?: boolean;
  materialName?: string | null;
  materialUrl?: string | null;
};

type PresignResponse = {
  bucket: string;
  key: string;
  upload: {
    url: string;
    fields: Record<string, string>;
  };
};

function isoToDateInput(iso: string | null) {
  if (!iso) return "";
  // iso like 2026-05-25T18:29:00+00:00 -> take yyyy-mm-dd
  return iso.slice(0, 10);
}

export default function LecturerAssignmentsPage() {
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
  const [assignments, setAssignments] = useState<AssignmentCard[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [visibleAssignmentCount, setVisibleAssignmentCount] = useState(12);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---------- Create modal ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newClassId, setNewClassId] = useState<number | "">("");
  const [newDue, setNewDue] = useState("");

  const [allowResub, setAllowResub] = useState(true);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [studentCanViewReport, setStudentCanViewReport] = useState(false);

  const [creating, setCreating] = useState(false);

  // ---------- View/Edit modal ----------
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // editable fields in modal
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eDue, setEDue] = useState("");
  const [eAllowResub, setEAllowResub] = useState(true);
  const [eMaxAttempts, setEMaxAttempts] = useState<number>(1);
  const [eStudentCanViewReport, setEStudentCanViewReport] = useState(false);

  const [newMaterial, setNewMaterial] = useState<File | null>(null);

  const classOptions = useMemo(() => classes ?? [], [classes]);

  const uploadMaterialToS3 = async (assignmentId: number, file: File): Promise<void> => {
    const presign = await api<PresignResponse>(`/lecturer/${username}/assignments/${assignmentId}/material/presign`, {
      method: "POST",
      body: {
        filename: file.name,
        content_type: file.type || "application/pdf",
      },
    });

    await uploadToPresignedPost(presign.upload, file);

    await api(`/lecturer/${username}/assignments/${assignmentId}/material/finalize`, {
      method: "POST",
      body: {
        s3_bucket: presign.bucket,
        s3_key: presign.key,
        filename: file.name,
        content_type: file.type || "application/pdf",
        file_size: file.size,
      },
    });
  };

  const loadAll = async () => {
    if (!username) return;
    setLoading(true);
    setErr(null);

    try {
      const classPromise = api<any[]>(`/lecturer/${username}/classes`);
      const assignmentPromise = api<AssignmentCard[]>(`/lecturer/${username}/assignments`);

      const cls = await classPromise.catch(() => []);
      setClasses(
        (cls ?? []).map((c) => ({
          id: c.id,
          name: c.name ?? c.title,
          code: c.code,
        }))
      );

      const asg = await assignmentPromise;
      setAssignments(asg ?? []);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ? String(e.message) : JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadAll();
    }, 12000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const assignmentFilterDefinitions = useMemo<FilterDefinition<AssignmentCard>[]>(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search by assignment title or class",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [item.title, item.classCode, item.className].join(" ").toLowerCase().includes(q);
        },
      },
      {
        key: "classCode",
        label: "Class",
        type: "select",
        options: classes.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
        getValue: (item) => item.classCode,
      },
      {
        key: "submissionState",
        label: "Submission state",
        type: "select",
        options: [
          { value: "none", label: "No submissions yet" },
          { value: "partial", label: "Partially submitted" },
          { value: "complete", label: "Fully submitted" },
        ],
        match: (item, value) => {
          if (value === "none") return item.submitted === 0;
          if (value === "partial") return item.submitted > 0 && item.submitted < item.totalStudents;
          if (value === "complete") return item.totalStudents > 0 && item.submitted >= item.totalStudents;
          return true;
        },
      },
      {
        key: "dueState",
        label: "Due state",
        type: "select",
        options: [
          { value: "upcoming", label: "Upcoming" },
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Due today" },
        ],
        match: (item, value) => {
          const dueDate = item.due ? new Date(`${item.due}T23:59:59`) : null;
          if (!dueDate || Number.isNaN(dueDate.getTime())) return false;
          const now = new Date();
          const dueKey = dueDate.toISOString().slice(0, 10);
          const todayKey = now.toISOString().slice(0, 10);
          if (value === "today") return dueKey === todayKey;
          if (value === "overdue") return dueDate.getTime() < now.getTime() && dueKey !== todayKey;
          if (value === "upcoming") return dueDate.getTime() >= now.getTime() || dueKey === todayKey;
          return true;
        },
      },
      {
        key: "title",
        label: "Assignment title",
        type: "text",
        placeholder: "Search by assignment title",
        match: (item, value) => item.title.toLowerCase().includes(value.toLowerCase()),
      },
    ],
    [classes]
  );

  const filteredAssignments = useMemo(
    () => applyFilters(assignments, filters, assignmentFilterDefinitions),
    [assignments, filters, assignmentFilterDefinitions]
  );
  const visibleAssignments = filteredAssignments.slice(0, visibleAssignmentCount);
  const hasMoreAssignments = visibleAssignments.length < filteredAssignments.length;

  useEffect(() => {
    setVisibleAssignmentCount(12);
  }, [filters, assignments.length]);

  const resetCreateModal = () => {
    setCreateOpen(false);
    setNewTitle("");
    setNewDesc("");
    setNewClassId("");
    setNewDue("");
    setAllowResub(true);
    setMaxAttempts(1);
    setStudentCanViewReport(false);
  };

  const createAssignment = async () => {
    if (!username) return;
    if (creating) return;

    if (!newTitle.trim() || !newDue || !newClassId) {
      setErr("Title, due date and class are required");
      return;
    }

    try {
      setCreating(true);
      setErr(null);

      const created = await api<{ ok: boolean; id: number }>(`/lecturer/${username}/assignments`, {
        method: "POST",
        body: {
          class_id: Number(newClassId),
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          due_at: new Date(`${newDue}T23:59:00`).toISOString(),
          allow_resubmission: allowResub,
          max_attempts: Math.max(1, Number(maxAttempts || 1)),
          student_report_visible: studentCanViewReport,
        },
      });

      if (newMaterial) {
        await uploadMaterialToS3(created.id, newMaterial);
      }

      resetCreateModal();
      setNewMaterial(null);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to create assignment");
    } finally {
      setCreating(false);
    }
  };

  const openViewModal = async (assignmentId: number) => {
    if (!username) return;
    setViewOpen(true);
    setViewLoading(true);
    setViewErr(null);
    setEditMode(false);
    setDetail(null);

    try {
      const d = await api<AssignmentDetail>(`/lecturer/${username}/assignments/${assignmentId}`);
      setDetail(d);

      // seed editable fields
      setETitle(d.title ?? "");
      setEDesc(d.description ?? "");
      setEDue(isoToDateInput(d.due_at));
      setEAllowResub(!!d.allow_resubmission);
      setEMaxAttempts(Number(d.max_attempts || 1));
      setEStudentCanViewReport(!!d.student_report_visible);
    } catch (e: any) {
      setViewErr(e?.message || "Failed to load assignment");
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewModal = () => {
    setViewOpen(false);
    setViewErr(null);
    setDetail(null);
    setEditMode(false);
  };

  const saveAssignment = async () => {
    if (!username || !detail) return;
    if (saving) return;

    if (!eTitle.trim()) {
      setViewErr("Title cannot be empty");
      return;
    }

    try {
      setSaving(true);
      setViewErr(null);

      await api(`/lecturer/${username}/assignments/${detail.id}`, {
        method: "PUT",
        body: {
          title: eTitle.trim(),
          description: eDesc.trim() || null,
          due_at: eDue ? new Date(`${eDue}T23:59:00`).toISOString() : null,
          allow_resubmission: eAllowResub,
          max_attempts: Math.max(1, Number(eMaxAttempts || 1)),
          student_report_visible: eStudentCanViewReport,
        },
      });

      // refresh detail + list
      await openViewModal(detail.id);
      await loadAll();
      setEditMode(false);
    } catch (e: any) {
      setViewErr(e?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Assignments</h1>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          disabled={createOpen}
          className="rounded-full px-4 py-2 text-white transition
          bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700
          shadow-[0_10px_30px_rgba(59,130,246,0.35)] disabled:opacity-50"
        >
          + Create Assignment
        </button>
      </div>

      <div className="mt-4">
        <FilterBuilder
          title="Assignment filters"
          subtitle="Combine class, submission progress and due-state filters. Search updates the list live."
          fields={assignmentFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onAdd={() => setFilters((prev) => [...prev, createFilterRule<AssignmentCard>(assignmentFilterDefinitions)])}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search assignment title or class"
        />
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600">Loading…</p>}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading && assignments.length === 0 ? (
          <ProgressiveCardSkeleton count={4} />
        ) : !loading && filteredAssignments.length === 0 ? (
          <div className="rounded-2xl bg-white/70 border border-white/60 shadow p-6 text-slate-700">
{assignments.length === 0 ? "No assignments yet." : "No assignments match the current filters."}
          </div>
        ) : (
          visibleAssignments.map((a, i) => (
            <div
              key={a.id}
              className="relative transform-gpu overflow-hidden rounded-2xl bg-white/75 border border-slate-200 shadow-md ring-1 ring-black/5 p-6 transition-all duration-300 ease-out hover:-translate-y-[6px] hover:scale-[1.015] hover:border-blue-400/70 hover:shadow-[0_26px_60px_rgba(59,130,246,0.22)]"
            >
              <div
                className="absolute left-0 top-0 h-full w-[6px] rounded-l-2xl"
                style={{
                  background: i % 2 === 0 ? "rgb(99,102,241)" : "rgb(59,130,246)",
                }}
              />

              <h2 className="text-lg font-semibold">{a.title}</h2>

              <div className="mt-2 text-sm text-slate-600 space-y-1">
                <div>Course: {a.className}</div>
                <div>Due: {a.due}</div>
                <div>
                  {a.submitted}/{a.totalStudents} submitted
                </div>
              </div>

              <button
                className="mt-4 rounded-full px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 shadow"
                onClick={() => openViewModal(a.id)}
              >
                View Assignment
              </button>
            </div>
          ))
        )}
      </div>

      {!loading && hasMoreAssignments ? (
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

      {/* ---------------- CREATE MODAL ---------------- */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="max-h-[85vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold">Create Assignment</h3>
              <p className="text-slate-600 mt-1">Add details for the new assignment.</p>

              <label className="block text-sm mt-4">Title</label>
              <input
                className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Worksheet 01"
              />



              <label className="block text-sm mt-4">Details / Instructions</label>
              <textarea
                className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border h-28 resize-y"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Explain requirements, submission format, marking criteria, references, etc."
              />

<label className="block text-sm mt-4">Lecturer material (PDF/DOC/DOCX)</label>
<input
  type="file"
  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
  onChange={(e) => setNewMaterial(e.target.files?.[0] ?? null)}
/>
{newMaterial && (
  <p className="mt-1 text-xs text-slate-600">Selected: {newMaterial.name}</p>
)}

              <label className="block text-sm mt-4">Class</label>
              <select
                className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                value={newClassId}
                onChange={(e) => setNewClassId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select a class</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>

              <label className="block text-sm mt-4">Due date</label>
              <input
                type="date"
                className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />

              <label className="block text-sm mt-4">Submission settings</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="allowResubCreate"
                  type="checkbox"
                  checked={allowResub}
                  onChange={(e) => setAllowResub(e.target.checked)}
                />
                <label htmlFor="allowResubCreate" className="text-sm text-slate-700">
                  Allow resubmissions
                </label>
              </div>

              <div className="mt-3">
                <label className="block text-sm">Max attempts</label>
                <input
                  type="number"
                  min={1}
                  className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value || 1)))}
                />
                <div className="mt-1 text-xs text-slate-500">Must be ≥ 1.</div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="studentReportVisibleCreate"
                    type="checkbox"
                    className="mt-1"
                    checked={studentCanViewReport}
                    onChange={(e) => setStudentCanViewReport(e.target.checked)}
                  />
                  <div>
                    <label htmlFor="studentReportVisibleCreate" className="text-sm font-medium text-slate-800">
                      Students can view the generated report
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      When enabled, finalized plagiarism and AI report details appear in the student report view.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t bg-white px-6 py-4 flex justify-end gap-3">
              <button
                className="rounded-full px-4 py-2 bg-slate-100 hover:bg-slate-200"
                onClick={resetCreateModal}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className="rounded-full px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                onClick={createAssignment}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- VIEW / EDIT MODAL ---------------- */}
      {viewOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="max-h-[85vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold">
                {editMode ? "Edit Assignment" : "Assignment Details"}
              </h3>
              <p className="text-slate-600 mt-1">
                {detail?.class?.code ? `Class: ${detail.class.code} — ${detail.class.name}` : " "}
              </p>

              {viewErr && <p className="mt-3 text-sm text-red-600">{viewErr}</p>}
              {viewLoading && <p className="mt-3 text-sm text-slate-600">Loading…</p>}

              {!viewLoading && detail && (
                <>
                  <label className="block text-sm mt-4">Title</label>
                  <input
                    className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                    value={eTitle}
                    onChange={(e) => setETitle(e.target.value)}
                    disabled={!editMode}
                  />

                  <label className="block text-sm mt-4">Details / Instructions</label>
                  <textarea
                    className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border h-36 resize-y"
                    value={eDesc}
                    onChange={(e) => setEDesc(e.target.value)}
                    disabled={!editMode}
                  />

                  {/* ✅ ADD THIS BLOCK RIGHT HERE */}
    {detail?.materialUrl && (
      <div className="mt-4">
        <div className="text-sm font-medium">Lecturer material</div>
        <a
          className="text-sm text-blue-600 underline"
          href={`${API_BASE_URL}${detail.materialUrl}`}
          target="_blank"
          rel="noreferrer"
        >
          Download: {detail.materialName || "material"}
        </a>
      </div>
    )}

                  <label className="block text-sm mt-4">Due date</label>
                  <input
                    type="date"
                    className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                    value={eDue}
                    onChange={(e) => setEDue(e.target.value)}
                    disabled={!editMode}
                  />

                  <label className="block text-sm mt-4">Submission settings</label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      id="allowResubEdit"
                      type="checkbox"
                      checked={eAllowResub}
                      onChange={(e) => setEAllowResub(e.target.checked)}
                      disabled={!editMode}
                    />
                    <label htmlFor="allowResubEdit" className="text-sm text-slate-700">
                      Allow resubmissions
                    </label>
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm">Max attempts</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full mt-1 px-4 py-2 rounded-xl bg-slate-50 border"
                      value={eMaxAttempts}
                      onChange={(e) =>
                        setEMaxAttempts(Math.max(1, Number(e.target.value || 1)))
                      }
                      disabled={!editMode}
                    />
                    <div className="mt-1 text-xs text-slate-500">Must be ≥ 1.</div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id="studentReportVisibleEdit"
                        type="checkbox"
                        className="mt-1"
                        checked={eStudentCanViewReport}
                        onChange={(e) => setEStudentCanViewReport(e.target.checked)}
                        disabled={!editMode}
                      />
                      <div>
                        <label htmlFor="studentReportVisibleEdit" className="text-sm font-medium text-slate-800">
                          Students can view the generated report
                        </label>
                        <p className="mt-1 text-xs text-slate-500">
                          Turn this on when students should be allowed to open the report with plagiarism and AI highlights.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t bg-white px-6 py-4 flex justify-end gap-3">
              {!editMode ? (
                <>
                  <button
                    className="rounded-full px-4 py-2 bg-slate-100 hover:bg-slate-200"
                    onClick={closeViewModal}
                    disabled={saving}
                  >
                    Close
                  </button>
                  <button
                    className="rounded-full px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    onClick={() => setEditMode(true)}
                    disabled={!detail || saving}
                  >
                    Edit
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="rounded-full px-4 py-2 bg-slate-100 hover:bg-slate-200"
                    onClick={() => {
                      if (!detail) return;
                      setEditMode(false);
                      setViewErr(null);
                      setETitle(detail.title ?? "");
                      setEDesc(detail.description ?? "");
                      setEDue(isoToDateInput(detail.due_at));
                      setEAllowResub(!!detail.allow_resubmission);
                      setEMaxAttempts(Number(detail.max_attempts || 1));
                      setEStudentCanViewReport(!!detail.student_report_visible);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    onClick={saveAssignment}
                    disabled={saving || !detail}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
