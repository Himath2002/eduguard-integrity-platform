import { Outlet, useLocation } from "react-router-dom";
import {
  LecturerThemeProvider,
  useLecturerTheme,
} from "@/shared/theme/lecturerTheme";

function getLecturerPageClass(pathname: string) {
  if (pathname === "/lecturer" || pathname === "/lecturer/dashboard") {
    return "lecturer-dashboard-page";
  }

  if (pathname.startsWith("/lecturer/classes")) {
    return "lecturer-classes-page";
  }

  if (pathname.startsWith("/lecturer/assignments")) {
    return "lecturer-assignments-page";
  }

  if (pathname.startsWith("/lecturer/reports")) {
    return "lecturer-reports-page";
  }

  if (pathname.startsWith("/lecturer/marking")) {
    return "lecturer-marking-page";
  }

  if (pathname.startsWith("/lecturer/messages")) {
    return "lecturer-messages-page";
  }

  if (pathname.startsWith("/lecturer/students")) {
    return "lecturer-students-page";
  }

  if (pathname.startsWith("/lecturer/settings")) {
    return "lecturer-settings-page";
  }

  if (pathname.startsWith("/lecturer/help")) {
    return "lecturer-help-page";
  }

  return "lecturer-standard-page";
}

function LecturerPageConsistencyCSS() {
  return (
    <style>{`
      .lecturer-shell {
        min-height: 100vh;
      }

      .lecturer-page-frame {
        width: 100%;
      }

      .lecturer-page-content {
        width: 100%;
      }

      /*
        Main alignment fix:
        lecturer pages were hugging the screen edge.
        This normalizes page wrappers inside the shared frame so titles align
        like the student side.
      */
      .lecturer-page-content > .mx-auto,
      .lecturer-page-content > .w-full > .mx-auto {
        max-width: 100% !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      /*
        Prevent extra top padding from nested page wrappers.
      */
      .lecturer-page-content > .mx-auto,
      .lecturer-page-content > .w-full > .mx-auto {
        padding-top: 0 !important;
      }

      /*
        Standard title look for lecturer pages.
      */
      .lecturer-page-content h1 {
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

      .lecturer-page-content h1.text-2xl,
      .lecturer-page-content h1.text-3xl,
      .lecturer-page-content h1.text-lg {
        font-size: 2rem !important;
        line-height: 2.35rem !important;
        font-weight: 800 !important;
      }

      .lecturer-page-content h1 + p,
      .lecturer-page-content h1 ~ p:first-of-type {
        margin-top: 0.45rem !important;
        font-size: 0.95rem !important;
        line-height: 1.55rem !important;
        font-weight: 400 !important;
        letter-spacing: 0.01em !important;
        color: rgb(71, 85, 105) !important;
      }

      /*
        Dashboard keeps centered title but uses same title sizing.
      */
      .lecturer-page-content.lecturer-dashboard-page h2[class*="bg-gradient-to-r"] {
        text-align: center !important;
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
      }

      .lecturer-page-content.lecturer-dashboard-page h2[class*="bg-gradient-to-r"] + p {
        text-align: center !important;
        margin-top: 0.75rem !important;
        font-size: 0.95rem !important;
        line-height: 1.55rem !important;
        font-weight: 400 !important;
        letter-spacing: 0.01em !important;
      }

      /*
        Settings page uses a custom title wrapper instead of normal h1.
        Make it align with the same left position as student pages.
      */
      .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:first-child {
        max-width: 100% !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:first-child > .py-6 {
        padding-top: 0 !important;
        padding-bottom: 1.5rem !important;
        text-align: left !important;
      }

      .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:first-child > .py-6 > div {
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

      .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:nth-child(2) {
        max-width: 100% !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      /*
        Keep title blocks spaced evenly below the nav.
      */
      .lecturer-page-content > div > div:first-child:has(h1) {
        margin-bottom: 1.5rem !important;
      }

      .lecturer-page-content > div > div:first-child:has(h1) + div {
        margin-top: 0 !important;
      }

      /*
        Dark mode support.
      */
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content h1 {
        color: rgb(248, 250, 252) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content h1 + p,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content h1 ~ p:first-of-type {
        color: rgb(203, 213, 225) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:first-child > .py-6 > div {
        color: rgb(248, 250, 252) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] {
        color: rgb(226, 232, 240);
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-white,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-white\\/70,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-white\\/75,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-white\\/80 {
        background-color: rgba(8, 15, 32, 0.86) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-slate-50,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-slate-50\\/70,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-slate-50\\/80,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .bg-slate-50\\/85 {
        background-color: rgba(15, 23, 42, 0.78) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .border-slate-100,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .border-slate-200,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .border-white\\/60,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .border-white\\/70 {
        border-color: rgba(148, 163, 184, 0.22) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .text-slate-900 {
        color: rgb(248, 250, 252) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .text-slate-800 {
        color: rgb(226, 232, 240) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .text-slate-700 {
        color: rgb(203, 213, 225) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .text-slate-600 {
        color: rgb(186, 199, 219) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content .text-slate-500 {
        color: rgb(148, 163, 184) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content input,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content textarea,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content select {
        background-color: rgba(15, 23, 42, 0.92) !important;
        border-color: rgba(148, 163, 184, 0.28) !important;
        color: rgb(226, 232, 240) !important;
      }

      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content input::placeholder,
      .lecturer-shell[data-lecturer-theme="dark"] .lecturer-page-content textarea::placeholder {
        color: rgba(148, 163, 184, 0.78) !important;
      }

      /*
        Mobile support.
      */
      @media (max-width: 640px) {
        .lecturer-page-content h1,
        .lecturer-page-content.lecturer-settings-page > .w-full > .mx-auto:first-child > .py-6 > div,
        .lecturer-page-content.lecturer-dashboard-page h2[class*="bg-gradient-to-r"] {
          font-size: 1.75rem !important;
          line-height: 2.1rem !important;
        }

        .lecturer-page-frame {
          padding-top: 1.75rem !important;
        }
      }
    `}</style>
  );
}

function LecturerLayoutInner() {
  const location = useLocation();
  const { theme } = useLecturerTheme();

  const pageClass = getLecturerPageClass(location.pathname);

  return (
    <div
      className={[
        "lecturer-shell",
        "min-h-screen",
        "transition-[background,color]",
        "duration-300",
        pageClass,
      ].join(" ")}
      data-lecturer-theme={theme}
    >
      <LecturerPageConsistencyCSS />

      {/*
        This frame is the actual alignment fix.
        It matches the student side width and horizontal padding.
      */}
      <main className="lecturer-page-frame mx-auto max-w-[1200px] px-5 pb-16 pt-10">
        <div className={["lecturer-page-content", pageClass].join(" ")}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function LecturerLayout() {
  return (
    <LecturerThemeProvider>
      <LecturerLayoutInner />
    </LecturerThemeProvider>
  );
}