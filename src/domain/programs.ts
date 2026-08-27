import "server-only";
import { and, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CREDENTIALS } from "@/db/schema/canonical";
import { z } from "zod";
import { loadClaims, type ClaimWithSource, type SubjectRef } from "./claims";

export type Credential = (typeof CREDENTIALS)[number];

const credentialSchema = z.enum(CREDENTIALS);

export type ProgramListFilters = {
  q?: string;
  credential?: Credential;
};

export function parseProgramListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProgramListFilters {
  const rawQ = searchParams.q;
  const q =
    typeof rawQ === "string" && rawQ.trim() !== "" ? rawQ.trim() : undefined;

  const rawCredential = searchParams.credential;
  const parsedCredential =
    typeof rawCredential === "string"
      ? credentialSchema.safeParse(rawCredential)
      : undefined;

  return {
    q,
    credential: parsedCredential?.success ? parsedCredential.data : undefined,
  };
}

export type ProgramListItem = {
  school: Pick<
    typeof schema.schools.$inferSelect,
    "slug" | "name" | "city" | "state"
  >;
  program: Pick<
    typeof schema.programs.$inferSelect,
    "slug" | "name" | "credential" | "modality" | "latitude" | "longitude"
  >;
};

export function listPrograms(
  db: BetterSQLite3Database<typeof schema>,
  filters: ProgramListFilters,
): ProgramListItem[] {
  const conditions: SQL[] = [
    ne(schema.programs.status, "archived"),
    ne(schema.schools.status, "archived"),
  ];

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        like(schema.schools.name, pattern),
        like(schema.schools.city, pattern),
      )!,
    );
  }

  if (filters.credential) {
    conditions.push(eq(schema.programs.credential, filters.credential));
  }

  return db
    .select({
      school: {
        slug: schema.schools.slug,
        name: schema.schools.name,
        city: schema.schools.city,
        state: schema.schools.state,
      },
      program: {
        slug: schema.programs.slug,
        name: schema.programs.name,
        credential: schema.programs.credential,
        modality: schema.programs.modality,
        latitude: schema.programs.latitude,
        longitude: schema.programs.longitude,
      },
    })
    .from(schema.programs)
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(and(...conditions))
    .orderBy(schema.schools.name, schema.programs.name)
    .all();
}
