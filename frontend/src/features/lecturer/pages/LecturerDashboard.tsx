import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/shared/lib/api";
import { readCachedView, writeCachedView } from "@/shared/lib/viewCache";

/* Dashboard-scoped theme styles. */
const LocalCSS = () => (
  <style>{`
    .lecturer-dashboard-light {
      color: rgba(15,23,42,.96);
    }

    .lecturer-dashboard-dark {
      color: rgba(226,232,240,.96);
    }

    .lecturer-dashboard-light .glass,
    .lecturer-dashboard-dark .glass {
      position: relative;
      border-radius: 1rem;
      z-index: 1;
      overflow: hidden;
    }

    .lecturer-dashboard-light .glass {
      background: rgba(255,255,255,.58);
      border: 1px solid rgba(255,255,255,.70);
      box-shadow:
        0 18px 60px rgba(16,24,40,.12),
        0 6px 18px rgba(16,24,40,.06),
        inset 0 1px 0 rgba(255,255,255,.55),
        inset 0 -1px 0 rgba(0,0,0,.07);
      backdrop-filter: blur(14px) saturate(120%);
      -webkit-backdrop-filter: blur(14px) saturate(120%);
    }

    .lecturer-dashboard-dark .glass {
      background: rgba(7, 14, 28, 0.78);
      border: 1px solid rgba(148,163,184,.20);
      box-shadow:
        0 24px 60px rgba(2,6,23,.46),
        0 10px 26px rgba(2,6,23,.28),
        inset 0 1px 0 rgba(255,255,255,.06),
        inset 0 -1px 0 rgba(255,255,255,.03);
      backdrop-filter: blur(16px) saturate(125%);
      -webkit-backdrop-filter: blur(16px) saturate(125%);
    }

    .lecturer-dashboard-light .glass::after,
    .lecturer-dashboard-dark .glass::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      z-index: 1;
    }

    .lecturer-dashboard-light .glass::after {
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.65);
      opacity: .9;
    }

    .lecturer-dashboard-dark .glass::after {
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
      opacity: 1;
    }

    .lecturer-dashboard-light .glass::before,
    .lecturer-dashboard-dark .glass::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      z-index: 0;
    }

    .lecturer-dashboard-light .glass::before {
      background:
        radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,.50) 0%, transparent 55%),
        radial-gradient(90% 100% at 95% 10%, rgba(255,255,255,.18) 0%, transparent 65%);
      mix-blend-mode: screen;
    }

    .lecturer-dashboard-dark .glass::before {
      background:
        radial-gradient(120% 120% at 10% 0%, rgba(99,102,241,.16) 0%, transparent 55%),
        radial-gradient(95% 95% at 92% 10%, rgba(34,211,238,.10) 0%, transparent 62%),
        linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,0));
      mix-blend-mode: screen;
    }

    .lecturer-dashboard-light .glass .shine,
    .lecturer-dashboard-dark .glass .shine {
      position: absolute;
      top: 0;
      height: 100%;
      transform: skewX(-12deg);
      pointer-events: none;
      z-index: 0;
      opacity: 0;
      transition: opacity .22s ease, left .22s ease;
    }

    .lecturer-dashboard-light .glass .shine {
      left: -35%;
      width: 35%;
      background: rgba(255,255,255,.25);
      filter: blur(16px);
    }

    .lecturer-dashboard-dark .glass .shine {
      left: -30%;
      width: 24%;
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,.05) 45%,
        rgba(255,255,255,.12) 50%,
        rgba(255,255,255,.05) 55%,
        rgba(255,255,255,0) 100%
      );
      filter: blur(12px);
    }

    .lecturer-dashboard-light .glass:hover .shine { opacity: .75; left: -10%; }
    .lecturer-dashboard-dark .glass:hover .shine { opacity: .34; left: -8%; }

    .lecturer-dashboard-light .halo-card,
    .lecturer-dashboard-dark .halo-card {
      position: relative;
      isolation: isolate;
      transition: transform .22s ease, box-shadow .22s ease;
      border-radius: 1rem;
    }

    .lecturer-dashboard-light .halo-card::before,
    .lecturer-dashboard-dark .halo-card::before {
      content: "";
      position: absolute;
      inset: -14%;
      z-index: 0;
      pointer-events: none;
      opacity: 0;
      border-radius: 1.25rem;
      filter: blur(28px);
      background: radial-gradient(60% 60% at 50% 45%,
        var(--halo1, rgba(140,90,255,.16)) 0%,
        var(--halo2, rgba(66,130,255,.10)) 40%,
        var(--halo3, rgba(236,72,153,.08)) 66%,
        transparent 75%);
      transition: opacity .22s ease;
    }

    .lecturer-dashboard-light .halo-card:hover {
      transform: translateY(-3px) scale(1.015);
      box-shadow: 0 26px 70px rgba(99,102,241,.14), 0 12px 30px rgba(17,24,39,.10);
    }

    .lecturer-dashboard-dark .halo-card:hover {
      transform: translateY(-3px) scale(1.01);
      box-shadow:
        0 30px 70px rgba(2,6,23,.34),
        0 12px 28px rgba(2,6,23,.22);
    }

    .lecturer-dashboard-light .halo-card:hover::before,
    .lecturer-dashboard-dark .halo-card:hover::before { opacity: 1; }

    /*
      Timeline shade removal:
      This removes the big hover shade/glow only from the timeline cards.
      The timeline card can still pop/scale like the other cards.
    */
    .lecturer-dashboard-light .halo-card.no-timeline-hover-shade:hover {
      transform: translateY(-3px) scale(1.015);
      box-shadow: none !important;
    }

    .lecturer-dashboard-dark .halo-card.no-timeline-hover-shade:hover {
      transform: translateY(-3px) scale(1.01);
      box-shadow: none !important;
    }

    .lecturer-dashboard-light .halo-card.no-timeline-hover-shade:hover::before,
    .lecturer-dashboard-dark .halo-card.no-timeline-hover-shade:hover::before {
      opacity: 0 !important;
    }

    .deadline-timeline-no-shade:hover .shine {
      opacity: 0 !important;
      left: -35% !important;
    }

    @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
    .animate-float { animation: float 10s ease-in-out infinite; }
    .animate-float-delayed { animation: float 12s ease-in-out 1.5s infinite; }

    @keyframes pulseOrb {
      0%, 100% { transform: scale(1); opacity: .42; }
      50% { transform: scale(1.18); opacity: .7; }
    }

    .lecturer-dashboard-light .card-title {
      font-weight: 800;
      letter-spacing: -0.015em;
      color: rgba(15,23,42,.92);
    }

    .lecturer-dashboard-dark .card-title {
      font-weight: 800;
      letter-spacing: -0.015em;
      color: rgba(248,250,252,.96);
    }

    .lecturer-dashboard-light .card-subtitle {
      color: rgba(51,65,85,.85);
    }

    .lecturer-dashboard-dark .card-subtitle {
      color: rgba(186,199,219,.82);
    }

    .lecturer-dashboard-light .glass-colorful {
      background: rgba(255,255,255,.34);
      border: 1px solid rgba(255,255,255,.72);
    }

    .lecturer-dashboard-dark .glass-colorful {
      background: rgba(7, 14, 28, 0.82);
      border: 1px solid rgba(148,163,184,.22);
    }

    .lecturer-dashboard-light .glass-colorful::before {
      background:
        radial-gradient(95% 110% at 92% 10%, rgba(255, 255, 255, 0) 0%, transparent 65%),
        radial-gradient(125% 125% at 18% 18%, var(--tint1, rgba(99,102,241,.30)) 0%, transparent 70%),
        radial-gradient(120% 120% at 88% 55%, var(--tint2, rgba(59,130,246,.26)) 0%, transparent 60%),
        linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,0));
      mix-blend-mode: normal;
      opacity: 0.5;
    }

    .lecturer-dashboard-dark .glass-colorful::before {
      background:
        radial-gradient(95% 110% at 92% 10%, rgba(255,255,255,0) 0%, transparent 65%),
        radial-gradient(125% 125% at 18% 18%, var(--tint1, rgba(99,102,241,.24)) 0%, transparent 70%),
        radial-gradient(120% 120% at 88% 55%, var(--tint2, rgba(59,130,246,.20)) 0%, transparent 60%),
        linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,0));
      mix-blend-mode: normal;
      opacity: .82;
    }

    .lecturer-dashboard-light .tint-blue   { --tint1: rgba(59,130,246,.34); --tint2: rgba(99,102,241,.30); }
    .lecturer-dashboard-light .tint-green  { --tint1: rgba(16,185,129,.34); --tint2: rgba(59,130,246,.22); }
    .lecturer-dashboard-light .tint-purple { --tint1: rgba(139,92,246,.34); --tint2: rgba(236,72,153,.22); }
    .lecturer-dashboard-light .tint-amber  { --tint1: rgba(245,158,11,.34); --tint2: rgba(251,146,60,.26); }
    .lecturer-dashboard-light .tint-slate  { --tint1: rgba(100,116,139,.26); --tint2: rgba(59,130,246,.18); }

    .lecturer-dashboard-dark .tint-blue   { --tint1: rgba(59,130,246,.28); --tint2: rgba(99,102,241,.24); }
    .lecturer-dashboard-dark .tint-green  { --tint1: rgba(16,185,129,.28); --tint2: rgba(59,130,246,.16); }
    .lecturer-dashboard-dark .tint-purple { --tint1: rgba(139,92,246,.30); --tint2: rgba(236,72,153,.18); }
    .lecturer-dashboard-dark .tint-amber  { --tint1: rgba(245,158,11,.30); --tint2: rgba(251,146,60,.20); }
    .lecturer-dashboard-dark .tint-slate  { --tint1: rgba(100,116,139,.20); --tint2: rgba(59,130,246,.14); }

    .edge-right {
      position: relative;
    }

    .lecturer-dashboard-light .edge-right::before,
    .lecturer-dashboard-dark .edge-right::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      border-radius: 999px;
      pointer-events: none;
      z-index: 2;
      background: linear-gradient(
        180deg,
        var(--edgeA, rgba(99,102,241,1)) 0%,
        var(--edgeB, rgba(59,130,246,1)) 55%,
        var(--edgeC, rgba(34,211,238,1)) 100%
      );
    }

    .lecturer-dashboard-light .edge-right::before {
      width: 8px;
      box-shadow:
        0 10px 26px rgba(59,130,246,.22),
        0 4px 10px rgba(17,24,39,.10);
      opacity: .95;
    }

    .lecturer-dashboard-dark .edge-right::before {
      width: 7px;
      box-shadow:
        0 0 24px rgba(59,130,246,.18),
        0 0 12px rgba(17,24,39,.16);
      opacity: .82;
    }

    .edge-blue   { --edgeA: rgba(99,102,241,1); --edgeB: rgba(59,130,246,1); --edgeC: rgba(34,211,238,1); }
    .edge-purple { --edgeA: rgba(139,92,246,1); --edgeB: rgba(99,102,241,1); --edgeC: rgba(236,72,153,1); }
    .edge-green  { --edgeA: rgba(16,185,129,1); --edgeB: rgba(34,197,94,1);  --edgeC: rgba(59,130,246,1); }
    .edge-amber  { --edgeA: rgba(245,158,11,1); --edgeB: rgba(251,146,60,1); --edgeC: rgba(236,72,153,1); }
    .edge-slate  { --edgeA: rgba(71,85,105,1);  --edgeB: rgba(99,102,241,1); --edgeC: rgba(59,130,246,1); }

    .lecturer-dashboard-light .deadline-timeline-shell {
      position: relative;
      min-height: 34rem;
      overflow: visible;
      border-radius: 1.5rem;
      background:
        radial-gradient(120% 120% at 0% 0%, rgba(99,102,241,.10) 0%, transparent 46%),
        radial-gradient(120% 120% at 100% 0%, rgba(236,72,153,.09) 0%, transparent 42%),
        radial-gradient(120% 120% at 50% 100%, rgba(34,211,238,.10) 0%, transparent 40%),
        linear-gradient(180deg, rgba(255,255,255,.46), rgba(255,255,255,.24));
      border: 1px solid rgba(255,255,255,.7);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.72),
        0 20px 60px rgba(16,24,40,.10);
    }

    .lecturer-dashboard-dark .deadline-timeline-shell {
      position: relative;
      min-height: 34rem;
      overflow: visible;
      border-radius: 1.5rem;
      background:
        radial-gradient(120% 120% at 0% 0%, rgba(99,102,241,.12) 0%, transparent 42%),
        radial-gradient(120% 120% at 100% 0%, rgba(236,72,153,.10) 0%, transparent 38%),
        radial-gradient(120% 120% at 50% 100%, rgba(34,211,238,.10) 0%, transparent 36%),
        linear-gradient(180deg, rgba(5,10,24,.92), rgba(8,15,32,.82));
      border: 1px solid rgba(148,163,184,.20);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.04),
        0 28px 60px rgba(2,6,23,.30);
    }

    .timeline-overflow-visible {
      overflow: visible !important;
    }

    .timeline-popup-card {
      pointer-events: none;
    }

    .timeline-expanded-shell {
      overflow: visible !important;
    }

    .deadline-node-core {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
    }

    .lecturer-dashboard-light .deadline-node-core {
      box-shadow:
        0 18px 34px rgba(99,102,241,.18),
        inset 0 0 0 8px rgba(255,255,255,.82),
        inset 0 0 0 1px rgba(255,255,255,.90);
    }

    .lecturer-dashboard-dark .deadline-node-core {
      box-shadow:
        0 18px 34px rgba(15,23,42,.36),
        inset 0 0 0 7px rgba(255,255,255,.82),
        inset 0 0 0 1px rgba(255,255,255,.92);
    }

    .deadline-node-orb {
      position: absolute;
      inset: -16%;
      border-radius: 999px;
      filter: blur(18px);
      pointer-events: none;
      animation: pulseOrb 3.2s ease-in-out infinite;
    }

    .lecturer-dashboard-light .deadline-detail-card {
      background: rgba(255,255,255,.72);
      border: 1px solid rgba(255,255,255,.82);
      box-shadow:
        0 20px 50px rgba(15,23,42,.12),
        inset 0 1px 0 rgba(255,255,255,.72);
      backdrop-filter: blur(16px) saturate(135%);
      -webkit-backdrop-filter: blur(16px) saturate(135%);
    }

    .lecturer-dashboard-dark .deadline-detail-card {
      background: linear-gradient(180deg, rgba(9,16,32,.92), rgba(8,14,28,.86));
      border: 1px solid rgba(148,163,184,.22);
      box-shadow:
        0 24px 50px rgba(2,6,23,.34),
        inset 0 1px 0 rgba(255,255,255,.04);
      backdrop-filter: blur(16px) saturate(135%);
      -webkit-backdrop-filter: blur(16px) saturate(135%);
    }

    .lecturer-dashboard-light .timeline-mini-card {
      background: rgba(255,255,255,.68);
      border: 1px solid rgba(255,255,255,.82);
      box-shadow:
        0 14px 34px rgba(15,23,42,.10),
        inset 0 1px 0 rgba(255,255,255,.75);
      backdrop-filter: blur(12px) saturate(125%);
      -webkit-backdrop-filter: blur(12px) saturate(125%);
    }

    .lecturer-dashboard-dark .timeline-mini-card {
      background: linear-gradient(180deg, rgba(9,16,32,.90), rgba(8,14,28,.82));
      border: 1px solid rgba(148,163,184,.20);
      box-shadow:
        0 18px 34px rgba(2,6,23,.28),
        inset 0 1px 0 rgba(255,255,255,.04);
      backdrop-filter: blur(12px) saturate(125%);
      -webkit-backdrop-filter: blur(12px) saturate(125%);
    }

    .lecturer-dashboard-dark input.glass,
    .lecturer-dashboard-dark textarea.glass {
      color: rgba(248,250,252,.96);
      background: rgba(5,12,24,.86);
      border-color: rgba(148,163,184,.22);
    }

    .lecturer-dashboard-dark input.glass::placeholder,
    .lecturer-dashboard-dark textarea.glass::placeholder {
      color: rgba(148,163,184,.72);
    }

    .lecturer-dashboard-dark .text-slate-900 { color: rgba(248,250,252,.97) !important; }
    .lecturer-dashboard-dark .text-slate-800 { color: rgba(226,232,240,.96) !important; }
    .lecturer-dashboard-dark .text-slate-700 { color: rgba(203,213,225,.92) !important; }
    .lecturer-dashboard-dark .text-slate-600 { color: rgba(186,199,219,.84) !important; }
    .lecturer-dashboard-dark .text-slate-500 { color: rgba(148,163,184,.88) !important; }
    .lecturer-dashboard-dark .text-red-600 { color: rgba(252,165,165,.95) !important; }

    .lecturer-dashboard-dark .bg-slate-200\\/80 {
      background: rgba(30,41,59,.86) !important;
    }

    .lecturer-dashboard-dark .bg-white,
    .lecturer-dashboard-dark .bg-white\\/55,
    .lecturer-dashboard-dark .bg-white\\/58,
    .lecturer-dashboard-dark .bg-white\\/60,
    .lecturer-dashboard-dark .bg-white\\/68,
    .lecturer-dashboard-dark .bg-white\\/70,
    .lecturer-dashboard-dark .bg-white\\/72 {
      background: rgba(9,16,32,.78) !important;
    }

    .lecturer-dashboard-dark .border-white\\/60,
    .lecturer-dashboard-dark .border-white\\/70,
    .lecturer-dashboard-dark .border-white\\/75,
    .lecturer-dashboard-dark .border-white\\/80,
    .lecturer-dashboard-dark .border-white\\/82,
    .lecturer-dashboard-dark .border-white\\/85 {
      border-color: rgba(148,163,184,.22) !important;
    }

    .lecturer-dashboard-dark .hover\\:bg-white:hover {
      background: rgba(15,23,42,.92) !important;
    }

    .lecturer-dashboard-dark .bg-amber-100 {
      background: rgba(120,53,15,.30) !important;
    }
    .lecturer-dashboard-dark .text-amber-800 {
      color: rgba(253,230,138,.96) !important;
    }
    .lecturer-dashboard-dark .bg-emerald-100 {
      background: rgba(6,78,59,.30) !important;
    }
    .lecturer-dashboard-dark .text-emerald-800 {
      color: rgba(167,243,208,.96) !important;
    }
    .lecturer-dashboard-dark .bg-indigo-100 {
      background: rgba(49,46,129,.30) !important;
    }
    .lecturer-dashboard-dark .text-indigo-800 {
      color: rgba(199,210,254,.96) !important;
    }

    /* Fix dark mode readability for shortcut cards */
    .lecturer-dashboard-light .glass > *:not(.shine),
    .lecturer-dashboard-dark .glass > *:not(.shine) {
      position: relative;
      z-index: 2;
    }

    .lecturer-dashboard-dark .glass.glass-colorful .card-title {
      color: rgba(248,250,252,.98) !important;
      text-shadow: 0 1px 8px rgba(0,0,0,.18);
    }

    .lecturer-dashboard-dark .glass.glass-colorful .card-subtitle {
      color: rgba(203,213,225,.92) !important;
    }

    .lecturer-dashboard-dark .glass.glass-colorful .text-slate-600 {
      color: rgba(203,213,225,.92) !important;
    }

    .lecturer-dashboard-dark .glass.glass-colorful .text-slate-500 {
      color: rgba(186,199,219,.88) !important;
    }

    /* Stronger fix for the six shortcut cards in dark mode */
    .lecturer-dashboard-dark .shortcut-card {
      background:
        radial-gradient(120% 120% at 18% 12%, var(--tint1, rgba(99,102,241,.20)) 0%, transparent 62%),
        radial-gradient(110% 110% at 92% 20%, var(--tint2, rgba(59,130,246,.16)) 0%, transparent 58%),
        linear-gradient(135deg, rgba(15,23,42,.98), rgba(8,15,32,.94)) !important;
    }

    .lecturer-dashboard-dark .shortcut-card::before {
      opacity: .20 !important;
      mix-blend-mode: screen;
    }

    .lecturer-dashboard-dark .shortcut-card::after {
      opacity: .55 !important;
      z-index: 1;
    }

    .lecturer-dashboard-dark .shortcut-card > *:not(.shine) {
      position: relative;
      z-index: 5;
    }

    .lecturer-dashboard-dark .shortcut-kicker {
      color: rgba(226,232,240,.98) !important;
      opacity: 1 !important;
      text-shadow: 0 1px 10px rgba(0,0,0,.28);
    }

    .lecturer-dashboard-dark .shortcut-title {
      color: rgba(248,250,252,.98) !important;
      opacity: 1 !important;
      text-shadow: 0 1px 12px rgba(0,0,0,.34);
    }

    .lecturer-dashboard-dark .shortcut-subtitle {
      color: rgba(203,213,225,.96) !important;
      opacity: 1 !important;
      text-shadow: 0 1px 10px rgba(0,0,0,.24);
    }
  `}</style>
);

