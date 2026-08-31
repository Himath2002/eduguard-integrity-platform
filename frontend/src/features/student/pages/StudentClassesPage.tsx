import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api } from "@/shared/lib/api";
import FilterBuilder from "@/shared/components/FilterBuilder";
import { applyFilters, type FilterDefinition, type FilterRule } from "@/shared/lib/filtering";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";
import { useRealtimeEvents, type RealtimeEvent } from "@/shared/hooks/useRealtimeEvents";
import { useRefreshIndicator } from "@/shared/lib/refreshIndicator";

type StudentClassCard = {
  id: number | string;
  name: string;
  title?: string;
  code: string;
  instructor: string;
  assignmentsDue: number;
  joined_at?: string | null;
  created_at?: string | null;
};

const MAX_PINS = 4;

function getPinnedKey(ident: string) {
  return `eduguard.pinnedClasses.${ident}`;
}
function readPinned(ident: string): string[] {
  try {
    const raw = localStorage.getItem(getPinnedKey(ident));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}
function writePinned(ident: string, pins: string[]) {
  localStorage.setItem(getPinnedKey(ident), JSON.stringify(pins));
}

export default function StudentClassesPage() {
  const navigate = useNavigate();

  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string;
    username?: string;
    email?: string;
  };

  const ident = resolveAuthIdent(auth);

  const [classes, setClasses] = useState<StudentClassCard[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [pinned, setPinned] = useState<string[]>([]);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const { beginTask, updateTask, finishTask } = useRefreshIndicator();

  useEffect(() => {
    if (!ident) return;
    setPinned(readPinned(ident));
  }, [ident]);

  useEffect(() => {
    if (!pinMsg) return;
    const t = window.setTimeout(() => setPinMsg(null), 2600);
    return () => window.clearTimeout(t);
  }, [pinMsg]);

  const load = useCallback(async (silent = false) => {
    if (!ident) return;
    const taskId = beginTask(silent ? "Refreshing classes" : "Loading classes", silent ? 22 : 12);
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      updateTask(taskId, 45);
      const data = await api<StudentClassCard[]>(`/student/${ident}/classes`);
      const normalized = (data ?? []).map((item) => ({
        ...item,
        name: item.name || item.title || "Untitled class",
      }));
      setClasses(normalized);
      localStorage.setItem(`eduguard.classesCache.${ident}`, JSON.stringify(normalized));
      if (silent) setErr(null);
      updateTask(taskId, 85);
    } catch (e: any) {
      const cachedRaw = localStorage.getItem(`eduguard.classesCache.${ident}`);
      if (cachedRaw) {
        try {
          setClasses(JSON.parse(cachedRaw));
        } catch {
          // ignore cache parse errors
        }
      }
      if (!silent) setErr(e?.message || "Failed to load classes");
    } finally {
      updateTask(taskId, 100);
      finishTask(taskId);
      if (!silent) setLoading(false);
    }
  }, [ident, beginTask, updateTask, finishTask]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useRealtimeEvents("student", ident, useCallback((event: RealtimeEvent) => {
    if (["class_membership_changed", "submission_updated", "integrity_job", "mark_report_updated"].includes(event.type)) {
      void load(true);
    }
  }, [load]));

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const join = () => navigate("/student/classes?join=1");
  const isPinned = (code: string) => pinned.includes(code);

  const togglePin = (code: string) => {
    if (!ident) return;

    if (isPinned(code)) {
      const next = pinned.filter((c) => c !== code);
      setPinned(next);
      writePinned(ident, next);
      return;
    }

    if (pinned.length >= MAX_PINS) {
      setPinMsg("You can pin only 4 classes. Unpin one to pin this.");
      return;
    }

    const next = [code, ...pinned.filter((c) => c !== code)].slice(0, MAX_PINS);
    setPinned(next);
    writePinned(ident, next);
  };

  const classFilterDefinitions = useMemo<FilterDefinition<StudentClassCard>[]>(
    () => [
      {
        key: "keyword",
        label: "Search",
        type: "text",
        hidden: true,
        placeholder: "Search classes, unit codes or lecturers",
        match: (item, value) => {
          const q = value.toLowerCase();
          return [item.code, item.name, item.instructor].join(" ").toLowerCase().includes(q);
        },
      },
      {
        key: "classCode",
        label: "Class",
        type: "select",
        options: classes.map((item) => ({ value: item.code, label: `${item.code} — ${item.name}` })),
        getValue: (item) => item.code,
      },
      {
        key: "instructor",
        label: "Lecturer",
        type: "text",
        placeholder: "Type a lecturer name",
        match: (item, value) => item.instructor.toLowerCase().includes(value.toLowerCase()),
      },
      {
        key: "dueLoad",
        label: "Workload",
        type: "select",
        options: [
          { value: "none", label: "No pending assignments" },
          { value: "light", label: "1–2 assignments due" },
          { value: "heavy", label: "3+ assignments due" },
        ],
        match: (item, value) => {
          const count = Number(item.assignmentsDue || 0);
          if (value === "none") return count === 0;
          if (value === "light") return count >= 1 && count <= 2;
          if (value === "heavy") return count >= 3;
          return true;
        },
      },
      {
        key: "pinState",
        label: "Pin state",
        type: "select",
        options: [
          { value: "pinned", label: "Pinned only" },
          { value: "unpinned", label: "Unpinned only" },
        ],
        match: (item, value) => (value === "pinned" ? pinned.includes(item.code) : !pinned.includes(item.code)),
      },
      {
        key: "sortOrder",
        label: "Order",
        type: "select",
        options: [
          { value: "joinedNewest", label: "Joined: newest first" },
          { value: "joinedOldest", label: "Joined: oldest first" },
          { value: "nameAZ", label: "Class name: A to Z" },
          { value: "nameZA", label: "Class name: Z to A" },
        ],
        match: () => true,
      },
    ],
    [classes, pinned]
  );

  const sortOrder = filters.find((rule) => rule.fieldKey === "sortOrder")?.value || "";
  const activeFilterRules = useMemo(() => filters.filter((rule) => rule.fieldKey !== "sortOrder"), [filters]);

  const filteredClasses = useMemo(() => {
    const filtered = applyFilters(classes, activeFilterRules, classFilterDefinitions);
    const pIndex = new Map<string, number>();
    pinned.forEach((code, idx) => pIndex.set(code, idx));

    const safeJoinedAt = (item: StudentClassCard) => {
      const raw = item.joined_at || item.created_at || String(item.id);
      const time = new Date(raw).getTime();
      return Number.isNaN(time) ? Number(item.id) || 0 : time;
    };

    return [...filtered].sort((a, b) => {
      const ap = pIndex.has(a.code);
      const bp = pIndex.has(b.code);
      if (ap && bp) return (pIndex.get(a.code) ?? 0) - (pIndex.get(b.code) ?? 0);
      if (ap) return -1;
      if (bp) return 1;

      if (sortOrder === "joinedNewest") return safeJoinedAt(b) - safeJoinedAt(a);
      if (sortOrder === "joinedOldest") return safeJoinedAt(a) - safeJoinedAt(b);
      if (sortOrder === "nameZA") return String(b.name).localeCompare(String(a.name));
      return String(a.name).localeCompare(String(b.name));
    });
  }, [activeFilterRules, classFilterDefinitions, classes, pinned, sortOrder]);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Your Classes</h1>
          <p className="mt-1 text-sm text-slate-600">Join a class using the code provided by your lecturer.</p>
        </div>

        <button
          onClick={join}
          className="rounded-full px-5 py-2 text-white font-semibold transition
                     bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700
                     shadow-[0_12px_34px_rgba(16,185,129,0.28)]
                     hover:shadow-[0_20px_60px_rgba(16,185,129,0.34)]
                     active:scale-[0.99]"
        >
          + Join Class
        </button>
      </div>

      {pinMsg && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {pinMsg}
        </div>
      )}

      <div className="mt-5">
        <FilterBuilder
          fields={classFilterDefinitions}
          rules={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          quickFieldKey="keyword"
          quickPlaceholder="Search classes, unit codes or lecturers"
        />
      </div>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      {loading && <div className="mt-4 text-sm text-slate-600">Loading…</div>}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <JoinClassCard onClick={join} />

        {filteredClasses.map((c, i) => (
          <JoinedClassCard
            key={String(c.id)}
            c={c}
            accent={i % 2 === 0 ? "emerald" : "blue"}
            pinned={isPinned(c.code)}
            onTogglePin={() => togglePin(c.code)}
            onOpen={() => navigate(`/student/assignments?class_code=${encodeURIComponent(c.code)}`)}
          />
        ))}
      </div>
    </div>
  );
}

function JoinClassCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "student-join-card group relative text-left overflow-hidden rounded-3xl p-6",
        "border-2 border-dashed border-emerald-300/70",
        "bg-gradient-to-br from-emerald-50/90 via-white/70 to-sky-50/80",
        "shadow-[0_10px_30px_rgba(15,23,42,0.07)]",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(15,23,42,0.12)]",
        "active:scale-[0.99]",
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: "radial-gradient(55% 55% at 35% 25%, rgba(16,185,129,.25), transparent 70%)",
        }}
      />

      <div className="absolute right-5 top-5">
        <div
          className={[
            "grid h-12 w-12 place-items-center rounded-full text-white font-bold text-xl",
            "bg-gradient-to-br from-emerald-500 to-green-600",
            "shadow-[0_16px_40px_rgba(16,185,129,0.30)]",
            "group-hover:scale-[1.03] transition",
          ].join(" ")}
        >
          +
        </div>
      </div>

      <div className="relative pr-16">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-emerald-800 bg-emerald-100/80 border border-emerald-200/70">
          JOIN CLASS
        </div>

        <div className="mt-4 text-xl font-semibold text-slate-900">Add a class</div>
        <div className="mt-2 text-sm text-slate-600">Join using a Class Code.</div>

        <div className="mt-4 text-sm font-semibold text-emerald-700">Click to join →</div>
      </div>
    </button>
  );
}

