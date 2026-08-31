import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

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

type Piece = {
  type: "cap" | "book" | "pencil";
  x: number;
  y: number;
  size: number;
  rotate?: number;
  color: string;
  delay?: string;
  duration?: string;
  opacity?: number;
  dx?: number;
  dy?: number;
};

const ICON_SCALE = 1.35;

export default function Welcome() {
  const nav = useNavigate();
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

  const pieces: Piece[] = [
    { type: "cap", x: 9, y: 20, size: 42, rotate: -10, color: "rgba(99,102,241,.35)", delay: "-1s", duration: "20s", dx: 36, dy: 26 },
    { type: "book", x: 21, y: 68, size: 48, rotate: 8, color: "rgba(59,130,246,.32)", delay: "-2s", duration: "24s", dx: 44, dy: 32 },
    { type: "pencil", x: 87, y: 24, size: 54, rotate: 24, color: "rgba(56,189,248,.30)", delay: "-3s", duration: "22s", dx: 40, dy: 30 },
    { type: "book", x: 74, y: 72, size: 46, rotate: -6, color: "rgba(236,72,153,.30)", delay: "-1.6s", duration: "26s", dx: 48, dy: 34 },
    { type: "cap", x: 42, y: 12, size: 40, rotate: 6, color: "rgba(167,139,250,.32)", delay: "-2.4s", duration: "21s", dx: 34, dy: 24 },
    { type: "pencil", x: 14, y: 82, size: 52, rotate: -18, color: "rgba(59,130,246,.28)", delay: "-4s", duration: "23s", dx: 42, dy: 28 },
    { type: "book", x: 90, y: 50, size: 44, rotate: 10, color: "rgba(99,102,241,.30)", delay: "-2.8s", duration: "25s", dx: 46, dy: 30 },
    { type: "cap", x: 65, y: 16, size: 38, rotate: -4, color: "rgba(236,72,153,.28)", delay: "-3.6s", duration: "20s", dx: 32, dy: 22 },
    { type: "pencil", x: 32, y: 38, size: 50, rotate: 14, color: "rgba(56,189,248,.28)", delay: "-1.2s", duration: "24s", dx: 44, dy: 30 },
    { type: "book", x: 55, y: 85, size: 42, rotate: -12, color: "rgba(59,130,246,.28)", delay: "-5s", duration: "26s", dx: 48, dy: 36 },
  ];

  return (
    <div
      className={[
        "relative min-h-screen w-full overflow-hidden grid place-items-center transition-colors duration-300",
        isDark ? "bg-[#08111F]" : "bg-[#f6f4ff]",
      ].join(" ")}
    >
      <style>{`
        @keyframes blobFloat {
          0%   { transform: translate(0,0) scale(1); }
          33%  { transform: translate(22px,-16px) scale(1.06); }
          66%  { transform: translate(-18px,18px) scale(1.03); }
          100% { transform: translate(0,0) scale(1); }
        }
        @keyframes halo {
          0%,100% { transform: scale(1); opacity: .55; }
          50%     { transform: scale(1.09); opacity: .95; }
        }
        @keyframes wander {
          0%   { transform: translate3d(0,0,0) rotate(var(--rot)); }
          25%  { transform: translate3d(var(--dx), calc(var(--dy) * 0.6), 0) rotate(calc(var(--rot) + 4deg)); }
          50%  { transform: translate3d(calc(var(--dx) * -0.6), var(--dy), 0) rotate(calc(var(--rot) + 8deg)); }
          75%  { transform: translate3d(calc(var(--dx) * 0.4), calc(var(--dy) * -0.4), 0) rotate(calc(var(--rot) + 5deg)); }
          100% { transform: translate3d(0,0,0) rotate(var(--rot)); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .eg-gradient-text{
          background: linear-gradient(90deg,
            #0b0124ff 0%,
            #031f85ff 30%,
            #b351f5ff 60%,
            #5904a8ff 85%);
          background-size: 220% 220%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gradientShift 9s ease-in-out infinite;
          filter: drop-shadow(0 8px 22px rgba(99,102,241,.18));
        }
        .eg-gradient-text-dark{
          background: linear-gradient(90deg,
            #e8ecff 0%,
            #8fb7ff 28%,
            #c593ff 58%,
            #8cb8ff 100%);
          background-size: 220% 220%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gradientShift 9s ease-in-out infinite;
          filter: drop-shadow(0 10px 26px rgba(99,102,241,.24));
        }
        .blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(72px) saturate(130%);
          opacity: .65;
          animation: blobFloat 16s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .halo { animation: halo 3.8s ease-in-out infinite; }
        .piece {
          position: absolute;
          z-index: 1;
          pointer-events: none;
          will-change: transform;
          opacity: .95;
        }
      `}</style>

      <button
        type="button"
        onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        className={[
          "absolute right-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-xl transition-all duration-300",
          isDark
            ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
            : "border-white/80 bg-white/70 text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.08)] hover:bg-white",
        ].join(" ")}
      >
        <span>{isDark ? "☀️" : "🌙"}</span>
        <span>{isDark ? "Light mode" : "Night mode"}</span>
      </button>

      <div className="absolute inset-0">
        <div
          className="blob"
          style={{
            top: "-18vh",
            left: "-14vw",
            width: "52vw",
            height: "52vw",
            background: isDark
              ? "radial-gradient(circle at 40% 40%, rgba(167,139,250,.28), transparent 62%)"
              : "radial-gradient(circle at 40% 40%, rgba(167,139,250,.60), transparent 62%)",
          }}
        />
        <div
          className="blob"
          style={{
            top: "-20vh",
            right: "-12vw",
            width: "48vw",
            height: "48vw",
            background: isDark
              ? "radial-gradient(circle at 60% 42%, rgba(56,189,248,.26), transparent 64%)"
              : "radial-gradient(circle at 60% 42%, rgba(56,189,248,.55), transparent 64%)",
          }}
        />
        <div
          className="blob"
          style={{
            bottom: "-18vh",
            left: "-12vw",
            width: "50vw",
            height: "50vw",
            background: isDark
              ? "radial-gradient(circle at 45% 60%, rgba(236,72,153,.22), transparent 62%)"
              : "radial-gradient(circle at 45% 60%, rgba(236,72,153,.48), transparent 62%)",
          }}
        />
        <div
          className="blob"
          style={{
            bottom: "-16vh",
            right: "-14vw",
            width: "54vw",
            height: "54vw",
            background: isDark
              ? "radial-gradient(circle at 55% 55%, rgba(59,130,246,.28), transparent 64%)"
              : "radial-gradient(circle at 55% 55%, rgba(59,130,246,.55), transparent 64%)",
          }}
        />
      </div>

      {isDark && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(8,17,31,0)_26%,rgba(8,17,31,0.46)_100%)]" />
          <div className="absolute inset-0 opacity-[0.08]" style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
          }} />
        </>
      )}

      <div className="absolute inset-0" aria-hidden="true">
        {pieces.map((p, i) => (
          <StudyPiece key={i} {...p} isDark={isDark} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <div className="relative">
          <div
            className="absolute -inset-10 rounded-[32px] halo blur-2xl"
            style={{
              background: isDark
                ? "radial-gradient(closest-side, rgba(99,102,241,.26), transparent 70%)"
                : "radial-gradient(closest-side, rgba(99,102,241,.35), transparent 70%)",
            }}
          />
          <div
            className="relative grid h-24 w-24 place-items-center rounded-2xl text-3xl font-semibold text-white shadow-[0_14px_36px_rgba(140,90,255,0.45)]"
            style={{ background: "linear-gradient(135deg, rgb(140,90,255), rgb(66,130,255))" }}
          >
            EG
          </div>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
          <span className={isDark ? "eg-gradient-text-dark" : "eg-gradient-text"}>
            Welcome to EduGuard
          </span>
        </h1>

        <p className={["max-w-xl", isDark ? "text-slate-300" : "text-slate-700"].join(" ")}>
          Keeping academic integrity simple.
        </p>

        <button
          onClick={() => nav("/login")}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 px-8 py-3 font-medium text-white shadow-[0_14px_36px_rgba(99,102,241,0.35)] transition-transform hover:scale-[1.03] hover:from-indigo-600 hover:to-blue-700 active:scale-95"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function StudyPiece(props: Piece & { isDark: boolean }) {
  const {
    type,
    x,
    y,
    size,
    rotate = 0,
    color,
    delay = "0s",
    duration = "22s",
    opacity = 0.95,
    dx = 40,
    dy = 30,
    isDark,
  } = props;

  const w = size * ICON_SCALE;
  const h = size * ICON_SCALE;

  const style = {
    left: `${x}%`,
    top: `${y}%`,
    width: `${w}px`,
    height: `${h}px`,
    opacity: isDark ? Math.max(0.55, opacity - 0.18) : opacity,
    ["--rot" as any]: `${rotate}deg`,
    ["--dx" as any]: `${dx}px`,
    ["--dy" as any]: `${dy}px`,
    ["--dur" as any]: duration,
    animation: `wander var(--dur) ease-in-out infinite`,
    animationDelay: delay,
    filter: isDark
      ? `drop-shadow(0 0 14px ${color}) drop-shadow(0 8px 18px rgba(0,0,0,.22))`
      : `drop-shadow(0 0 18px ${color}) drop-shadow(0 8px 18px rgba(0,0,0,.06))`,
  } as CSSProperties;

  return (
    <svg
      className="piece"
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke={isDark ? "rgba(255,255,255,.82)" : "rgba(255,255,255,.95)"}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "cap" && (
        <>
          <polygon points="12,3 22,9 12,15 2,9" />
          <path d="M5 11v4c0 1.2 3.5 3 7 3s7-1.8 7-3v-4" />
          <path d="M22 9v5" />
          <circle cx="22" cy="15" r="0.9" fill={isDark ? "rgba(255,255,255,.82)" : "rgba(255,255,255,.95)"} stroke="none" />
        </>
      )}
      {type === "book" && (
        <>
          <path d="M3 5h7a3 3 0 0 1 3 3v10a3 3 0 0 0-3-3H3z" />
          <path d="M21 5h-7a3 3 0 0 0-3 3v10a3 3 0 0 1 3-3h7z" />
          <path d="M10 8v7" />
        </>
      )}
      {type === "pencil" && (
        <>
          <path d="M4 20l3-1 11-11-2-2L5 17z" />
          <path d="M15 6l2 2" />
          <path d="M3 21l1-1" />
        </>
      )}
    </svg>
  );
}