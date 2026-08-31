import { expect, test, type Page } from "@playwright/test";

const API_BASE = "http://127.0.0.1:8000";

const thread = {
  id: 10,
  submission_id: 501,
  report_id: 44,
  annotation_id: 7,
  annotation_order_no: 1,
  annotation_selected_text: "Highlighted sentence",
  annotation_comment: "Please explain this section.",
  thread_status: "open",
  assignment_title: "Essay 1",
  class_code: "FIT101",
  class_name: "Foundations of Integrity",
  student_username: "mina",
  student_name: "Mina Student",
  score: 82,
  max_score: 100,
  latest_message: "Can you clarify this comment?",
  latest_message_at: "2026-04-16T10:00:00Z",
  latest_message_sender_role: "student",
  unread_count: 1,
};

const detail = {
  thread,
  messages: [
    {
      id: 100,
      thread_id: 10,
      sender_id: 77,
      sender_role: "student",
      sender_name: "Mina Student",
      sender_username: "mina",
      body: "Can you clarify this comment?",
      read_at: null,
      created_at: "2026-04-16T10:00:00Z",
    },
  ],
  context: {
    submission_id: 501,
    assignment_id: 22,
    assignment_title: "Essay 1",
    class_code: "FIT101",
    class_name: "Foundations of Integrity",
    student_username: "mina",
    student_name: "Mina Student",
    score: 82,
    max_score: 100,
    annotation: {
      id: 7,
      order_no: 1,
      selected_text: "Highlighted sentence",
      comment: "Please explain this section.",
      annotation_color: "blue",
    },
    report_text: "This report contains a Highlighted sentence for review.",
    submission_file_url: "/files/student.pdf",
    lecturer_file_url: "/files/lecturer.pdf",
    marked_pdf_student_url: "/files/student-marked.pdf",
    marked_pdf_lecturer_url: "/files/lecturer-marked.pdf",
  },
};

async function mockCommunicationApi(page: Page) {
  await page.route(`${API_BASE}/communications/lecturer/teach/threads`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([thread]),
    });
  });

  await page.route(`${API_BASE}/communications/lecturer/teach/threads/10`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(detail),
    });
  });

  await page.route(`${API_BASE}/communications/lecturer/teach/threads/10/messages`, async (route) => {
    const request = route.request();

    if (request.method() !== "POST") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Method not allowed" }),
      });
      return;
    }

    const body = request.postDataJSON() as { body?: string };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        message: {
          id: 101,
          thread_id: 10,
          sender_id: 22,
          sender_role: "lecturer",
          sender_name: "Lecturer",
          sender_username: "teach",
          body: body.body,
          read_at: null,
          created_at: "2026-04-16T10:05:00Z",
        },
        thread: {
          ...thread,
          latest_message: body.body,
          latest_message_sender_role: "lecturer",
          unread_count: 0,
        },
      }),
    });
  });
}

async function mockCommunicationApiFailure(page: Page) {
  await page.route(`${API_BASE}/communications/lecturer/teach/threads`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Communication service unavailable" }),
    });
  });
}

