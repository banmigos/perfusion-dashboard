import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { FIELD_BASE, fieldSize } from "./Input";

export function Textarea({
  compact,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { compact?: boolean }) {
  return (
    <textarea
      className={cn(FIELD_BASE, fieldSize(compact), className)}
      {...props}
    />
  );
}
