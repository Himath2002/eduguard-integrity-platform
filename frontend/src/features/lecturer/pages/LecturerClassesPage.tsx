import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { api } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { applyFilters, type FilterDefinition, type FilterRule } from "@/shared/lib/filtering";

type LecturerClass = {
  id: number;
  name: string;
  code: string;
  enrolled: number;
  activeAssignments: number;
  instructor: string;
  description?: string | null;
  created_at?: string | null;
};

const fetchClasses = (username: string) => api<LecturerClass[]>(`/lecturer/${username}/classes`);
const createClass = (username: string, body: { name: string; code: string; description?: string }) =>
  api<LecturerClass>(`/lecturer/${username}/classes`, {
    method: "POST",
    body,
  });
const deleteClass = (username: string, classId: number) =>
  api<{ ok: boolean }>(`/lecturer/${username}/classes/${classId}`, {
    method: "DELETE",
  });

export default function LecturerClassesPage() {
  const { userId } = useSelector((s: RootState) => s.auth);
  const username = userId || "";

  const [classes, setClasses] = useState<LecturerClass[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  const loadClasses = async (silent = false) => {
    if (!username) return;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const data = await fetchClasses(username);
      setClasses(data ?? []);
      if (silent) setErr(null);
    } catch (e: any) {
      if (!silent) setErr(e?.message || "Failed to load classes");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadClasses(true);
    }, 12000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const onCreate = async () => {
    if (!name.trim() || !code.trim()) {
      setErr("Name and code are required");
      return;
    }

    try {
      const created = await createClass(username, {
        name: name.trim(),
        code: code.trim(),
        description: description.trim() || undefined,
      });

      setClasses((prev) => [created, ...prev]);
      setOpen(false);
      setName("");
      setCode("");
      setDescription("");
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to create class");
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this class?")) return;

    try {
      await deleteClass(username, id);
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Failed to delete class");
    }
  };

  const classFilterDefinitions = useMemo<FilterDefinition<LecturerClass>[]>(() => [
    {
      key: "keyword",
      label: "Search",
      type: "text",
      hidden: true,
      placeholder: "Search class name, code or description",
      match: (item, value) => {
        const q = value.toLowerCase();
        return [item.name, item.code, item.description || "", item.instructor].join(" ").toLowerCase().includes(q);
      },
    },
    {
      key: "order",
      label: "Order",
      type: "select",
      options: [
        { value: "newest", label: "Newest created first" },
        { value: "oldest", label: "Oldest created first" },
        { value: "nameAZ", label: "Class name: A to Z" },
        { value: "nameZA", label: "Class name: Z to A" },
      ],
      match: () => true,
    },
    {
      key: "assignmentLoad",
      label: "Assignments",
      type: "select",
      options: [
        { value: "none", label: "No assignments yet" },
        { value: "active", label: "Has assignments" },
      ],
      match: (item, value) => (value === "none" ? Number(item.activeAssignments) === 0 : Number(item.activeAssignments) > 0),
    },
  ], []);

  const sortOrder = filters.find((rule) => rule.fieldKey === "order")?.value || "";
  const activeFilterRules = useMemo(() => filters.filter((rule) => rule.fieldKey !== "order"), [filters]);

  const filteredClasses = useMemo(() => {
    const filtered = applyFilters(classes, activeFilterRules, classFilterDefinitions);
    const safeCreatedAt = (item: LecturerClass) => {
      const time = new Date(item.created_at || String(item.id)).getTime();
      return Number.isNaN(time) ? item.id : time;
    };

    return [...filtered].sort((a, b) => {
      if (sortOrder === "newest") return safeCreatedAt(b) - safeCreatedAt(a);
      if (sortOrder === "oldest") return safeCreatedAt(a) - safeCreatedAt(b);
      if (sortOrder === "nameZA") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  }, [activeFilterRules, classFilterDefinitions, classes, sortOrder]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Your Classes</h1>
          <p className="mt-1 text-sm text-slate-600">View and manage your classes.</p>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-white font-semibold transition
                    bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700
                    shadow-[0_12px_34px_rgba(99,102,241,0.28)]
                    hover:shadow-[0_22px_70px_rgba(99,102,241,0.34)]
                    active:scale-[0.99]"
        >
          + Create Class
        </button>
      </div>

      <div className="mt-5">
        <FilterBuilder
          fields={classFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search classes, codes or descriptions"
        />
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <div className="text-slate-600">Loading…</div>
        ) : filteredClasses.length === 0 ? (
          <EmptyGlowCard onCreate={() => setOpen(true)} />
        ) : (
          filteredClasses.map((c, i) => (
            <LecturerClassGlowCard
              key={c.id}
              c={c}
              accent={i % 3 === 0 ? "indigo" : i % 3 === 1 ? "blue" : "violet"}
              onDelete={() => onDelete(c.id)}
            />
          ))
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/85 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.18)] backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-900">Create Class</h2>

            <div className="mt-4 space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class name" />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Class code" />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onCreate}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyGlowCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/55 p-6 backdrop-blur-xl shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <div
        className="pointer-events-none absolute -inset-16 blur-2xl opacity-70"
        style={{
          background: "radial-gradient(60% 60% at 50% 30%, rgba(99,102,241,.18), transparent 70%)",
        }}
      />
      <div className="relative">
        <div className="font-semibold text-slate-800">No classes yet.</div>
        <div className="mt-1 text-sm text-slate-600">
          Click <span className="font-medium">Create Class</span> to add one.
        </div>

        <button
          onClick={onCreate}
          className="mt-4 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 font-semibold text-white transition hover:from-indigo-600 hover:to-blue-700 shadow-[0_12px_34px_rgba(99,102,241,0.28)]"
        >
          + Create Class
        </button>
      </div>
    </div>
  );
}

function LecturerClassGlowCard({
  c,
  accent,
  onDelete,
}: {
  c: LecturerClass;
  accent: "indigo" | "blue" | "violet";
  onDelete: () => void;
}) {
  const halo =
    accent === "indigo"
      ? "radial-gradient(60% 60% at 50% 30%, rgba(99,102,241,.20), transparent 70%)"
      : accent === "blue"
      ? "radial-gradient(60% 60% at 50% 30%, rgba(59,130,246,.18), transparent 70%)"
      : "radial-gradient(60% 60% at 50% 30%, rgba(139,92,246,.20), transparent 70%)";

  const stripe =
    accent === "indigo"
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : accent === "blue"
      ? "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(99,102,241))"
      : "linear-gradient(180deg, rgb(139,92,246), rgb(99,102,241), rgb(236,72,153))";

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-3xl",
        "border border-white/60 bg-white/55 backdrop-blur-xl",
        "shadow-[0_14px_40px_rgba(15,23,42,0.07)]",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-[0_28px_90px_rgba(99,102,241,0.20)]",
        "p-6",
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute -inset-14 opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: halo }}
      />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-2" style={{ background: stripe }} />

      <div className="relative">
        <h2 className="text-xl font-semibold text-slate-900">{c.name}</h2>

        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">Instructor:</span> {c.instructor}
          </div>
          <div>
            <span className="text-slate-500">Code:</span> {c.code}
          </div>
          <div>
            <span className="text-slate-500">Students enrolled:</span> {c.enrolled}
          </div>
          <div>
            <span className="text-slate-500">Assignments:</span> {c.activeAssignments}
          </div>
          {c.description ? (
            <div>
              <span className="text-slate-500">Description:</span> {c.description}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onDelete}
            className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
