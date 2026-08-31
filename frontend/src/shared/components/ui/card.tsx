import type { PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

export function Card({ children }: PropsWithChildren) {
  return (
    <div
      className={cn(
        "rounded-3xl p-6 sm:p-8",
        "bg-[color:var(--card)] border border-[color:var(--card-border)]",
        "backdrop-blur-[var(--blur)] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
      )}
    >
      {children}
    </div>
  );
}
