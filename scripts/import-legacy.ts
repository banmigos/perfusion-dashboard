import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db/client";
import { legacyCaptureSchema } from "./legacy-import/schema";
import { buildImportPlan } from "./legacy-import/transform";
import { runLegacyImport } from "./legacy-import/apply";

const apply = process.argv.includes("--apply");
const filePath = path.join(process.cwd(), "seed/legacy/2025-26-aistudio.json");
const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
const capture = legacyCaptureSchema.parse(raw);

const plans = buildImportPlan(capture.records);
const report = runLegacyImport(db, plans, apply ? "apply" : "dry_run");

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);
for (const line of report.lines) {
  console.log(`${line.action.padEnd(6)} ${line.kind.padEnd(8)} ${line.label}`);
}
console.log(
  `\nCreated ${report.created.schools} schools, ${report.created.programs} programs, ` +
    `${report.created.sources} sources, ${report.created.requirements} requirements, ` +
    `${report.created.prerequisites} prerequisite_courses, ${report.created.claims} claims.`,
);
console.log(`Skipped ${report.skipped} already-imported programs.`);
if (!apply) {
  console.log("\nDry run only — no changes written. Re-run with --apply to commit.");
}
