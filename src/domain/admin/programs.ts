import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type ProgramInput = {
  schoolId: number;
  slug: string;
  name: string;
  credential?: (typeof CREDENTIALS)[number] | null;
  modality?: (typeof MODALITIES)[number] | null;
  accreditationStatus?: string | null;
  caeAccredited?: boolean | null;
  programLengthMonths?: number | null;
  classSize?: number | null;
  websiteUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export type ProgramPatch = Partial<ProgramInput>;
export type Program = typeof schema.programs.$inferSelect;

export function createProgram(
  db: BetterSQLite3Database<typeof schema>,
  input: ProgramInput,
): Program {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.programs)
      .values({
        schoolId: input.schoolId,
        slug: input.slug,
        name: input.name,
        credential: input.credential ?? null,
        modality: input.modality ?? null,
        accreditationStatus: input.accreditationStatus ?? null,
        caeAccredited: input.caeAccredited ?? null,
        programLengthMonths: input.programLengthMonths ?? null,
        classSize: input.classSize ?? null,
        websiteUrl: input.websiteUrl ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "programs",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateProgram(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: ProgramPatch,
): Program {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    if (!before) {
      throw new Error(`program ${id} not found`);
    }

    tx.update(schema.programs)
      .set(patch)
      .where(eq(schema.programs.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "programs",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveProgram(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    if (!before) {
      throw new Error(`program ${id} not found`);
    }

    tx.update(schema.programs)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.programs.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "programs",
      subjectId: id,
      before,
      after,
    });
  });
}
