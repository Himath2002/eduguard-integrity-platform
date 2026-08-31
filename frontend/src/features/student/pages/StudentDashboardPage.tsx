import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { api } from "@/shared/lib/api";
import { resolveAuthIdent, resolveDisplayName } from "@/shared/lib/authIdentity";
import { useRealtimeEvents, type RealtimeEvent } from "@/shared/hooks/useRealtimeEvents";
import { useRefreshIndicator } from "@/shared/lib/refreshIndicator";
import { readCachedView, writeCachedView } from "@/shared/lib/viewCache";

type Tone = "indigo" | "emerald" | "amber";

type StudentClassCard = {
  id: number | string;
  name: string;
  code: string;
  instructor: string;
  assignmentsDue: number;
  joined_at?: string | null;
  created_at?: string | null;
};

type RecentActivityItem = {
  id: string;
  tone: Tone;
  icon: string;
  text: string;
};

type StudentDashboardSummary = {
  stats: {
    assignments_due: number;
    new_feedback: number;
    joined_classes: number;
  };
  classes: StudentClassCard[];
  recent_activity: RecentActivityItem[];
};

type StudentAnnouncement = {
  id: number;
  subject: string;
  body: string;
  audience?: string;
  created_at: string | null;
};

type StatItem = {
  title: string;
  value: number;
  icon: string;
  tone: Tone;
  path: string;
};

type QuickAction = {
  title: string;
  desc: string;
  icon: string;
  tone: Tone;
  label: string;
  path: string;
};

const STUDENT_THEME_KEY = "eduguard.student.theme";

function normalizeThemeValue(value: string | null | undefined): "dark" | "light" | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("dark")) return "dark";
  if (v.includes("light")) return "light";
  return null;
}

function resolveStudentIsDarkMode() {
  if (typeof window === "undefined") return false;

  const doc = document.documentElement;
  const body = document.body;

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme"));

  if (explicitTheme) return explicitTheme === "dark";

  if (doc.classList.contains("dark") || body.classList.contains("dark")) {
    return true;
  }

  const storedTheme = normalizeThemeValue(window.localStorage.getItem(STUDENT_THEME_KEY));
  return storedTheme === "dark";
}

const EMPTY_STATS: StatItem[] = [
  {
    title: "Assignments due",
    value: 0,
    icon: "🧾",
    tone: "indigo",
    path: "/student/assignments",
  },
  {
    title: "New feedback",
    value: 0,
    icon: "💭",
    tone: "emerald",
    path: "/student/reports?tab=feedback",
  },
  {
    title: "Joined classes",
    value: 0,
    icon: "👥",
    tone: "amber",
    path: "/student/classes",
  },
];

function studentDashboardCacheKey(ident: string) {
  return `eduguard.student.dashboard.${ident}`;
}

function studentAnnouncementsCacheKey(ident: string) {
  return `eduguard.student.announcements.${ident}`;
}

function getPinnedKey(ident: string) {
  return `eduguard.pinnedClasses.${ident}`;
}