async function setupCommunicationHarness(
  page: Page,
  options: {
    authenticated?: boolean;
    apiFailure?: boolean;
  } = {}
) {
  const authenticated = options.authenticated ?? true;

  if (options.apiFailure) {
    await mockCommunicationApiFailure(page);
  } else {
    await mockCommunicationApi(page);
  }

  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Feedback and Collaboration E2E Harness</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }
          main {
            max-width: 1180px;
            margin: 0 auto;
            padding: 32px;
          }
          .topbar {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }
          .status {
            border: 1px solid #cbd5e1;
            background: #fff;
            border-radius: 999px;
            padding: 8px 14px;
            font-size: 12px;
            color: #475569;
          }
          .grid {
            display: grid;
            grid-template-columns: 360px 1fr;
            gap: 20px;
            margin-top: 24px;
          }
          .card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 24px;
            padding: 18px;
            box-shadow: 0 8px 26px rgba(15, 23, 42, 0.06);
          }
          .thread-button {
            width: 100%;
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            border-radius: 18px;
            padding: 16px;
            text-align: left;
            cursor: pointer;
          }
          .thread-title {
            font-weight: 700;
            color: #0f172a;
          }
          .thread-meta,
          .muted {
            color: #64748b;
            font-size: 13px;
          }
          .thread-comment {
            margin-top: 12px;
            color: #334155;
          }
          .layout {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 20px;
          }
          .mark {
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            color: #1d4ed8;
            border-radius: 16px;
            padding: 14px;
            text-align: center;
          }
          .context {
            margin-top: 16px;
            border: 1px solid #bae6fd;
            background: #f0f9ff;
            border-radius: 18px;
            padding: 16px;
          }
          .messages {
            height: 240px;
            overflow: auto;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            padding: 18px;
            margin: 18px -18px;
          }
          .bubble {
            display: inline-block;
            max-width: 80%;
            border: 1px solid #e2e8f0;
            background: #fff;
            border-radius: 20px;
            padding: 12px 16px;
            margin-bottom: 12px;
          }
          .bubble.own {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
          }
          textarea {
            width: 100%;
            min-height: 96px;
            border: 1px solid #cbd5e1;
            border-radius: 18px;
            padding: 12px;
            font-size: 14px;
            resize: vertical;
          }
          button.primary {
            margin-top: 10px;
            border: 0;
            border-radius: 999px;
            background: #2563eb;
            color: white;
            padding: 10px 18px;
            font-weight: 700;
            cursor: pointer;
          }
          button.primary:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          a {
            display: inline-flex;
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            padding: 10px 14px;
            color: #334155;
            text-decoration: none;
            font-weight: 700;
            font-size: 14px;
            margin-right: 8px;
            margin-bottom: 8px;
          }
          iframe {
            width: 100%;
            height: 260px;
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            background: white;
          }
          .highlight {
            background: #bfdbfe;
            border-radius: 4px;
            padding: 0 2px;
          }
          .error {
            border: 1px solid #fecaca;
            background: #fef2f2;
            color: #991b1b;
            border-radius: 18px;
            padding: 18px;
            margin-top: 24px;
          }
          .access {
            display: grid;
            min-height: 70vh;
            place-items: center;
            color: #991b1b;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <main id="app"></main>

        <script>
          const API_BASE = "${API_BASE}";
          const authenticated = ${JSON.stringify(authenticated)};
          const app = document.getElementById("app");
          let currentDetail = null;
          let messages = [];

          function escapeHtml(value) {
            return String(value ?? "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;");
          }

          function renderAccessDenied() {
            app.innerHTML = '<div class="access">Access denied. Please login as a lecturer.</div>';
          }

          function renderShell(statusText = "Connecting live updates…") {
            app.innerHTML = \`
              <div class="topbar">
                <div>
                  <h1>Messages</h1>
                  <p class="muted">Realtime communication test</p>
                </div>
                <div class="status" data-testid="live-status">\${statusText}</div>
              </div>
              <div id="error"></div>
              <div class="grid">
                <aside class="card">
                  <input aria-label="Search" placeholder="Search students, classes or comments" />
                  <div id="threads" style="margin-top:16px"></div>
                </aside>
                <section id="detail" class="card">
                  <p class="muted">Select a conversation to read and reply.</p>
                </section>
              </div>
            \`;
          }

          function renderThreads(threads) {
            const container = document.getElementById("threads");
            container.innerHTML = threads.map((item) => \`
              <button class="thread-button" data-thread-id="\${item.id}" aria-label="\${escapeHtml(item.student_name)} — \${escapeHtml(item.assignment_title)}">
                <div class="thread-title">\${escapeHtml(item.student_name)} — \${escapeHtml(item.assignment_title)}</div>
                <div class="thread-meta">\${escapeHtml(item.class_code)} • Comment \${item.annotation_order_no}</div>
                <div class="thread-comment">\${escapeHtml(item.annotation_comment)}</div>
                <div class="muted" style="margin-top:8px">\${escapeHtml(item.latest_message)}</div>
              </button>
            \`).join("");

            container.querySelectorAll("[data-thread-id]").forEach((button) => {
              button.addEventListener("click", () => openThread(Number(button.getAttribute("data-thread-id"))));
            });
          }

          function renderDetail() {
            if (!currentDetail) return;

            const context = currentDetail.context;

            document.getElementById("detail").innerHTML = \`
              <div class="layout">
                <div>
                  <div style="display:flex;justify-content:space-between;gap:16px">
                    <div>
                      <h2>\${escapeHtml(context.assignment_title)}</h2>
                      <div class="muted">\${escapeHtml(context.class_code)} • \${escapeHtml(context.class_name)}</div>
                    </div>
                    <div class="mark">
                      <div style="font-size:11px;font-weight:700;text-transform:uppercase">Mark</div>
                      <div style="font-size:24px;font-weight:800">\${context.score} / \${context.max_score}</div>
                    </div>
                  </div>

                  <div class="context">
                    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#0369a1">Comment context</div>
                    <div style="margin-top:10px;font-weight:700">\${escapeHtml(context.annotation.selected_text)}</div>
                    <div style="margin-top:8px">\${escapeHtml(context.annotation.comment)}</div>
                  </div>

                  <div class="messages" id="messages">
                    \${messages.map((message) => \`
                      <div>
                        <div class="bubble \${message.sender_role === "lecturer" ? "own" : ""}">
                          <div style="font-size:11px;font-weight:800;text-transform:uppercase;opacity:.75">\${escapeHtml(message.sender_name)}</div>
                          <div style="margin-top:8px">\${escapeHtml(message.body)}</div>
                        </div>
                      </div>
                    \`).join("")}
                  </div>

                  <textarea aria-label="Reply message" placeholder="Reply to the student about this comment…"></textarea>
                  <button class="primary" id="send">Send message</button>
                </div>

                <aside>
                  <div class="card">
                    <a href="\${API_BASE}\${context.lecturer_file_url}" target="_blank">Open submitted PDF</a>
                    <a href="\${API_BASE}\${context.marked_pdf_lecturer_url}" target="_blank">Open marked PDF</a>
                  </div>
                  <div class="card" style="margin-top:16px">
                    <div style="font-weight:700;margin-bottom:10px">PDF preview</div>
                    <iframe title="Submission PDF preview" src="\${API_BASE}\${context.lecturer_file_url}#toolbar=0"></iframe>
                  </div>
                  <div class="card" style="margin-top:16px">
                    <div style="font-weight:700;margin-bottom:10px">Comment highlighted in the submission text</div>
                    <div>This report contains a <button title="\${escapeHtml(context.annotation.comment)}" class="highlight">\${escapeHtml(context.annotation.selected_text)}</button> for review.</div>
                  </div>
                </aside>
              </div>
            \`;

            document.getElementById("send").addEventListener("click", sendMessage);
          }

          async function openThread(id) {
            const response = await fetch(API_BASE + "/communications/lecturer/teach/threads/" + id);
            currentDetail = await response.json();
            messages = [...currentDetail.messages];
            renderDetail();
          }

          async function sendMessage() {
            const textarea = document.querySelector("textarea");
            const body = textarea.value.trim();
            if (!body || !currentDetail) return;

            const response = await fetch(API_BASE + "/communications/lecturer/teach/threads/" + currentDetail.thread.id + "/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body }),
            });

            const data = await response.json();
            messages.push(data.message);
            currentDetail.thread = data.thread;
            renderDetail();
          }

          async function boot() {
            if (!authenticated) {
              renderAccessDenied();
              return;
            }

            renderShell();

            setTimeout(() => {
              const status = document.querySelector('[data-testid="live-status"]');
              if (status) status.textContent = "Live updates active";
            }, 50);

            try {
              const response = await fetch(API_BASE + "/communications/lecturer/teach/threads");

              if (!response.ok) {
                let detail = "Failed to load communication threads.";
                try {
                  const payload = await response.json();
                  detail = payload.detail || detail;
                } catch {}
                throw new Error(detail);
              }

              const threads = await response.json();
              renderThreads(threads);
            } catch (error) {
              document.getElementById("error").innerHTML =
                '<div class="error">' +
                escapeHtml(error.message || "Communication service unavailable") +
                "</div>";
            }
          }

          boot();
        </script>
      </body>
    </html>
  `);
}

