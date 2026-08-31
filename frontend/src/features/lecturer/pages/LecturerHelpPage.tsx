import React, { useEffect, useMemo, useState } from "react";

type FAQ = { q: string; a: string };

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

  const explicitTheme =
    normalizeThemeValue(doc.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(body.getAttribute("data-lecturer-theme")) ??
    normalizeThemeValue(doc.getAttribute("data-student-theme")) ??
    normalizeThemeValue(body.getAttribute("data-student-theme"));

  if (explicitTheme) {
    return explicitTheme === "dark";
  }

  const storedTheme =
    normalizeThemeValue(window.localStorage.getItem(LECTURER_THEME_KEY)) ??
    normalizeThemeValue(window.localStorage.getItem(STUDENT_THEME_KEY));

  if (storedTheme) {
    return storedTheme === "dark";
  }

  return (
    doc.classList.contains("dark") ||
    body.classList.contains("dark") ||
    body.classList.contains("lecturer-dashboard-dark")
  );
}

function LecturerHelpCSS() {
  return (
    <style>{`
      .lecturer-help-page-only {
        color: rgb(15, 23, 42);
      }

      .lecturer-help-page-only.lecturer-help-dark-only {
        color: rgb(226, 232, 240);
      }

      .lecturer-help-light-only .lecturer-help-heading {
        color: rgb(15, 23, 42);
      }

      .lecturer-help-dark-only .lecturer-help-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .lecturer-help-light-only .lecturer-help-subtext {
        color: rgb(71, 85, 105);
      }

      .lecturer-help-dark-only .lecturer-help-subtext {
        color: rgb(170, 185, 207);
      }

      .lecturer-help-search-label {
        display: block;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.35rem;
      }

      .lecturer-help-light-only .lecturer-help-search-label {
        color: rgb(51, 65, 85);
      }

      .lecturer-help-dark-only .lecturer-help-search-label {
        color: rgb(203, 213, 225);
      }

      .lecturer-help-gradient-field {
        border-radius: 0.9rem;
        padding: 2px;
        overflow: hidden;
        background: linear-gradient(90deg, rgb(139, 92, 246), rgb(99, 102, 241), rgb(14, 165, 233));
        box-shadow: 0 16px 40px rgba(79, 70, 229, 0.14);
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          filter 220ms ease;
      }

      .lecturer-help-gradient-field:focus-within {
        transform: translateY(-2px);
        box-shadow:
          0 18px 45px rgba(79, 70, 229, 0.18),
          0 0 0 4px rgba(99, 102, 241, 0.14);
        filter: saturate(1.05);
      }

      .lecturer-help-field-inner {
        border-radius: calc(0.9rem - 2px);
      }

      .lecturer-help-light-only .lecturer-help-field-inner {
        background: linear-gradient(90deg, rgba(245, 243, 255, 0.92), rgba(238, 242, 255, 0.94), rgba(240, 249, 255, 0.94));
      }

      .lecturer-help-dark-only .lecturer-help-field-inner {
        background: linear-gradient(90deg, rgba(9, 16, 32, 0.96), rgba(13, 22, 42, 0.98), rgba(8, 21, 38, 0.96));
      }

      .lecturer-help-field {
        width: 100%;
        height: 2.75rem;
        padding: 0 1rem;
        font-weight: 600;
        background: transparent;
        border: 0;
        outline: none;
      }

      .lecturer-help-light-only .lecturer-help-field {
        color: rgb(15, 23, 42);
      }

      .lecturer-help-dark-only .lecturer-help-field {
        color: rgb(248, 250, 252);
      }

      .lecturer-help-field::placeholder {
        color: rgb(148, 163, 184);
      }

      .lecturer-help-panel {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.5rem;
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease,
          transform 220ms cubic-bezier(.2,.8,.2,1);
      }

      .lecturer-help-panel:hover {
        transform: translateY(-2px);
      }

      .lecturer-help-light-only .lecturer-help-panel {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.82), transparent 55%),
          rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .lecturer-help-dark-only .lecturer-help-panel {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.075), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow:
          0 20px 56px rgba(2, 6, 23, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .lecturer-help-panel::before {
        content: "";
        position: absolute;
        inset: -5rem;
        pointer-events: none;
        z-index: 0;
        opacity: 0.42;
        background:
          radial-gradient(55% 55% at 20% 20%, rgba(99, 102, 241, 0.12), transparent 70%),
          radial-gradient(48% 48% at 80% 15%, rgba(34, 211, 238, 0.10), transparent 72%);
      }

      .lecturer-help-panel-content {
        position: relative;
        z-index: 2;
      }

      .lecturer-help-panel-header {
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      }

      .lecturer-help-light-only .lecturer-help-panel-header {
        background: rgba(255, 255, 255, 0.42);
      }

      .lecturer-help-dark-only .lecturer-help-panel-header {
        background: rgba(8, 15, 29, 0.34);
      }

      .lecturer-help-light-only .lecturer-help-panel-title {
        color: rgb(15, 23, 42);
      }

      .lecturer-help-dark-only .lecturer-help-panel-title {
        color: rgb(248, 250, 252);
      }

      .lecturer-help-light-only .lecturer-help-copy {
        color: rgb(71, 85, 105);
      }

      .lecturer-help-dark-only .lecturer-help-copy {
        color: rgb(199, 212, 232);
      }

      .lecturer-help-faq-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.25rem;
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease,
          filter 220ms ease;
      }

      .lecturer-help-faq-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .lecturer-help-light-only .lecturer-help-faq-card {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.72), transparent 55%),
          rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(226, 232, 240, 0.86);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .lecturer-help-light-only .lecturer-help-faq-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .lecturer-help-dark-only .lecturer-help-faq-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.075), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow:
          0 20px 56px rgba(2, 6, 23, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .lecturer-help-dark-only .lecturer-help-faq-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .lecturer-help-card-shine {
        position: absolute;
        top: -36%;
        bottom: -36%;
        left: -42%;
        width: 26%;
        transform: rotate(14deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.26),
          transparent
        );
        opacity: 0;
        filter: blur(10px);
        transition:
          left 0.66s ease,
          opacity 0.22s ease;
        pointer-events: none;
        z-index: 3;
      }

      .lecturer-help-dark-only .lecturer-help-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .lecturer-help-faq-card:hover .lecturer-help-card-shine,
      .lecturer-help-link-card:hover .lecturer-help-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .lecturer-help-card-halo {
        position: absolute;
        inset: -4rem;
        opacity: 0;
        transform: scale(0.96);
        filter: blur(28px);
        pointer-events: none;
        z-index: 0;
        transition:
          opacity 240ms ease,
          transform 240ms ease,
          filter 240ms ease;
      }

      .lecturer-help-faq-card:hover .lecturer-help-card-halo,
      .lecturer-help-link-card:hover .lecturer-help-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .lecturer-help-card-content {
        position: relative;
        z-index: 4;
      }

      .lecturer-help-card-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .lecturer-help-light-only .lecturer-help-question {
        color: rgb(15, 23, 42);
      }

      .lecturer-help-dark-only .lecturer-help-question {
        color: rgb(248, 250, 252);
      }

      .lecturer-help-light-only .lecturer-help-answer {
        color: rgb(51, 65, 85);
      }

      .lecturer-help-dark-only .lecturer-help-answer {
        color: rgb(199, 212, 232);
      }

      .lecturer-help-chevron {
        transition: transform 200ms ease, color 180ms ease;
      }

      .lecturer-help-light-only .lecturer-help-chevron {
        color: rgb(71, 85, 105);
      }

      .lecturer-help-dark-only .lecturer-help-chevron {
        color: rgb(125, 211, 252);
      }

      .lecturer-help-answer-wrap {
        overflow: hidden;
        transition:
          grid-template-rows 260ms cubic-bezier(.2,.8,.2,1),
          opacity 220ms ease;
      }

      .lecturer-help-answer-open {
        display: grid;
        grid-template-rows: 1fr;
        opacity: 1;
      }

      .lecturer-help-answer-closed {
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
      }

      .lecturer-help-answer-inner {
        min-height: 0;
      }

      .lecturer-help-link-card {
        display: block;
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1rem;
        padding: 1rem;
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease;
      }

      .lecturer-help-link-card:hover {
        transform: translateY(-3px) scale(1.008);
      }

      .lecturer-help-light-only .lecturer-help-link-card {
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid rgba(226, 232, 240, 0.86);
      }

      .lecturer-help-light-only .lecturer-help-link-card:hover {
        background: rgba(255, 255, 255, 0.92);
        border-color: rgba(99, 102, 241, 0.22);
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.10);
      }

      .lecturer-help-dark-only .lecturer-help-link-card {
        background: rgba(8, 15, 29, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.16);
      }

      .lecturer-help-dark-only .lecturer-help-link-card:hover {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.065), rgba(99, 102, 241, 0.055)),
          rgba(8, 15, 29, 0.86);
        border-color: rgba(34, 211, 238, 0.24);
        box-shadow: 0 18px 46px rgba(2, 6, 23, 0.38);
      }

      .lecturer-help-light-only .lecturer-help-link-title {
        color: rgb(79, 70, 229);
      }

      .lecturer-help-dark-only .lecturer-help-link-title {
        color: rgb(103, 232, 249);
      }

      .lecturer-help-light-only .lecturer-help-link-description {
        color: rgb(71, 85, 105);
      }

      .lecturer-help-dark-only .lecturer-help-link-description {
        color: rgb(170, 185, 207);
      }

      .lecturer-help-support-link {
        font-weight: 700;
        transition: color 180ms ease;
      }

      .lecturer-help-light-only .lecturer-help-support-link {
        color: rgb(79, 70, 229);
      }

      .lecturer-help-light-only .lecturer-help-support-link:hover {
        color: rgb(67, 56, 202);
        text-decoration: underline;
      }

      .lecturer-help-dark-only .lecturer-help-support-link {
        color: rgb(103, 232, 249);
      }

      .lecturer-help-dark-only .lecturer-help-support-link:hover {
        color: rgb(165, 243, 252);
        text-decoration: underline;
      }
    `}</style>
  );
}

