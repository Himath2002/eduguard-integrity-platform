import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type LecturerThemeMode = "light" | "dark";

type LecturerThemeContextValue = {
  theme: LecturerThemeMode;
  setTheme: (theme: LecturerThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "eduguard.lecturer.theme";
const CHANGE_EVENT = "eduguard:lecturer-theme-change";

const LecturerThemeContext = createContext<LecturerThemeContextValue | null>(null);

function normalizeTheme(value: unknown): LecturerThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): LecturerThemeMode {
  if (typeof window === "undefined") return "light";
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

export function LecturerThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<LecturerThemeMode>(() => readInitialTheme());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.lecturerTheme = theme;
    document.body.dataset.lecturerTheme = theme;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { theme } }));
    return () => {
      delete document.documentElement.dataset.lecturerTheme;
      delete document.body.dataset.lecturerTheme;
    };
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = (nextTheme: unknown) => {
      const normalized = normalizeTheme(nextTheme);
      setThemeState((current) => (current === normalized ? current : normalized));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncTheme(event.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: LecturerThemeMode }>;
      syncTheme(customEvent.detail?.theme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  const value = useMemo<LecturerThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => setThemeState(normalizeTheme(next)),
      toggleTheme: () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <LecturerThemeContext.Provider value={value}>{children}</LecturerThemeContext.Provider>;
}

export function useLecturerTheme() {
  const ctx = useContext(LecturerThemeContext);
  if (!ctx) {
    throw new Error("useLecturerTheme must be used within LecturerThemeProvider");
  }
  return ctx;
}