function JoinedClassCard({
  c,
  accent,
  pinned,
  onTogglePin,
  onOpen,
}: {
  c: StudentClassCard;
  accent: "emerald" | "blue";
  pinned: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
}) {
  const halo =
    accent === "emerald"
      ? "radial-gradient(60% 60% at 50% 30%, rgba(16,185,129,.18), transparent 70%)"
      : "radial-gradient(60% 60% at 50% 30%, rgba(99,102,241,.18), transparent 70%)";

  const stripe =
    accent === "emerald"
      ? "linear-gradient(180deg, rgb(16,185,129), rgb(34,197,94), rgb(20,184,166))"
      : "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))";

  return (
    <div
      className={[
        "student-class-card group relative overflow-hidden rounded-3xl",
        "border border-white/60 bg-white/50 backdrop-blur-xl",
        "shadow-[0_14px_40px_rgba(15,23,42,0.07)]",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(15,23,42,0.10)]",
        "p-6",
      ].join(" ")}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <div
        className="pointer-events-none absolute -inset-12 opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: halo }}
      />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-2" style={{ background: stripe }} />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={[
          "student-class-pin absolute right-4 top-4 z-10 rounded-full px-3 py-1 text-xs font-semibold",
          "border shadow-sm transition",
          pinned
            ? "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200"
            : "bg-white/80 text-slate-700 border-white/60 hover:bg-white",
        ].join(" ")}
      >
        {pinned ? "📌 Pinned" : "📌 Pin"}
      </button>

      <div className="relative">
        <div className="text-lg font-semibold text-slate-900">{c.name}</div>

        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">Code:</span> {c.code}
          </div>
          <div>
            <span className="text-slate-500">Instructor:</span> {c.instructor}
          </div>
          <div>
            <span className="text-slate-500">Assignments due:</span> {c.assignmentsDue}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className={[
              "student-class-open rounded-full px-4 py-2 text-sm font-semibold text-white",
              "transition",
              accent === "emerald"
                ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                : "bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700",
              "shadow-[0_12px_34px_rgba(99,102,241,0.22)]",
            ].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