function GradientField({ children }: { children: React.ReactNode }) {
  return (
    <div className="lecturer-help-gradient-field">
      <div className="lecturer-help-field-inner">{children}</div>
    </div>
  );
}

const FieldBase = "lecturer-help-field";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="lecturer-help-panel">
      <div className="lecturer-help-panel-content">
        <div className="lecturer-help-panel-header px-6 py-4">
          <h2 className="lecturer-help-panel-title text-sm font-semibold">
            {title}
          </h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </section>
  );
}

function FAQRow({
  q,
  a,
  open,
  onToggle,
  index,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  const stripe =
    index % 2 === 0
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : "linear-gradient(180deg, rgb(139,92,246), rgb(236,72,153), rgb(34,211,238))";

  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(139,92,246,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(236,72,153,.13), transparent 72%)";

  return (
    <div className="lecturer-help-faq-card">
      <div className="lecturer-help-card-stripe" style={{ background: stripe }} />
      <div className="lecturer-help-card-halo" style={{ background: halo }} />
      <div className="lecturer-help-card-shine" />

      <div className="lecturer-help-card-content pl-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-4 text-left"
        >
          <span
            className={`lecturer-help-chevron shrink-0 ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="lecturer-help-question text-sm font-semibold">
            {q}
          </span>
        </button>

        <div
          className={`lecturer-help-answer-wrap ${
            open ? "lecturer-help-answer-open" : "lecturer-help-answer-closed"
          }`}
        >
          <div className="lecturer-help-answer-inner">
            <p className="lecturer-help-answer px-10 pb-4 text-sm leading-relaxed">
              {a}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideLink({
  href,
  children,
  index,
}: {
  href: string;
  children: React.ReactNode;
  index: number;
}) {
  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 24% 30%, rgba(99,102,241,.14), transparent 70%), radial-gradient(48% 48% at 82% 22%, rgba(34,211,238,.12), transparent 72%)"
      : "radial-gradient(60% 60% at 24% 30%, rgba(34,211,238,.13), transparent 70%), radial-gradient(48% 48% at 82% 22%, rgba(16,185,129,.12), transparent 72%)";

  return (
    <a className="lecturer-help-link-card" href={href}>
      <div className="lecturer-help-card-halo" style={{ background: halo }} />
      <div className="lecturer-help-card-shine" />
      <div className="lecturer-help-card-content">
        <div className="lecturer-help-link-title text-sm font-semibold">
          {children}
        </div>
      </div>
    </a>
  );
}

export default function LecturerHelpPage() {
  const [query, setQuery] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
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

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-lecturer-theme", "data-student-theme", "class"],
    });

    window.addEventListener("storage", onStorage);
    window.addEventListener(LECTURER_THEME_EVENT, syncTheme as EventListener);
    window.addEventListener(STUDENT_THEME_EVENT, syncTheme as EventListener);

    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        LECTURER_THEME_EVENT,
        syncTheme as EventListener
      );
      window.removeEventListener(
        STUDENT_THEME_EVENT,
        syncTheme as EventListener
      );
    };
  }, []);

  const faqs: FAQ[] = useMemo(
    () => [
      {
        q: "How do I create a class?",
        a: "Open Classes, create the class with a unique code, then share that code with students so they can enroll.",
      },
      {
        q: "How do I publish a generated report to students?",
        a: "Enable student report visibility on the assignment. Students will then see the integrity report once it is ready.",
      },
      {
        q: "How do I mark an assignment and publish feedback?",
        a: "Use the Marking area, open the submission, add inline comments, assign the score, then publish the marked report to the student.",
      },
      {
        q: "How do I respond to an appeal or comment discussion?",
        a: "Open Messages. Each thread is linked to the marked comment and the submission context so you can reply directly.",
      },
    ],
    []
  );

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
    );
  }, [faqs, query]);

  const safeOpenIdx =
    openIdx === null ? null : openIdx >= filteredFaqs.length ? null : openIdx;

  return (
    <div
      className={[
        "lecturer-help-page-only mx-auto max-w-6xl px-6 py-8",
        isDarkMode ? "lecturer-help-dark-only" : "lecturer-help-light-only",
      ].join(" ")}
    >
      <LecturerHelpCSS />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="lecturer-help-heading text-2xl font-semibold">Help</h1>
          <p className="lecturer-help-subtext mt-1 text-sm">
            Quick answers for lecturers using EduGuard.
          </p>
        </div>
        <div className="w-full md:w-[420px]">
          <label className="lecturer-help-search-label">Search</label>
          <div className="mt-1">
            <GradientField>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenIdx(null);
                }}
                placeholder="Search help topics…"
                className={FieldBase}
              />
            </GradientField>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        <SectionCard title="Frequently asked questions">
          <div className="space-y-3">
            {filteredFaqs.length === 0 ? (
              <p className="lecturer-help-copy text-sm">
                No matching help topics. Try a different keyword.
              </p>
            ) : (
              filteredFaqs.map((f, i) => (
                <FAQRow
                  key={`${f.q}-${i}`}
                  q={f.q}
                  a={f.a}
                  open={safeOpenIdx === i}
                  onToggle={() =>
                    setOpenIdx((prev) => (prev === i ? null : i))
                  }
                  index={i}
                />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Guides and Tutorials">
          <button
            type="button"
            onClick={() => setGuidesOpen((prev) => !prev)}
            className="lecturer-help-link-card w-full text-left"
            aria-expanded={guidesOpen}
          >
            <span className="lecturer-help-link-title text-sm font-semibold">
              {guidesOpen ? "Hide guides" : "Open lecturer guides"}
            </span>
          </button>

          {guidesOpen ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <GuideLink href="/lecturer/classes" index={0}>
                Creating and managing classes
              </GuideLink>
              <GuideLink href="/lecturer/marking" index={1}>
                Marking assignments and providing feedback
              </GuideLink>
              <GuideLink href="/lecturer/reports" index={2}>
                Reviewing plagiarism and AI reports
              </GuideLink>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Contact Support">
          <p className="lecturer-help-copy text-sm leading-7">
            Need further assistance? Reach out to our support team at{" "}
            <a
              className="lecturer-help-support-link"
              href="mailto:support@eduguard.app"
            >
              support@eduguard.app
            </a>
            .
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
