import { db } from "../src/db/client";
import { countUnhashed, httpFetcher, runSweep } from "./sweep/sweep";

// usage: npm run sweep -- [--dry-run] [--baseline]
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseline = args.includes("--baseline");

async function main(): Promise<void> {
  const { results } = await runSweep(db, httpFetcher, { dryRun, baseline });

  console.log(
    `Mode: ${dryRun ? "DRY RUN" : "APPLY"}${baseline ? " +baseline" : ""}\n`,
  );
  for (const r of results) {
    const detail =
      r.outcome === "error"
        ? r.error
        : r.outcome === "changed"
          ? `${r.demoted} verified claim(s) -> needs_review`
          : "";
    console.log(
      `${r.outcome.toUpperCase().padEnd(9)} ${r.url}  ${detail}`.trimEnd(),
    );
  }

  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  const demoted = results.reduce((n, r) => n + r.demoted, 0);
  console.log(
    `\nChecked ${results.length}: ${count("unchanged")} unchanged, ` +
      `${count("changed")} changed (${demoted} claims flagged), ` +
      `${count("baselined")} baselined, ${count("error")} errors.`,
  );

  const unhashed = countUnhashed(db);
  if (!baseline && unhashed > 0) {
    console.log(
      `${unhashed} source(s) have no content_hash and were skipped; run with --baseline to record one.`,
    );
  }
  if (count("error") > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(
    "Sweep FAILED:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
