import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { useEffect, useMemo } from "react";
import JoinClassModal from "@/features/student/components/JoinClassModal";
import { clearSession } from "@/app/store/authSlice";
import { resolveDisplayName } from "@/shared/lib/authIdentity";
import {
  StudentThemeProvider,
  useStudentTheme,
} from "@/shared/theme/studentTheme";

function StudentPageConsistencyCSS() {
  return (
    <style>{`
      .student-shell {
        min-height: 100vh;
      }

      .student-page-content {
        width: 100%;
      }

      /*
        Normalize page root containers.
        Some student pages already have their own mx-auto / px / py wrappers.
        This removes double padding and makes every tab start from the same place.
      */
      .student-page-content > .mx-auto {
        max-width: 100% !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-top: 0 !important;
      }

      .student-page-content > div > .pt-4:first-child {
        padding-top: 0 !important;
      }

      /*
        Main page title consistency:
        Classes, Assignments, Reports, Messages, Help, Settings.
        Dashboard uses the same font size/style but stays centered.
      */
      .student-page-content h1 {
        margin: 0 !important;
        text-align: left !important;
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif !important;
        font-size: 2rem !important;
        line-height: 2.35rem !important;
        font-weight: 800 !important;
        letter-spacing: -0.035em !important;
        color: rgb(15, 23, 42) !important;
      }

      /*
        Only Dashboard title should be centered.
      */
      .student-page-content.student-dashboard-page h1 {
        text-align: center !important;
      }

      .student-page-content h1 + p,
      .student-page-content h1 ~ p:first-of-type {
        margin-top: 0.45rem !important;
        font-size: 0.95rem !important;
        line-height: 1.55rem !important;
        font-weight: 400 !important;
        letter-spacing: 0.01em !important;
        color: rgb(71, 85, 105) !important;
      }

      /*
        If Dashboard has a subtitle directly under the title, keep it centered too.
        Other pages remain left aligned.
      */
      .student-page-content.student-dashboard-page h1 + p,
      .student-page-content.student-dashboard-page h1 ~ p:first-of-type {
        text-align: center !important;
      }

      /*
        Normalize header rows below titles.
        This helps Classes / Reports / Messages align with Assignments.
      */
      .student-page-content > div > div:first-child:has(h1) {
        margin-bottom: 1.5rem;
      }

      .student-page-content > div > div:first-child:has(h1) + div {
        margin-top: 0 !important;
      }

      /*
        Help page had centered title before. Force it left unless it is Dashboard.
      */
      .student-page-content:not(.student-dashboard-page) h1.text-center {
        text-align: left !important;
      }

      /*
        Keep Dashboard welcome title using the same size and weight.
      */
      .student-page-content h1.text-4xl {
        font-size: 2rem !important;
        line-height: 2.35rem !important;
        font-weight: 800 !important;
      }

      /*
        Keep Reports / Messages / Help titles from appearing smaller.
      */
      .student-page-content h1.text-2xl,
      .student-page-content h1.text-lg {
        font-size: 2rem !important;
        line-height: 2.35rem !important;
        font-weight: 800 !important;
      }

      /*
        Dark mode title consistency.
      */
      .student-shell[data-student-theme="dark"] .student-page-content h1 {
        color: rgb(248, 250, 252) !important;
      }

      .student-shell[data-student-theme="dark"] .student-page-content h1 + p,
      .student-shell[data-student-theme="dark"] .student-page-content h1 ~ p:first-of-type {
        color: rgb(203, 213, 225) !important;
      }

      .student-shell[data-student-theme="dark"] .student-topbar {
        background: rgba(8, 15, 32, 0.86) !important;
        border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: 0 18px 45px rgba(2, 6, 23, 0.28);
      }

      .student-shell[data-student-theme="dark"] {
        color: rgb(226, 232, 240);
      }

      /*
        Mobile spacing.
      */
      @media (max-width: 640px) {
        .student-page-content h1 {
          font-size: 1.75rem !important;
          line-height: 2.1rem !important;
        }

        .student-page-frame {
          padding-top: 1.75rem !important;
        }

        .student-tab-nav {
          justify-content: flex-start !important;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .student-tab-nav::-webkit-scrollbar {
          display: none;
        }
      }
    `}</style>
  );
}

