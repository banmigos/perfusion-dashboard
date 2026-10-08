import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg",
        className,
      )}
      {...props}
    />
  );
}