function readPinnedCodes(ident: string): string[] {
  try {
    const raw = localStorage.getItem(getPinnedKey(ident));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

function mapSummaryToStats(summary: StudentDashboardSummary | null): StatItem[] {
  if (!summary) return EMPTY_STATS;

  return [
    {
      title: "Assignments due",
      value: Number(summary?.stats?.assignments_due || 0),
      icon: "🧾",
      tone: "indigo",
      path: "/student/assignments",
    },
    {
      title: "New feedback",
      value: Number(summary?.stats?.new_feedback || 0),
      icon: "💭",
      tone: "emerald",
      path: "/student/reports?tab=feedback",
    },
    {
      title: "Joined classes",
      value: Number(summary?.stats?.joined_classes || summary?.classes?.length || 0),
      icon: "👥",
      tone: "amber",
      path: "/student/classes",
    },
  ];
}

function toneGrad(tone: Tone) {
  if (tone === "emerald") {
    return {
      bg: "bg-gradient-to-r from-emerald-200/95 via-teal-200/95 to-cyan-200/90",
      glow: "radial-gradient(60% 60% at 30% 25%, rgba(16,185,129,.34), transparent 70%)",
      darkGlow: "radial-gradient(60% 60% at 30% 25%, rgba(16,185,129,.22), transparent 70%)",
      icon: "text-emerald-900",
      ring: "ring-emerald-200/70",
      btn: "bg-emerald-600 hover:bg-emerald-700 shadow-[0_14px_40px_rgba(16,185,129,0.28)]",
    };
  }

  if (tone === "amber") {
    return {
      bg: "bg-gradient-to-r from-amber-200/95 via-orange-200/95 to-rose-200/45",
      glow: "radial-gradient(60% 60% at 30% 25%, rgba(245,158,11,.34), transparent 70%)",
      darkGlow: "radial-gradient(60% 60% at 30% 25%, rgba(245,158,11,.24), transparent 70%)",
      icon: "text-amber-950",
      ring: "ring-amber-200/70",
      btn: "bg-orange-500 hover:bg-orange-600 shadow-[0_14px_40px_rgba(249,115,22,0.28)]",
    };
  }

  return {
    bg: "bg-gradient-to-r from-indigo-200/95 via-blue-200/95 to-violet-200/90",
    glow: "radial-gradient(60% 60% at 30% 25%, rgba(99,102,241,.34), transparent 70%)",
    darkGlow: "radial-gradient(60% 60% at 30% 25%, rgba(99,102,241,.24), transparent 70%)",
    icon: "text-indigo-950",
    ring: "ring-indigo-200/70",
    btn: "bg-indigo-600 hover:bg-indigo-700 shadow-[0_14px_40px_rgba(99,102,241,0.28)]",
  };
}

function StudentDashboardCSS() {
  return (
    <style>{`
      .student-dashboard-page-only {
        position: relative;
      }

      .student-dashboard-page-only .sd-enter {
        opacity: 1;
        translate: 0 0;
        scale: 1;
        animation: sd-enter-up 460ms cubic-bezier(.2,.8,.2,1) both;
      }

      .student-dashboard-page-only .sd-popup-card {
        position: relative;
        will-change: transform, box-shadow, filter;
        transform: translateY(0) scale(1);
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease,
          filter 220ms ease;
      }

      .student-dashboard-page-only .sd-popup-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 30;
        filter: saturate(1.04);
        box-shadow:
          0 18px 55px rgba(15,23,42,.14),
          0 8px 24px rgba(99,102,241,.10);
      }

      .student-dashboard-dark-only .sd-popup-card:hover {
        box-shadow:
          0 20px 60px rgba(2,6,23,.42),
          0 8px 28px rgba(34,211,238,.10),
          inset 0 1px 0 rgba(255,255,255,.05);
      }

      .student-dashboard-page-only .sd-popup-card:active {
        transform: translateY(-2px) scale(1.006);
      }

      .student-dashboard-page-only .sd-card-shine {
        position: relative;
        overflow: hidden;
        isolation: isolate;
      }

      .student-dashboard-page-only .sd-card-shine::after {
        content: "";
        position: absolute;
        top: -36%;
        bottom: -36%;
        left: -42%;
        width: 26%;
        transform: rotate(14deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.28),
          transparent
        );
        opacity: 0;
        filter: blur(10px);
        transition:
          left .66s ease,
          opacity .22s ease;
        pointer-events: none;
        z-index: 3;
      }

      .student-dashboard-dark-only .sd-card-shine::after {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125,211,252,.16),
          transparent
        );
      }

      .student-dashboard-page-only .sd-card-shine:hover::after {
        left: 120%;
        opacity: .9;
      }

      .student-dashboard-page-only .sd-dot-bg {
        background-image:
          radial-gradient(circle at 1px 1px, rgba(15,23,42,.10) 1px, transparent 0);
        background-size: 12px 12px;
      }

      .student-dashboard-dark-only .sd-dot-bg {
        background-image:
          radial-gradient(circle at 1px 1px, rgba(255,255,255,.08) 1px, transparent 0);
      }

      .student-dashboard-page-only .sd-surface-light {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.72) 0%, transparent 55%),
          rgba(255,255,255,.55);
        border: 1px solid rgba(255,255,255,.62);
        backdrop-filter: blur(18px) saturate(125%);
        -webkit-backdrop-filter: blur(18px) saturate(125%);
        box-shadow:
          0 18px 60px rgba(15,23,42,.10),
          inset 0 1px 0 rgba(255,255,255,.42);
      }

      .student-dashboard-page-only .sd-surface-dark {
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(125,211,252,.08) 0%, transparent 50%),
          radial-gradient(90% 100% at 95% 10%, rgba(129,140,248,.08) 0%, transparent 58%),
          linear-gradient(180deg, rgba(6,12,24,.94), rgba(8,15,32,.96));
        border: 1px solid rgba(148,163,184,.16);
        backdrop-filter: blur(18px) saturate(130%);
        -webkit-backdrop-filter: blur(18px) saturate(130%);
        box-shadow:
          0 20px 56px rgba(2,6,23,.30),
          inset 0 1px 0 rgba(255,255,255,.04);
      }

      .student-dashboard-page-only .sd-announcement-body {
        white-space: pre-wrap;
      }

      .student-dashboard-page-only .sd-announcement-expand {
        display: grid;
        grid-template-rows: 0fr;
        opacity: .72;
        transition:
          grid-template-rows .34s cubic-bezier(.2,.8,.2,1),
          opacity .24s ease;
      }

      .student-dashboard-page-only .sd-announcement-expand.sd-open {
        grid-template-rows: 1fr;
        opacity: 1;
      }

      .student-dashboard-page-only .sd-announcement-inner {
        overflow: hidden;
      }

      .student-dashboard-page-only .sd-glow-orb {
        animation: sd-float 6.8s ease-in-out infinite;
      }

      .student-dashboard-page-only .sd-glow-orb:nth-child(2) {
        animation-delay: -2.3s;
      }

      .student-dashboard-page-only .sd-pulse-badge {
        animation: sd-pulse 2.8s ease-in-out infinite;
      }

      .student-dashboard-page-only .sd-number {
        animation: sd-number-rise 560ms cubic-bezier(.2,.8,.2,1) both;
      }

      .student-dashboard-page-only .sd-divider-line {
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(148,163,184,.38),
          transparent
        );
      }

      .student-dashboard-dark-only .sd-divider-line {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125,211,252,.22),
          transparent
        );
      }

      @keyframes sd-enter-up {
        from {
          opacity: 0;
          translate: 0 20px;
          scale: .985;
          filter: blur(2px);
        }
        to {
          opacity: 1;
          translate: 0 0;
          scale: 1;
          filter: blur(0);
        }
      }

      @keyframes sd-float {
        0%, 100% {
          transform: translate3d(0, 0, 0) scale(1);
        }
        50% {
          transform: translate3d(12px, -16px, 0) scale(1.04);
        }
      }

      @keyframes sd-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.05);
          opacity: .86;
        }
      }

      @keyframes sd-number-rise {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .student-dashboard-page-only .sd-enter,
        .student-dashboard-page-only .sd-glow-orb,
        .student-dashboard-page-only .sd-pulse-badge,
        .student-dashboard-page-only .sd-number {
          animation: none !important;
          opacity: 1 !important;
          translate: 0 0 !important;
          scale: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        .student-dashboard-page-only .sd-popup-card,
        .student-dashboard-page-only .sd-announcement-expand {
          transition: none !important;
        }
      }
    `}</style>
  );
}

function LoadingStatCard({ title, icon, tone }: { title: string; icon: string; tone: Tone }) {
  const t = toneGrad(tone);

  return (
    <div className="sd-popup-card sd-card-shine rounded-2xl p-[1px] shadow-[0_20px_70px_rgba(15,23,42,0.10)]">
      <div className={`relative overflow-hidden rounded-2xl p-5 ${t.bg} ring-1 ${t.ring}`}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] sd-dot-bg" />
        <div
          className="pointer-events-none absolute -inset-10 opacity-90 blur-2xl"
          style={{ background: t.glow }}
        />
        <div className="relative flex items-center gap-3 text-slate-800/90">
          <span className={`text-lg ${t.icon}`}>{icon}</span>
          <div className="text-sm font-medium">{title}</div>
        </div>
        <div className="mt-3 h-9 w-20 animate-pulse rounded-xl bg-white/70" />
      </div>
    </div>
  );
}

function StatCard({
  item,
  delayMs,
  onClick,
}: {
  item: StatItem;
  delayMs: number;
  onClick: () => void;
}) {
  const t = toneGrad(item.tone);

  return (
    <button
      type="button"
      onClick={onClick}
      className="sd-enter sd-popup-card sd-card-shine w-full rounded-2xl p-[1px] text-left shadow-[0_20px_70px_rgba(15,23,42,0.10)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={`relative overflow-hidden rounded-2xl p-5 ${t.bg} ring-1 ${t.ring}`}>
        <div
          className="pointer-events-none absolute -inset-10 opacity-90 blur-2xl"
          style={{ background: t.glow }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/70 to-transparent" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] sd-dot-bg" />

        <div className="relative">
          <div className="flex items-center gap-3 text-slate-800/90">
            <span className={`sd-pulse-badge text-lg ${t.icon}`}>{item.icon}</span>
            <div className="text-sm font-medium">{item.title}</div>
          </div>
          <div className="sd-number mt-3 text-3xl font-extrabold text-slate-900">{item.value}</div>
        </div>
      </div>
    </button>
  );
}

function QuickActionCard({
  action,
  isDark,
  delayMs,
  onClick,
}: {
  action: QuickAction;
  isDark: boolean;
  delayMs: number;
  onClick: () => void;
}) {
  const t = toneGrad(action.tone);

  return (
    <div
      className={[
        "sd-enter sd-popup-card sd-card-shine rounded-2xl p-5 backdrop-blur-xl",
        isDark ? "sd-surface-dark" : "sd-surface-light",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={["relative overflow-hidden rounded-2xl px-4 py-3 ring-1", t.bg, t.ring].join(" ")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/65 to-transparent" />
        <div
          className="pointer-events-none absolute -inset-8 opacity-80 blur-2xl"
          style={{ background: isDark ? t.darkGlow : t.glow }}
        />
        <div className="relative flex items-center gap-3 text-slate-900/90">
          <span className={`sd-pulse-badge text-lg ${t.icon}`}>{action.icon}</span>
          <div className="font-medium">{action.title}</div>
        </div>
      </div>

      <div className={["mt-4 text-sm leading-7", isDark ? "text-sky-100/90" : "text-slate-700"].join(" ")}>
        {action.desc}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className={["flex items-center gap-2 text-sm", isDark ? "text-sky-100/90" : "text-slate-700"].join(" ")}>
          <span className="text-base">{action.icon}</span>
          <span className="font-medium">{action.label}</span>
        </div>

        <button
          type="button"
          onClick={onClick}
          className={[
            "rounded-full px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98]",
            t.btn,
          ].join(" ")}
        >
          Open
        </button>
      </div>
    </div>
  );
}

function ActivityCard({
  item,
  isDark,
  delayMs,
}: {
  item: RecentActivityItem;
  isDark: boolean;
  delayMs: number;
}) {
  const t = toneGrad(item.tone);

  return (
    <div
      className={[
        "sd-enter sd-popup-card sd-card-shine rounded-xl px-4 py-3 backdrop-blur-xl",
        isDark ? "sd-surface-dark" : "sd-surface-light",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-2xl ${t.bg} ring-1 ${t.ring}`}>
          <span className="sd-pulse-badge text-base">{item.icon}</span>
        </span>
        <div className={["text-sm", isDark ? "text-sky-100/90" : "text-slate-700"].join(" ")}>{item.text}</div>
      </div>
    </div>
  );
}

function PinnedClassCard({
  c,
  tone,
  isDark,
  delayMs,
  onOpen,
}: {
  c: StudentClassCard;
  tone: Tone;
  isDark: boolean;
  delayMs: number;
  onOpen: () => void;
}) {
  const t = toneGrad(tone);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "sd-enter sd-popup-card sd-card-shine rounded-2xl p-5 text-left backdrop-blur-xl",
        isDark ? "sd-surface-dark" : "sd-surface-light",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={["relative overflow-hidden rounded-2xl px-4 py-3 ring-1", t.bg, t.ring].join(" ")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/65 to-transparent" />
        <div
          className="pointer-events-none absolute -inset-8 opacity-80 blur-2xl"
          style={{ background: isDark ? t.darkGlow : t.glow }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`sd-pulse-badge text-base ${t.icon}`}>📌</span>
            <div className="font-medium text-slate-900/90">{c.code}</div>
          </div>
          <div className="text-xs font-semibold text-slate-700/80">Pinned</div>
        </div>
      </div>

      <div className="mt-4">
        <div className={["font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")}>{c.name}</div>
        <div className={["mt-1 text-sm", isDark ? "text-sky-100/85" : "text-slate-700"].join(" ")}>
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Instructor:</span> {c.instructor}
        </div>
        <div className={["mt-1 text-sm", isDark ? "text-sky-100/85" : "text-slate-700"].join(" ")}>
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Assignments due:</span> {c.assignmentsDue}
        </div>
      </div>

      <div className="mt-5">
        <span className={isDark ? "text-sm font-semibold text-cyan-300" : "text-sm font-semibold text-indigo-600"}>
          Open →
        </span>
      </div>
    </button>
  );
}

function EmptyPinnedCard({
  isDark,
  delayMs,
  onGo,
}: {
  isDark: boolean;
  delayMs: number;
  onGo: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onGo}
      className={[
        "sd-enter sd-popup-card sd-card-shine relative overflow-hidden rounded-2xl p-5 text-left border-2 border-dashed backdrop-blur-xl",
        isDark
          ? "border-slate-600 bg-slate-900/40 text-slate-200"
          : "border-slate-300/70 bg-white/45 text-slate-900",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="text-sm font-semibold">Pin a class</div>
      <div className={["mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-600"].join(" ")}>
        Go to Classes and tap <span className="font-semibold">📌 Pin</span>.
      </div>
      <div className={["mt-4 text-sm font-semibold", isDark ? "text-cyan-300" : "text-indigo-600"].join(" ")}>
        Go to Classes →
      </div>
      <div className={["sd-pulse-badge absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-semibold", isDark ? "bg-white/5 text-slate-300" : "bg-slate-900/5 text-slate-700"].join(" ")}>
        📌
      </div>
    </button>
  );
}

function AnnouncementCard({
  item,
  isDark,
  expanded,
  delayMs,
  onToggleExpand,
}: {
  item: StudentAnnouncement;
  isDark: boolean;
  expanded: boolean;
  delayMs: number;
  onToggleExpand: () => void;
}) {
  const isLong = item.body.length > 220;
  const collapsedContent = isLong ? `${item.body.slice(0, 220)}...` : item.body;

  return (
    <div
      className={[
        "sd-enter sd-popup-card sd-card-shine rounded-2xl px-5 py-4",
        isDark
          ? "border border-white/10 bg-white/[0.03]"
          : "border border-slate-200 bg-slate-50/90",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={["text-base font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")}>
        {item.subject}
      </div>

      <div className={["mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
        {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
      </div>

      <div className={["sd-announcement-body mt-3 text-sm leading-7", isDark ? "text-sky-100/88" : "text-slate-700"].join(" ")}>
        {isLong && expanded ? item.body.slice(0, 220) : collapsedContent}
      </div>

      {isLong ? (
        <div className={`sd-announcement-expand ${expanded ? "sd-open" : ""}`}>
          <div className="sd-announcement-inner">
            <div className={["sd-announcement-body text-sm leading-7", isDark ? "text-sky-100/88" : "text-slate-700"].join(" ")}>
              {item.body.slice(220)}
            </div>
          </div>
        </div>
      ) : null}

      {isLong ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className={[
            "mt-3 rounded-full px-0 text-sm font-semibold transition hover:underline",
            isDark ? "text-cyan-300" : "text-indigo-600",
          ].join(" ")}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const auth = useSelector((s: RootState) => (s as any).auth);

  const ident = resolveAuthIdent(auth);
  const name = useMemo(() => resolveDisplayName(auth, "Student"), [auth]);

  const [isDarkMode, setIsDarkMode] = useState(resolveStudentIsDarkMode);

  const summaryCache = useMemo(
    () => (ident ? readCachedView<StudentDashboardSummary>(studentDashboardCacheKey(ident)) : null),
    [ident]
  );

  const announcementsCache = useMemo(
    () => (ident ? readCachedView<StudentAnnouncement[]>(studentAnnouncementsCacheKey(ident)) : null),
    [ident]
  );

  const [stats, setStats] = useState<StatItem[]>(mapSummaryToStats(summaryCache));
  const [classes, setClasses] = useState<StudentClassCard[]>(summaryCache?.classes ?? []);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>(summaryCache?.recent_activity ?? []);
  const [dashboardLoading, setDashboardLoading] = useState(!summaryCache);

  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>(
    Array.isArray(announcementsCache) ? announcementsCache : []
  );
  const [announcementsLoading, setAnnouncementsLoading] = useState(!announcementsCache);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<number[]>([]);
  const [pinnedCodes, setPinnedCodes] = useState<string[]>([]);

  const { beginTask, updateTask, finishTask } = useRefreshIndicator();

  const actions: QuickAction[] = useMemo(
    () => [
      {
        title: "View Assignments",
        desc: "Check deadlines, open instructions, and submit your work.",
        icon: "🧾",
        tone: "indigo",
        label: "Assignments",
        path: "/student/assignments",
      },
      {
        title: "Check Feedback",
        desc: "See lecturer comments, grades, and published feedback.",
        icon: "💭",
        tone: "emerald",
        label: "Reports",
        path: "/student/reports",
      },
      {
        title: "Manage Classes",
        desc: "Join classes and review the units you are currently enrolled in.",
        icon: "👥",
        tone: "amber",
        label: "Classes",
        path: "/student/classes",
      },
    ],
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(resolveStudentIsDarkMode());

    syncTheme();

    const observer = new MutationObserver(syncTheme);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-student-theme", "class"],
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-student-theme", "class"],
    });

    const onStorage = () => syncTheme();
    const onThemeEvent = () => syncTheme();

    window.addEventListener("storage", onStorage);
    window.addEventListener("eduguard:student-theme-change", onThemeEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eduguard:student-theme-change", onThemeEvent);
    };
  }, []);

  useEffect(() => {
    if (!ident) return;
    setPinnedCodes(readPinnedCodes(ident));
  }, [ident]);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!ident) return;

      const taskId = beginTask(
        silent ? "Refreshing student dashboard" : "Loading student dashboard",
        silent ? 28 : 12
      );

      if (!silent) setDashboardLoading(true);

      try {
        updateTask(taskId, 42);
        const summary = await api<StudentDashboardSummary>(`/student/${ident}/dashboard/summary`);
        updateTask(taskId, 86);

        setStats(mapSummaryToStats(summary));
        setClasses(summary?.classes ?? []);
        setRecentActivity(summary?.recent_activity ?? []);
        writeCachedView(studentDashboardCacheKey(ident), summary, 60_000);
      } catch {
        const cached = readCachedView<StudentDashboardSummary>(studentDashboardCacheKey(ident));
        setStats(mapSummaryToStats(cached));
        setClasses(cached?.classes ?? []);
        setRecentActivity(cached?.recent_activity ?? []);
      } finally {
        updateTask(taskId, 100);
        finishTask(taskId);
        if (!silent) setDashboardLoading(false);
      }
    },
    [ident, beginTask, updateTask, finishTask]
  );

  const loadAnnouncements = useCallback(
    async (silent = false) => {
      if (!ident) return;

      if (!silent) setAnnouncementsLoading(true);

      try {
        const data = await api<StudentAnnouncement[]>(`/student/${ident}/announcements`);
        const next = Array.isArray(data) ? data : [];
        setAnnouncements(next);
        writeCachedView(studentAnnouncementsCacheKey(ident), next, 60_000);
      } catch {
        const cached = readCachedView<StudentAnnouncement[]>(studentAnnouncementsCacheKey(ident));
        setAnnouncements(Array.isArray(cached) ? cached : []);
      } finally {
        if (!silent) setAnnouncementsLoading(false);
      }
    },
    [ident]
  );

  useEffect(() => {
    if (!ident) return;
    void loadDashboard(false);
    void loadAnnouncements(false);
  }, [ident, loadDashboard, loadAnnouncements]);

  useRealtimeEvents(
    "student",
    ident,
    useCallback(
      (event: RealtimeEvent) => {
        if (
          [
            "class_membership_changed",
            "submission_updated",
            "integrity_job",
            "mark_report_updated",
            "thread_updated",
            "new_message",
            "announcement_created",
            "announcement_updated",
          ].includes(event.type)
        ) {
          void loadDashboard(true);
          void loadAnnouncements(true);
        }
      },
      [loadDashboard, loadAnnouncements]
    )
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadDashboard(true);
        void loadAnnouncements(true);
        if (ident) setPinnedCodes(readPinnedCodes(ident));
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ident, loadDashboard, loadAnnouncements]);

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });
  }, [announcements]);

  const visibleAnnouncements = useMemo(() => {
    return showAllAnnouncements ? sortedAnnouncements : sortedAnnouncements.slice(0, 2);
  }, [showAllAnnouncements, sortedAnnouncements]);

  const pinnedClasses = useMemo(() => {
    const map = new Map(classes.map((c) => [c.code, c]));
    return pinnedCodes.map((code) => map.get(code)).filter(Boolean) as StudentClassCard[];
  }, [classes, pinnedCodes]);

  const isDark = isDarkMode;

  const announcementSummary =
    sortedAnnouncements.length === 0
      ? "No announcements available."
      : showAllAnnouncements
      ? `Showing all ${sortedAnnouncements.length} announcements.`
      : `Showing ${visibleAnnouncements.length} of ${sortedAnnouncements.length} announcements.`;

  const toggleAnnouncementExpand = (id: number) => {
    setExpandedAnnouncementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div
      className={[
        "student-dashboard-page-only relative space-y-8 pb-10",
        isDark ? "student-dashboard-dark-only" : "student-dashboard-light-only",
      ].join(" ")}
    >
      <StudentDashboardCSS />

      {isDark ? (
        <>
          <div
            className="sd-glow-orb pointer-events-none absolute -left-20 top-10 h-[22rem] w-[22rem] rounded-full blur-3xl"
            style={{
              background: "radial-gradient(closest-side, rgba(34,211,238,.14), transparent)",
              opacity: 0.9,
            }}
          />
          <div
            className="sd-glow-orb pointer-events-none absolute right-0 top-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
            style={{
              background: "radial-gradient(closest-side, rgba(129,140,248,.16), transparent)",
              opacity: 0.9,
            }}
          />
        </>
      ) : null}

      <div className="sd-enter pt-4">
        <h1 className={["text-4xl font-extrabold tracking-tight", isDark ? "text-white" : "text-slate-900"].join(" ")}>
          Welcome, {name}!
        </h1>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {dashboardLoading
          ? EMPTY_STATS.map((s) => (
              <LoadingStatCard key={s.title} title={s.title} icon={s.icon} tone={s.tone} />
            ))
          : stats.map((s, index) => (
              <StatCard
                key={s.title}
                item={s}
                delayMs={index * 70}
                onClick={() => navigate(s.path)}
              />
            ))}
      </div>

      <div className="space-y-3">
        <div className={["sd-enter font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")} style={{ animationDelay: "120ms" }}>
          Quick actions
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {actions.map((a, index) => (
            <QuickActionCard
              key={a.title}
              action={a}
              isDark={isDark}
              delayMs={160 + index * 80}
              onClick={() => navigate(a.path)}
            />
          ))}
        </div>
      </div>

      <section
        className={[
          "sd-enter rounded-3xl p-6 backdrop-blur-xl",
          isDark ? "sd-surface-dark" : "sd-surface-light",
        ].join(" ")}
        style={{ animationDelay: "260ms" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={["text-xl font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")}>
              Announcements
            </h2>
            <p className={["mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {announcementsLoading ? "Loading announcements..." : announcementSummary}
            </p>
          </div>

          {sortedAnnouncements.length > 2 ? (
            <button
              type="button"
              onClick={() => setShowAllAnnouncements((prev) => !prev)}
              className={[
                "rounded-full px-5 py-2 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0",
                isDark
                  ? "border border-white/10 bg-white/[0.03] text-sky-100 hover:bg-white/[0.06]"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {showAllAnnouncements ? "Show less" : `Show all (${sortedAnnouncements.length})`}
            </button>
          ) : null}
        </div>

        <div className="sd-divider-line my-5" />

        {announcementsLoading ? (
          <div className={["text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
            Loading…
          </div>
        ) : sortedAnnouncements.length === 0 ? (
          <div className={["text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
            No announcements available.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleAnnouncements.map((item, index) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                isDark={isDark}
                expanded={expandedAnnouncementIds.includes(item.id)}
                delayMs={300 + index * 70}
                onToggleExpand={() => toggleAnnouncementExpand(item.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="space-y-3">
        <div className={["sd-enter font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")} style={{ animationDelay: "340ms" }}>
          Recent activity
        </div>

        <div className="space-y-3">
          {recentActivity.length === 0 ? (
            <div
              className={[
                "sd-enter sd-popup-card sd-card-shine rounded-xl px-4 py-3 backdrop-blur-xl",
                isDark ? "sd-surface-dark text-slate-400" : "sd-surface-light text-slate-600",
              ].join(" ")}
              style={{ animationDelay: "380ms" }}
            >
              Your recent submissions, feedback, and joined classes will appear here.
            </div>
          ) : (
            recentActivity.map((item, index) => (
              <ActivityCard
                key={item.id}
                item={item}
                isDark={isDark}
                delayMs={380 + index * 50}
              />
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="sd-enter flex items-center justify-between" style={{ animationDelay: "440ms" }}>
          <div className={["font-semibold", isDark ? "text-white" : "text-slate-900"].join(" ")}>
            Pinned classes
          </div>

          <button
            onClick={() => navigate("/student/classes")}
            className={["text-sm font-semibold", isDark ? "text-cyan-300 hover:underline" : "text-indigo-600 hover:underline"].join(" ")}
          >
            Manage pins →
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-4">
          {pinnedClasses.length === 0 ? (
            <>
              <EmptyPinnedCard isDark={isDark} delayMs={500} onGo={() => navigate("/student/classes")} />
              <EmptyPinnedCard isDark={isDark} delayMs={560} onGo={() => navigate("/student/classes")} />
              <EmptyPinnedCard isDark={isDark} delayMs={620} onGo={() => navigate("/student/classes")} />
              <EmptyPinnedCard isDark={isDark} delayMs={680} onGo={() => navigate("/student/classes")} />
            </>
          ) : (
            <>
              {pinnedClasses.slice(0, 4).map((c, idx) => (
                <PinnedClassCard
                  key={c.code}
                  c={c}
                  tone={(idx % 3 === 0 ? "indigo" : idx % 3 === 1 ? "emerald" : "amber") as Tone}
                  isDark={isDark}
                  delayMs={500 + idx * 60}
                  onOpen={() => navigate(`/student/assignments?class_code=${encodeURIComponent(c.code)}`)}
                />
              ))}
              {Array.from({ length: Math.max(0, 4 - pinnedClasses.length) }).map((_, i) => (
                <EmptyPinnedCard
                  key={`empty-${i}`}
                  isDark={isDark}
                  delayMs={620 + i * 60}
                  onGo={() => navigate("/student/classes")}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}