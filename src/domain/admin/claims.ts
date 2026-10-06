// src/domain/admin/claims.ts
import "server-only";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type {
  CLAIM_STATES,
  SOURCE_TYPES,
  VERIFICATION_STATES,
} from "@/db/schema/provenance";
import { recordChange } from "../changeLog";
import { findOrCreateSource } from "./sources";
import type { ClaimWithSource, SubjectTable } from "../claims";

export type ClaimUpsertInput = {
  subjectTable: SubjectTable;
  subjectId: number;
  fieldKey: string;
  state: (typeof CLAIM_STATES)[number];
  sourceUrl?: string | null;
  sourceType?: (typeof SOURCE_TYPES)[number];
  quote?: string | null;
  note?: string | null;
  checkedAt?: Date | null;
  verification?: (typeof VERIFICATION_STATES)[number];
  locked?: boolean;
};
export type Claim = typeof schema.claims.$inferSelect;

function subjectFieldEq(
  subjectTable: SubjectTable,
  subjectId: number,
  fieldKey: string,
) {
  return and(
    eq(schema.claims.subjectTable, subjectTable),
    eq(schema.claims.subjectId, subjectId),
    eq(schema.claims.fieldKey, fieldKey),
  );
}

export function upsertClaim(
  db: BetterSQLite3Database<typeof schema>,
  input: ClaimUpsertInput,
): Claim {
  return db.transaction((tx) => {
    let sourceId: number | null = null;
    if (input.sourceUrl) {
      sourceId = findOrCreateSource(tx, {
        url: input.sourceUrl,
        sourceType: input.sourceType ?? "other",
      }).id;
    }

    // Satisfy claims_known_requires_source here rather than letting the DB
    // reject the insert with an opaque constraint error.
    if (input.state === "known" && sourceId === null) {
      throw new Error("a known claim requires a source URL");
    }

    const [existingClaim] = tx
      .select()
      .from(schema.claims)
      .where(
        subjectFieldEq(input.subjectTable, input.subjectId, input.fieldKey),
      )
      .all();

    const resolvedVerification =
      input.verification ?? existingClaim?.verification ?? "draft";
    let resolvedCheckedAt = input.checkedAt ?? existingClaim?.checkedAt ?? null;
    if (resolvedVerification !== "draft" && resolvedCheckedAt === null) {
      resolvedCheckedAt = new Date();
    }

    const values = {
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey,
      state: input.state,
      sourceId,
      quote: input.quote ?? null,
      note: input.note ?? null,
      checkedAt: resolvedCheckedAt,
      verification: resolvedVerification,
      locked: input.locked ?? existingClaim?.locked ?? false,
    };

    if (existingClaim) {
      tx.update(schema.claims)
        .set(values)
        .where(eq(schema.claims.id, existingClaim.id))
        .run();
      const [after] = tx
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.id, existingClaim.id))
        .all();
      recordChange(tx, {
        action: "update",
        subjectTable: input.subjectTable,
        subjectId: input.subjectId,
        fieldKey: input.fieldKey,
        before: existingClaim,
        after,
      });
      return after!;
    }

    const [row] = tx.insert(schema.claims).values(values).returning().all();
    recordChange(tx, {
      action: "create",
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function setClaimVerification(
  db: BetterSQLite3Database<typeof schema>,
  claimId: number,
  verification: "verified" | "needs_review",
): Claim {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .all();
    if (!before) {
      throw new Error(`claim ${claimId} not found`);
    }

    const patch: Partial<typeof schema.claims.$inferInsert> = { verification };
    if (before.checkedAt === null) {
      patch.checkedAt = new Date();
    }

    tx.update(schema.claims)
      .set(patch)
      .where(eq(schema.claims.id, claimId))
      .run();
    const [after] = tx
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .all();

    recordChange(tx, {
      action: "verify",
      subjectTable: before.subjectTable,
      subjectId: before.subjectId,
      fieldKey: before.fieldKey,
      before,
      after,
    });
    return after!;
  });
}

export function listClaimsForSubject(
  db: BetterSQLite3Database<typeof schema>,
  subjectTable: SubjectTable,
  subjectId: number,
): ClaimWithSource[] {
  return db
    .select()
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(
      and(
        eq(schema.claims.subjectTable, subjectTable),
        eq(schema.claims.subjectId, subjectId),
      ),
    )
    .orderBy(schema.claims.fieldKey)
    .all()
    .map((row) => ({ ...row.claims, source: row.sources }));
}
