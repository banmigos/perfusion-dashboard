import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "ok" | "warn";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-raised text-muted",
  accent: "bg-accent-soft text-accent-strong",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
