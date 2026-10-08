import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** `inset` is for a card nested inside another card. */
export function Card({
  inset,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border",
        inset ? "border-line bg-canvas" : "border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}
