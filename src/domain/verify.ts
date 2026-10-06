import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { SubjectTable } from "./claims";
import { CURRENT_USER_ID } from "./user";

export type VerifyQueueItem = {
  claim: typeof schema.claims.$inferSelect;
  source: typeof schema.sources.$inferSelect | null;
  subjectLabel: string;
  school: { slug: string; name: string } | null;
  // `id` is carried so listVerifyQueue can check saved-programs membership.
  program: { slug: string; name: string; id: number } | null;
  deadlineDate: string | null;
  isSaved: boolean;
};

type SubjectContext = {
  school: { slug: string; name: string } | null;
  program: { slug: string; name: string; id: number } | null;
  deadlineDate: string | null;
  subjectLabel: string;
};

function resolveSubjectContext(
  db: BetterSQLite3Database<typeof schema>,
  subjectTable: SubjectTable,
  subjectId: number,
): SubjectContext {
  const empty: SubjectContext = {
    school: null,
    program: null,
    deadlineDate: null,
    subjectLabel: `${subjectTable} ${subjectId}`,
  };

  if (subjectTable === "schools") {
    const [school] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, subjectId))
      .all();
    if (!school) return empty;
    return {
      school: { slug: school.slug, name: school.name },
      program: null,
      deadlineDate: null,
      subjectLabel: school.name,
    };
  }

  if (subjectTable === "programs") {
    const [row] = db
      .select({ program: schema.programs, school: schema.schools })
      .from(schema.programs)
      .innerJoin(
        schema.schools,
        eq(schema.programs.schoolId, schema.schools.id),
      )
      .where(eq(schema.programs.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: {
        slug: row.program.slug,
        name: row.program.name,
        id: row.program.id,
      },
      deadlineDate: null,
      subjectLabel: row.program.name,
    };
  }

  if (subjectTable === "application_cycles") {
    const [row] = db
      .select({
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.applicationCycles)
      .innerJoin(
        schema.programs,
        eq(schema.applicationCycles.programId, schema.programs.id),
      )
      .innerJoin(
        schema.schools,
        eq(schema.programs.schoolId, schema.schools.id),
      )
      .where(eq(schema.applicationCycles.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: {
        slug: row.program.slug,
        name: row.program.name,
        id: row.program.id,
      },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: `${row.program.name} — ${row.cycle.cycleLabel}`,
    };
  }

  if (subjectTable === "requirements") {
    const [row] = db
      .select({
        requirement: schema.requirements,
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.requirements)
      .innerJoin(
        schema.applicationCycles,
        eq(schema.requirements.cycleId, schema.applicationCycles.id),
      )
      .innerJoin(
        schema.programs,
        eq(schema.applicationCycles.programId, schema.programs.id),
      )
      .innerJoin(
        schema.schools,
        eq(schema.programs.schoolId, schema.schools.id),
      )
      .where(eq(schema.requirements.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: {
        slug: row.program.slug,
        name: row.program.name,
        id: row.program.id,
      },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: row.requirement.label,
    };
  }

  if (subjectTable === "prerequisite_courses") {
    const [row] = db
      .select({
        prereq: schema.prerequisiteCourses,
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.prerequisiteCourses)
      .innerJoin(
        schema.applicationCycles,
        eq(schema.prerequisiteCourses.cycleId, schema.applicationCycles.id),
      )
      .innerJoin(
        schema.programs,
        eq(schema.applicationCycles.programId, schema.programs.id),
      )
      .innerJoin(
        schema.schools,
        eq(schema.programs.schoolId, schema.schools.id),
      )
      .where(eq(schema.prerequisiteCourses.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: {
        slug: row.program.slug,
        name: row.program.name,
        id: row.program.id,
      },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: row.prereq.subject,
    };
  }

  // subjectTable === "tuition_estimates"
  const [row] = db
    .select({
      tuition: schema.tuitionEstimates,
      program: schema.programs,
      school: schema.schools,
    })
    .from(schema.tuitionEstimates)
    .innerJoin(
      schema.programs,
      eq(schema.tuitionEstimates.programId, schema.programs.id),
    )
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(eq(schema.tuitionEstimates.id, subjectId))
    .all();
  if (!row) return empty;
  return {
    school: { slug: row.school.slug, name: row.school.name },
    program: {
      slug: row.program.slug,
      name: row.program.name,
      id: row.program.id,
    },
    deadlineDate: null,
    subjectLabel: `tuition (${row.tuition.residency})`,
  };
}

function tier(item: VerifyQueueItem): 0 | 1 | 2 {
  if (item.isSaved && item.deadlineDate) return 0;
  if (item.isSaved) return 1;
  return 2;
}

export function listVerifyQueue(
  db: BetterSQLite3Database<typeof schema>,
): VerifyQueueItem[] {
  const rows = db
    .select({ claim: schema.claims, source: schema.sources })
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(
      inArray(schema.claims.verification, ["draft", "needs_review", "stale"]),
    )
    .all();

  const savedProgramIds = new Set(
    db
      .select({ programId: schema.savedPrograms.programId })
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.userId, CURRENT_USER_ID))
      .all()
      .map((r) => r.programId),
  );

  const items: VerifyQueueItem[] = rows.map(({ claim, source }) => {
    const ctx = resolveSubjectContext(db, claim.subjectTable, claim.subjectId);
    return {
      claim,
      source,
      subjectLabel: ctx.subjectLabel,
      school: ctx.school,
      program: ctx.program,
      deadlineDate: ctx.deadlineDate,
      isSaved: ctx.program !== null && savedProgramIds.has(ctx.program.id),
    };
  });

  return items.sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) {
      const byDeadline = (a.deadlineDate ?? "").localeCompare(
        b.deadlineDate ?? "",
      );
      if (byDeadline !== 0) return byDeadline;
    }
    return a.subjectLabel.localeCompare(b.subjectLabel);
  });
}
