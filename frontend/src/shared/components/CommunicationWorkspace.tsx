import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, API_BASE_URL } from "@/shared/lib/api";
import {
  renderMarkedReportHighlights,
  type MarkAnnotationHighlight,
} from "@/shared/lib/reportHighlight";

type ThreadSummary = {
  id: number;
  submission_id: number;
  report_id: number;
  annotation_id?: number | null;
  annotation_order_no?: number | null;
  annotation_selected_text?: string | null;
  annotation_comment?: string | null;
  thread_status: string;
  assignment_title: string;
  class_code: string;
  class_name: string;
  student_username: string;
  student_name?: string | null;
  score?: number | null;
  max_score?: number | null;
  latest_message?: string | null;
  latest_message_at?: string | null;
  latest_message_sender_role?: string | null;
  unread_count: number;
};

type MessageItem = {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_role: "student" | "lecturer";
  sender_name: string;
  sender_username?: string | null;
  body: string;
  read_at?: string | null;
  created_at?: string | null;
};

type ThreadDetail = {
  thread: ThreadSummary;
  messages: MessageItem[];
  context: {
    submission_id: number;
    assignment_id: number;
    assignment_title: string;
    class_code: string;
    class_name: string;
    student_username: string;
    student_name?: string | null;
    score?: number | null;
    max_score?: number | null;
    annotation: MarkAnnotationHighlight & {
      id?: number | null;
      order_no?: number | null;
    };
    report_text: string;
    submission_file_url?: string | null;
    lecturer_file_url?: string | null;
    marked_pdf_student_url?: string | null;
    marked_pdf_lecturer_url?: string | null;
  };
};

type RealtimePayload = {
  type: string;
  thread_id?: number;
  message?: MessageItem;
  thread?: ThreadSummary;
};

