import { useState } from "react";
import { useAdminTheme } from "@/shared/theme/adminTheme";

const faqs = [
  {
    q: "How should an admin manage new academic periods?",
    a: "Create or review lecturer accounts first, then confirm classes are created correctly before students begin joining. This keeps class ownership, assignment creation, and reporting aligned from the start.",
  },
  {
    q: "What should I check when a report does not appear for a student?",
    a: "Verify that the submission exists, the integrity job has completed, and the lecturer has enabled student report visibility when required. For marked feedback, also confirm the marking has been published to the student.",
  },
  {
    q: "How can I resolve enrollment issues quickly?",
    a: "Open the Classes page, inspect the roster for the affected class, then add or remove the student directly. Also confirm the student account exists and that the class is still active.",
  },
  {
    q: "What should I do before deploying the system for a new environment?",
    a: "Validate database connectivity, S3 configuration, websocket support, and environment variables first. Then confirm uploads, report generation, marking, and messaging all work in an end-to-end smoke test.",
  },
];

const usefulRoutes = [
  {
    label: "Manage users",
    href: "/admin/users",
    description: "Create, update, or remove student and lecturer accounts.",
  },
  {
    label: "Review classes and rosters",
    href: "/admin/classes",
    description: "Inspect class details, enrollment, and assignment activity.",
  },
  {
    label: "Monitor institution reports",
    href: "/admin/reports",
    description: "Review plagiarism, AI-risk, submissions, and marking visibility.",
  },
  {
    label: "Open platform settings",
    href: "/admin/settings",
    description: "Manage admin preferences and system-related settings.",
  },
];

function AdminHelpCSS() {
  return (
    <style>{`
      .admin-help-page-only {
        color: rgb(15, 23, 42);
      }

      .admin-help-page-only.admin-help-dark-only {
        color: rgb(226, 232, 240);
      }

      .admin-help-light-only .admin-help-heading {
        color: rgb(15, 23, 42);
      }

      .admin-help-dark-only .admin-help-heading {
        color: rgb(248, 250, 252);
        text-shadow: 0 0 28px rgba(34, 211, 238, 0.08);
      }

      .admin-help-light-only .admin-help-subtext {
        color: rgb(71, 85, 105);
      }

      .admin-help-dark-only .admin-help-subtext {
        color: rgb(170, 185, 207);
      }

      .admin-help-panel {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-radius: 1.5rem;
        transition:
          background 220ms ease,
          border-color 220ms ease,
          box-shadow 220ms ease;
      }

      .admin-help-light-only .admin-help-panel {
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.72), transparent 55%),
          rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(226, 232, 240, 0.86);
        box-shadow:
          0 18px 55px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .admin-help-dark-only .admin-help-panel {
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

      .admin-help-panel::before {
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

      .admin-help-panel-content {
        position: relative;
        z-index: 2;
      }

      .admin-help-light-only .admin-help-panel-title {
        color: rgb(15, 23, 42);
      }

      .admin-help-dark-only .admin-help-panel-title {
        color: rgb(248, 250, 252);
      }

      .admin-help-light-only .admin-help-copy {
        color: rgb(71, 85, 105);
      }

      .admin-help-dark-only .admin-help-copy {
        color: rgb(199, 212, 232);
      }

      .admin-help-light-only .admin-help-muted {
        color: rgb(100, 116, 139);
      }

      .admin-help-dark-only .admin-help-muted {
        color: rgb(148, 163, 184);
      }

      .admin-help-card {
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

      .admin-help-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
      }

      .admin-help-light-only .admin-help-card {
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

      .admin-help-light-only .admin-help-card:hover {
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .admin-help-dark-only .admin-help-card {
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

      .admin-help-dark-only .admin-help-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .admin-help-card-shine {
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

      .admin-help-dark-only .admin-help-card-shine {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      .admin-help-card:hover .admin-help-card-shine {
        left: 120%;
        opacity: 0.85;
      }

      .admin-help-card-halo {
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

      .admin-help-card:hover .admin-help-card-halo {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .admin-help-card-content {
        position: relative;
        z-index: 4;
      }

      .admin-help-card-stripe {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 6px;
        z-index: 5;
      }

      .admin-help-light-only .admin-help-question {
        color: rgb(15, 23, 42);
      }

      .admin-help-dark-only .admin-help-question {
        color: rgb(248, 250, 252);
      }

      .admin-help-light-only .admin-help-answer {
        color: rgb(51, 65, 85);
      }

      .admin-help-dark-only .admin-help-answer {
        color: rgb(199, 212, 232);
      }

      .admin-help-link-card {
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

      .admin-help-link-card:hover {
        transform: translateY(-3px) scale(1.008);
      }

      .admin-help-light-only .admin-help-link-card {
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid rgba(226, 232, 240, 0.86);
      }

      .admin-help-light-only .admin-help-link-card:hover {
        background: rgba(255, 255, 255, 0.92);
        border-color: rgba(99, 102, 241, 0.22);
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.10);
      }

      .admin-help-dark-only .admin-help-link-card {
        background: rgba(8, 15, 29, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.16);
      }

      .admin-help-dark-only .admin-help-link-card:hover {
        background:
          linear-gradient(90deg, rgba(34, 211, 238, 0.065), rgba(99, 102, 241, 0.055)),
          rgba(8, 15, 29, 0.86);
        border-color: rgba(34, 211, 238, 0.24);
        box-shadow: 0 18px 46px rgba(2, 6, 23, 0.38);
      }

      .admin-help-light-only .admin-help-link-title {
        color: rgb(79, 70, 229);
      }

      .admin-help-dark-only .admin-help-link-title {
        color: rgb(103, 232, 249);
      }

      .admin-help-light-only .admin-help-link-description {
        color: rgb(71, 85, 105);
      }

      .admin-help-dark-only .admin-help-link-description {
        color: rgb(170, 185, 207);
      }

      .admin-help-support-link {
        font-weight: 700;
        transition: color 180ms ease;
      }

      .admin-help-light-only .admin-help-support-link {
        color: rgb(79, 70, 229);
      }

      .admin-help-light-only .admin-help-support-link:hover {
        color: rgb(67, 56, 202);
        text-decoration: underline;
      }

      .admin-help-dark-only .admin-help-support-link {
        color: rgb(103, 232, 249);
      }

      .admin-help-dark-only .admin-help-support-link:hover {
        color: rgb(165, 243, 252);
        text-decoration: underline;
      }
    `}</style>
  );
}

