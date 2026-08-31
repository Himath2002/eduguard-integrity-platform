import { useState, type ReactNode } from "react";

function StudentHelpPageCSS() {
  return (
    <style>{`
      .student-help-card {
        background: rgba(255, 255, 255, 0.58);
        border: 1px solid rgba(226, 232, 240, 0.78);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .student-help-title {
        color: rgb(15, 23, 42);
      }

      .student-help-text {
        color: rgb(71, 85, 105);
      }

      .student-help-row {
        border-bottom: 1px solid rgba(226, 232, 240, 0.82);
      }

      .student-help-row:last-child {
        border-bottom: 0;
      }

      .student-help-dropdown {
        color: rgb(30, 41, 59);
      }

      .student-help-dropdown:hover {
        background: rgba(248, 250, 252, 0.75);
      }

      .student-help-answer {
        color: rgb(71, 85, 105);
      }

      .student-help-pill {
        background: rgba(238, 242, 255, 0.9);
        color: rgb(67, 56, 202);
        border: 1px solid rgba(199, 210, 254, 0.8);
      }

      .student-help-question-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border: 1px solid rgba(226, 232, 240, 0.85);
        background:
          radial-gradient(120% 120% at 8% 0%, rgba(255,255,255,.65), transparent 55%),
          rgba(248, 250, 252, 0.72);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        transition:
          transform 220ms cubic-bezier(.2,.8,.2,1),
          box-shadow 220ms cubic-bezier(.2,.8,.2,1),
          border-color 220ms ease,
          background 220ms ease,
          filter 220ms ease;
      }

      .student-help-question-card:hover {
        transform: translateY(-4px) scale(1.012);
        z-index: 20;
        filter: saturate(1.04);
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow:
          0 22px 62px rgba(15, 23, 42, 0.13),
          0 8px 24px rgba(99, 102, 241, 0.10);
      }

      .student-help-question-card::before {
        content: "";
        position: absolute;
        inset: -4rem;
        opacity: 0;
        transform: scale(0.96);
        filter: blur(28px);
        pointer-events: none;
        z-index: 0;
        background:
          radial-gradient(60% 60% at 42% 34%, rgba(99,102,241,.18), transparent 70%),
          radial-gradient(48% 48% at 76% 28%, rgba(34,211,238,.13), transparent 72%);
        transition:
          opacity 240ms ease,
          transform 240ms ease,
          filter 240ms ease;
      }

      .student-help-question-card:hover::before {
        opacity: 1;
        transform: scale(1.04);
        filter: blur(24px);
      }

      .student-help-question-card::after {
        content: "";
        position: absolute;
        top: -36%;
        bottom: -36%;
        left: -42%;
        width: 26%;
        transform: rotate(14deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.28),
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

      .student-help-question-card:hover::after {
        left: 120%;
        opacity: 0.85;
      }

      .student-help-question-content {
        position: relative;
        z-index: 4;
      }

      .student-help-sub-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border: 1px solid rgba(203, 213, 225, 0.78);
        background: rgba(255, 255, 255, 0.7);
        transition:
          transform 200ms cubic-bezier(.2,.8,.2,1),
          box-shadow 200ms cubic-bezier(.2,.8,.2,1),
          border-color 200ms ease,
          background 200ms ease;
      }

      .student-help-sub-card:hover {
        transform: translateY(-3px) scale(1.008);
        border-color: rgba(99, 102, 241, 0.22);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }

      .student-help-sub-card::before {
        content: "";
        position: absolute;
        inset: -3rem;
        opacity: 0;
        pointer-events: none;
        z-index: 0;
        filter: blur(22px);
        background:
          radial-gradient(55% 55% at 35% 20%, rgba(99,102,241,.12), transparent 70%),
          radial-gradient(45% 45% at 80% 25%, rgba(34,211,238,.10), transparent 72%);
        transition: opacity 220ms ease;
      }

      .student-help-sub-card:hover::before {
        opacity: 1;
      }

      .student-help-sub-card-content {
        position: relative;
        z-index: 2;
      }

      .student-help-choice {
        border: 1px solid rgba(199, 210, 254, 0.85);
        background: rgba(238, 242, 255, 0.74);
        color: rgb(49, 46, 129);
        transition:
          transform 180ms cubic-bezier(.2,.8,.2,1),
          box-shadow 180ms ease,
          background 180ms ease,
          border-color 180ms ease;
      }

      .student-help-choice:hover {
        background: rgba(224, 231, 255, 0.9);
        transform: translateY(-2px) scale(1.015);
        border-color: rgba(99, 102, 241, 0.35);
        box-shadow: 0 10px 28px rgba(99, 102, 241, 0.12);
      }

      .student-help-choice:active {
        transform: translateY(0) scale(0.99);
      }

      .student-help-solution {
        border-left: 4px solid rgb(99, 102, 241);
        background: rgba(239, 246, 255, 0.78);
        color: rgb(51, 65, 85);
        animation: studentHelpReveal 220ms cubic-bezier(.2,.8,.2,1) both;
      }

      .student-help-step {
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(226, 232, 240, 0.82);
        transition:
          transform 180ms cubic-bezier(.2,.8,.2,1),
          box-shadow 180ms ease,
          border-color 180ms ease,
          background 180ms ease;
      }

      .student-help-step:hover {
        transform: translateX(4px) translateY(-1px);
        border-color: rgba(99, 102, 241, 0.24);
        box-shadow: 0 10px 26px rgba(15, 23, 42, 0.07);
      }

      .student-help-reveal {
        animation: studentHelpReveal 240ms cubic-bezier(.2,.8,.2,1) both;
      }

      .student-help-arrow {
        transition: transform 180ms ease;
      }

      .student-help-arrow-open {
        transform: rotate(180deg);
      }

      body[data-student-theme="dark"] .student-help-card,
      html[data-student-theme="dark"] .student-help-card {
        background: rgba(8, 15, 32, 0.78);
        border-color: rgba(148, 163, 184, 0.18);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
      }

      body[data-student-theme="dark"] .student-help-title,
      html[data-student-theme="dark"] .student-help-title {
        color: rgb(248, 250, 252);
      }

      body[data-student-theme="dark"] .student-help-text,
      html[data-student-theme="dark"] .student-help-text {
        color: rgb(190, 203, 220);
      }

      body[data-student-theme="dark"] .student-help-row,
      html[data-student-theme="dark"] .student-help-row {
        border-bottom-color: rgba(148, 163, 184, 0.24);
      }

      body[data-student-theme="dark"] .student-help-dropdown,
      html[data-student-theme="dark"] .student-help-dropdown {
        color: rgb(226, 232, 240);
      }

      body[data-student-theme="dark"] .student-help-dropdown:hover,
      html[data-student-theme="dark"] .student-help-dropdown:hover {
        background: rgba(15, 23, 42, 0.72);
      }

      body[data-student-theme="dark"] .student-help-answer,
      html[data-student-theme="dark"] .student-help-answer {
        color: rgb(190, 203, 220);
      }

      body[data-student-theme="dark"] .student-help-pill,
      html[data-student-theme="dark"] .student-help-pill {
        background: rgba(34, 211, 238, 0.12);
        color: rgb(165, 243, 252);
        border-color: rgba(34, 211, 238, 0.24);
      }

      body[data-student-theme="dark"] .student-help-question-card,
      html[data-student-theme="dark"] .student-help-question-card {
        background:
          radial-gradient(120% 120% at 0% 0%, rgba(34, 211, 238, 0.06), transparent 44%),
          radial-gradient(95% 100% at 100% 0%, rgba(129, 140, 248, 0.075), transparent 48%),
          linear-gradient(160deg, rgba(7, 15, 31, 0.94), rgba(9, 19, 37, 0.98));
        border-color: rgba(148, 163, 184, 0.2);
        box-shadow:
          0 20px 56px rgba(2, 6, 23, 0.30),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      body[data-student-theme="dark"] .student-help-question-card:hover,
      html[data-student-theme="dark"] .student-help-question-card:hover {
        border-color: rgba(34, 211, 238, 0.28);
        box-shadow:
          0 24px 70px rgba(2, 6, 23, 0.52),
          0 8px 30px rgba(34, 211, 238, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      body[data-student-theme="dark"] .student-help-question-card::before,
      html[data-student-theme="dark"] .student-help-question-card::before {
        background:
          radial-gradient(60% 60% at 42% 34%, rgba(34,211,238,.17), transparent 70%),
          radial-gradient(48% 48% at 76% 28%, rgba(99,102,241,.13), transparent 72%);
      }

      body[data-student-theme="dark"] .student-help-question-card::after,
      html[data-student-theme="dark"] .student-help-question-card::after {
        background: linear-gradient(
          90deg,
          transparent,
          rgba(125, 211, 252, 0.15),
          transparent
        );
      }

      body[data-student-theme="dark"] .student-help-sub-card,
      html[data-student-theme="dark"] .student-help-sub-card {
        background: rgba(8, 15, 32, 0.72);
        border-color: rgba(148, 163, 184, 0.22);
      }

      body[data-student-theme="dark"] .student-help-sub-card:hover,
      html[data-student-theme="dark"] .student-help-sub-card:hover {
        border-color: rgba(34, 211, 238, 0.25);
        box-shadow: 0 16px 38px rgba(2, 6, 23, 0.32);
      }

      body[data-student-theme="dark"] .student-help-sub-card::before,
      html[data-student-theme="dark"] .student-help-sub-card::before {
        background:
          radial-gradient(55% 55% at 35% 20%, rgba(34,211,238,.12), transparent 70%),
          radial-gradient(45% 45% at 80% 25%, rgba(129,140,248,.11), transparent 72%);
      }

      body[data-student-theme="dark"] .student-help-choice,
      html[data-student-theme="dark"] .student-help-choice {
        background: rgba(34, 211, 238, 0.1);
        border-color: rgba(34, 211, 238, 0.22);
        color: rgb(165, 243, 252);
      }

      body[data-student-theme="dark"] .student-help-choice:hover,
      html[data-student-theme="dark"] .student-help-choice:hover {
        background: rgba(34, 211, 238, 0.16);
        border-color: rgba(34, 211, 238, 0.34);
        box-shadow: 0 10px 28px rgba(34, 211, 238, 0.10);
      }

      body[data-student-theme="dark"] .student-help-solution,
      html[data-student-theme="dark"] .student-help-solution {
        border-left-color: rgb(34, 211, 238);
        background: rgba(14, 165, 233, 0.1);
        color: rgb(203, 213, 225);
      }

      body[data-student-theme="dark"] .student-help-step,
      html[data-student-theme="dark"] .student-help-step {
        background: rgba(15, 23, 42, 0.68);
        border-color: rgba(148, 163, 184, 0.22);
      }

      body[data-student-theme="dark"] .student-help-step:hover,
      html[data-student-theme="dark"] .student-help-step:hover {
        border-color: rgba(34, 211, 238, 0.25);
        box-shadow: 0 10px 26px rgba(2, 6, 23, 0.28);
      }

      @keyframes studentHelpReveal {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.99);
          filter: blur(1px);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .student-help-question-card,
        .student-help-sub-card,
        .student-help-choice,
        .student-help-step,
        .student-help-solution,
        .student-help-reveal,
        .student-help-arrow {
          animation: none !important;
          transition: none !important;
          transform: none !important;
          filter: none !important;
        }
      }
    `}</style>
  );
}

function DropdownItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="student-help-row">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="student-help-dropdown flex w-full items-center justify-between gap-4 rounded-xl px-1 py-3 text-left transition"
      >
        <span className="text-sm font-medium">{title}</span>
        <span
          className={[
            "student-help-arrow shrink-0 text-sm opacity-75",
            open ? "student-help-arrow-open" : "",
          ].join(" ")}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="student-help-answer student-help-reveal pb-4 pr-8 text-sm leading-6">
          {children}
        </div>
      )}
    </div>
  );
}

function GuideQuestion({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="student-help-question-card rounded-2xl p-4">
      <div className="student-help-question-content">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-start justify-between gap-4 text-left"
        >
          <div>
            <div className="student-help-title text-sm font-bold">{title}</div>
            {subtitle && (
              <p className="student-help-text mt-1 text-sm leading-6">
                {subtitle}
              </p>
            )}
          </div>

          <span className="student-help-pill shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
            {open ? "Hide" : "Choose"}
          </span>
        </button>

        {open && <div className="student-help-reveal mt-4 space-y-3">{children}</div>}
      </div>
    </div>
  );
}

function SubQuestion({
  question,
  children,
  defaultOpen = false,
}: {
  question: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="student-help-sub-card rounded-2xl p-4">
      <div className="student-help-sub-card-content">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <span className="student-help-title text-sm font-semibold">
            {question}
          </span>

          <span
            className={[
              "student-help-arrow text-sm opacity-70",
              open ? "student-help-arrow-open" : "",
            ].join(" ")}
          >
            ▾
          </span>
        </button>

        {open && (
          <div className="student-help-answer student-help-reveal mt-3 text-sm leading-6">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function SolutionChoice({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="student-help-choice rounded-full px-3 py-2 text-xs font-semibold"
      >
        {label}
      </button>

      {open && (
        <div className="student-help-solution mt-3 rounded-2xl px-4 py-3 text-sm leading-6">
          {children}
        </div>
      )}
    </div>
  );
}

function StepList({ items }: { items: string[] }) {
  return (
    <div className="mt-3 grid gap-2">
      {items.map((item, index) => (
        <div
          key={`${index}-${item}`}
          className="student-help-step flex gap-3 rounded-xl px-3 py-2 text-sm"
          style={{
            animationDelay: `${index * 40}ms`,
          }}
        >
          <span className="student-help-pill grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold">
            {index + 1}
          </span>
          <span className="student-help-text leading-6">{item}</span>
        </div>
      ))}
    </div>
  );
}

export default function StudentHelpPage() {
  const [guidesOpen, setGuidesOpen] = useState(false);

  return (
    <div className="space-y-5">
      <StudentHelpPageCSS />

      <h1 className="text-lg font-semibold text-slate-900">
        Help &amp; Support
      </h1>

      <div className="student-help-card rounded-2xl p-5">
        <div className="student-help-title mb-2 font-semibold">
          Frequently asked questions
        </div>

        <div className="overflow-hidden rounded-xl">
          <DropdownItem title="How do I join a class?">
            Open the <b>Classes</b> tab, choose <b>Join Class</b>, and enter the
            class code given by your lecturer. Once the code is accepted, the
            class will appear in your class list.
          </DropdownItem>

          <DropdownItem title="Where can I see lecturer feedback?">
            Open the <b>Reports</b> tab and switch to the marked feedback view.
            If your lecturer has published feedback, you can view the mark,
            comments, and marked report there.
          </DropdownItem>

          <DropdownItem title="What does the plagiarism score mean?">
            The plagiarism score shows how much of your submission is similar to
            indexed sources or other submissions. It is only a review signal and
            does not automatically mean academic misconduct.
          </DropdownItem>

          <DropdownItem title="How do I appeal a lecturer comment?">
            Open your marked feedback, select the relevant lecturer comment, and
            continue the discussion in the <b>Messages</b> tab.
          </DropdownItem>
        </div>
      </div>

      <div className="student-help-card rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="student-help-title font-semibold">
              Guides &amp; Tutorials
            </div>
            <p className="student-help-text mt-1 text-sm">
              Choose the question that matches your problem, then open the
              sub-question that best describes your situation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setGuidesOpen((prev) => !prev)}
            className="student-help-pill rounded-full px-3 py-1 text-xs font-semibold"
            aria-expanded={guidesOpen}
          >
            {guidesOpen ? "Hide guides" : "Open guides"}
          </button>
        </div>

        {guidesOpen ? (
        <div className="student-help-reveal space-y-4">
          <GuideQuestion
            title="I need help with assignment submission"
            subtitle="Use this section when you are trying to upload, re-submit, or check an assignment."
          >
            <SubQuestion question="Are you submitting for the first time?">
              <StepList
                items={[
                  "Open the Assignments tab.",
                  "Select the assignment you want to submit.",
                  "Read the instructions and check the due date.",
                  "Choose your PDF file.",
                  "Click Submit and wait until the upload reaches 100%.",
                  "After upload, EduGuard will finalize the report on the server.",
                ]}
              />
            </SubQuestion>

            <SubQuestion question="Are you trying to re-submit an assignment?">
              <div className="space-y-3">
                <SolutionChoice label="I still have attempts left">
                  Open the assignment again, choose the corrected PDF file, and
                  click <b>Re-submit</b>. The previous submission will remain as
                  history, but the latest submission will be used for checking.
                </SolutionChoice>

                <SolutionChoice label="I have no attempts left">
                  You cannot re-submit from the student side when attempts are
                  finished. Contact your lecturer and ask whether another
                  attempt can be allowed.
                </SolutionChoice>

                <SolutionChoice label="The upload reached 100% but says finalizing">
                  The file has already uploaded. You can close the modal and
                  EduGuard will continue finalizing the result on the server.
                  Reopen the assignment or Reports tab later to check the result.
                </SolutionChoice>
              </div>
            </SubQuestion>

            <SubQuestion question="Is your upload not working?">
              <div className="space-y-3">
                <SolutionChoice label="My file is not accepted">
                  Make sure the file is a PDF. EduGuard only accepts PDF
                  submissions for assignments.
                </SolutionChoice>

                <SolutionChoice label="The upload is slow">
                  Keep the page open until the upload reaches 100%. Large files
                  or slow internet may take longer.
                </SolutionChoice>

                <SolutionChoice label="The submit button is disabled">
                  The assignment may be closed, the due date may have passed, or
                  your allowed attempts may be finished. Check the submission
                  message shown inside the assignment window.
                </SolutionChoice>
              </div>
            </SubQuestion>
          </GuideQuestion>

          <GuideQuestion
            title="I need help understanding integrity and feedback reports"
            subtitle="Use this section when you want to understand plagiarism, AI risk, or lecturer-marked feedback."
          >
            <SubQuestion question="Do you want to understand the integrity report?">
              <div className="space-y-3">
                <SolutionChoice label="What is the plagiarism score?">
                  The plagiarism score shows how much of your submission is
                  similar to available sources, class materials, or other
                  submissions. It is a signal for review, not an automatic final
                  decision.
                </SolutionChoice>

                <SolutionChoice label="What is AI risk?">
                  AI risk shows whether parts of the writing look AI-generated.
                  Higher risk means the lecturer may review the highlighted
                  sections more carefully.
                </SolutionChoice>

                <SolutionChoice label="Why are some parts highlighted?">
                  Highlighted sections show the exact parts EduGuard wants you
                  or your lecturer to review. Yellow usually relates to
                  similarity/plagiarism, while AI highlights may use different
                  colors based on risk level.
                </SolutionChoice>
              </div>
            </SubQuestion>

            <SubQuestion question="Do you want to view lecturer-marked feedback?">
              <StepList
                items={[
                  "Open the Reports tab.",
                  "Switch to Marked feedback if needed.",
                  "Open the marked report for your assignment.",
                  "Read the score, general feedback, and inline comments.",
                  "Use Messages if you need clarification about a comment.",
                ]}
              />
            </SubQuestion>

            <SubQuestion question="Are your report results not visible?">
              <div className="space-y-3">
                <SolutionChoice label="The report is still processing">
                  Wait a few moments and refresh the Reports tab. Report
                  generation can take time after upload.
                </SolutionChoice>

                <SolutionChoice label="The lecturer has not released it">
                  Some reports are hidden until the lecturer or admin enables
                  visibility. Ask your lecturer if the report should already be
                  visible.
                </SolutionChoice>

                <SolutionChoice label="I cannot find my marked feedback">
                  Marked feedback appears only after the lecturer has completed
                  marking and published it to students.
                </SolutionChoice>
              </div>
            </SubQuestion>
          </GuideQuestion>

          <GuideQuestion
            title="I need help with lecturer comments and messages"
            subtitle="Use this section when you want to ask a question, reply to feedback, or appeal a comment."
          >
            <SubQuestion question="Do you want to ask for clarification?">
              <StepList
                items={[
                  "Open the Messages tab.",
                  "Select the conversation related to your assignment or comment.",
                  "Read the existing messages carefully.",
                  "Write a clear question explaining what you need help with.",
                  "Send the message and wait for your lecturer response.",
                ]}
              />
            </SubQuestion>

            <SubQuestion question="Do you want to appeal a lecturer comment?">
              <div className="space-y-3">
                <SolutionChoice label="I disagree with an inline comment">
                  Open the marked report, select the related comment, and reply
                  through Messages. Explain politely why you disagree and include
                  specific evidence from your work.
                </SolutionChoice>

                <SolutionChoice label="I need more explanation about my mark">
                  Use Messages to ask your lecturer which part of the rubric or
                  answer affected the mark. Keep the message short and specific.
                </SolutionChoice>

                <SolutionChoice label="I made a submission mistake">
                  Explain the mistake clearly to your lecturer. If another
                  upload is needed, ask whether another attempt can be enabled.
                </SolutionChoice>
              </div>
            </SubQuestion>

            <SubQuestion question="What should I write in my message?">
              <div className="student-help-solution rounded-2xl px-4 py-3 text-sm leading-6">
                Start with the assignment name, mention the exact comment or
                issue, explain your question in one or two sentences, and ask
                clearly what you need from the lecturer.
              </div>
            </SubQuestion>
          </GuideQuestion>
        </div>
        ) : null}
      </div>

      <div className="student-help-card rounded-2xl p-5">
        <div className="student-help-title mb-2 font-semibold">
          Contact Support
        </div>

        <div className="student-help-text text-sm leading-6">
          Need further assistance? Reach out to our support team at{" "}
          <a
            className="text-indigo-600 hover:underline"
            href="mailto:support@eduguard.app"
          >
            support@eduguard.app
          </a>
          .
        </div>
      </div>
    </div>
  );
}
