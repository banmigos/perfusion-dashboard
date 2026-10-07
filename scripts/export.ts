import path from "node:path";
import { db } from "../src/db/client";
import { exportAllSchools, writeBundles } from "./bundle-import/export";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = path.resolve(
  process.cwd(),
  outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1]! : "seed/schools",
);

const exported = exportAllSchools(db);
const files = writeBundles(exported, outDir);

for (const { warnings } of exported) {
  for (const warning of warnings) console.warn(`WARN  ${warning}`);
}
for (const file of files)
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
console.log(
  `\nExported ${files.length} school(s) to ${path.relative(process.cwd(), outDir) || "."}.`,
);
