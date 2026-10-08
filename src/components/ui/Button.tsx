import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-canvas hover:bg-accent-strong",
  secondary: "border border-line-strong bg-raised text-fg hover:bg-line",
  ghost: "text-muted hover:bg-raised hover:text-fg",
};

const SIZE: Record<Size, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...props}
    />
  );
}