function HelpFaqCard({
  item,
  index,
}: {
  item: {
    q: string;
    a: string;
  };
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const stripe =
    index % 2 === 0
      ? "linear-gradient(180deg, rgb(99,102,241), rgb(59,130,246), rgb(34,211,238))"
      : "linear-gradient(180deg, rgb(59,130,246), rgb(34,211,238), rgb(16,185,129))";

  const halo =
    index % 2 === 0
      ? "radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%)"
      : "radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%), radial-gradient(48% 48% at 76% 28%, rgba(16,185,129,.13), transparent 72%)";

  return (
    <div className="admin-help-card p-5">
      <div className="admin-help-card-stripe" style={{ background: stripe }} />
      <div className="admin-help-card-halo" style={{ background: halo }} />
      <div className="admin-help-card-shine" />

      <div className="admin-help-card-content pl-3">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={open}
        >
          <span className="admin-help-question text-base font-semibold">
            {item.q}
          </span>
          <span
            className={[
              "shrink-0 text-sm opacity-75 transition-transform",
              open ? "rotate-180" : "",
            ].join(" ")}
          >
            ▾
          </span>
        </button>
        {open ? (
          <p className="admin-help-answer mt-3 text-sm leading-7">
            {item.a}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminHelp() {
  const { theme } = useAdminTheme();
  const [usefulRoutesOpen, setUsefulRoutesOpen] = useState(false);
  const isDark = theme === "dark";

  return (
    <div
      className={[
        "admin-help-page-only relative min-h-[calc(100vh-160px)] space-y-8",
        isDark ? "admin-help-dark-only" : "admin-help-light-only",
      ].join(" ")}
    >
      <AdminHelpCSS />

      <div className="mt-8">
        <h1 className="admin-help-heading text-3xl font-semibold">
          Admin help
        </h1>
        <p className="admin-help-subtext mt-1 text-sm">
          Operational guidance for managing users, classes, reports, and platform readiness.
        </p>
      </div>

      <section className="admin-help-panel p-6">
        <div className="admin-help-panel-content">
          <div>
            <h2 className="admin-help-panel-title text-lg font-semibold">
              Frequently asked questions
            </h2>
            <p className="admin-help-copy mt-1 text-sm">
              Quick answers for common admin operations and troubleshooting.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {faqs.map((item, index) => (
              <HelpFaqCard key={item.q} item={item} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="admin-help-panel p-6">
        <div className="admin-help-panel-content">
          <div>
            <h2 className="admin-help-panel-title text-lg font-semibold">
              Useful admin routes
            </h2>
            <p className="admin-help-copy mt-1 text-sm">
              Jump directly to the pages used most often during admin support.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setUsefulRoutesOpen((prev) => !prev)}
            className="admin-help-link-card mt-5 w-full text-left"
            aria-expanded={usefulRoutesOpen}
          >
            <span className="admin-help-link-title text-sm font-semibold">
              {usefulRoutesOpen ? "Hide admin routes" : "Open admin routes"}
            </span>
          </button>

          {usefulRoutesOpen ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {usefulRoutes.map((route) => (
                <a
                  key={route.href}
                  className="admin-help-link-card"
                  href={route.href}
                >
                  <div className="admin-help-link-title text-sm font-semibold">
                    {route.label}
                  </div>
                  <div className="admin-help-link-description mt-2 text-sm leading-6">
                    {route.description}
                  </div>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="admin-help-panel p-6">
        <div className="admin-help-panel-content">
          <h2 className="admin-help-panel-title text-lg font-semibold">
            Contact support
          </h2>
          <p className="admin-help-copy mt-2 text-sm leading-7">
            For environment, storage, or deployment support, contact{" "}
            <a
              className="admin-help-support-link"
              href="mailto:support@eduguard.app"
            >
              support@eduguard.app
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
