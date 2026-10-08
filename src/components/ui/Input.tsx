import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-subtle",
        className,
      )}
      {...props}
    />
  );
}
