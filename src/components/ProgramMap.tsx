// src/components/ProgramMap.tsx
"use client";

import dynamic from "next/dynamic";
import type { ProgramListItem } from "@/domain/programs";

const ProgramMapInner = dynamic(
  () => import("./ProgramMapInner").then((mod) => mod.ProgramMapInner),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted">Loading map…</p>,
  },
);

export function ProgramMap({ items }: { items: ProgramListItem[] }) {
  return <ProgramMapInner items={items} />;
}