function formatWhen(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function threadTitle(role: "student" | "lecturer", thread: ThreadSummary) {
  if (role === "student") return thread.assignment_title;
  return `${thread.student_name || thread.student_username} — ${thread.assignment_title}`;
}

function buildWsUrl(role: "student" | "lecturer", ident: string) {
  const base = API_BASE_URL.replace(/^http/i, "ws");
  return `${base}/communications/ws/${role}/${encodeURIComponent(ident)}`;
}

export default function CommunicationWorkspace({
  role,
  ident,
  title,
  subtitle,
}: {
  role: "student" | "lecturer";
  ident: string;
  title: string;
  subtitle: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [search, setSearch] = useState("");
  const [classCode, setClassCode] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [connectingLabel, setConnectingLabel] = useState(
    "Connecting live updates…"
  );
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  const autoOpened = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagePaneRef = useRef<HTMLDivElement | null>(null);
  const selectedThreadIdRef = useRef<number | null>(null);

  const loadThreads = async () => {
    if (!ident) return;
    setLoadingThreads(true);
    try {
      const data = await api<ThreadSummary[]>(
        `/communications/${role}/${ident}/threads`
      );
      setThreads(data ?? []);
      setPageError(null);
    } catch (e: any) {
      setPageError(e?.message || "Failed to load conversations");
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadThreadDetail = async (threadId: number) => {
    if (!ident) return;
    selectedThreadIdRef.current = threadId;
    setSelectedThreadId(threadId);
    setLoadingDetail(true);
    try {
      const data = await api<ThreadDetail>(
        `/communications/${role}/${ident}/threads/${threadId}`
      );
      setDetail(data);
      setPageError(null);
    } catch (e: any) {
      setPageError(e?.message || "Failed to open conversation");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident, role]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    if (!ident) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      if (stopped) return;
      setConnectingLabel(
        attempts > 0 ? "Reconnecting live updates…" : "Connecting live updates…"
      );
      const url = buildWsUrl(role, ident);
      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setConnectingLabel("Live updates active");
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 20000);
      };

      socket.onerror = () => {
        setConnectingLabel("Reconnecting live updates…");
      };

      socket.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!stopped) {
          attempts += 1;
          if (attempts <= 5) {
            setConnectingLabel("Reconnecting live updates…");
            const wait = Math.min(15000, 1500 * attempts);
            reconnectTimer = window.setTimeout(connect, wait);
          } else {
            setConnectingLabel("Live updates unavailable — refresh to retry");
          }
        }
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimePayload;
          if (payload.type === "connected") {
            setConnectingLabel("Live updates active");
            return;
          }
          if (payload.type !== "message_created" || !payload.thread) return;

          setThreads((prev) => {
            const next = [...prev];
            const index = next.findIndex((item) => item.id === payload.thread!.id);
            if (index >= 0) {
              next[index] = payload.thread!;
            } else {
              next.unshift(payload.thread!);
            }
            next.sort(
              (a, b) =>
                (new Date(b.latest_message_at || 0).getTime() || 0) -
                (new Date(a.latest_message_at || 0).getTime() || 0)
            );
            return next;
          });

          if (
            payload.thread_id &&
            payload.thread_id === selectedThreadIdRef.current &&
            payload.message
          ) {
            setDetail((prev) => {
              if (!prev || prev.thread.id !== payload.thread_id) return prev;
              const hasMessage = prev.messages.some(
                (item) => item.id === payload.message!.id
              );
              return {
                ...prev,
                thread: payload.thread || prev.thread,
                messages: hasMessage
                  ? prev.messages
                  : [...prev.messages, payload.message!],
              };
            });
          }
        } catch {
          // ignore malformed payloads
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [ident, role]);

  const classes = useMemo(() => {
    const uniq = Array.from(
      new Set(threads.map((item) => item.class_code).filter(Boolean))
    );
    return uniq.sort();
  }, [threads]);

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((thread) => {
      if (classCode !== "all" && thread.class_code !== classCode) return false;
      if (showUnreadOnly && (thread.unread_count || 0) <= 0) return false;
      if (!q) return true;
      return [
        thread.assignment_title,
        thread.class_code,
        thread.class_name,
        thread.student_name || "",
        thread.student_username,
        thread.annotation_comment || "",
        thread.annotation_selected_text || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [threads, search, classCode, showUnreadOnly]);

  useEffect(() => {
    if (selectedThreadId || loadingThreads) return;
    if (visibleThreads.length > 0) {
      void loadThreadDetail(visibleThreads[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleThreads, loadingThreads, selectedThreadId]);

  useEffect(() => {
    if (autoOpened.current || loadingThreads || !ident) return;
    const submissionId = Number(searchParams.get("submission_id") || 0);
    const annotationId = Number(searchParams.get("annotation_id") || 0);
    if (!submissionId || !annotationId) return;

    autoOpened.current = true;
    const intent = searchParams.get("intent") || "reply";
    setComposer(
      intent === "appeal"
        ? "I would like to appeal this comment because…"
        : "Hello, I would like to discuss this comment…"
    );

    void (async () => {
      try {
        const opened = await api<ThreadSummary>(
          `/communications/${role}/${ident}/threads/open`,
          {
            method: "POST",
            body: {
              submission_id: submissionId,
              annotation_id: annotationId,
            },
          }
        );
        setThreads((prev) => {
          const others = prev.filter((item) => item.id !== opened.id);
          return [opened, ...others];
        });
        await loadThreadDetail(opened.id);
      } catch (e: any) {
        setPageError(
          e?.message || "Failed to open the conversation for this comment"
        );
      }
    })();
    // The route-triggered open operation is keyed to URL and account identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ident, loadingThreads, role]);

  useEffect(() => {
    if (!messagePaneRef.current) return;
    messagePaneRef.current.scrollTop = messagePaneRef.current.scrollHeight;
  }, [detail?.messages.length]);

  useEffect(() => {
    if (!isPdfModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPdfModalOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPdfModalOpen]);

  const sendMessage = async () => {
    if (!selectedThreadId || !composer.trim() || sending) return;
    setSending(true);
    try {
      const response = await api<{
        ok: boolean;
        message: MessageItem;
        thread: ThreadSummary;
      }>(`/communications/${role}/${ident}/threads/${selectedThreadId}/messages`, {
        method: "POST",
        body: { body: composer.trim() },
      });
      setThreads((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.id === response.thread.id);
        if (index >= 0) next[index] = response.thread;
        else next.unshift(response.thread);
        return next;
      });
      setDetail((prev) => {
        if (!prev || prev.thread.id !== selectedThreadId) return prev;
        const hasMessage = prev.messages.some(
          (item) => item.id === response.message.id
        );
        return {
          ...prev,
          thread: response.thread,
          messages: hasMessage
            ? prev.messages
            : [...prev.messages, response.message],
        };
      });
      setComposer("");
    } catch (e: any) {
      setPageError(e?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const jumpToMarkedReport = () => {
    if (!detail) return;
    navigate(
      `/student/reports?tab=feedback&submission_id=${detail.context.submission_id}&open=1`
    );
  };

  const currentFileUrl = detail?.context
    ? role === "student"
      ? detail.context.submission_file_url
      : detail.context.lecturer_file_url
    : null;

  const markedPdfUrl = detail?.context
    ? role === "student"
      ? detail.context.marked_pdf_student_url
      : detail.context.marked_pdf_lecturer_url
    : null;

  const previewPdfSrc = currentFileUrl
    ? `${API_BASE_URL}${currentFileUrl}#toolbar=0`
    : null;

  const fullPreviewPdfSrc = currentFileUrl
    ? `${API_BASE_URL}${currentFileUrl}#toolbar=1`
    : null;

  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm">
            {connectingLabel}
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  role === "student"
                    ? "Search comments or classes"
                    : "Search students, classes or comments"
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-0 transition focus:border-blue-300 focus:bg-white"
              />
              <div className="flex flex-wrap gap-2">
                <select
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                >
                  <option value="all">All classes</option>
                  {classes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowUnreadOnly((prev) => !prev)}
                  className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${
                    showUnreadOnly
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Unread only
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {loadingThreads ? (
                <p className="text-sm text-slate-600">Loading conversations…</p>
              ) : null}

              {!loadingThreads && visibleThreads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  {role === "student"
                    ? "Open a marked lecturer comment and choose reply or appeal to start a conversation."
                    : "Student replies and appeals will appear here as soon as they are sent."}
                </div>
              ) : null}

              {visibleThreads.map((thread) => {
                const active = selectedThreadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => void loadThreadDetail(thread.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {threadTitle(role, thread)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {thread.class_code} • Comment{" "}
                          {thread.annotation_order_no ?? "—"}
                        </div>
                      </div>
                      {thread.unread_count > 0 ? (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                          {thread.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm text-slate-700">
                      {thread.annotation_comment ||
                        thread.latest_message ||
                        "Conversation"}
                    </div>
                    <div className="mt-2 line-clamp-1 text-xs text-slate-500">
                      {thread.latest_message || "No messages yet"}
                    </div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      {formatWhen(thread.latest_message_at) ||
                        "Waiting for first message"}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              {!detail ? (
                <div className="grid min-h-[70vh] place-items-center px-6 text-center text-sm text-slate-600">
                  Select a conversation to read and reply.
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">
                          {detail.thread.assignment_title}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {detail.thread.class_code} • {detail.thread.class_name}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-blue-700">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                          Mark
                        </div>
                        <div className="text-2xl font-semibold">
                          {detail.context.score ?? "—"}
                          {typeof detail.context.max_score === "number"
                            ? ` / ${detail.context.max_score}`
                            : ""}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-600 text-white">
                          {detail.context.annotation.order_no ?? "#"}
                        </span>
                        Comment context
                      </div>
                      <div className="mt-3 text-sm font-medium text-slate-700">
                        {detail.context.annotation.selected_text}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-slate-600">
                        {detail.context.annotation.comment}
                      </div>
                    </div>
                  </div>

                  <div
                    ref={messagePaneRef}
                    className="h-[48vh] overflow-y-auto bg-slate-50 px-5 py-5"
                  >
                    {loadingDetail ? (
                      <div className="text-sm text-slate-600">
                        Opening conversation…
                      </div>
                    ) : null}

                    {!loadingDetail && detail.messages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                        No messages yet. Start the conversation below.
                      </div>
                    ) : null}

                    <div className="space-y-4">
                      {detail.messages.map((message) => {
                        const own = message.sender_role === role;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${
                              own ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${
                                own
                                  ? "bg-blue-600 text-white"
                                  : "border border-slate-200 bg-white text-slate-800"
                              }`}
                            >
                              <div
                                className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                                  own ? "text-blue-100" : "text-slate-400"
                                }`}
                              >
                                {message.sender_name}
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-7">
                                {message.body}
                              </div>
                              <div
                                className={`mt-2 text-[11px] ${
                                  own ? "text-blue-100" : "text-slate-400"
                                }`}
                              >
                                {formatWhen(message.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 p-4">
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder={
                          role === "student"
                            ? "Reply, appeal, or ask your lecturer for clarification…"
                            : "Reply to the student about this comment…"
                        }
                        className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-300"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                          Messages are delivered live while both sides are online.
                        </div>
                        <button
                          type="button"
                          onClick={() => void sendMessage()}
                          disabled={
                            sending || !composer.trim() || !selectedThreadId
                          }
                          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {sending ? "Sending…" : "Send message"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <aside className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  {role === "student" ? (
                    <button
                      type="button"
                      onClick={jumpToMarkedReport}
                      disabled={!detail}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Open full marked report
                    </button>
                  ) : null}

                  {currentFileUrl ? (
                    <a
                      href={`${API_BASE_URL}${currentFileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open submitted PDF
                    </a>
                  ) : null}

                  {markedPdfUrl ? (
                    <a
                      href={`${API_BASE_URL}${markedPdfUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open marked PDF
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-800">
                    PDF preview
                  </div>

                  {currentFileUrl ? (
                    <button
                      type="button"
                      onClick={() => setIsPdfModalOpen(true)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View full preview
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {previewPdfSrc ? (
                    <iframe
                      title="Submission PDF preview"
                      src={previewPdfSrc}
                      className="h-[340px] w-full bg-white"
                    />
                  ) : (
                    <div className="grid h-[180px] place-items-center text-sm text-slate-500">
                      Submission preview is not available.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">
                  Comment highlighted in the submission text
                </div>
                <div className="mt-3 max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {detail
                    ? renderMarkedReportHighlights(
                        detail.context.report_text || "No extracted text found.",
                        [detail.context.annotation]
                      )
                    : "Select a conversation to preview the linked comment."}
                </div>
              </div>
            </aside>
          </section>
        </div>

        {pageError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}
      </div>

      {isPdfModalOpen && fullPreviewPdfSrc ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/70 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={() => setIsPdfModalOpen(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Full PDF preview
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Press Esc or click outside to close.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`${API_BASE_URL}${currentFileUrl ?? ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(false)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100">
              <iframe
                title="Full submission PDF preview"
                src={fullPreviewPdfSrc}
                className="h-full w-full bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
