import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

runMigrations(db);
console.log("Migrations applied.");
