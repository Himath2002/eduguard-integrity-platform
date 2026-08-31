import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/lib/api";
import { readCachedView, writeCachedView } from "@/shared/lib/viewCache";
import { useAdminTheme } from "@/shared/theme/adminTheme";

type AdminDashboardStats = {
  instructors: number;
  students: number;
  pending_submissions: number;
};

type Announcement = {
  id: number;
  audience: string;
  subject: string;
  body: string;
  created_at?: string | null;
};

type AdminDashboardSummary = AdminDashboardStats & {
  latest_announcement?: Announcement | null;
};

const ADMIN_DASHBOARD_CACHE_KEY = "eduguard.admin.dashboard";

const LocalCSS = () => (
  <style>{`
    .admin-dashboard-light-only {
      color: rgba(15,23,42,.96);
    }

    .admin-dashboard-dark-only {
      color: rgba(226,232,240,.96);
    }

    .admin-dashboard-light-only .dashboard-title {
      color: rgba(15,23,42,.96);
    }

    .admin-dashboard-dark-only .dashboard-title {
      color: rgba(248,250,252,.98);
      text-shadow: 0 0 28px rgba(34,211,238,.08);
    }

    .admin-dashboard-light-only .dashboard-subtext {
      color: rgba(71,85,105,.90);
    }

    .admin-dashboard-dark-only .dashboard-subtext {
      color: rgba(186,199,219,.84);
    }

    .admin-dashboard-light-only .glass-card,
    .admin-dashboard-dark-only .glass-card {
      position: relative;
      border-radius: 1.25rem;
      overflow: hidden;
      isolation: isolate;
      transition:
        transform .24s ease,
        box-shadow .24s ease,
        border-color .24s ease;
    }

    .admin-dashboard-light-only .glass-card {
      background: rgba(255,255,255,.58);
      border: 1px solid rgba(255,255,255,.70);
      box-shadow:
        0 18px 55px rgba(15,23,42,.10),
        0 8px 24px rgba(15,23,42,.06),
        inset 0 1px 0 rgba(255,255,255,.62),
        inset 0 -1px 0 rgba(0,0,0,.06);
      backdrop-filter: blur(14px) saturate(125%);
      -webkit-backdrop-filter: blur(14px) saturate(125%);
    }

    .admin-dashboard-dark-only .glass-card {
      background:
        radial-gradient(80% 90% at 18% 14%, rgba(34,211,238,.05), transparent 42%),
        linear-gradient(180deg, rgba(8,15,32,.95), rgba(6,12,24,.93));
      border: 1px solid rgba(148,163,184,.20);
      box-shadow:
        0 24px 60px rgba(2,6,23,.34),
        0 10px 28px rgba(2,6,23,.22),
        inset 0 1px 0 rgba(255,255,255,.04);
      backdrop-filter: blur(16px) saturate(130%);
      -webkit-backdrop-filter: blur(16px) saturate(130%);
    }

    .admin-dashboard-light-only .glass-card::before,
    .admin-dashboard-dark-only .glass-card::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      border-radius: inherit;
    }

    .admin-dashboard-light-only .glass-card::before {
      background:
        radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.42) 0%, transparent 56%),
        radial-gradient(90% 100% at 94% 10%, rgba(255,255,255,.16) 0%, transparent 65%);
      mix-blend-mode: screen;
    }

    .admin-dashboard-dark-only .glass-card::before {
      background:
        radial-gradient(120% 120% at 10% 0%, rgba(99,102,241,.12) 0%, transparent 54%),
        radial-gradient(95% 95% at 92% 12%, rgba(34,211,238,.09) 0%, transparent 62%),
        linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,0));
      mix-blend-mode: screen;
    }

    .admin-dashboard-light-only .glass-card::after,
    .admin-dashboard-dark-only .glass-card::after {
      content: "";
      position: absolute;
      top: -28%;
      bottom: -28%;
      left: -40%;
      width: 26%;
      pointer-events: none;
      z-index: 0;
      opacity: 0;
      transform: rotate(12deg);
      filter: blur(12px);
      transition:
        left .58s ease,
        opacity .24s ease;
    }

    .admin-dashboard-light-only .glass-card::after {
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,.26),
        transparent
      );
    }

    .admin-dashboard-dark-only .glass-card::after {
      background: linear-gradient(
        90deg,
        transparent,
        rgba(34,211,238,.10),
        transparent
      );
    }

    .admin-dashboard-light-only .glass-card:hover,
    .admin-dashboard-dark-only .glass-card:hover {
      transform: translateY(-4px);
    }

    .admin-dashboard-light-only .glass-card:hover::after,
    .admin-dashboard-dark-only .glass-card:hover::after {
      opacity: .72;
      left: 112%;
    }

    .admin-dashboard-light-only .glass-card > *,
    .admin-dashboard-dark-only .glass-card > * {
      position: relative;
      z-index: 1;
    }

    .admin-dashboard-light-only .surface-muted {
      background: rgba(255,255,255,.42);
      border: 1px solid rgba(255,255,255,.60);
    }

    .admin-dashboard-dark-only .surface-muted {
      background: rgba(8,15,32,.74);
      border: 1px solid rgba(148,163,184,.16);
    }

    .admin-dashboard-light-only .stat-value {
      color: rgba(15,23,42,.98);
    }

    .admin-dashboard-dark-only .stat-value {
      color: rgba(248,250,252,.98);
    }

    .admin-dashboard-light-only .muted-text {
      color: rgba(71,85,105,.90);
    }

    .admin-dashboard-dark-only .muted-text {
      color: rgba(186,199,219,.82);
    }

    .admin-dashboard-light-only .soft-text {
      color: rgba(100,116,139,.92);
    }

    .admin-dashboard-dark-only .soft-text {
      color: rgba(148,163,184,.84);
    }

    .admin-dashboard-light-only .notice-card {
      background: rgba(255,255,255,.62);
      border: 1px solid rgba(255,255,255,.72);
    }

    .admin-dashboard-dark-only .notice-card {
      background: rgba(8,15,32,.82);
      border: 1px solid rgba(148,163,184,.18);
    }

    .admin-dashboard-light-only .accent-chip,
    .admin-dashboard-dark-only .accent-chip {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      border-radius: 999px;
      padding: .35rem .8rem;
      font-size: .72rem;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .admin-dashboard-light-only .accent-chip {
      background: rgba(255,255,255,.60);
      border: 1px solid rgba(255,255,255,.72);
      color: rgba(71,85,105,.90);
    }

    .admin-dashboard-dark-only .accent-chip {
      background: rgba(15,23,42,.78);
      border: 1px solid rgba(148,163,184,.18);
      color: rgba(186,199,219,.88);
    }

    .admin-dashboard-light-only .action-title {
      color: rgba(15,23,42,.96);
    }

    .admin-dashboard-dark-only .action-title {
      color: rgba(248,250,252,.98);
    }

    .admin-dashboard-light-only .action-copy {
      color: rgba(51,65,85,.88);
    }

    .admin-dashboard-dark-only .action-copy {
      color: rgba(186,199,219,.82);
    }

    .admin-dashboard-light-only .action-footer {
      color: rgba(51,65,85,.88);
    }

    .admin-dashboard-dark-only .action-footer {
      color: rgba(203,213,225,.90);
    }

    .admin-dashboard-light-only .dashboard-error {
      color: rgba(220,38,38,.90);
    }

    .admin-dashboard-dark-only .dashboard-error {
      color: rgba(252,165,165,.96);
    }

    .admin-dashboard-light-only .dash-btn-soft,
    .admin-dashboard-dark-only .dash-btn-soft {
      border-radius: 999px;
      padding: .7rem 1rem;
      font-weight: 700;
      transition:
        transform .2s ease,
        opacity .2s ease,
        background .2s ease;
    }

    .admin-dashboard-light-only .dash-btn-soft {
      background: rgba(255,255,255,.72);
      border: 1px solid rgba(255,255,255,.78);
      color: rgba(51,65,85,.92);
    }

    .admin-dashboard-dark-only .dash-btn-soft {
      background: rgba(15,23,42,.82);
      border: 1px solid rgba(148,163,184,.18);
      color: rgba(226,232,240,.96);
    }

    .admin-dashboard-light-only .dash-btn-soft:hover,
    .admin-dashboard-dark-only .dash-btn-soft:hover {
      transform: translateY(-1px);
      opacity: .96;
    }
  `}</style>
);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { theme } = useAdminTheme();
  const isDarkMode = theme === "dark";
  const [notifOpen, setNotifOpen] = useState(true);

  const cachedSummary =
    readCachedView<AdminDashboardSummary>(ADMIN_DASHBOARD_CACHE_KEY);

  const [stats, setStats] = useState<AdminDashboardStats>({
    instructors: cachedSummary?.instructors ?? 0,
    students: cachedSummary?.students ?? 0,
    pending_submissions: cachedSummary?.pending_submissions ?? 0,
  });

  const [statsLoading, setStatsLoading] = useState(!cachedSummary);
  const [statsError, setStatsError] = useState("");
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(
    cachedSummary?.latest_announcement || null
  );

  const formatNum = useMemo(() => {
    const nf = new Intl.NumberFormat();
    return (n: number) => nf.format(n);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatsLoading(true);
      setStatsError("");

      try {
        const data = await api<AdminDashboardSummary>("/admin/dashboard/summary");
        if (cancelled) return;

        setStats({
          instructors: data?.instructors ?? 0,
          students: data?.students ?? 0,
          pending_submissions: data?.pending_submissions ?? 0,
        });
        setLatestAnnouncement(data?.latest_announcement || null);
        writeCachedView(ADMIN_DASHBOARD_CACHE_KEY, data, 60_000);
      } catch (e: any) {
        if (cancelled) return;
        setStatsError(e?.message ?? "Failed to load dashboard stats");
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const themeClass = isDarkMode
    ? "admin-dashboard-dark-only"
    : "admin-dashboard-light-only";

  return (
    <div className={`${themeClass} relative min-h-[calc(100vh-160px)] pb-8`}>
      <LocalCSS />

      <div
        className="pointer-events-none absolute -left-24 top-10 h-[22rem] w-[22rem] rounded-full blur-3xl"
        style={{
          opacity: isDarkMode ? 0.44 : 0.55,
          background: isDarkMode
            ? "radial-gradient(closest-side, rgba(34,211,238,.18), transparent)"
            : "radial-gradient(closest-side, rgba(140,90,255,.18), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-20 top-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
        style={{
          opacity: isDarkMode ? 0.42 : 0.52,
          background: isDarkMode
            ? "radial-gradient(closest-side, rgba(99,102,241,.16), transparent)"
            : "radial-gradient(closest-side, rgba(66,130,255,.18), transparent)",
        }}
      />

      <div className="mb-8 mt-8 text-center">
        <p className="soft-text text-[11px] font-semibold uppercase tracking-[0.34em]">
          Admin dashboard
        </p>
        <h1 className="dashboard-title mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          Welcome, Admin!
        </h1>
        <p className="dashboard-subtext mx-auto mt-3 max-w-[46rem] text-sm leading-6">
          Monitor institution-wide activity, review the latest platform update,
          and jump quickly into user, settings, and reporting workflows.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <GlassStat
          label="Instructors"
          value={statsLoading ? "…" : formatNum(stats.instructors)}
          icon={<UsersIcon />}
          tone="violet"
        />
        <GlassStat
          label="Students"
          value={statsLoading ? "…" : formatNum(stats.students)}
          icon={<GraduateIcon />}
          tone="emerald"
        />
        <GlassStat
          label="Pending submissions"
          value={statsLoading ? "…" : formatNum(stats.pending_submissions)}
          icon={<DocIcon />}
          tone="amber"
        />
      </div>

      {statsError && (
        <div className="dashboard-error mb-6 text-center text-sm">
          {statsError}
        </div>
      )}

      {notifOpen && (
        <div className="glass-card notice-card mb-8 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <WarningIcon />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="accent-chip">Latest notice</span>
                {latestAnnouncement?.audience ? (
                  <span className="accent-chip">{latestAnnouncement.audience}</span>
                ) : null}
              </div>

              {latestAnnouncement ? (
                <>
                  <p className="action-title text-base font-semibold">
                    {latestAnnouncement.subject}
                  </p>
                  <p className="soft-text mt-1 text-xs">
                    {latestAnnouncement.created_at
                      ? new Date(latestAnnouncement.created_at).toLocaleString()
                      : "—"}
                  </p>
                  <p className="muted-text mt-3 text-sm leading-6">
                    {latestAnnouncement.body}
                  </p>
                </>
              ) : (
                <p className="muted-text text-sm leading-6">
                  Core platform services are ready when the API, database,
                  storage, and websocket support are configured correctly.
                </p>
              )}
            </div>

            <button
              type="button"
              className="dash-btn-soft text-xl leading-none"
              title="Dismiss"
              onClick={() => setNotifOpen(false)}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="action-title text-lg font-bold">Quick actions</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ActionCard
            title="Manage Users"
            theme="violet"
            cta="Open"
            onCta={() => navigate("/admin/users")}
            footer={
              <span className="action-footer flex items-center gap-2">
                <UsersIcon className="h-5 w-5" /> Users
              </span>
            }
          >
            Create, disable, or reset accounts for staff and students.
          </ActionCard>

          <ActionCard
            title="Configure Settings"
            theme="emerald"
            cta="Open"
            onCta={() => navigate("/admin/settings")}
            footer={
              <span className="action-footer flex items-center gap-2">
                <CogIcon className="h-5 w-5" /> Settings
              </span>
            }
          >
            Adjust institution-wide preferences, thresholds, and integrations.
          </ActionCard>

          <ActionCard
            title="Review Reports"
            theme="amber"
            cta="Open"
            onCta={() => navigate("/admin/reports")}
            footer={
              <span className="action-footer flex items-center gap-2">
                <ChartIcon className="h-5 w-5" /> Reports
              </span>
            }
          >
            View institution insights, flagged submissions, and reporting trends.
          </ActionCard>
        </div>
      </section>
    </div>
  );
}

function GlassStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "violet" | "emerald" | "amber";
}) {
  const palette: Record<
    "violet" | "emerald" | "amber",
    {
      halo1: string;
      halo2: string;
      tint1: string;
      tint2: string;
      edge: string;
      badge: string;
    }
  > = {
    violet: {
      halo1: "rgba(99,102,241,.18)",
      halo2: "rgba(34,211,238,.10)",
      tint1: "rgba(99,102,241,.20)",
      tint2: "rgba(34,211,238,.14)",
      edge: "linear-gradient(180deg, rgba(99,102,241,1), rgba(34,211,238,1))",
      badge: "rgba(99,102,241,.14)",
    },
    emerald: {
      halo1: "rgba(16,185,129,.20)",
      halo2: "rgba(34,211,238,.10)",
      tint1: "rgba(16,185,129,.18)",
      tint2: "rgba(34,211,238,.14)",
      edge: "linear-gradient(180deg, rgba(16,185,129,1), rgba(34,211,238,1))",
      badge: "rgba(16,185,129,.14)",
    },
    amber: {
      halo1: "rgba(245,158,11,.22)",
      halo2: "rgba(236,72,153,.10)",
      tint1: "rgba(245,158,11,.18)",
      tint2: "rgba(251,146,60,.16)",
      edge: "linear-gradient(180deg, rgba(245,158,11,1), rgba(251,146,60,1))",
      badge: "rgba(245,158,11,.14)",
    },
  };

  const p = palette[tone];

  const style = {
    ["--halo1" as string]: p.halo1,
    ["--halo2" as string]: p.halo2,
    ["--tint1" as string]: p.tint1,
    ["--tint2" as string]: p.tint2,
    ["--edge" as string]: p.edge,
    ["--badge" as string]: p.badge,
  } as CSSProperties;

  return (
    <div className="glass-card rounded-2xl p-5" style={style}>
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(110% 120% at 12% 12%, var(--tint1) 0%, transparent 55%), radial-gradient(90% 100% at 88% 18%, var(--tint2) 0%, transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-[6px] rounded-l-2xl"
        style={{ background: "var(--edge)" }}
      />

      <div className="flex items-center gap-3 muted-text text-sm font-medium">
        <span
          className="grid h-10 w-10 place-items-center rounded-2xl"
          style={{ background: "var(--badge)" }}
        >
          {icon}
        </span>
        <span>{label}</span>
      </div>

      <div className="stat-value mt-5 text-3xl font-extrabold tracking-tight">
        {value}
      </div>
    </div>
  );
}

type CardThemeName = "violet" | "emerald" | "amber";

const THEMES: Record<
  CardThemeName,
  {
    border: string;
    tintA: string;
    tintB: string;
    pill: string;
    btnFrom: string;
    btnTo: string;
  }
> = {
  violet: {
    border: "rgba(99,102,241,.20)",
    tintA: "rgba(99,102,241,.16)",
    tintB: "rgba(34,211,238,.10)",
    pill: "rgba(99,102,241,.14)",
    btnFrom: "rgb(99,102,241)",
    btnTo: "rgb(59,130,246)",
  },
  emerald: {
    border: "rgba(16,185,129,.22)",
    tintA: "rgba(16,185,129,.16)",
    tintB: "rgba(34,211,238,.10)",
    pill: "rgba(16,185,129,.14)",
    btnFrom: "rgb(5,150,105)",
    btnTo: "rgb(13,148,136)",
  },
  amber: {
    border: "rgba(245,158,11,.24)",
    tintA: "rgba(245,158,11,.16)",
    tintB: "rgba(251,146,60,.12)",
    pill: "rgba(245,158,11,.14)",
    btnFrom: "rgb(217,119,6)",
    btnTo: "rgb(234,88,12)",
  },
};

function ActionCard({
  title,
  theme,
  children,
  footer,
  cta,
  onCta,
}: {
  title: string;
  theme: CardThemeName;
  children: ReactNode;
  footer?: ReactNode;
  cta: string;
  onCta: () => void;
}) {
  const t = THEMES[theme];

  return (
    <div
      className="glass-card rounded-2xl p-5"
      style={{ borderColor: t.border }}
    >
      <div
        className="surface-muted mb-4 rounded-2xl px-4 py-3"
        style={{
          background: `linear-gradient(90deg, ${t.tintA}, ${t.tintB})`,
          borderColor: t.border,
        }}
      >
        <h3 className="action-title font-semibold">{title}</h3>
      </div>

      <p className="action-copy text-sm leading-6">{children}</p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-sm">{footer}</div>

        <button
          type="button"
          onClick={onCta}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow transition hover:opacity-95"
          style={{
            background: `linear-gradient(90deg, ${t.btnFrom}, ${t.btnTo})`,
            boxShadow: `0 14px 36px ${t.pill}`,
          }}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

function UsersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M17 20c0-2.21-2.239-4-5-4s-5 1.79-5 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 20c0-1.6-1.2-3-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 9a3 3 0 1 0 0-6"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function GraduateIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M2 8l10-4 10 4-10 4L2 8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 10v6c0 2 3 4 6 4s6-2 6-4v-6"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M22 8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 12h8M8 16h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 17h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function CogIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.5-2-3.5-2.4.6a8.4 8.4 0 0 0-1.7-1L15 3h-6l-.4 2.6a8.4 8.4 0 0 0-1.7 1L4.5 6l-2 3.5 2 1.5a7.9 7.9 0 0 0 .1 2l-2 1.5 2 3.5 2.4-.6a8.4 8.4 0 0 0 1.7 1L9 21h6l.4-2.6a8.4 8.4 0 0 0 1.7-1l2.4.6 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 19V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 19H4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 16v-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 16V8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 16v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}