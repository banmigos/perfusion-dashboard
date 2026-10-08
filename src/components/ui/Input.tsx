import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export const FIELD_BASE =
  "rounded-md border border-line-strong bg-surface text-fg placeholder:text-subtle";

export function fieldSize(compact: boolean | undefined): string {
  return compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm";
}

export function Input({
  compact,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <input
      className={cn(FIELD_BASE, fieldSize(compact), className)}
      {...props}
    />
  );
}
