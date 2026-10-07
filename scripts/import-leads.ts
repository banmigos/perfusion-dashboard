import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db/client";
import { leadCaptureSchema } from "./lead-import/schema";
import { runLeadImport } from "./lead-import/apply";

const DEFAULT_FILE = "seed/leads/2026-10-06-perfusionprep.json";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArg = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_FILE;
const filePath = path.resolve(process.cwd(), fileArg);
const sourceLabel = path.relative(process.cwd(), filePath);

const bytes = fs.readFileSync(filePath);
const fileHash = crypto.createHash("sha256").update(bytes).digest("hex");
const capture = leadCaptureSchema.parse(JSON.parse(bytes.toString("utf-8")));

const report = runLeadImport(
  db,
  capture,
  apply ? "apply" : "dry_run",
  sourceLabel,
  fileHash,
);

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}  (${sourceLabel})\n`);
for (const line of report.lines) {
  console.log(`${line.action.padEnd(9)} ${line.kind.padEnd(11)} ${line.label}`);
}
const { CREATE, APPEND, CONFLICT, UNCHANGED, KEEP } = report.counts;
console.log(
  `\nCREATE ${CREATE}, APPEND ${APPEND}, CONFLICT ${CONFLICT}, ` +
    `UNCHANGED ${UNCHANGED}, KEEP ${KEEP}; source created: ${report.sourceCreated ? "yes" : "no"}.`,
);
if (!apply) {
  console.log(
    "\nDry run only — no changes written. Re-run with --apply to commit.",
  );
} else if (!report.committed) {
  console.log("\nNo changes — nothing written (no import batch recorded).");
} else {
  console.log("\nApplied in one transaction.");
}
