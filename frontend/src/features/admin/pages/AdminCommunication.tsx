import { useEffect, useMemo, useState } from "react";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type Announcement = {
  id: number;
  audience: "all" | "students" | "lecturers" | "admins";
  subject: string;
  body: string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

const INITIAL_HISTORY_LIMIT = 4;
const BODY_PREVIEW_LIMIT = 180;

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function AdminCommunicationCSS() {
  return (
    <style>{`
      .admin-communication-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-communication-page-only.admin-communication-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-communication-light-only .admin-communication-heading {
        color: rgb(15, 23, 42);
      }

      .admin-communication-dark-only .admin-communication-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-communication-light-only .admin-communication-subtext {
        color: rgb(71, 85, 105);
      }

      .admin-communication-dark-only .admin-communication-subtext {
        color: rgb(170, 185, 207);
      }

      .admin-communication-search-shell {
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-communication-light-only .admin-communication-search-shell {
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(226, 232, 240, 0.9);
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-communication-dark-only .admin-communication-search-shell {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.07), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 18px 50px rgba(2, 6, 23, 0.34);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .admin-communication-dark-only .admin-communication-search-shell input,
      .admin-communication-dark-only .admin-communication-input,
      .admin-communication-dark-only .admin-communication-select,
      .admin-communication-dark-only .admin-communication-textarea {
        background: rgba(8, 15, 29, 0.92) !important;
        color: rgb(226, 232, 240) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        color-scheme: dark;
      }

      .admin-communication-dark-only .admin-communication-search-shell input::placeholder,
      .admin-communication-dark-only .admin-communication-input::placeholder,
      .admin-communication-dark-only .admin-communication-textarea::placeholder {
        color: rgb(125, 140, 163) !important;
      }

      .admin-communication-dark-only .admin-communication-select option {
        background-color: rgb(8, 15, 29) !important;
        color: rgb(226, 232, 240) !important;
      }

      .admin-communication-dark-only .admin-communication-select option:checked {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22)),
          rgb(15, 23, 42) !important;
        color: rgb(248, 250, 252) !important;
      }

      .admin-communication-panel {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.25rem;
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-communication-light-only .admin-communication-panel {
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

      .admin-communication-dark-only .admin-communication-panel {
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

      .admin-communication-panel::before {
        content: "";
        position: absolute;
        inset: -5rem;
        pointer-events: none;
        z-index: 0;
        opacity: 0.4;
        background:
          radial-gradient(55% 55% at 20% 20%, rgba(99, 102, 241, 0.12), transparent 70%),
          radial-gradient(48% 48% at 80% 15%, rgba(34, 211, 238, 0.10), transparent 72%);
      }

      .admin-communication-panel-content {
        position: relative;
        z-index: 2;
      }

      .admin-communication-light-only .admin-communication-panel-title {
        color: rgb(15, 23, 42);
      }

      .admin-communication-dark-only .admin-communication-panel-title {
        color: rgb(248, 250, 252);
      }

      .admin-communication-light-only .admin-communication-copy {
        color: rgb(71, 85, 105);
      }

      .admin-communication-dark-only .admin-communication-copy {
        color: rgb(199, 212, 232);
      }

      .admin-communication-light-only .admin-communication-label {
        color: rgb(51, 65, 85);
      }

      .admin-communication-dark-only .admin-communication-label {
        color: rgb(203, 213, 225);
      }

      .admin-communication-light-only .admin-communication-muted {
        color: rgb(100, 116, 139);
      }

      .admin-communication-dark-only .admin-communication-muted {
        color: rgb(148, 163, 184);
      }

      .admin-announcement-card {
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

      .admin-announcement-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .admin-communication-light-only .admin-announcement-card {
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

      .admin-communication-light-only .admin-announcement-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .admin-communication-dark-only .admin-announcement-card {
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

      .admin-communication-dark-only .admin-announcement-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .admin-announcement-card-shine {
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

      .admin-communication-dark-only .admin-announcement-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .admin-announcement-card:hover .admin-announcement-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .admin-announcement-card-halo {
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

      .admin-announcement-card:hover .admin-announcement-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .admin-announcement-card-content {
        position: relative;
        z-index: 4;
      }

      .admin-announcement-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .admin-communication-light-only .admin-announcement-title {
        color: rgb(15, 23, 42);
      }

      .admin-communication-dark-only .admin-announcement-title {
        color: rgb(248, 250, 252);
      }

      .admin-communication-light-only .admin-announcement-body {
        color: rgb(51, 65, 85);
      }

      .admin-communication-dark-only .admin-announcement-body {
        color: rgb(199, 212, 232);
      }

      .admin-communication-light-only .admin-announcement-time {
        color: rgb(100, 116, 139);
      }

      .admin-communication-dark-only .admin-announcement-time {
        color: rgb(148, 163, 184);
      }

      .admin-audience-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.3rem 0.75rem;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .admin-communication-light-only .admin-audience-pill {
        background: rgba(99, 102, 241, 0.1);
        color: rgb(67, 56, 202);
        border: 1px solid rgba(99, 102, 241, 0.16);
      }

      .admin-communication-dark-only .admin-audience-pill {
        background: rgba(34, 211, 238, 0.1);
        color: rgb(165, 243, 252);
        border: 1px solid rgba(34, 211, 238, 0.18);
      }

      .admin-items-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.75rem;
        font-weight: 700;
      }

      .admin-communication-light-only .admin-items-pill {
        background: rgba(241, 245, 249, 0.92);
        color: rgb(51, 65, 85);
        border: 1px solid rgba(226, 232, 240, 0.85);
      }

      .admin-communication-dark-only .admin-items-pill {
        background: rgba(15, 23, 42, 0.78);
        color: rgb(203, 213, 225);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }

      .admin-communication-empty-card {
        border-radius: 1.25rem;
        padding: 1.5rem;
        font-size: 0.875rem;
      }

      .admin-communication-light-only .admin-communication-empty-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        color: rgb(71, 85, 105);
      }

      .admin-communication-dark-only .admin-communication-empty-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.05), transparent 44%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        color: rgb(148, 163, 184);
      }

      .admin-communication-clear-button,
      .admin-communication-more-button,
      .admin-announcement-more-button {
        transition:
          color 180ms ease,
          transform 180ms ease,
          background 180ms ease,
          border-color 180ms ease;
      }

      .admin-communication-clear-button:hover,
      .admin-communication-more-button:hover,
      .admin-announcement-more-button:hover {
        transform: translateY(-1px);
      }

      .admin-communication-light-only .admin-communication-clear-button {
        color: rgb(71, 85, 105);
      }

      .admin-communication-light-only .admin-communication-clear-button:hover {
        color: rgb(15, 23, 42);
      }

      .admin-communication-dark-only .admin-communication-clear-button {
        color: rgb(170, 185, 207);
      }

      .admin-communication-dark-only .admin-communication-clear-button:hover {
        color: rgb(248, 250, 252);
      }

      .admin-communication-light-only .admin-communication-more-button {
        border: 1px solid rgba(226, 232, 240, 0.9);
        background: rgba(255, 255, 255, 0.8);
        color: rgb(51, 65, 85);
      }

      .admin-communication-light-only .admin-communication-more-button:hover {
        background: rgb(255, 255, 255);
        color: rgb(15, 23, 42);
      }

      .admin-communication-dark-only .admin-communication-more-button {
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(15, 23, 42, 0.72);
        color: rgb(203, 213, 225);
      }

      .admin-communication-dark-only .admin-communication-more-button:hover {
        background: rgba(30, 41, 59, 0.86);
        color: rgb(248, 250, 252);
      }

      .admin-communication-light-only .admin-announcement-more-button {
        color: rgb(79, 70, 229);
      }

      .admin-communication-dark-only .admin-announcement-more-button {
        color: rgb(103, 232, 249);
      }
    `}</style>
  );
}

function AnnouncementCard({
  item,
  index,
  expanded,
  onToggleExpand,
  onDelete,
}: {
  item: Announcement;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {
  const stripe =
    index % 2 === 0
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(16,185,129))";

  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(16,185,129,.13), transparent 72%)";

  const isLong = item.body.length > BODY_PREVIEW_LIMIT;
  const displayBody =
    !isLong || expanded
      ? item.body
      : `${item.body.slice(0, BODY_PREVIEW_LIMIT).trim()}...`;

  return (
    <div className="admin-announcement-card p-5">
      <div className="admin-announcement-stripe" style={{ background: stripe }} />
      <div className="admin-announcement-card-halo" style={{ background: halo }} />
      <div className="admin-announcement-card-shine" />

      <div className="admin-announcement-card-content pl-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="admin-announcement-title break-words text-base font-semibold">
                {item.subject}
              </h3>
              <span className="admin-audience-pill">{item.audience}</span>
            </div>

            <p className="admin-announcement-body mt-3 whitespace-pre-wrap text-sm leading-7">
              {displayBody}
            </p>

            {isLong && (
              <button
                type="button"
                className="admin-announcement-more-button mt-2 text-sm font-semibold hover:underline"
                onClick={onToggleExpand}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}

            <div className="admin-announcement-time mt-4 text-xs">
              Created: {formatWhen(item.created_at)} · Updated: {formatWhen(item.updated_at)}
            </div>
          </div>

          <button
            className="shrink-0 rounded-full border border-rose-300/70 px-4 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/10 hover:text-rose-400"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCommunications() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [audience, setAudience] = useState<Announcement["audience"]>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<number[]>([]);

  const loadAnnouncements = async () => {
    setLoading(true);

    try {
      const data = await api<Announcement[]>("/admin/announcements");
      setAnnouncements(data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  useEffect(() => {
    setShowAllHistory(false);
    setExpandedAnnouncementIds([]);
  }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return announcements;

    return announcements.filter((item) =>
      [item.subject, item.body, item.audience]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [announcements, search]);

  const visibleAnnouncements = useMemo(() => {
    return showAllHistory ? filtered : filtered.slice(0, INITIAL_HISTORY_LIMIT);
  }, [filtered, showAllHistory]);

  const hiddenCount = Math.max(0, filtered.length - visibleAnnouncements.length);

  const sendAnnouncement = async () => {
    if (!subject.trim()) {
      alert("Subject is required");
      return;
    }

    if (!body.trim()) {
      alert("Message is required");
      return;
    }

    setSaving(true);

    try {
      await api("/admin/announcements", {
        method: "POST",
        body: {
          audience,
          subject: subject.trim(),
          body: body.trim(),
        },
      });

      setSubject("");
      setBody("");
      setAudience("all");
      setShowAllHistory(false);
      setExpandedAnnouncementIds([]);
      await loadAnnouncements();
    } catch (e: any) {
      alert(e?.message || "Failed to send announcement");
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!window.confirm("Delete this announcement?")) return;

    try {
      await api(`/admin/announcements/${id}`, { method: "DELETE" });
      setExpandedAnnouncementIds((prev) => prev.filter((itemId) => itemId !== id));
      await loadAnnouncements();
    } catch (e: any) {
      alert(e?.message || "Failed to delete announcement");
    }
  };

  const clearForm = () => {
    setAudience("all");
    setSubject("");
    setBody("");
  };

  const toggleAnnouncementExpand = (id: number) => {
    setExpandedAnnouncementIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id]
    );
  };

  return (
    <div
      className={[
        "admin-communication-page-only relative min-h-[calc(100vh-160px)] space-y-8",
        isDark ? "admin-communication-dark-only" : "admin-communication-light-only",
      ].join(" ")}
    >
      <AdminCommunicationCSS />

      <div className="mt-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="admin-communication-heading text-3xl font-semibold">
            Communications
          </h1>
          <p className="admin-communication-subtext mt-1 text-sm">
            Publish institution-wide announcements and keep a clean record of what has been sent.
          </p>
        </div>

        <div className="admin-communication-search-shell w-full rounded-2xl p-3 md:w-96">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements"
            className="admin-communication-input"
          />
        </div>
      </div>

      <section className="admin-communication-panel p-6">
        <div className="admin-communication-panel-content">
          <h2 className="admin-communication-panel-title text-lg font-semibold">
            Send announcement
          </h2>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="admin-communication-label mb-2 block text-sm font-medium">
                Audience
              </label>

              <select
                className="admin-communication-select w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                value={audience}
                onChange={(e) => setAudience(e.target.value as Announcement["audience"])}
              >
                <option value="all">All users</option>
                <option value="students">Students</option>
                <option value="lecturers">Lecturers</option>
                <option value="admins">Admins</option>
              </select>
            </div>

            <div>
              <label className="admin-communication-label mb-2 block text-sm font-medium">
                Subject
              </label>

              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter announcement subject"
                className="admin-communication-input"
              />
            </div>

            <div>
              <label className="admin-communication-label mb-2 block text-sm font-medium">
                Message
              </label>

              <textarea
                className="admin-communication-textarea min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the announcement that should be published to the selected audience"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button disabled={saving} onClick={() => void sendAnnouncement()}>
                {saving ? "Sending…" : "Send announcement"}
              </Button>

              <button
                type="button"
                className="admin-communication-clear-button text-sm font-medium"
                onClick={clearForm}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-communication-panel p-6">
        <div className="admin-communication-panel-content">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="admin-communication-panel-title text-lg font-semibold">
                Announcement history
              </h2>
              <p className="admin-communication-copy text-sm">
                Review the communication record for the institution.
              </p>
            </div>

            <span className="admin-items-pill">{filtered.length} items</span>
          </div>

          {error && <div className="mt-4 text-sm text-red-500">{error}</div>}

          {loading && (
            <div className="admin-communication-copy mt-4 text-sm">
              Loading announcements…
            </div>
          )}

          <div className="mt-5 space-y-4">
            {visibleAnnouncements.map((item, index) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                index={index}
                expanded={expandedAnnouncementIds.includes(item.id)}
                onToggleExpand={() => toggleAnnouncementExpand(item.id)}
                onDelete={() => void deleteAnnouncement(item.id)}
              />
            ))}

            {!loading && filtered.length === 0 && (
              <div className="admin-communication-empty-card">
                No announcements match the current search.
              </div>
            )}
          </div>

          {!loading && filtered.length > INITIAL_HISTORY_LIMIT && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="admin-communication-more-button rounded-full px-6 py-2 text-sm font-semibold"
                onClick={() => setShowAllHistory((prev) => !prev)}
              >
                {showAllHistory
                  ? "Show less"
                  : `Show more${hiddenCount > 0 ? ` (${hiddenCount} more)` : ""}`}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}