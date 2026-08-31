import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

type Role = "student" | "lecturer" | "admin";
type StudentThemeMode = "light" | "dark";

const STORAGE_KEY = "eduguard.student.theme";
const CHANGE_EVENT = "eduguard:student-theme-change";

function normalizeTheme(value: unknown): StudentThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): StudentThemeMode {
  if (typeof window === "undefined") return "light";
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

const ROLES: Array<{
  key: Role;
  index: string;
  title: string;
  shortTitle: string;
  caption: string;
  imageSrc: string;
  accent: string;
  glow: string;
}> = [
  {
    key: "student",
    index: "01",
    title: "Student",
    shortTitle: "STUDENT",
    caption: "Assignments, coursework, and integrity reports.",
    imageSrc: "/StudentLogin.png",
    accent: "#4F7CFF",
    glow: "rgba(79,124,255,0.34)",
  },
  {
    key: "lecturer",
    index: "02",
    title: "Lecturer / Tutor",
    shortTitle: "LECTURER",
    caption: "Review submissions and manage classes.",
    imageSrc: "/LecturerLogin.png",
    accent: "#9A6BFF",
    glow: "rgba(154,107,255,0.30)",
  },
  {
    key: "admin",
    index: "03",
    title: "Administrator",
    shortTitle: "ADMIN",
    caption: "Manage users, settings, and activity.",
    imageSrc: "/AdminLogin.png",
    accent: "#19B98B",
    glow: "rgba(25,185,139,0.28)",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export default function RoleSelectPage() {
  const nav = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [theme, setTheme] = useState<StudentThemeMode>(() => readInitialTheme());

  const isDark = theme === "dark";

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.studentTheme = theme;
    document.body.dataset.studentTheme = theme;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { theme } }));

    return () => {
      delete document.documentElement.dataset.studentTheme;
      delete document.body.dataset.studentTheme;
    };
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      const normalized = normalizeTheme(nextTheme);
      setTheme((current) => (current === normalized ? current : normalized));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: StudentThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustomEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  function handleSelect(role: Role) {
    if (selectedRole) return;

    setSelectedRole(role);

    window.setTimeout(() => {
      nav(`/register/${role}`);
    }, 280);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0.92 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={[
        "relative min-h-screen overflow-hidden transition-colors duration-300",
        isDark ? "bg-[#08111F] text-slate-100" : "bg-white text-[#0F172A]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[-16rem] top-[-10rem] h-[40rem] w-[40rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(79,124,255,0.24) 0%, rgba(79,124,255,0.10) 34%, rgba(79,124,255,0) 72%)"
              : "radial-gradient(circle, rgba(79,124,255,0.30) 0%, rgba(79,124,255,0.14) 34%, rgba(79,124,255,0) 72%)",
          }}
          animate={{ x: [0, 26, -12, 0], y: [0, 20, -10, 0], scale: [1, 1.06, 0.98, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-14rem] top-[-8rem] h-[36rem] w-[36rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(154,107,255,0.22) 0%, rgba(154,107,255,0.09) 34%, rgba(154,107,255,0) 72%)"
              : "radial-gradient(circle, rgba(154,107,255,0.26) 0%, rgba(154,107,255,0.10) 34%, rgba(154,107,255,0) 72%)",
          }}
          animate={{ x: [0, -22, 10, 0], y: [0, 18, -8, 0], scale: [1, 0.98, 1.05, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-10rem] bottom-[-9rem] h-[30rem] w-[30rem] rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(25,185,139,0.18) 0%, rgba(25,185,139,0.07) 34%, rgba(25,185,139,0) 72%)"
              : "radial-gradient(circle, rgba(25,185,139,0.24) 0%, rgba(25,185,139,0.08) 34%, rgba(25,185,139,0) 72%)",
          }}
          animate={{ x: [0, -16, 8, 0], y: [0, -12, 10, 0], scale: [1, 1.04, 0.98, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute bottom-[-10rem] left-1/2 h-[26rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background: isDark
              ? "radial-gradient(circle, rgba(255,204,102,0.12) 0%, rgba(255,204,102,0.04) 36%, rgba(255,204,102,0) 72%)"
              : "radial-gradient(circle, rgba(255,204,102,0.22) 0%, rgba(255,204,102,0.06) 36%, rgba(255,204,102,0) 72%)",
          }}
          animate={{ scale: [1, 1.05, 0.98, 1], opacity: [0.82, 1, 0.86, 0.82] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.44 : 0.62 }}
          animate={{
            opacity: isDark ? [0.34, 0.56, 0.42, 0.34] : [0.48, 0.78, 0.56, 0.48],
            x: [0, 10, -8, 0],
            y: [0, -6, 8, 0],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="lineGlowA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(79,124,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.22)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(154,107,255,0.24)" : "rgba(154,107,255,0.34)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.16)" : "rgba(79,196,255,0.24)"} />
              <stop offset="100%" stopColor="rgba(79,196,255,0.00)" />
            </linearGradient>

            <linearGradient id="lineCoreA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="18%" stopColor={isDark ? "rgba(123,198,255,0.60)" : "rgba(123,198,255,0.85)"} />
              <stop offset="52%" stopColor={isDark ? "rgba(120,77,255,0.78)" : "rgba(120,77,255,0.95)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(79,196,255,0.62)" : "rgba(79,196,255,0.88)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="blurA" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#lineGlowA)"
            strokeWidth="28"
            strokeLinecap="round"
            filter="url(#blurA)"
            animate={{ pathLength: [0.96, 1, 0.98, 0.96] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 70 560 C 130 220, 340 150, 520 380 S 980 560, 1140 210 S 1480 40, 1540 260 S 1510 720, 1300 760"
            fill="none"
            stroke="url(#lineCoreA)"
            strokeWidth="8"
            strokeLinecap="round"
            animate={{ pathLength: [0.96, 1, 0.98, 0.96] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.34 : 0.52 }}
          animate={{
            opacity: isDark ? [0.24, 0.46, 0.30, 0.24] : [0.34, 0.62, 0.42, 0.34],
            x: [0, -12, 8, 0],
            y: [0, 8, -6, 0],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="lineGlowB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(79,196,255,0.12)" : "rgba(79,196,255,0.18)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(79,124,255,0.16)" : "rgba(79,124,255,0.24)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(154,107,255,0.14)" : "rgba(154,107,255,0.22)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <linearGradient id="lineCoreB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="22%" stopColor={isDark ? "rgba(126,222,255,0.54)" : "rgba(126,222,255,0.72)"} />
              <stop offset="56%" stopColor={isDark ? "rgba(88,146,255,0.58)" : "rgba(88,146,255,0.78)"} />
              <stop offset="84%" stopColor={isDark ? "rgba(170,121,255,0.56)" : "rgba(170,121,255,0.74)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="blurB" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#lineGlowB)"
            strokeWidth="20"
            strokeLinecap="round"
            filter="url(#blurB)"
            animate={{ pathLength: [0.97, 1, 0.99, 0.97] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.path
            d="M 120 620 C 260 760, 520 640, 700 470 S 1040 190, 1260 140 S 1500 180, 1520 390 S 1480 740, 1260 760"
            fill="none"
            stroke="url(#lineCoreB)"
            strokeWidth="6"
            strokeLinecap="round"
            animate={{ pathLength: [0.97, 1, 0.99, 0.97] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          initial={{ opacity: isDark ? 0.18 : 0.28 }}
          animate={{
            opacity: isDark ? [0.12, 0.24, 0.16, 0.12] : [0.18, 0.34, 0.22, 0.18],
            x: [0, 6, -5, 0],
            y: [0, -4, 4, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="lineCoreC" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="28%" stopColor={isDark ? "rgba(79,124,255,0.30)" : "rgba(79,124,255,0.42)"} />
              <stop offset="60%" stopColor={isDark ? "rgba(154,107,255,0.34)" : "rgba(154,107,255,0.48)"} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            <filter id="blurC" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <path
            d="M 210 780 C 420 720, 700 700, 980 760 S 1360 840, 1500 810"
            fill="none"
            stroke="url(#lineCoreC)"
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#blurC)"
          />
        </motion.svg>

        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.11 : 0.16,
            backgroundImage: isDark
              ? "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)"
              : "linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
          }}
        />

        <div className={isDark ? "absolute left-0 top-0 h-full w-[20%] bg-[linear-gradient(90deg,rgba(79,124,255,0.08),rgba(79,124,255,0))]" : "absolute left-0 top-0 h-full w-[20%] bg-[linear-gradient(90deg,rgba(79,124,255,0.10),rgba(79,124,255,0))]"} />
        <div className={isDark ? "absolute right-0 top-0 h-full w-[18%] bg-[linear-gradient(270deg,rgba(154,107,255,0.07),rgba(154,107,255,0))]" : "absolute right-0 top-0 h-full w-[18%] bg-[linear-gradient(270deg,rgba(154,107,255,0.09),rgba(154,107,255,0))]"} />
        <div className={isDark ? "absolute bottom-0 left-0 h-[24%] w-full bg-[linear-gradient(0deg,rgba(25,185,139,0.05),rgba(25,185,139,0))]" : "absolute bottom-0 left-0 h-[24%] w-full bg-[linear-gradient(0deg,rgba(25,185,139,0.07),rgba(25,185,139,0))]"} />
        <div className={isDark ? "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(4,10,24,0)_26%,rgba(4,10,24,0.46)_100%)]" : "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0)_30%,rgba(255,255,255,0.38)_100%)]"} />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10 lg:py-10">
        <div className="mb-10 flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => nav("/login")}
              className={[
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl transition",
                isDark
                  ? "border border-white/10 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                  : "border border-white/70 bg-white/70 text-[#334155] hover:bg-white hover:text-[#0F172A]",
              ].join(" ")}
            >
              ← Back to sign in
            </button>
          </motion.div>

          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300",
              isDark
                ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white",
            ].join(" ")}
          >
            <span>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light mode" : "Night mode"}</span>
          </button>
        </div>

        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.82, ease: EASE }}
            className="flex h-full flex-col justify-between"
          >
            <div>
              <div
                className={[
                  "mb-4 text-xs uppercase tracking-[0.42em]",
                  isDark ? "text-slate-400" : "text-[#64748B]",
                ].join(" ")}
              >
                Create account / role selection
              </div>

              <div className="overflow-hidden">
                <motion.h1
                  initial={{ y: 90 }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.92, delay: 0.04, ease: EASE }}
                  className={[
                    "max-w-[8ch] text-[3rem] font-semibold uppercase leading-[0.88] tracking-[-0.055em] sm:text-[4.2rem] lg:text-[5.3rem]",
                    isDark ? "text-white" : "text-[#0F172A]",
                  ].join(" ")}
                >
                  Choose your entry lane
                </motion.h1>
              </div>
            </div>
          </motion.section>

          <section className="flex flex-wrap items-end justify-center gap-4 lg:justify-end">
            {ROLES.map((role, index) => {
              const isSelected = selectedRole === role.key;
              const isDimmed = selectedRole !== null && selectedRole !== role.key;

              return (
                <motion.button
                  key={role.key}
                  type="button"
                  onClick={() => handleSelect(role.key)}
                  layoutId={`role-card-${role.key}`}
                  initial={{ opacity: 0, y: 44 }}
                  animate={{
                    opacity: isDimmed ? 0.38 : 1,
                    y: 0,
                    scale: isSelected ? 1.035 : isDimmed ? 0.985 : 1,
                    rotateY: isSelected ? -12 : 0,
                    x: isSelected ? -16 : 0,
                  }}
                  transition={{
                    layout: { duration: 0.92, ease: EASE },
                    default: {
                      duration: 1.72,
                      delay: 0.14 + index * 0.08,
                      ease: EASE,
                    },
                  }}
                  whileHover={selectedRole ? undefined : { y: -8, scale: 1.01 }}
                  whileTap={selectedRole ? undefined : { scale: 0.99 }}
                  style={{
                    transformPerspective: 1600,
                    transformStyle: "preserve-3d",
                  }}
                  className={[
                    "group relative h-[34rem] w-[11rem] overflow-hidden rounded-[34px] text-left shadow-[0_20px_50px_rgba(15,23,42,0.10)] backdrop-blur-2xl md:h-[36rem] md:w-[11.75rem]",
                    isDark
                      ? "border border-white/10 bg-white/8"
                      : "border border-white/80 bg-white/50",
                  ].join(" ")}
                >
                  <motion.div
                    layoutId={`role-card-bg-${role.key}`}
                    className="absolute inset-0"
                    style={{
                      background: isDark
                        ? `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0.08) 100%), radial-gradient(circle at top left, ${role.glow} 0%, rgba(255,255,255,0) 58%)`
                        : `linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.10) 34%, rgba(255,255,255,0.20) 100%), radial-gradient(circle at top left, ${role.glow} 0%, rgba(255,255,255,0) 58%)`,
                    }}
                    transition={{ layout: { duration: 0.92, ease: EASE } }}
                  />

                  <motion.img
                    layoutId={`role-card-image-${role.key}`}
                    src={role.imageSrc}
                    alt={role.title}
                    className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.96]"
                    animate={{ scale: isSelected ? 1.03 : 1 }}
                    transition={{
                      layout: { duration: 0.92, ease: EASE },
                      default: { duration: 0.45, ease: "easeOut" },
                    }}
                  />

                  <div className={isDark ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.03)_34%,rgba(255,255,255,0.10)_100%)]" : "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.04)_34%,rgba(255,255,255,0.16)_100%)]"} />
                  <div className={isDark ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.22)_42%,rgba(2,6,23,0.82)_100%)]" : "absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.00)_0%,rgba(15,23,42,0.08)_42%,rgba(15,23,42,0.70)_100%)]"} />

                  <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                    <div
                      className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.34em] backdrop-blur-md"
                      style={{
                        color: role.accent,
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.82)",
                        background: isDark ? "rgba(8,17,31,0.52)" : "rgba(255,255,255,0.70)",
                      }}
                    >
                      {role.index}
                    </div>

                    <div className={isDark ? "text-[10px] uppercase tracking-[0.34em] text-white/72" : "text-[10px] uppercase tracking-[0.34em] text-white/92"}>
                      Select
                    </div>
                  </div>

                  <div className="relative flex h-full flex-col justify-end p-4">
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.55, delay: 0.28 + index * 0.07 }}
                    >
                      <div className={isDark ? "mb-2 text-[10px] uppercase tracking-[0.36em] text-white/64" : "mb-2 text-[10px] uppercase tracking-[0.36em] text-white/74"}>
                        {role.shortTitle}
                      </div>

                      <h2 className="text-[1.05rem] font-semibold leading-[1.04] tracking-[-0.03em] text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.22)] md:text-[1.15rem]">
                        {role.title}
                      </h2>

                      <p className={isDark ? "mt-3 text-[13px] leading-6 text-white/80" : "mt-3 text-[13px] leading-6 text-white/88"}>
                        {role.caption}
                      </p>

                      <div className="mt-6 flex items-center justify-between">
                        <div className="text-sm font-medium text-white">Continue</div>
                        <motion.div
                          animate={{ x: isSelected ? 10 : 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="text-lg text-white"
                        >
                          →
                        </motion.div>
                      </div>
                    </motion.div>
                  </div>

                  <motion.div
                    className="absolute bottom-0 left-0 h-[3px]"
                    style={{ background: role.accent }}
                    initial={{ width: 0 }}
                    animate={{ width: isSelected ? "100%" : "0%" }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                </motion.button>
              );
            })}
          </section>
        </div>
      </div>
    </motion.div>
  );
}