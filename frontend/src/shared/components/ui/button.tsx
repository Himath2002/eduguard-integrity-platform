import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "outline" | "ghost";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; }

export function Button({ className="", variant="primary", ...rest }: Props) {
  const base = "btn";
  const styles: Record<Variant, string> = {
    primary: "btn-primary",
    outline: "btn-outline",
    ghost:  "hover:bg-black/5",
  };
  return <button className={cn(base, styles[variant], className)} {...rest} />;
}
