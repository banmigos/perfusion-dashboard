import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db/client";
import { parseBundle, type SchoolBundle } from "../src/domain/import/bundle";
import { formatPlan, summarizePlan } from "../src/domain/import/format";
import { runBundleImport } from "./bundle-import/apply";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArgs = args.filter((arg) => !arg.startsWith("--"));

if (fileArgs.length === 0) {
  console.error("usage: npm run import -- <bundle.json>... [--apply]");
  process.exit(2);
}

interface Loaded {
  label: string;
  hash: string;
  bundle: SchoolBundle;
}

// Validate every file before touching the database, so a typo in the last
// file cannot leave an earlier one applied.
const loaded: Loaded[] = [];
let invalid = 0;
for (const fileArg of fileArgs) {
  const filePath = path.resolve(process.cwd(), fileArg);
  const label = path.relative(process.cwd(), filePath);
  const bytes = fs.readFileSync(filePath);
  const parsed = parseBundle(JSON.parse(bytes.toString("utf-8")));
  if (!parsed.success) {
    invalid += 1;
    console.error(`${label} is not a valid school bundle:\n`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("");
    continue;
  }
  loaded.push({
    label,
    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    bundle: parsed.data,
  });
}
if (invalid > 0) {
  console.error(
    `ERRORS ${invalid} of ${fileArgs.length} file(s) invalid — nothing was read or written.`,
  );
  process.exit(1);
}

const many = loaded.length > 1;
const totals = { created: 0, updated: 0, conflicts: 0, unchanged: 0 };
for (const { label, hash, bundle } of loaded) {
  const report = runBundleImport(
    db,
    bundle,
    apply ? "apply" : "dry_run",
    label,
    hash,
  );
  const summary = summarizePlan(report.plan);
  totals.created += summary.created;
  totals.updated += summary.updated;
  totals.conflicts += summary.conflicts;
  totals.unchanged += summary.unchanged;

  if (many) {
    console.log(
      `${label}: create ${summary.created}, update ${summary.updated}, ` +
        `claims +${summary.claimsCreated}/~${summary.claimsUpdated}, ` +
        `conflicts ${summary.conflicts}, unchanged ${summary.unchanged}`,
    );
    continue;
  }
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}  (${label})\n`);
  console.log(formatPlan(report.plan));
  if (!apply) {
    console.log("\nDry run only — rolled back. Re-run with --apply to commit.");
  } else if (!report.committed) {
    console.log("\nNo changes — nothing written (no import batch recorded).");
  } else {
    console.log(
      `\nApplied in one transaction (import batch #${report.batchId}).`,
    );
  }
}

if (many) {
  console.log(
    `\n${apply ? "APPLY" : "DRY RUN"}: ${loaded.length} files valid. ` +
      `Rows created ${totals.created}, updated ${totals.updated}, ` +
      `conflicts ${totals.conflicts}, unchanged ${totals.unchanged}.`,
  );
  if (!apply) console.log("Dry run only — every file rolled back.");
}
