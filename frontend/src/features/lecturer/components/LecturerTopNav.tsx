import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";

const tabs = [
  { label: "Dashboard", to: "/lecturer/dashboard" },
  { label: "Classes", to: "/lecturer/classes" },
  { label: "Assignments", to: "/lecturer/assignments" },
  { label: "Reports", to: "/lecturer/reports" },
  { label: "Marking", to: "/lecturer/marking" },
  { label: "Messages", to: "/lecturer/messages" },
  { label: "Students", to: "/lecturer/students" },
  { label: "Settings", to: "/lecturer/settings" },
  { label: "Help", to: "/lecturer/help" },
];

const LECTURER_THEME_STORAGE_KEY = "eduguard.lecturer.theme";
const LECTURER_THEME_EVENT = "eduguard:lecturer-theme-change";

type LecturerThemeMode = "light" | "dark";

function normalizeLecturerTheme(value: unknown): LecturerThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function LecturerThemeButton() {
  const [theme, setTheme] = useState<LecturerThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return normalizeLecturerTheme(window.localStorage.getItem(LECTURER_THEME_STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      setTheme((current) => {
        const normalized = normalizeLecturerTheme(nextTheme);
        return current === normalized ? current : normalized;
      });
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LECTURER_THEME_STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: LecturerThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, onCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LECTURER_THEME_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  const toggleTheme = () => {
    if (typeof window === "undefined") return;
    const nextTheme: LecturerThemeMode = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(LECTURER_THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.lecturerTheme = nextTheme;
    document.body.dataset.lecturerTheme = nextTheme;
    window.dispatchEvent(new CustomEvent(LECTURER_THEME_EVENT, { detail: { theme: nextTheme } }));
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={theme === "dark"
        ? "rounded-full border border-cyan-400/20 bg-white/5 px-3 py-1 text-sm font-medium text-cyan-200 shadow-[0_12px_28px_rgba(34,211,238,0.15)] backdrop-blur-xl transition hover:bg-white/10"
        : "rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-medium text-slate-700 shadow transition hover:bg-white"
      }
      title="Toggle theme"
    >
      {theme === "dark" ? "Dark Mode" : "Light Mode"}
    </button>
  );
}

export default function LecturerTopNav() {
  const [theme, setTheme] = useState<LecturerThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return normalizeLecturerTheme(window.localStorage.getItem(LECTURER_THEME_STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      setTheme((current) => {
        const normalized = normalizeLecturerTheme(nextTheme);
        return current === normalized ? current : normalized;
      });
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LECTURER_THEME_STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: LecturerThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, onCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LECTURER_THEME_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  return (
    <nav className="w-full">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to.endsWith("/dashboard")}>
            {({ isActive }) => (
              <div className="relative px-4 py-2 text-sm font-medium transition">
                <span
                  className={
                    isActive
                      ? theme === "dark"
                        ? "text-cyan-300"
                        : "text-indigo-600"
                      : theme === "dark"
                        ? "text-slate-300 hover:text-cyan-200"
                        : "text-slate-600 hover:text-indigo-500"
                  }
                >
                  {tab.label}
                </span>

                {isActive && (
                  <span className={theme === "dark" ? "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400" : "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-indigo-600"} />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
