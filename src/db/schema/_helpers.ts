import { integer, text } from "drizzle-orm/sqlite-core";

export const id = () => integer().primaryKey({ autoIncrement: true });

export const createdAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const archivedAt = () => integer({ mode: "timestamp_ms" });

export const CANONICAL_STATUSES = [
  "draft",
  "needs_review",
  "verified",
  "stale",
  "archived",
] as const;

export const canonicalStatus = () =>
  text({ enum: CANONICAL_STATUSES }).notNull().default("draft");