/* ------------------- theme helpers ------------------- */
const LECTURER_THEME_KEY = "eduguard.lecturer.theme";
const LECTURER_THEME_EVENT = "eduguard:lecturer-theme-change";
const STUDENT_THEME_KEY = "eduguard.student.theme";
const STUDENT_THEME_EVENT = "eduguard:student-theme-change";

function normalizeThemeValue(
  value: string | null | undefined
): "dark" | "light" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();

  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";

  return null;
}

function resolveIsDarkMode() {
  if (typeof window === "undefined") return false;

  const doc = document.documentElement;
  const body = document.body;
  const lecturerShell = document.querySelector(".lecturer-shell");

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(body.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(lecturerShell?.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme"));

  if (explicitTheme) {
    return explicitTheme === "dark";
  }

  const storedTheme =
    normalizeThemeValue(window.localStorage.getItem(LECTURER_THEME_KEY)) ??
    normalizeThemeValue(window.localStorage.getItem(STUDENT_THEME_KEY));

  return storedTheme === "dark";
}

/* ------------------- types ------------------- */
type ClassCard = {
  id: string;
  name: string;
  code: string;
  enrolled: number;
  activeAssignments: number;
  accent?: "purple" | "blue" | "green";
};

type LecturerStatsResp = {
  submissionsToReview: number;
  activeClasses: number;
};

type LecturerClassResp = {
  id: number;
  name: string;
  code: string;
  enrolled: number;
  activeAssignments: number;
};

type ActivityResp = { id: string; text: string };

type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  tone?: "info" | "warn" | "success";
  action?: { label: string; to: string };
};

type LecturerAnnouncement = {
  id: number;
  subject: string;
  body: string;
  audience: string;
  created_at: string | null;
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

type LecturerDashboardSummary = {
  stats: LecturerStatsResp;
  classes: LecturerClassResp[];
  recent: ActivityResp[];
  upcoming: AssignmentCard[];
};

const lecturerDashboardCacheKey = (username: string) =>
  `eduguard.lecturer.dashboard.${username}`;

const EASE = [0.22, 1, 0.36, 1] as const;

type DeadlineTone = "blue" | "purple" | "green" | "amber";

type TimelinePoint = AssignmentCard & {
  x: number;
  y: number;
  tone: DeadlineTone;
  side: "top" | "bottom";
};

export default function LecturerDashboard() {
  const navigate = useNavigate();

  type AuthState = {
    name?: string;
    username?: string;
    email?: string;
    userId?: string;
    role?: string;
  };

  const auth = useSelector((s: RootState) => s.auth) as AuthState;
  const [isDarkMode, setIsDarkMode] = useState(resolveIsDarkMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => setIsDarkMode(resolveIsDarkMode());

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === LECTURER_THEME_KEY ||
        event.key === STUDENT_THEME_KEY
      ) {
        syncTheme();
      }
    };

    const onThemeEvent = () => syncTheme();

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme"],
    });
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme"],
    });

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, onThemeEvent as EventListener);
    window.addEventListener(STUDENT_THEME_EVENT, onThemeEvent as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        LECTURER_THEME_EVENT,
        onThemeEvent as EventListener
      );
      window.removeEventListener(
        STUDENT_THEME_EVENT,
        onThemeEvent as EventListener
      );
    };
  }, []);

  const themeClass = isDarkMode
    ? "lecturer-dashboard-dark"
    : "lecturer-dashboard-light";

  const shortcutKickerStyle: CSSProperties = {
    color: isDarkMode ? "rgba(248,250,252,.96)" : "rgba(71,85,105,.92)",
  };

  const shortcutTitleStyle: CSSProperties = {
    color: isDarkMode ? "rgba(255,255,255,.98)" : "rgba(15,23,42,.94)",
  };

  const shortcutSubtitleStyle: CSSProperties = {
    color: isDarkMode ? "rgba(226,232,240,.94)" : "rgba(71,85,105,.88)",
  };

  const displayName: string = (() => {
    const fromSlice =
      auth?.name ||
      auth?.username ||
      (auth?.email && String(auth.email).split("@")[0]) ||
      auth?.userId;
    const raw = String(fromSlice || "Smith");
    const base = raw.includes("@") ? raw.split("@")[0] : raw;
    return base.charAt(0).toUpperCase() + base.slice(1);
  })();

  const username =
    auth?.username ||
    auth?.userId ||
    (auth?.email ? String(auth.email).split("@")[0] : "");

  const [announcements, setAnnouncements] = useState<LecturerAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deadlineTimelineOpen, setDeadlineTimelineOpen] = useState(false);
  const [activeDeadlineId, setActiveDeadlineId] = useState<number | null>(null);
  const [hoveredDeadlineId, setHoveredDeadlineId] = useState<number | null>(
    null
  );

  const loadAnnouncements = async () => {
    if (!username) return;

    try {
      setAnnouncementsLoading(true);
      const data = await api<LecturerAnnouncement[]>(
        `/lecturer/${username}/announcements`
      );

      const normalized = Array.isArray(data)
        ? [...data].sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
          })
        : [];

      setAnnouncements(normalized);
    } catch {
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const cachedSummary = username
    ? readCachedView<LecturerDashboardSummary>(
        lecturerDashboardCacheKey(username)
      )
    : null;

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    cachedSummary ? new Date().toISOString() : null
  );

  const [classes, setClasses] = useState<ClassCard[]>(
    cachedSummary?.classes?.map((r, i) => ({
      id: String(r.id),
      name: r.name,
      code: r.code,
      enrolled: r.enrolled,
      activeAssignments: r.activeAssignments,
      accent: i % 3 === 0 ? "purple" : i % 3 === 1 ? "blue" : "green",
    })) ?? []
  );

  const [submissionsToReview, setSubmissionsToReview] = useState(
    cachedSummary?.stats?.submissionsToReview ?? 0
  );

  const [activeClasses, setActiveClasses] = useState(
    cachedSummary?.stats?.activeClasses ?? 0
  );

  const [recent, setRecent] = useState<string[]>(
    (cachedSummary?.recent ?? []).map((r) => r.text)
  );

  const [upcoming, setUpcoming] = useState<AssignmentCard[]>(
    cachedSummary?.upcoming ?? []
  );

  const [loading, setLoading] = useState(!cachedSummary);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const nextDeadline = upcoming[0] ?? null;

  useEffect(() => {
    setActiveDeadlineId((current) => {
      if (upcoming.length === 0) return null;
      if (current && upcoming.some((item) => item.id === current)) {
        return current;
      }
      return upcoming[0].id;
    });
  }, [upcoming]);

  const timelinePoints = useMemo<TimelinePoint[]>(() => {
    const tones: DeadlineTone[] = ["blue", "purple", "green", "amber"];
    const desktopItems = upcoming.slice(0, 5);
    const total = desktopItems.length;

    return desktopItems.map((item, index) => {
      const x =
        total <= 1 ? 50 : 12 + (index * 76) / Math.max(total - 1, 1);
      const y = index % 2 === 0 ? 34 : 68;

      return {
        ...item,
        x,
        y,
        tone: tones[index % tones.length],
        side: index % 2 === 0 ? "top" : "bottom",
      };
    });
  }, [upcoming]);

  const displayDeadlineId = hoveredDeadlineId ?? activeDeadlineId;

  const activeDeadline =
    upcoming.find((item) => item.id === displayDeadlineId) ??
    upcoming[0] ??
    null;

  const timelinePath = useMemo(
    () => buildTimelinePath(timelinePoints),
    [timelinePoints]
  );

  const renderStatValue = (value: number) => {
    if (loading && !cachedSummary) {
      return (
        <span className="inline-flex min-w-[3.5ch] items-center justify-center rounded-lg bg-slate-200/80 px-2 py-1 text-base font-semibold tracking-[0.2em] text-slate-500 animate-pulse">
          ...
        </span>
      );
    }

    return <span>{value}</span>;
  };

  const notifications: DashboardNotification[] = useMemo(() => {
    const items: DashboardNotification[] = [];

    if (submissionsToReview > 0) {
      items.push({
        id: "review",
        title: "Submissions waiting",
        message: `${submissionsToReview} submission${
          submissionsToReview === 1 ? "" : "s"
        } need review.`,
        tone: "warn",
        action: { label: "Go to Reports", to: "/lecturer/reports" },
      });
    }

    if (activeClasses === 0) {
      items.push({
        id: "noclass",
        title: "No classes yet",
        message: "Create your first class to start adding assignments.",
        tone: "info",
        action: { label: "Create class", to: "/lecturer/classes" },
      });
    }

    if (upcoming.length > 0) {
      const next = upcoming[0];
      items.push({
        id: "nextdue",
        title: "Next due date",
        message: `${next.title} (${next.classCode}) due ${next.due}.`,
        tone: "info",
        action: { label: "View assignments", to: "/lecturer/assignments" },
      });
    }

    if (recent.length === 0) {
      const synthesized = [];

      if (activeClasses > 0) {
        synthesized.push(
          `You have ${activeClasses} active class${
            activeClasses === 1 ? "" : "es"
          }.`
        );
      }

      if (submissionsToReview > 0) {
        synthesized.push(`Reviews pending: ${submissionsToReview}.`);
      }

      if (synthesized.length) {
        items.push({
          id: "summary",
          title: "Quick summary",
          message: synthesized.join(" "),
          tone: "success",
        });
      }
    }

    return items.slice(0, 5);
  }, [activeClasses, submissionsToReview, upcoming, recent]);

  const visibleAnnouncements = showAllAnnouncements
    ? announcements
    : announcements.slice(0, 1);

  const hasMoreAnnouncements = announcements.length > 1;

  const mapAccent = (i: number): "purple" | "blue" | "green" =>
    i % 3 === 0 ? "purple" : i % 3 === 1 ? "blue" : "green";

  const refreshAll = async () => {
    if (!username) return;

    setLoading(true);
    setErrMsg(null);

    try {
      const summary = await api<LecturerDashboardSummary>(
        `/lecturer/${username}/dashboard/summary`,
        { cacheTtlMs: 0 }
      );

      writeCachedView(lecturerDashboardCacheKey(username), summary, 60_000);

      setSubmissionsToReview(summary?.stats?.submissionsToReview ?? 0);

      setActiveClasses(
        summary?.stats?.activeClasses ?? summary?.classes?.length ?? 0
      );

      const cls = summary?.classes ?? [];

      setClasses(
        cls.map((r, i) => ({
          id: String(r.id),
          name: r.name,
          code: r.code,
          enrolled: r.enrolled,
          activeAssignments: r.activeAssignments,
          accent: mapAccent(i),
        }))
      );

      setRecent((summary?.recent ?? []).map((r) => r.text));

      const list = summary?.upcoming ?? [];
      const sorted = [...list].sort((a, b) =>
        String(a.due).localeCompare(String(b.due))
      );

      setUpcoming(sorted.slice(0, 5));
    } catch (error: any) {
      setClasses([]);
      setRecent([]);
      setUpcoming([]);
      setErrMsg(error?.message || "Failed to load lecturer dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!username) return;

    try {
      setRefreshing(true);
      await Promise.all([refreshAll(), loadAnnouncements()]);
    } finally {
      setRefreshing(false);
      setLastUpdatedAt(new Date().toISOString());
    }
  };

  useEffect(() => {
    void handleRefresh();
    // The refresh is intentionally keyed to the authenticated lecturer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCode, setNewCode] = useState("");

  const addClass = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    if (!username) return;

    try {
      await api(`/lecturer/${username}/classes`, {
        method: "POST",
        body: {
          name: newName.trim(),
          code: newCode.trim(),
          description: newDesc.trim() || null,
        },
      });

      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewCode("");

      await refreshAll();
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to create class";
      alert(message);
    }
  };

  return (
    <div className={`${themeClass} relative overflow-visible`}>
      <LocalCSS />

      <div
        className="pointer-events-none absolute -top-40 -left-32 h-[38rem] w-[38rem] rounded-full blur-3xl"
        style={{
          opacity: isDarkMode ? 0.5 : 0.6,
          background: isDarkMode
            ? "radial-gradient(closest-side, rgba(124,58,237,0.26), transparent)"
            : "radial-gradient(closest-side, rgba(140,90,255,0.40), transparent)",
        }}
      />

      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          opacity: isDarkMode ? 0.5 : 0.6,
          background: isDarkMode
            ? "radial-gradient(closest-side, rgba(37,99,235,0.24), transparent)"
            : "radial-gradient(closest-side, rgba(66,130,255,0.40), transparent)",
        }}
      />

      <main className="mx-auto max-w-[1200px] px-5 pb-10 pt-10 overflow-visible">
        <section className="relative mb-10 overflow-hidden rounded-[34px] px-2 py-2">
          <div
            className="pointer-events-none absolute inset-0 rounded-[34px]"
            style={{
              background: isDarkMode
                ? "linear-gradient(90deg, rgba(76,29,149,0.16) 0%, rgba(8,15,32,0.08) 36%, rgba(8,145,178,0.14) 100%)"
                : "linear-gradient(90deg, rgba(139,92,246,0.09) 0%, rgba(255,255,255,0.14) 32%, rgba(34,211,238,0.10) 100%)",
            }}
          />

          <div
            className="pointer-events-none absolute -left-20 top-2 h-56 w-56 rounded-full blur-3xl"
            style={{
              background: isDarkMode
                ? "rgba(139,92,246,0.18)"
                : "rgba(196,181,253,0.25)",
            }}
          />

          <div
            className="pointer-events-none absolute right-0 top-6 h-48 w-48 rounded-full blur-3xl"
            style={{
              background: isDarkMode
                ? "rgba(34,211,238,0.12)"
                : "rgba(125,211,252,0.20)",
            }}
          />

          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: isDarkMode
                ? "rgba(255,255,255,0.10)"
                : "rgba(255,255,255,0.80)",
            }}
          />

          <div className="relative mx-auto max-w-[930px] px-2 py-4 md:px-4 md:py-6">
            <div className="mb-4 flex justify-end">
              <motion.button
                type="button"
                onClick={handleRefresh}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/72 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:bg-white"
              >
                <motion.span
                  animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    refreshing
                      ? { duration: 0.9, ease: "linear", repeat: Infinity }
                      : { duration: 0.24, ease: EASE }
                  }
                  className="inline-flex text-base leading-none"
                >
                  ↻
                </motion.span>
                {refreshing ? "Refreshing..." : "Refresh"}
              </motion.button>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
              className="text-center"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                Lecturer dashboard
              </p>

              <h2 className="mt-3 bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500 bg-clip-text text-[2rem] font-semibold tracking-tight text-transparent sm:text-[2.35rem] md:text-[2.6rem]">
                Welcome back, Prof. {displayName}!
              </h2>

              <p className="mx-auto mt-3 max-w-[42rem] text-sm leading-6 text-slate-600 sm:text-[15px]">
                A cleaner snapshot of your dashboard. Review new work, check
                active classes, and catch the latest announcement quickly.
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500 sm:text-sm">
                <span className="rounded-full border border-white/70 bg-white/58 px-3 py-1.5 backdrop-blur-md">
                  {announcements.length} announcement
                  {announcements.length === 1 ? "" : "s"}
                </span>

                {nextDeadline && (
                  <span className="rounded-full border border-white/70 bg-white/58 px-3 py-1.5 backdrop-blur-md">
                    Next due: {formatShortDate(nextDeadline.due)}
                  </span>
                )}

                {lastUpdatedAt && (
                  <span className="rounded-full border border-white/70 bg-white/58 px-3 py-1.5 backdrop-blur-md">
                    Updated {formatLastUpdated(lastUpdatedAt)}
                  </span>
                )}
              </div>
            </motion.div>

            {loading && (
              <p className="mt-4 text-center text-sm text-slate-600">
                Loading dashboard…
              </p>
            )}

            {errMsg && (
              <p className="mt-4 text-center text-sm text-red-600">{errMsg}</p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <HaloCard colors="blue">
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.58, ease: EASE, delay: 0.05 }}
                  className="glass glass-colorful tint-blue flex min-h-[136px] flex-col justify-center rounded-[26px] px-5 py-5 sm:px-6"
                >
                  <span className="shine" />

                  <p className="text-sm font-medium text-slate-600">
                    You have
                  </p>

                  <p className="mt-2 text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
                    {renderStatValue(submissionsToReview)} new submissions
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    ready for review
                  </p>
                </motion.div>
              </HaloCard>

              <HaloCard colors="green">
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.58, ease: EASE, delay: 0.11 }}
                  className="glass glass-colorful tint-green flex min-h-[136px] flex-col justify-center rounded-[26px] px-5 py-5 sm:px-6"
                >
                  <span className="shine" />

                  <p className="text-sm font-medium text-slate-600">
                    You manage
                  </p>

                  <p className="mt-2 text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.15rem]">
                    {renderStatValue(activeClasses)} active classes
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    currently running
                  </p>
                </motion.div>
              </HaloCard>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
                Announcements
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {hasMoreAnnouncements
                  ? `Showing ${visibleAnnouncements.length} of ${announcements.length} announcements.`
                  : "Latest updates shared with lecturers."}
              </p>
            </div>

            {hasMoreAnnouncements && (
              <button
                type="button"
                onClick={() => setShowAllAnnouncements((prev) => !prev)}
                className="inline-flex items-center justify-center rounded-full border border-white/75 bg-white/72 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition hover:bg-white"
              >
                {showAllAnnouncements
                  ? "Show less"
                  : `Show all (${announcements.length})`}
              </button>
            )}
          </div>

          {announcementsLoading ? (
            <div className="glass rounded-[24px] px-4 py-4 text-slate-600">
              Loading announcements…
            </div>
          ) : announcements.length === 0 ? (
            <div className="glass rounded-[24px] px-4 py-4 text-slate-600">
              No announcements available.
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false} mode="popLayout">
                {visibleAnnouncements.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.34, ease: EASE }}
                  >
                    <HaloCard colors={idx % 2 === 0 ? "blue" : "purple"}>
                      <div
                        className={[
                          "glass glass-colorful edge-right rounded-[26px] px-5 py-5 sm:px-6",
                          idx % 2 === 0
                            ? "tint-blue edge-blue"
                            : "tint-purple edge-purple",
                        ].join(" ")}
                      >
                        <span className="shine" />

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/75 bg-white/68 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                                {idx === 0 ? "Latest" : `Update ${idx + 1}`}
                              </span>

                              {item.audience && (
                                <span className="rounded-full border border-white/75 bg-white/55 px-3 py-1 text-xs font-medium text-slate-600">
                                  {item.audience}
                                </span>
                              )}
                            </div>

                            <h4 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
                              {item.subject}
                            </h4>

                            <p className="mt-2 text-xs text-slate-500">
                              {item.created_at
                                ? new Date(item.created_at).toLocaleString()
                                : "-"}
                            </p>

                            <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {item.body}
                            </div>
                          </div>
                        </div>
                      </div>
                    </HaloCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        <section className="mb-10">
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <HaloCard colors="purple">
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="glass glass-colorful shortcut-card tint-purple h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Create a new class"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Create Class</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      Set up a new class and share the enrollment key.
                    </p>
                  </button>
                </HaloCard>

                <HaloCard colors="blue">
                  <button
                    type="button"
                    onClick={() => navigate("/lecturer/assignments")}
                    className="glass glass-colorful shortcut-card tint-blue h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Manage assignments"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Assignments</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      Create, edit, and track submissions by due date.
                    </p>
                  </button>
                </HaloCard>

                <HaloCard colors="green">
                  <button
                    type="button"
                    onClick={() => navigate("/lecturer/reports")}
                    className="glass glass-colorful shortcut-card tint-green h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Open reports"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Reports</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      Review AI and plagiarism results, then approve or override.
                    </p>
                  </button>
                </HaloCard>

                <HaloCard colors="amber">
                  <button
                    type="button"
                    onClick={() => navigate("/lecturer/students")}
                    className="glass glass-colorful shortcut-card tint-amber h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Manage students"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Students</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      View enrollments, search, and manage class rosters.
                    </p>
                  </button>
                </HaloCard>

                <HaloCard colors="slate">
                  <button
                    type="button"
                    onClick={() => navigate("/lecturer/settings")}
                    className="glass glass-colorful shortcut-card tint-slate h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Open settings"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Settings</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      Configure class policies and detection thresholds.
                    </p>
                  </button>
                </HaloCard>

                <HaloCard colors="blue">
                  <button
                    type="button"
                    onClick={() => navigate("/lecturer/help")}
                    className="glass glass-colorful shortcut-card tint-blue h-full w-full rounded-2xl p-5 text-left"
                    aria-label="Open help"
                  >
                    <span className="shine" />
                    <p className="shortcut-kicker text-sm" style={shortcutKickerStyle}>Shortcut</p>
                    <p className="shortcut-title card-title mt-1 text-lg" style={shortcutTitleStyle}>Help</p>
                    <p className="shortcut-subtitle card-subtitle mt-1 text-sm" style={shortcutSubtitleStyle}>
                      Quick tips, FAQs, and guidance for reviewing reports.
                    </p>
                  </button>
                </HaloCard>
              </div>
            </div>

            <HaloCard colors="slate">
              <aside className="glass glass-colorful tint-slate h-full rounded-2xl p-5">
                <span className="shine" />

                <div className="mb-3">
                  <h3 className="card-title text-lg">Notifications</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Important updates based on your live dashboard data.
                  </p>
                </div>

                {notifications.length === 0 ? (
                  <div className="rounded-xl border border-white/70 bg-white/55 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      You&apos;re all caught up.
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      New alerts will appear here as submissions arrive.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-white/70 bg-white/55 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-extrabold tracking-tight text-slate-800">
                              {n.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {n.message}
                            </p>
                          </div>

                          <span
                            className={
                              "shrink-0 rounded-full px-2 py-1 text-xs font-medium " +
                              (n.tone === "warn"
                                ? "bg-amber-100 text-amber-800"
                                : n.tone === "success"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-indigo-100 text-indigo-800")
                            }
                          >
                            {n.tone === "warn"
                              ? "Action"
                              : n.tone === "success"
                              ? "OK"
                              : "Info"}
                          </span>
                        </div>

                        {n.action && (
                          <button
                            type="button"
                            onClick={() => navigate(n.action!.to)}
                            className="mt-3 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-3 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] hover:from-indigo-600 hover:to-blue-700"
                          >
                            {n.action.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </HaloCard>
          </div>
        </section>

        <section className="mb-8 overflow-visible">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
              Upcoming Deadlines
            </h3>

            {upcoming.length > 0 && (
              <button
                type="button"
                onClick={() => setDeadlineTimelineOpen((prev) => !prev)}
                className="rounded-full border border-white/75 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-white"
              >
                {deadlineTimelineOpen ? "Hide timeline" : "Open timeline"}
              </button>
            )}
          </div>

          {upcoming.length === 0 ? (
            <HaloCard colors="slate">
              <div className="glass glass-colorful tint-slate edge-right edge-slate rounded-2xl p-5">
                <span className="shine" />

                <p className="text-sm font-semibold text-slate-800">
                  No upcoming deadlines
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Create an assignment to see due dates appear here.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/lecturer/assignments")}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-3 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] hover:from-indigo-600 hover:to-blue-700"
                >
                  Go to Assignments
                </button>
              </div>
            </HaloCard>
          ) : (
            <>
              <HaloCard
                colors={deadlineTimelineOpen ? "purple" : "blue"}
                noTimelineHoverShade
              >
                <motion.button
                  type="button"
                  onClick={() => setDeadlineTimelineOpen((prev) => !prev)}
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.995 }}
                  transition={{ duration: 0.26, ease: EASE }}
                  className="glass glass-colorful tint-blue edge-right edge-blue deadline-timeline-no-shade w-full rounded-[28px] p-5 text-left"
                >
                  <span className="shine" />

                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-[38rem]">
                      <p className="text-[11px] uppercase tracking-[0.34em] text-slate-500">
                        Shortcut
                      </p>

                      <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                        Upcoming deadline timeline
                      </h4>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Click to open a visual deadline path. Hover a deadline
                        to enlarge it and reveal real assignment details.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[28rem]">
                      <div className="rounded-2xl border border-white/80 bg-white/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Next due
                        </p>

                        <p className="mt-2 text-sm font-bold text-slate-900">
                          {nextDeadline?.title ?? "-"}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {nextDeadline
                            ? `${nextDeadline.classCode} • ${formatDeadlineDate(
                                nextDeadline.due
                              )}`
                            : "No date"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/80 bg-white/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Deadlines
                        </p>

                        <p className="mt-2 text-2xl font-extrabold text-slate-900">
                          {upcoming.length}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          Loaded from real dashboard data
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/80 bg-white/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Action
                        </p>

                        <p className="mt-2 text-sm font-bold text-slate-900">
                          {deadlineTimelineOpen
                            ? "Timeline opened"
                            : "Open now"}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {deadlineTimelineOpen
                            ? "Hover a node to inspect"
                            : "Expand to see visual path"}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.button>
              </HaloCard>

              <AnimatePresence initial={false}>
                {deadlineTimelineOpen && (
                  <motion.div
                    key="deadline-expanded"
                    initial={{ opacity: 0, height: 0, y: -14 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -14 }}
                    transition={{ duration: 0.48, ease: EASE }}
                    className="overflow-visible timeline-expanded-shell"
                  >
                    <div className="mt-6">
                      <HaloCard colors="purple" noTimelineHoverShade>
                        <div className="glass glass-colorful tint-purple timeline-overflow-visible deadline-timeline-no-shade rounded-[28px] p-5 sm:p-6">
                          <span className="shine" />

                          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-[42rem]">
                              <p className="text-[11px] uppercase tracking-[0.34em] text-slate-500">
                                Visual flow
                              </p>

                              <h4 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                                Deadline roadmap
                              </h4>

                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                This uses your real upcoming assignments. Hover
                                or click a point to enlarge it and preview due
                                date, class, and submission progress.
                              </p>
                            </div>

                            {activeDeadline && (
                              <motion.div
                                key={activeDeadline.id}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={{ duration: 0.34, ease: EASE }}
                                className="deadline-detail-card w-full rounded-[24px] p-4 sm:max-w-[22rem]"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                                      Focused deadline
                                    </p>

                                    <h5 className="mt-2 text-xl font-extrabold leading-tight text-slate-900">
                                      {activeDeadline.title}
                                    </h5>
                                  </div>

                                  <span className="rounded-full border border-white/85 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                                    {formatShortDate(activeDeadline.due)}
                                  </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                  <div className="rounded-2xl border border-white/70 bg-white/55 px-3 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                      Class
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                      {activeDeadline.classCode}
                                    </p>

                                    <p className="text-xs text-slate-600">
                                      {activeDeadline.className}
                                    </p>
                                  </div>

                                  <div className="rounded-2xl border border-white/70 bg-white/55 px-3 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                      Progress
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                      {activeDeadline.submitted}/
                                      {activeDeadline.totalStudents}
                                    </p>

                                    <p className="text-xs text-slate-600">
                                      submissions received
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                      Due
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                      {formatDeadlineDate(activeDeadline.due)}
                                    </p>

                                    <p className="text-xs text-slate-600">
                                      {getDueLabel(activeDeadline.due)}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate("/lecturer/assignments")
                                    }
                                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] hover:from-indigo-600 hover:to-blue-700"
                                  >
                                    View →
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          <div className="deadline-timeline-shell timeline-overflow-visible relative hidden lg:block">
                            <div className="pointer-events-none absolute inset-0">
                              <div className="absolute left-[10%] top-[16%] h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" />
                              <div className="absolute right-[12%] top-[8%] h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
                              <div className="absolute bottom-[6%] left-[40%] h-44 w-44 rounded-full bg-pink-400/10 blur-3xl" />
                            </div>

                            <svg
                              className="absolute inset-0 h-full w-full"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                            >
                              <defs>
                                <linearGradient
                                  id="deadlineLineGlow"
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="0%"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="rgba(99,102,241,0.20)"
                                  />
                                  <stop
                                    offset="50%"
                                    stopColor="rgba(34,211,238,0.22)"
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="rgba(236,72,153,0.18)"
                                  />
                                </linearGradient>

                                <linearGradient
                                  id="deadlineLineCore"
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="0%"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="rgba(99,102,241,0.70)"
                                  />
                                  <stop
                                    offset="50%"
                                    stopColor="rgba(34,211,238,0.82)"
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="rgba(236,72,153,0.72)"
                                  />
                                </linearGradient>

                                <filter
                                  id="deadlineBlur"
                                  x="-20%"
                                  y="-20%"
                                  width="140%"
                                  height="140%"
                                >
                                  <feGaussianBlur stdDeviation="1.8" />
                                </filter>
                              </defs>

                              <motion.path
                                d={timelinePath}
                                fill="none"
                                stroke="url(#deadlineLineGlow)"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                filter="url(#deadlineBlur)"
                                initial={{ pathLength: 0, opacity: 0.4 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.95, ease: EASE }}
                              />

                              <motion.path
                                d={timelinePath}
                                fill="none"
                                stroke="url(#deadlineLineCore)"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.95, ease: EASE }}
                              />
                            </svg>

                            {timelinePoints.map((item, idx) => {
                              const isActive = activeDeadlineId === item.id;
                              const isHovered = hoveredDeadlineId === item.id;
                              const bubblePosition = getBubblePosition(item.x);
                              const nodeStyles = getDeadlineToneStyles(
                                item.tone
                              );

                              return (
                                <motion.button
                                  key={item.id}
                                  type="button"
                                  className="absolute -translate-x-1/2 -translate-y-1/2"
                                  style={{
                                    left: `${item.x}%`,
                                    top: `${item.y}%`,
                                  }}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{
                                    opacity: 1,
                                    scale: isHovered
                                      ? 1.12
                                      : isActive
                                      ? 1.06
                                      : 1,
                                    zIndex: isHovered
                                      ? 30
                                      : isActive
                                      ? 20
                                      : 10,
                                  }}
                                  transition={{
                                    duration: 0.4,
                                    delay: idx * 0.08,
                                    ease: EASE,
                                  }}
                                  whileHover={{
                                    scale: isHovered ? 1.12 : 1.1,
                                  }}
                                  onHoverStart={() => {
                                    setHoveredDeadlineId(item.id);
                                    setActiveDeadlineId(item.id);
                                  }}
                                  onHoverEnd={() => setHoveredDeadlineId(null)}
                                  onFocus={() => {
                                    setHoveredDeadlineId(item.id);
                                    setActiveDeadlineId(item.id);
                                  }}
                                  onBlur={() => setHoveredDeadlineId(null)}
                                  onClick={() => setActiveDeadlineId(item.id)}
                                >
                                  <div
                                    className="deadline-node-orb"
                                    style={{ background: nodeStyles.orb }}
                                  />

                                  <div
                                    className="deadline-node-core h-[108px] w-[108px]"
                                    style={{
                                      background: nodeStyles.core,
                                      color: "#ffffff",
                                    }}
                                  >
                                    <div className="flex flex-col items-center justify-center px-3 text-center">
                                      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80">
                                        {item.classCode}
                                      </div>

                                      <div className="mt-2 text-lg font-extrabold leading-none">
                                        {formatShortDate(item.due)}
                                      </div>

                                      <div className="mt-2 text-[11px] font-medium text-white/82">
                                        {item.submitted}/{item.totalStudents}
                                      </div>
                                    </div>
                                  </div>

                                  <AnimatePresence>
                                    {isHovered && (
                                      <motion.div
                                        initial={{
                                          opacity: 0,
                                          y: item.side === "top" ? 12 : -12,
                                          scale: 0.96,
                                        }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{
                                          opacity: 0,
                                          y: item.side === "top" ? 8 : -8,
                                          scale: 0.96,
                                        }}
                                        transition={{
                                          duration: 0.22,
                                          ease: EASE,
                                        }}
                                        className={[
                                          "timeline-mini-card timeline-popup-card absolute z-30 w-[220px] rounded-[22px] p-4 text-left shadow-[0_22px_50px_rgba(15,23,42,0.16)]",
                                          item.side === "top"
                                            ? "top-[calc(100%+1.5rem)]"
                                            : "bottom-[calc(100%+1.5rem)]",
                                          bubblePosition,
                                        ].join(" ")}
                                      >
                                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                          {item.className}
                                        </p>

                                        <h5 className="mt-2 text-lg font-extrabold leading-tight text-slate-900">
                                          {item.title}
                                        </h5>

                                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                          <div className="rounded-2xl border border-white/75 bg-white/58 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                              Due
                                            </p>

                                            <p className="mt-1 font-semibold text-slate-900">
                                              {formatDeadlineDate(item.due)}
                                            </p>
                                          </div>

                                          <div className="rounded-2xl border border-white/75 bg-white/58 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                              Progress
                                            </p>

                                            <p className="mt-1 font-semibold text-slate-900">
                                              {item.submitted}/
                                              {item.totalStudents}
                                            </p>
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.button>
                              );
                            })}
                          </div>

                          <div className="space-y-4 lg:hidden">
                            {upcoming.map((item, idx) => {
                              const isActive = activeDeadlineId === item.id;
                              const tone = getDeadlineToneStyles(
                                (["blue", "purple", "green", "amber"][
                                  idx % 4
                                ] as DeadlineTone) || "blue"
                              );

                              return (
                                <motion.button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setActiveDeadlineId(item.id)}
                                  whileTap={{ scale: 0.99 }}
                                  className="w-full text-left"
                                >
                                  <div className="timeline-mini-card rounded-[24px] p-4">
                                    <div className="flex items-center gap-4">
                                      <motion.div
                                        animate={{
                                          scale: isActive ? 1.08 : 1,
                                        }}
                                        transition={{
                                          duration: 0.24,
                                          ease: EASE,
                                        }}
                                        className="deadline-node-core h-[78px] w-[78px] shrink-0"
                                        style={{
                                          background: tone.core,
                                          color: "#ffffff",
                                        }}
                                      >
                                        <div className="flex flex-col items-center justify-center text-center">
                                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                                            {item.classCode}
                                          </div>

                                          <div className="mt-1 text-sm font-extrabold">
                                            {formatShortDate(item.due)}
                                          </div>
                                        </div>
                                      </motion.div>

                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                                          {item.className}
                                        </p>

                                        <h5 className="mt-1 text-lg font-extrabold leading-tight text-slate-900">
                                          {item.title}
                                        </h5>

                                        <p className="mt-2 text-sm text-slate-600">
                                          {formatDeadlineDate(item.due)} •{" "}
                                          {item.submitted}/{item.totalStudents}{" "}
                                          submissions
                                        </p>
                                      </div>
                                    </div>

                                    <AnimatePresence initial={false}>
                                      {isActive && (
                                        <motion.div
                                          initial={{
                                            opacity: 0,
                                            height: 0,
                                            y: -8,
                                          }}
                                          animate={{
                                            opacity: 1,
                                            height: "auto",
                                            y: 0,
                                          }}
                                          exit={{
                                            opacity: 0,
                                            height: 0,
                                            y: -8,
                                          }}
                                          transition={{
                                            duration: 0.28,
                                            ease: EASE,
                                          }}
                                          className="overflow-hidden"
                                        >
                                          <div className="mt-4 rounded-2xl border border-white/75 bg-white/58 p-4">
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                              <div>
                                                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                                  Due in
                                                </p>

                                                <p className="mt-1 font-semibold text-slate-900">
                                                  {getDueLabel(item.due)}
                                                </p>
                                              </div>

                                              <div>
                                                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                                  Status
                                                </p>

                                                <p className="mt-1 font-semibold text-slate-900">
                                                  Review progress visible
                                                </p>
                                              </div>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(
                                                  "/lecturer/assignments"
                                                );
                                              }}
                                              className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] hover:from-indigo-600 hover:to-blue-700"
                                            >
                                              View →
                                            </button>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      </HaloCard>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </section>

        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
              Your Classes
            </h3>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-white shadow-[0_10px_30px_rgba(59,130,246,0.35)] transition hover:from-indigo-600 hover:to-blue-700"
            >
              ＋ Create Class
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {classes.map((c) => {
              const edge =
                c.accent === "green"
                  ? "edge-green"
                  : c.accent === "blue"
                  ? "edge-blue"
                  : "edge-purple";

              const tint =
                c.accent === "green"
                  ? "tint-green"
                  : c.accent === "blue"
                  ? "tint-blue"
                  : "tint-purple";

              return (
                <HaloCard key={c.id} colors={c.accent ?? "purple"}>
                  <div
                    className={[
                      "glass glass-colorful edge-right rounded-2xl p-5",
                      edge,
                      tint,
                    ].join(" ")}
                  >
                    <span className="shine" />

                    <h4 className="text-xl font-extrabold tracking-tight text-slate-900">
                      {c.name}
                    </h4>

                    <p className="font-medium text-slate-600">
                      Code: {c.code}
                    </p>

                    <p className="text-slate-600">
                      {c.enrolled} students enrolled
                    </p>

                    <p className="text-slate-600">
                      {c.activeAssignments} active assignments
                    </p>

                    <button
                      type="button"
                      className="mt-4 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] transition hover:from-indigo-600 hover:to-blue-700"
                      onClick={() => navigate("/lecturer/classes")}
                    >
                      Manage
                    </button>
                  </div>
                </HaloCard>
              );
            })}

            {!loading && classes.length === 0 && (
              <div className="glass glass-colorful tint-slate edge-right edge-slate rounded-2xl p-5 text-slate-700">
                <span className="shine" />
                No classes yet. Click <b>Create Class</b> to add one.
              </div>
            )}
          </div>
        </section>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-extrabold tracking-tight text-slate-900">
            Recent Activity
          </h3>

          <div className="space-y-3">
            {recent.map((line, i) => (
              <HaloCard key={i} colors={i === 0 ? "green" : "blue"}>
                <div className="glass flex items-start gap-2 rounded-xl border-l-4 border-indigo-500/80 px-3 py-2">
                  <span className="shine" />
                  <span>{i === 0 ? "✅" : "💬"}</span>
                  <p className="font-medium text-slate-800">{line}</p>
                </div>
              </HaloCard>
            ))}

            {!loading && recent.length === 0 && (
              <div className="glass rounded-xl px-3 py-2 text-slate-700">
                <span className="shine" />
                No recent activity yet.
              </div>
            )}
          </div>
        </section>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-5">
          <HaloCard colors="blue">
            <div className="glass w-full max-w-md rounded-3xl p-6 shadow-2xl">
              <span className="shine" />

              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
                Create Class
              </h3>

              <p className="mt-1 text-slate-600">
                Enter details for your new class.
              </p>

              <label className="mt-4 block text-sm font-semibold text-slate-800">
                Class name
              </label>

              <input
                className="glass mt-1 w-full rounded-xl px-4 py-2"
                placeholder="e.g., STEM"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />

              <label className="mt-4 block text-sm font-semibold text-slate-800">
                Class description
              </label>

              <textarea
                className="glass mt-1 w-full rounded-xl px-4 py-2"
                rows={3}
                placeholder="Short summary"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />

              <label className="mt-4 block text-sm font-semibold text-slate-800">
                Class code
              </label>

              <input
                className="glass mt-1 w-full rounded-xl px-4 py-2"
                placeholder="e.g., COMP-3002"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-slate-700 hover:bg-white"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-white shadow transition hover:from-indigo-600 hover:to-blue-700"
                  onClick={addClass}
                >
                  Create
                </button>
              </div>
            </div>
          </HaloCard>
        </div>
      )}
    </div>
  );
}

/* ------------------- helpers ------------------- */

function HaloCard({
  children,
  colors = "purple",
  noTimelineHoverShade = false,
}: {
  children: ReactNode;
  colors?: "purple" | "blue" | "green" | "amber" | "slate";
  noTimelineHoverShade?: boolean;
}) {
  const palette: Record<
    "purple" | "blue" | "green" | "amber" | "slate",
    [string, string, string]
  > = {
    purple: [
      "rgba(140,90,255,.16)",
      "rgba(66,130,255,.10)",
      "rgba(236,72,153,.08)",
    ],
    blue: [
      "rgba(59,130,246,.16)",
      "rgba(99,102,241,.10)",
      "rgba(236,72,153,.06)",
    ],
    green: [
      "rgba(16,185,129,.18)",
      "rgba(5,150,105,.10)",
      "rgba(59,130,246,.06)",
    ],
    amber: [
      "rgba(245,158,11,.18)",
      "rgba(251,146,60,.10)",
      "rgba(236,72,153,.06)",
    ],
    slate: [
      "rgba(100,116,139,.16)",
      "rgba(71,85,105,.10)",
      "rgba(59,130,246,.06)",
    ],
  };

  const [a, b, c] = palette[colors];

  const style = {
    ["--halo1" as string]: a,
    ["--halo2" as string]: b,
    ["--halo3" as string]: c,
  } as CSSProperties;

  return (
    <div
      className={`halo-card${
        noTimelineHoverShade ? " no-timeline-hover-shade" : ""
      }`}
      style={style}
    >
      {children}
    </div>
  );
}

function buildTimelinePath(points: TimelinePoint[]) {
  if (points.length === 0) return "";

  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return path;
}

function formatDeadlineDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDueLabel(value: string) {
  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) return "Due date available";

  const today = new Date();

  const due = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  );

  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  if (diffDays === -1) return "Was due yesterday";

  return `Was due ${Math.abs(diffDays)} days ago`;
}

function formatLastUpdated(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "just now";

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBubblePosition(x: number) {
  if (x < 22) return "left-0";
  if (x > 78) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

function getDeadlineToneStyles(tone: DeadlineTone) {
  switch (tone) {
    case "purple":
      return {
        core: "linear-gradient(135deg, rgba(124,58,237,1) 0%, rgba(99,102,241,1) 52%, rgba(236,72,153,0.92) 100%)",
        orb: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(236,72,153,0.20) 52%, rgba(236,72,153,0) 72%)",
      };

    case "green":
      return {
        core: "linear-gradient(135deg, rgba(16,185,129,1) 0%, rgba(34,197,94,0.96) 48%, rgba(59,130,246,0.9) 100%)",
        orb: "radial-gradient(circle, rgba(16,185,129,0.34) 0%, rgba(59,130,246,0.18) 52%, rgba(59,130,246,0) 72%)",
      };

    case "amber":
      return {
        core: "linear-gradient(135deg, rgba(245,158,11,1) 0%, rgba(251,146,60,0.96) 48%, rgba(236,72,153,0.86) 100%)",
        orb: "radial-gradient(circle, rgba(251,146,60,0.34) 0%, rgba(236,72,153,0.16) 52%, rgba(236,72,153,0) 72%)",
      };

    case "blue":
    default:
      return {
        core: "linear-gradient(135deg, rgba(59,130,246,1) 0%, rgba(99,102,241,0.98) 52%, rgba(34,211,238,0.92) 100%)",
        orb: "radial-gradient(circle, rgba(59,130,246,0.34) 0%, rgba(34,211,238,0.18) 52%, rgba(34,211,238,0) 72%)",
      };
  }
}
