import * as schema from "@/db/schema";
import type { TestDb } from "../integration/helpers/db";

export async function seedFixtureSchool(db: TestDb) {
  const [school] = await db
    .insert(schema.schools)
    .values({
      slug: "duke-university",
      name: "Duke University",
      city: "Durham",
      state: "NC",
      websiteUrl: "https://example.edu/duke-perfusion",
    })
    .returning();

  const [program] = await db
    .insert(schema.programs)
    .values({
      schoolId: school!.id,
      slug: "perfusion-ms",
      name: "MS in Cardiovascular Perfusion",
      credential: "MS",
      modality: "in_person",
    })
    .returning();

  const [cycle] = await db
    .insert(schema.applicationCycles)
    .values({
      programId: program!.id,
      cycleLabel: "2026-27",
      entryYear: 2027,
      deadlineDate: "2026-11-01",
      deadlineType: "firm",
    })
    .returning();

  const [requirement] = await db
    .insert(schema.requirements)
    .values({
      cycleId: cycle!.id,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
      unit: "gpa",
      isRequired: true,
    })
    .returning();

  const [prerequisite] = await db
    .insert(schema.prerequisiteCourses)
    .values({
      cycleId: cycle!.id,
      subject: "Anatomy & Physiology",
      minCredits: 4,
      labRequired: true,
    })
    .returning();

  const [tuition] = await db
    .insert(schema.tuitionEstimates)
    .values({
      programId: program!.id,
      cycleId: cycle!.id,
      residency: "in_state",
      amountCents: 4_600_000,
      covers: "per_year",
      asOfYear: 2026,
    })
    .returning();

  const [source] = await db
    .insert(schema.sources)
    .values({
      url: "https://example.edu/duke-perfusion/admissions",
      sourceType: "program_site",
    })
    .returning();

  const [claim] = await db
    .insert(schema.claims)
    .values({
      subjectTable: "requirements",
      subjectId: requirement!.id,
      fieldKey: "value_number",
      state: "known",
      sourceId: source!.id,
      quote: "Minimum cumulative GPA of 3.0 is required.",
      checkedAt: new Date(),
      verification: "verified",
    })
    .returning();

  return {
    school: school!,
    program: program!,
    cycle: cycle!,
    requirement: requirement!,
    prerequisite: prerequisite!,
    tuition: tuition!,
    source: source!,
    claim: claim!,
  };
}
