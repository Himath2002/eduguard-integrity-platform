import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api } from "@/shared/lib/api";
import { resolveAuthIdent } from "@/shared/lib/authIdentity";
import { useLecturerTheme } from "@/shared/theme/lecturerTheme";

type LecturerClass = { id: string; name: string; code: string };

type LecturerSettings = {
  classId: string;
  latePenaltyPercentPerDay: number;
  allowResubmission: boolean;
  plagiarismThresholdPercent: number;
  aiThresholdPercent: number;
  emailNotifications: "all" | "important" | "none";
};

const SETTINGS_KEY = "eduguard.lecturer.class-settings";

const defaultSettingsForClass = (classId: string): LecturerSettings => ({
  classId,
  latePenaltyPercentPerDay: 10,
  allowResubmission: true,
  plagiarismThresholdPercent: 10,
  aiThresholdPercent: 15,
  emailNotifications: "all",
});

function readStoredSettings(): Record<string, LecturerSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LecturerSettings>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredSettings(next: Record<string, LecturerSettings>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

function SettingsLocalCSS() {
  return (
    <style>{`
      .lecturer-settings-page {
        color: rgba(15, 23, 42, 0.96);
      }

      .lecturer-settings-page.settings-dark {
        color: rgba(248, 250, 252, 0.96);
      }

      .lecturer-settings-page .settings-glass {
        position: relative;
        overflow: hidden;
        border-radius: 1.5rem;
        transition: transform .24s ease, box-shadow .24s ease, border-color .24s ease;
      }

      .lecturer-settings-page .settings-glass::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(80% 120% at 8% 0%, var(--cardGlowA, rgba(99,102,241,.12)) 0%, transparent 55%),
          radial-gradient(80% 120% at 96% 18%, var(--cardGlowB, rgba(34,211,238,.10)) 0%, transparent 58%),
          linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,0));
        opacity: .9;
      }

      .lecturer-settings-page .settings-glass > * {
        position: relative;
        z-index: 1;
      }

      .lecturer-settings-page .settings-glass:hover {
        transform: translateY(-3px);
      }

      .lecturer-settings-page.settings-light .settings-title,
      .lecturer-settings-page.settings-light .settings-heading,
      .lecturer-settings-page.settings-light .settings-label,
      .lecturer-settings-page.settings-light .settings-strong {
        color: rgba(15, 23, 42, 0.96) !important;
      }

      .lecturer-settings-page.settings-light .settings-muted {
        color: rgba(51, 65, 85, 0.82) !important;
      }

      .lecturer-settings-page.settings-light .settings-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(203, 213, 225, 0.76);
        box-shadow:
          0 22px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(18px) saturate(130%);
        -webkit-backdrop-filter: blur(18px) saturate(130%);
      }

      .lecturer-settings-page.settings-dark .settings-title,
      .lecturer-settings-page.settings-dark .settings-heading,
      .lecturer-settings-page.settings-dark .settings-label,
      .lecturer-settings-page.settings-dark .settings-strong {
        color: rgba(248, 250, 252, 0.98) !important;
      }

      .lecturer-settings-page.settings-dark .settings-muted {
        color: rgba(203, 213, 225, 0.82) !important;
      }

      .lecturer-settings-page.settings-dark .settings-card {
        background: rgba(8, 15, 32, 0.82);
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow:
          0 24px 60px rgba(2, 6, 23, 0.36),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(18px) saturate(130%);
        -webkit-backdrop-filter: blur(18px) saturate(130%);
      }

      .lecturer-settings-page .settings-input {
        width: 100%;
        border-radius: 1rem;
        padding: .72rem .95rem;
        font-size: .92rem;
        outline: none;
        transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
      }

      .lecturer-settings-page.settings-light .settings-input {
        color: rgba(15, 23, 42, .92);
        background: rgba(255, 255, 255, .78);
        border: 1px solid rgba(203, 213, 225, .92);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
      }

      .lecturer-settings-page.settings-dark .settings-input {
        color: rgba(248, 250, 252, .94);
        background: rgba(2, 6, 23, .44);
        border: 1px solid rgba(148, 163, 184, .24);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      }

      .lecturer-settings-page .settings-input:focus {
        border-color: rgba(99, 102, 241, .75);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, .15);
      }

      .lecturer-settings-page.settings-dark .settings-input option {
        color: #0f172a;
        background: #ffffff;
      }

      .lecturer-settings-page .settings-divider {
        border-color: rgba(148, 163, 184, .16);
      }

      .lecturer-settings-page.settings-light .settings-savebar {
        background: rgba(255, 255, 255, .72);
        border: 1px solid rgba(203, 213, 225, .78);
        box-shadow: 0 18px 44px rgba(15,23,42,.08);
      }

      .lecturer-settings-page.settings-dark .settings-savebar {
        background: rgba(8, 15, 32, .76);
        border: 1px solid rgba(148, 163, 184, .22);
        box-shadow: 0 24px 55px rgba(2,6,23,.34);
      }
    `}</style>
  );
}

const accentMap = {
  class: {
    bar: "from-cyan-400 via-blue-500 to-indigo-500",
    glowA: "rgba(34,211,238,.18)",
    glowB: "rgba(99,102,241,.14)",
    badge: "bg-cyan-500/10 text-cyan-700 border-cyan-300/45",
    darkBadge: "bg-cyan-400/10 text-cyan-200 border-cyan-300/25",
  },
  detection: {
    bar: "from-violet-500 via-fuchsia-500 to-pink-500",
    glowA: "rgba(139,92,246,.16)",
    glowB: "rgba(236,72,153,.14)",
    badge: "bg-violet-500/10 text-violet-700 border-violet-300/45",
    darkBadge: "bg-violet-400/10 text-violet-200 border-violet-300/25",
  },
  notification: {
    bar: "from-emerald-400 via-teal-500 to-cyan-500",
    glowA: "rgba(16,185,129,.16)",
    glowB: "rgba(34,211,238,.14)",
    badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300/45",
    darkBadge: "bg-emerald-400/10 text-emerald-200 border-emerald-300/25",
  },
} as const;

function SectionCard({
  title,
  subtitle,
  tone,
  isDark,
  children,
}: {
  title: string;
  subtitle: string;
  tone: keyof typeof accentMap;
  isDark: boolean;
  children: ReactNode;
}) {
  const accent = accentMap[tone];

  return (
    <section
      className="settings-card settings-glass"
      style={
        {
          "--cardGlowA": accent.glowA,
          "--cardGlowB": accent.glowB,
        } as React.CSSProperties
      }
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b ${accent.bar}`} />

      <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-indigo-500">
            Settings group
          </p>
          <h2 className="settings-heading mt-2 text-lg font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="settings-muted mt-1 text-sm leading-6">{subtitle}</p>
        </div>

        <span
          className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            isDark ? accent.darkBadge : accent.badge
          }`}
        >
          Active
        </span>
      </div>

      <div className="h-px bg-slate-200/50 dark:bg-slate-700/40" />
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 py-4 md:grid-cols-[240px_1fr] md:gap-6">
      <div className="settings-label text-sm font-semibold">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function LecturerSettingsPage() {
  const { theme } = useLecturerTheme();
  const isDark = theme === "dark";
  const auth = useSelector((s: RootState) => s.auth) as {
    userId?: string | null;
    username?: string | null;
    email?: string | null;
  };
  const ident = resolveAuthIdent(auth);

  const [classes, setClasses] = useState<LecturerClass[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [settings, setSettings] = useState<LecturerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [err, setErr] = useState<string>("");

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ident) {
        setErr("Lecturer account details are not available.");
        return;
      }
      try {
        const data = await api<LecturerClass[]>(
          `/lecturer/${encodeURIComponent(ident)}/classes`
        );
        if (!mounted) return;
        setClasses(data ?? []);
        setClassId((prev) => prev || String(data?.[0]?.id || ""));
      } catch (e: any) {
        if (!mounted) return;
        setErr(String(e?.message || "Failed to load classes"));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ident]);

  useEffect(() => {
    if (!classId) {
      setSettings(null);
      return;
    }
    setErr("");
    const stored = readStoredSettings();
    setSettings(stored[classId] || defaultSettingsForClass(classId));
  }, [classId]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSavedTick(false);
    setErr("");
    try {
      const stored = readStoredSettings();
      stored[settings.classId] = settings;
      saveStoredSettings(stored);
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 1500);
    } catch (e: any) {
      setErr(String(e?.message || "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`lecturer-settings-page ${isDark ? "settings-dark" : "settings-light"} w-full`}
    >
      <SettingsLocalCSS />

      <div className="mx-auto max-w-[1200px] px-6 pb-12 pt-8">
        <header
          className={[
            "relative mb-7 overflow-hidden rounded-[30px] border px-6 py-7 backdrop-blur-2xl",
            isDark
              ? "border-slate-700/40 bg-slate-900/58 shadow-[0_24px_70px_rgba(2,6,23,0.34)]"
              : "border-white/80 bg-white/76 shadow-[0_24px_60px_rgba(15,23,42,0.08)]",
          ].join(" ")}
        >
          <div
            className={[
              "pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full blur-3xl",
              isDark ? "bg-indigo-500/18" : "bg-indigo-300/18",
            ].join(" ")}
          />
          <div
            className={[
              "pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full blur-3xl",
              isDark ? "bg-cyan-500/14" : "bg-cyan-300/18",
            ].join(" ")}
          />
          <div
            className={[
              "pointer-events-none absolute bottom-0 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full blur-3xl",
              isDark ? "bg-violet-500/10" : "bg-violet-200/24",
            ].join(" ")}
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.36em] text-indigo-500">
                Lecturer workspace
              </p>
              <h1 className="settings-title mt-2 text-3xl font-extrabold tracking-tight">
                Settings
              </h1>
              <p className="settings-muted mt-2 max-w-2xl text-sm leading-6">
                Manage class policies, detection limits, and notification rules.
              </p>
            </div>

            <div
              className={[
                "rounded-2xl border px-4 py-3 text-sm backdrop-blur-md",
                isDark
                  ? "border-slate-600/30 bg-slate-900/45 shadow-[0_16px_36px_rgba(2,6,23,0.26)]"
                  : "border-white/85 bg-white/72 shadow-[0_14px_34px_rgba(15,23,42,0.08)]",
              ].join(" ")}
            >
              <p className="settings-muted text-[11px] uppercase tracking-[0.24em]">
                Editing
              </p>
              <p className="settings-strong mt-1 font-bold">
                {selectedClass ? `${selectedClass.code} - ${selectedClass.name}` : "No class selected"}
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          <SectionCard
            title="Class Policies"
            subtitle="Control how selected class submissions and resubmissions should be handled."
            tone="class"
            isDark={isDark}
          >
            <div className="divide-y settings-divider">
              <Row label="Select class">
                <select
                  className="settings-input"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  {classes.length === 0 ? (
                    <option value="">No classes available</option>
                  ) : null}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </Row>

              <Row label="Late Submission Penalty (% per day)">
                <select
                  className="settings-input"
                  value={settings?.latePenaltyPercentPerDay ?? 10}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            latePenaltyPercentPerDay: Number(e.target.value),
                          }
                        : s
                    )
                  }
                  disabled={!settings}
                >
                  {Array.from({ length: 21 }).map((_, i) => {
                    const val = i * 5;
                    return (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    );
                  })}
                </select>
              </Row>

              <Row label="Allow Resubmission">
                <select
                  className="settings-input"
                  value={settings?.allowResubmission ? "yes" : "no"}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, allowResubmission: e.target.value === "yes" } : s
                    )
                  }
                  disabled={!settings}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Row>
            </div>
          </SectionCard>

          <SectionCard
            title="Detection Settings"
            subtitle="Set the percentages used when reviewing plagiarism and AI detection results."
            tone="detection"
            isDark={isDark}
          >
            <div className="divide-y settings-divider">
              <Row label="Plagiarism Threshold (%)">
                <select
                  className="settings-input"
                  value={settings?.plagiarismThresholdPercent ?? 10}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            plagiarismThresholdPercent: Number(e.target.value),
                          }
                        : s
                    )
                  }
                  disabled={!settings}
                >
                  {Array.from({ length: 21 }).map((_, i) => {
                    const val = i * 5;
                    return (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    );
                  })}
                </select>
              </Row>

              <Row label="AI Detection Threshold (%)">
                <select
                  className="settings-input"
                  value={settings?.aiThresholdPercent ?? 15}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, aiThresholdPercent: Number(e.target.value) } : s
                    )
                  }
                  disabled={!settings}
                >
                  {Array.from({ length: 21 }).map((_, i) => {
                    const val = i * 5;
                    return (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    );
                  })}
                </select>
              </Row>
            </div>
          </SectionCard>

          <SectionCard
            title="Notifications"
            subtitle="Choose which lecturer alerts should be sent by email."
            tone="notification"
            isDark={isDark}
          >
            <div className="divide-y settings-divider">
              <Row label="Email Notifications">
                <select
                  className="settings-input"
                  value={settings?.emailNotifications ?? "all"}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            emailNotifications: e.target
                              .value as LecturerSettings["emailNotifications"],
                          }
                        : s
                    )
                  }
                  disabled={!settings}
                >
                  <option value="all">All events</option>
                  <option value="important">Important only</option>
                  <option value="none">None</option>
                </select>
              </Row>
            </div>
          </SectionCard>

          <div className="settings-savebar sticky bottom-4 z-10 flex flex-col items-start justify-between gap-3 rounded-2xl px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center">
            <div className="text-sm">
              {selectedClass ? (
                <span className="settings-muted">
                  Editing settings for{" "}
                  <span className="settings-strong font-semibold">
                    {selectedClass.name}
                  </span>
                </span>
              ) : (
                <span className="settings-muted">Choose a class to edit settings.</span>
              )}
              {savedTick ? (
                <span className="ml-3 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-300">
                  Saved
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              {err ? <div className="text-sm text-red-500">{err}</div> : null}

              <button
                type="button"
                onClick={save}
                disabled={!settings || saving}
                className="rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_36px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(59,130,246,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
