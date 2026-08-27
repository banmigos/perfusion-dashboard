import "server-only";
import { and, desc, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";
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

export type ProgramDetail = {
  school: typeof schema.schools.$inferSelect;
  program: typeof schema.programs.$inferSelect;
  cycles: Array<{
    cycle: typeof schema.applicationCycles.$inferSelect;
    requirements: (typeof schema.requirements.$inferSelect)[];
    prerequisites: (typeof schema.prerequisiteCourses.$inferSelect)[];
  }>;
  tuitionEstimates: (typeof schema.tuitionEstimates.$inferSelect)[];
  claims: Map<string, ClaimWithSource>;
};

export function getProgramDetail(
  db: BetterSQLite3Database<typeof schema>,
  schoolSlug: string,
  programSlug: string,
): ProgramDetail | null {
  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) {
    return null;
  }

  const [program] = db
    .select()
    .from(schema.programs)
    .where(
      and(
        eq(schema.programs.schoolId, school.id),
        eq(schema.programs.slug, programSlug),
      ),
    )
    .all();
  if (!program) {
    return null;
  }

  const cycleRows = db
    .select()
    .from(schema.applicationCycles)
    .where(eq(schema.applicationCycles.programId, program.id))
    .orderBy(desc(schema.applicationCycles.cycleLabel))
    .all();
  const cycleIds = cycleRows.map((c) => c.id);

  const requirementRows = cycleIds.length
    ? db
        .select()
        .from(schema.requirements)
        .where(inArray(schema.requirements.cycleId, cycleIds))
        .all()
    : [];
  const prerequisiteRows = cycleIds.length
    ? db
        .select()
        .from(schema.prerequisiteCourses)
        .where(inArray(schema.prerequisiteCourses.cycleId, cycleIds))
        .all()
    : [];
  const tuitionRows = db
    .select()
    .from(schema.tuitionEstimates)
    .where(eq(schema.tuitionEstimates.programId, program.id))
    .all();

  const cycles = cycleRows.map((cycle) => ({
    cycle,
    requirements: requirementRows.filter((r) => r.cycleId === cycle.id),
    prerequisites: prerequisiteRows.filter((p) => p.cycleId === cycle.id),
  }));

  const subjects: SubjectRef[] = [
    { subjectTable: "schools", subjectId: school.id },
    { subjectTable: "programs", subjectId: program.id },
    ...cycleRows.map((c) => ({
      subjectTable: "application_cycles" as const,
      subjectId: c.id,
    })),
    ...requirementRows.map((r) => ({
      subjectTable: "requirements" as const,
      subjectId: r.id,
    })),
    ...prerequisiteRows.map((p) => ({
      subjectTable: "prerequisite_courses" as const,
      subjectId: p.id,
    })),
    ...tuitionRows.map((t) => ({
      subjectTable: "tuition_estimates" as const,
      subjectId: t.id,
    })),
  ];

  return {
    school,
    program,
    cycles,
    tuitionEstimates: tuitionRows,
    claims: loadClaims(db, subjects),
  };
}
