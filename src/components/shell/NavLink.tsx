"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  // The active page carries a venous rule on its leading edge, like the line
  // the eye follows on a chart; no filled pill.
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block border-l-2 px-2 py-1 text-sm whitespace-nowrap transition-colors",
        active
          ? "border-accent font-medium text-fg"
          : "border-transparent text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