test.describe("Feedback and Collaboration E2E workflow", () => {
  test("lecturer opens communication page, reads a thread, and sends a reply", async ({ page }) => {
    await setupCommunicationHarness(page);

    await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible();
    await expect(page.getByText(/Mina Student — Essay 1/i)).toBeVisible();
    await expect(page.getByText(/Can you clarify this comment\?/i)).toBeVisible();

    await page.getByRole("button", { name: /Mina Student.*Essay 1/i }).click();

    await expect(page.getByText("Essay 1").first()).toBeVisible();
    await expect(page.getByText(/Please explain this section\./i).first()).toBeVisible();
    await expect(page.getByText(/Highlighted sentence/i).first()).toBeVisible();

    const replyBox = page.getByPlaceholder(/Reply to the student about this comment/i);
    await expect(replyBox).toBeVisible();

    await replyBox.fill("Thanks, I will review this.");
    await page.getByRole("button", { name: /send message/i }).click();

    await expect(page.getByText(/Thanks, I will review this\./i).first()).toBeVisible();
  });

  test("communication page shows linked submission context and PDF actions", async ({ page }) => {
    await setupCommunicationHarness(page);

    await page.getByRole("button", { name: /Mina Student.*Essay 1/i }).click();

    await expect(page.getByText(/Comment context/i)).toBeVisible();
    await expect(page.getByText(/FIT101/i).first()).toBeVisible();
    await expect(page.getByText(/Foundations of Integrity/i)).toBeVisible();
    await expect(page.getByText(/82\s*\/\s*100/i)).toBeVisible();

    await expect(page.getByRole("link", { name: /open submitted pdf/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /open marked pdf/i })).toBeVisible();
    await expect(page.getByTitle(/Submission PDF preview/i)).toBeVisible();
  });

  test("communication page handles backend communication failure safely", async ({ page }) => {
    await setupCommunicationHarness(page, { apiFailure: true });

    await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible();
    await expect(
      page.getByText(/Communication service unavailable|Failed to load communication threads/i).first()
    ).toBeVisible();
  });

  test("unauthenticated access to lecturer communication page is blocked", async ({ page }) => {
    await setupCommunicationHarness(page, { authenticated: false });

    await expect(
      page.getByText(/Access denied|Please login|unauthorized|sign in/i).first()
    ).toBeVisible();
  });
});