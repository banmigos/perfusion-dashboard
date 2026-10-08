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

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-strong"
          : "text-muted hover:bg-raised hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
