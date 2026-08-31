import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function PortalModal({
  open,
  title,
  children,
  onClose,
  widthClass = "max-w-3xl",
  topClass = "",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  widthClass?: string;
  topClass?: string;
}) {
  useEffect(() => {
    if (!open) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("eg-modal-open");

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("eg-modal-open");
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      data-eg-modal="true"
      role="presentation"
    >
      <style>{`
        body.eg-modal-open footer {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        .eg-portal-modal {
          color: #0f172a;
          border-color: rgba(226, 232, 240, 0.95);
          background: #ffffff;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.22);
        }

        .eg-portal-modal-header {
          border-bottom-color: rgba(226, 232, 240, 0.90);
          background: #ffffff;
        }

        .eg-portal-modal-title {
          color: #1e293b;
        }

        .eg-portal-modal-close {
          color: #475569;
        }

        .eg-portal-modal-close:hover {
          color: #0f172a;
          background: rgba(15, 23, 42, 0.06);
        }

        .eg-portal-modal-body {
          background: #ffffff;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.45) transparent;
        }

        .eg-portal-modal-body::-webkit-scrollbar {
          width: 10px;
        }

        .eg-portal-modal-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .eg-portal-modal-body::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.38);
          border-radius: 999px;
          border: 3px solid transparent;
          background-clip: content-box;
        }

        body[data-student-theme="dark"].eg-modal-open footer,
        html[data-student-theme="dark"] body.eg-modal-open footer {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        body[data-student-theme="dark"] .eg-portal-modal,
        html[data-student-theme="dark"] .eg-portal-modal {
          color: #e5edf8;
          border-color: rgba(148, 163, 184, 0.22);
          background: #081120;
          box-shadow: 0 34px 100px rgba(0, 0, 0, 0.55);
        }

        body[data-student-theme="dark"] .eg-portal-modal-header,
        html[data-student-theme="dark"] .eg-portal-modal-header {
          border-bottom-color: rgba(148, 163, 184, 0.18);
          background: #091426;
        }

        body[data-student-theme="dark"] .eg-portal-modal-title,
        html[data-student-theme="dark"] .eg-portal-modal-title {
          color: #f8fafc;
        }

        body[data-student-theme="dark"] .eg-portal-modal-close,
        html[data-student-theme="dark"] .eg-portal-modal-close {
          color: #cbd5e1;
        }

        body[data-student-theme="dark"] .eg-portal-modal-close:hover,
        html[data-student-theme="dark"] .eg-portal-modal-close:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }

        body[data-student-theme="dark"] .eg-portal-modal-body,
        html[data-student-theme="dark"] .eg-portal-modal-body {
          background:
            radial-gradient(circle at top left, rgba(34, 211, 238, 0.07), transparent 32%),
            linear-gradient(180deg, #0b1728 0%, #081120 100%);
          scrollbar-color: rgba(148, 163, 184, 0.48) transparent;
        }
      `}</style>

      <button
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={onClose}
        aria-label="Close modal"
        type="button"
      />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-3 py-4 sm:px-6 sm:py-6">
        <div className={["min-h-0 w-full", widthClass, topClass].join(" ")}>
          <div className="eg-portal-modal mx-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border sm:max-h-[calc(100dvh-3rem)]">
            <div className="eg-portal-modal-header shrink-0 border-b px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="eg-portal-modal-title min-w-0 pr-4 font-semibold">
                  {title}
                </div>

                <button
                  className="eg-portal-modal-close grid h-9 w-9 shrink-0 place-items-center rounded-full transition"
                  onClick={onClose}
                  aria-label="Close"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="eg-portal-modal-body min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}