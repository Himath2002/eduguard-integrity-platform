import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type StudentThemeMode = "light" | "dark";

type StudentThemeContextValue = {
  theme: StudentThemeMode;
  setTheme: (theme: StudentThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "eduguard.student.theme";
const CHANGE_EVENT = "eduguard:student-theme-change";

const StudentThemeContext = createContext<StudentThemeContextValue | null>(null);

function normalizeTheme(value: unknown): StudentThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): StudentThemeMode {
  if (typeof window === "undefined") return "light";
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

export function StudentThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<StudentThemeMode>(() => readInitialTheme());

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
      setThemeState((current) => (current === normalized ? current : normalized));
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

  const value = useMemo<StudentThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => setThemeState(normalizeTheme(next)),
      toggleTheme: () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <StudentThemeContext.Provider value={value}>{children}</StudentThemeContext.Provider>;
}

export function useStudentTheme() {
  const ctx = useContext(StudentThemeContext);
  if (!ctx) {
    throw new Error("useStudentTheme must be used within StudentThemeProvider");
  }
  return ctx;
}