function TabLink({ to, label }: { to: string; label: string }) {
  const { theme } = useStudentTheme();

  return (
    <NavLink to={to} end={to.endsWith("/dashboard")}>
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
            {label}
          </span>

          {isActive && (
            <span
              className={
                theme === "dark"
                  ? "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400"
                  : "absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-indigo-600"
              }
            />
          )}
        </div>
      )}
    </NavLink>
  );
}

function StudentLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const [sp, setSp] = useSearchParams();

  const auth = useSelector((s: RootState) => s.auth) as {
    isAuthed?: boolean;
    role?: "student" | "lecturer" | "admin";
    name?: string;
    username?: string;
    email?: string;
    userId?: string;
  };

  const displayName = useMemo(() => resolveDisplayName(auth, "Student"), [auth]);
  const { theme, toggleTheme } = useStudentTheme();

  const isDashboardPage =
    location.pathname === "/student" ||
    location.pathname === "/student/dashboard";

  useEffect(() => {
    document.body.dataset.studentTheme = theme;
    document.documentElement.dataset.studentTheme = theme;

    return () => {
      delete document.body.dataset.studentTheme;
      delete document.documentElement.dataset.studentTheme;
    };
  }, [theme]);

  const joinOpen = sp.get("join") === "1";

  const closeJoin = () => {
    const nextParams = new URLSearchParams(sp);
    nextParams.delete("join");
    setSp(nextParams, { replace: true });
  };

  const onLogout = () => {
    dispatch(clearSession());
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="student-shell min-h-screen transition-[background,color] duration-300"
      data-student-theme={theme}
    >
      <StudentPageConsistencyCSS />

      <div className="sticky top-0 z-40">
        <div className="student-topbar bg-white/25 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-[background,border-color,box-shadow] duration-300">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              className="flex items-center gap-3"
              title="Go to dashboard"
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-[0_10px_26px_rgba(140,90,255,0.45)]"
                style={{
                  background:
                    "linear-gradient(135deg, rgb(140,90,255) 0%, rgb(66,130,255) 100%)",
                }}
              >
                EG
              </div>

              <span
                className={
                  theme === "dark"
                    ? "font-semibold tracking-tight text-white"
                    : "font-semibold tracking-tight text-slate-900"
                }
              >
                EduGuard
              </span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className={
                  theme === "dark"
                    ? "rounded-full border border-cyan-400/20 bg-white/5 px-3 py-1 text-sm font-medium text-cyan-200 shadow-[0_12px_28px_rgba(34,211,238,0.15)] backdrop-blur-xl transition hover:bg-white/10"
                    : "rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-medium text-slate-700 shadow transition hover:bg-white"
                }
                title="Toggle theme"
              >
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </button>

              <div
                className={
                  theme === "dark"
                    ? "hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:flex"
                    : "hidden items-center gap-2 rounded-full bg-white/55 px-3 py-1 shadow sm:flex"
                }
              >
                <span
                  className={
                    theme === "dark"
                      ? "text-sm text-slate-200"
                      : "text-sm text-slate-700"
                  }
                >
                  User: {displayName}
                </span>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-3 py-1 text-white shadow transition hover:from-rose-600 hover:to-red-700"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-[1200px] px-5 py-2">
            <nav className="student-tab-nav flex items-center justify-center gap-2">
              <TabLink to="/student/dashboard" label="Dashboard" />
              <TabLink to="/student/classes" label="Classes" />
              <TabLink to="/student/assignments" label="Assignments" />
              <TabLink to="/student/reports" label="Reports" />
              <TabLink to="/student/messages" label="Messages" />
              <TabLink to="/student/help" label="Help" />
              <TabLink to="/student/settings" label="Settings" />
            </nav>
          </div>
        </div>
      </div>

      <main className="student-page-frame mx-auto max-w-[1200px] px-5 pb-16 pt-10">
        <div
          className={
            isDashboardPage
              ? "student-page-content student-dashboard-page"
              : "student-page-content"
          }
        >
          <Outlet />
        </div>
      </main>

      <JoinClassModal open={joinOpen} onClose={closeJoin} />
    </div>
  );
}

export default function StudentLayout() {
  return (
    <StudentThemeProvider>
      <StudentLayoutInner />
    </StudentThemeProvider>
  );
}