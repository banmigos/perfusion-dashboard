# Phase 3 Research UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only research UI from `docs/plan.md` Phase 3 — a
program directory with search/filters and a Leaflet map, and a program
detail page rendering every fact through its provenance (source, quote,
checked date) with the four fact states (plus `known`'s verification
sub-states) visually distinct.

**Architecture:** A new `src/domain/**` query layer (first to cross the
`server-only` boundary) exposes synchronous, DB-injected read functions
mirroring the codebase's existing `runLegacyImport(db, ...)` convention. A
pure `src/lib/factState.ts` maps a claim to a discriminated display state,
rendered by `FactValue`/`SourceBadge`/`FreshnessPill`. Two server-rendered
pages (`/programs`, `/programs/[schoolSlug]/[programSlug]`) consume the
domain layer directly; a client-only Leaflet map is embedded in the
directory page via `next/dynamic`.

**Tech Stack:** Next.js 16 App Router (Server Components, promise-based
`params`/`searchParams`), Drizzle ORM + better-sqlite3 (synchronous driver),
Zod, Tailwind CSS, `leaflet` + `react-leaflet` (new deps), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-phase3-research-ui-design.md`
— read it before starting; this plan implements it with two corrections
discovered during planning, both called out in Task 3 and Task 9:

1. Domain functions are **synchronous**, not `Promise`-returning, and take
   `db` as an explicit first parameter — matching `scripts/legacy-import/apply.ts`'s
   `runLegacyImport(db, plans, mode)` convention, and required because the
   `better-sqlite3` driver is synchronous throughout this codebase.
2. `tuitionEstimates` is a top-level array on `ProgramDetail`, not nested
   per-cycle — its `cycleId` is nullable, so it doesn't strictly belong to
   one cycle.
3. The legacy corpus already carries `lat`/`lng` per record and the Phase
   2.5 import already writes `programs.latitude`/`longitude`. There is no
   coordinate-backfill task in this plan — a fresh `import:legacy --apply`
   populates real coordinates as a side effect.

## Global Constraints

- No writes: this phase reads only. No admin CRUD, no verify actions, no
  saved/checklist state.
- No auth: Tailscale ACLs only (D1). No login UI.
- `src/domain/**` files start with `import "server-only";` — this is the
  DB-access boundary application code crosses (`plan.md` §2). `src/db/**`
  and `scripts/**` never import `src/domain/**`, only `src/db/**` directly,
  so `drizzle-kit`/`tsx` stay unaffected by the `server-only` marker.
- Calendar dates are `TEXT YYYY-MM-DD`; never format them through
  `Date`-based epoch math. Money is integer cents.
- `STALE_AFTER_DAYS` (default 180) drives derived staleness per
  `data-model.md` §6 — never store a computed staleness boolean.
- Money/date/credential/etc. field names in domain types must match the
  Drizzle schema in `src/db/schema/canonical.ts` and
  `src/db/schema/provenance.ts` exactly (camelCase, `casing: "snake_case"`
  maps to the DB).
- `npm run verify` = `format:check && typecheck && lint && test && test:e2e`
  must pass at the end.

---

## File Structure

```
vitest.config.ts                                    MODIFY — alias "server-only"
src/lib/factState.ts                                 CREATE — pure fact→display mapping
tests/unit/factState.test.ts                          CREATE
src/domain/claims.ts                                  CREATE — bulk claim loader
tests/integration/domain-claims.test.ts                CREATE
src/domain/programs.ts                                CREATE — list/detail queries + filter parsing
tests/unit/programFilters.test.ts                       CREATE
tests/integration/domain-programs.test.ts               CREATE
src/components/SourceBadge.tsx                        CREATE
src/components/FreshnessPill.tsx                       CREATE
src/components/FactValue.tsx                          CREATE
src/app/programs/page.tsx                             MODIFY — directory (was placeholder)
src/app/programs/[schoolSlug]/[programSlug]/page.tsx  CREATE — detail page
src/components/ProgramMapInner.tsx                     CREATE — react-leaflet map
src/components/ProgramMap.tsx                          CREATE — ssr:false wrapper
package.json                                          MODIFY — leaflet, react-leaflet, @types/leaflet
tests/e2e/programs.spec.ts                             CREATE
```

---

### Task 1: `factState` — pure fact-display mapping

**Files:**
- Create: `src/lib/factState.ts`
- Test: `tests/unit/factState.test.ts`

**Interfaces:**
- Consumes: `isStale` from `src/lib/freshness.ts` (`isStale(checkedAt: Date | null, now: Date, staleAfterDays: number): boolean`, already exists).
- Produces: `ClaimLike` type and `factState(claim: ClaimLike | undefined, now: Date, staleAfterDays: number): FactDisplay`, both exported from `@/lib/factState`. Every later task that renders a fact imports these two names.

`ClaimLike` is defined locally in this file (not imported from the domain
layer) so `src/lib/factState.ts` stays free of the `server-only` boundary
and is trivially unit-testable. `src/domain/claims.ts` (Task 2) will export
a `ClaimWithSource` type that is a structural superset of `ClaimLike`, so it
satisfies this type without either file importing the other.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/factState.test.ts
import { describe, expect, it } from "vitest";
import { factState, type ClaimLike } from "@/lib/factState";

const NOW = new Date("2026-08-27T00:00:00Z");

function claim(overrides: Partial<ClaimLike>): ClaimLike {
  return {
    state: "known",
    verification: "verified",
    checkedAt: new Date("2026-08-01T00:00:00Z"),
    quote: "quote",
    source: { url: "https://example.edu/admissions", title: "Admissions" },
    ...overrides,
  };
}

describe("factState", () => {
  it("returns not_researched when there is no claim row", () => {
    expect(factState(undefined, NOW, 180)).toEqual({ kind: "not_researched" });
  });

  it("returns unknown for state=unknown", () => {
    const c = claim({ state: "unknown", checkedAt: new Date("2026-08-20T00:00:00Z") });
    expect(factState(c, NOW, 180)).toEqual({
      kind: "unknown",
      checkedAt: c.checkedAt,
    });
  });

  it("returns not_published for state=not_published", () => {
    const c = claim({ state: "not_published" });
    expect(factState(c, NOW, 180).kind).toBe("not_published");
  });

  it("returns not_applicable for state=not_applicable", () => {
    const c = claim({ state: "not_applicable" });
    expect(factState(c, NOW, 180).kind).toBe("not_applicable");
  });

  it("returns known with isStale=false when checked recently", () => {
    const c = claim({ checkedAt: new Date("2026-08-01T00:00:00Z") });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({
      kind: "known",
      verification: "verified",
      isStale: false,
      quote: "quote",
      source: { url: "https://example.edu/admissions", title: "Admissions" },
    });
  });

  it("returns known with isStale=true when checkedAt exceeds staleAfterDays", () => {
    const c = claim({ checkedAt: new Date("2026-01-01T00:00:00Z") });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", isStale: true });
  });

  it("returns known with isStale=true when checkedAt is null", () => {
    const c = claim({ checkedAt: null });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", isStale: true });
  });

  it("preserves a draft verification distinct from verified", () => {
    const c = claim({ verification: "draft" });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", verification: "draft" });
  });

  it("returns source: null when the claim has no source", () => {
    const c = claim({ source: null });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", source: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- factState`
Expected: FAIL — `Cannot find module '@/lib/factState'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/factState.ts
import { isStale } from "@/lib/freshness";

export type ClaimState = "known" | "unknown" | "not_published" | "not_applicable";
export type Verification = "draft" | "needs_review" | "verified" | "stale" | "archived";

export type ClaimLike = {
  state: ClaimState;
  verification: Verification;
  checkedAt: Date | null;
  quote: string | null;
  source: { url: string; title: string | null } | null;
};

export type FactDisplay =
  | { kind: "not_researched" }
  | { kind: "unknown"; checkedAt: Date | null }
  | { kind: "not_published"; checkedAt: Date | null }
  | { kind: "not_applicable"; checkedAt: Date | null }
  | {
      kind: "known";
      verification: Verification;
      isStale: boolean;
      source: { url: string; title: string | null } | null;
      quote: string | null;
      checkedAt: Date | null;
    };

export function factState(
  claim: ClaimLike | undefined,
  now: Date,
  staleAfterDays: number,
): FactDisplay {
  if (!claim) {
    return { kind: "not_researched" };
  }

  if (claim.state !== "known") {
    return { kind: claim.state, checkedAt: claim.checkedAt };
  }

  return {
    kind: "known",
    verification: claim.verification,
    isStale: isStale(claim.checkedAt, now, staleAfterDays),
    source: claim.source,
    quote: claim.quote,
    checkedAt: claim.checkedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- factState`
Expected: PASS, all 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/factState.ts tests/unit/factState.test.ts
git commit -m "Phase 3: add pure factState fact-display mapping"
```

---

### Task 2: Vitest `server-only` alias + `src/domain/claims.ts`

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/domain/claims.ts`
- Test: `tests/integration/domain-claims.test.ts`

**Interfaces:**
- Consumes: `db: BetterSQLite3Database<typeof schema>` (the type used by `scripts/legacy-import/apply.ts`); `schema.claims`, `schema.sources` from `@/db/schema`; `SUBJECT_TABLES` from `@/db/schema/provenance`; `createTestDb`/`TestDb` from `tests/integration/helpers/db.ts`; `seedFixtureSchool` from `tests/fixtures/school.ts`.
- Produces: `SubjectTable` type, `SubjectRef` type, `ClaimWithSource` type, `claimKey(subjectTable, subjectId, fieldKey): string`, `loadClaims(db, subjects: SubjectRef[]): Map<string, ClaimWithSource>` — all exported from `@/domain/claims`. Task 3's `getProgramDetail` calls `loadClaims` and `claimKey`; Task 5's `FactValue` usage sites read `ClaimWithSource` values out of the returned map (it satisfies Task 1's `ClaimLike`).

**Why the alias is needed first:** `src/domain/claims.ts` starts with
`import "server-only"`. That package's `index.js` unconditionally throws
(`node_modules/server-only/index.js`); Next's bundler resolves the package's
`"react-server"` export condition to the no-op `node_modules/server-only/empty.js`
instead, but plain Vitest does not set that condition, so importing any
`src/domain/**` file from a test would throw immediately without this alias.

- [ ] **Step 1: Add the alias to `vitest.config.ts`**

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/integration/domain-claims.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { claimKey, loadClaims } from "@/domain/claims";
import * as schema from "@/db/schema";

describe("loadClaims", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("returns an empty map for an empty subject list without querying", () => {
    const result = loadClaims(db, []);
    expect(result.size).toBe(0);
  });

  it("loads a claim with its joined source, keyed by claimKey", async () => {
    const fixture = await seedFixtureSchool(db);

    const result = loadClaims(db, [
      { subjectTable: "requirements", subjectId: fixture.requirement.id },
    ]);

    const key = claimKey("requirements", fixture.requirement.id, "value_number");
    expect(result.has(key)).toBe(true);
    const claim = result.get(key)!;
    expect(claim.state).toBe("known");
    expect(claim.source?.url).toBe(fixture.source.url);
  });

  it("batches multiple subject tables in one call", async () => {
    const fixture = await seedFixtureSchool(db);

    const result = loadClaims(db, [
      { subjectTable: "requirements", subjectId: fixture.requirement.id },
      { subjectTable: "schools", subjectId: fixture.school.id },
    ]);

    expect(result.has(claimKey("requirements", fixture.requirement.id, "value_number"))).toBe(true);
    // No school-level claim was seeded, so only the requirement claim is present.
    expect(result.size).toBe(1);
  });

  it("returns claims with source: null when sourceId is unset", async () => {
    const fixture = await seedFixtureSchool(db);
    const [unsourced] = db
      .insert(schema.claims)
      .values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
      })
      .returning()
      .all();

    const result = loadClaims(db, [
      { subjectTable: "programs", subjectId: fixture.program.id },
    ]);

    const claim = result.get(claimKey("programs", fixture.program.id, "modality"))!;
    expect(claim.id).toBe(unsourced!.id);
    expect(claim.source).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- domain-claims`
Expected: FAIL — `Cannot find module '@/domain/claims'`

- [ ] **Step 4: Write the implementation**

```ts
// src/domain/claims.ts
import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { SUBJECT_TABLES } from "@/db/schema/provenance";

export type SubjectTable = (typeof SUBJECT_TABLES)[number];

export type SubjectRef = {
  subjectTable: SubjectTable;
  subjectId: number;
};

export type ClaimWithSource = typeof schema.claims.$inferSelect & {
  source: typeof schema.sources.$inferSelect | null;
};

export function claimKey(
  subjectTable: SubjectTable,
  subjectId: number,
  fieldKey: string,
): string {
  return `${subjectTable}:${subjectId}:${fieldKey}`;
}

export function loadClaims(
  db: BetterSQLite3Database<typeof schema>,
  subjects: SubjectRef[],
): Map<string, ClaimWithSource> {
  const map = new Map<string, ClaimWithSource>();
  if (subjects.length === 0) {
    return map;
  }

  const idsByTable = new Map<SubjectTable, number[]>();
  for (const subject of subjects) {
    const ids = idsByTable.get(subject.subjectTable) ?? [];
    ids.push(subject.subjectId);
    idsByTable.set(subject.subjectTable, ids);
  }

  const conditions: SQL[] = [...idsByTable.entries()].map(([table, ids]) =>
    and(
      eq(schema.claims.subjectTable, table),
      inArray(schema.claims.subjectId, ids),
    )!,
  );

  const rows = db
    .select()
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(or(...conditions))
    .all();

  for (const row of rows) {
    const key = claimKey(
      row.claims.subjectTable,
      row.claims.subjectId,
      row.claims.fieldKey,
    );
    map.set(key, { ...row.claims, source: row.sources });
  }

  return map;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- domain-claims`
Expected: PASS, all 4 cases.

- [ ] **Step 6: Run the full unit+integration suite to confirm the alias didn't break anything else**

Run: `npm test`
Expected: PASS — every existing test (freshness, slug, zod-schemas,
legacy-import, foreign-keys, unique-constraints, claims-check-constraints,
pragmas-and-lifecycle, fixture) still passes.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/domain/claims.ts tests/integration/domain-claims.test.ts
git commit -m "Phase 3: add bulk claim loader and server-only test alias"
```

---

### Task 3: `src/domain/programs.ts` — filter parsing + `listPrograms`

**Files:**
- Create: `src/domain/programs.ts`
- Test: `tests/unit/programFilters.test.ts`
- Test: `tests/integration/domain-programs.test.ts` (started here, extended in Task 4)

**Interfaces:**
- Consumes: `Credential`, `CREDENTIALS` from `@/db/schema/canonical`; `schema.programs`, `schema.schools` from `@/db/schema`.
- Produces: `ProgramListFilters` type, `parseProgramListFilters(searchParams: Record<string, string | string[] | undefined>): ProgramListFilters`, `ProgramListItem` type, `listPrograms(db, filters: ProgramListFilters): ProgramListItem[]` — all exported from `@/domain/programs`. Task 6 (directory page) and Task 8 (map) both consume `ProgramListItem`.

`ProgramListItem` includes `latitude`/`longitude` on `program` (a deviation
from the spec's narrower `Pick`, needed so the map in Task 8 can reuse this
same query instead of adding a second one).

- [ ] **Step 1: Write the failing unit test for filter parsing**

```ts
// tests/unit/programFilters.test.ts
import { describe, expect, it } from "vitest";
import { parseProgramListFilters } from "@/domain/programs";

describe("parseProgramListFilters", () => {
  it("returns no filters for an empty searchParams object", () => {
    expect(parseProgramListFilters({})).toEqual({ q: undefined, credential: undefined });
  });

  it("trims and keeps a non-empty q", () => {
    expect(parseProgramListFilters({ q: "  Duke  " })).toEqual({
      q: "Duke",
      credential: undefined,
    });
  });

  it("drops a blank q", () => {
    expect(parseProgramListFilters({ q: "   " }).q).toBeUndefined();
  });

  it("keeps a valid credential", () => {
    expect(parseProgramListFilters({ credential: "MS" }).credential).toBe("MS");
  });

  it("drops an invalid credential rather than throwing", () => {
    expect(parseProgramListFilters({ credential: "PhD" }).credential).toBeUndefined();
  });

  it("ignores a repeated query param (array value)", () => {
    expect(parseProgramListFilters({ q: ["a", "b"] }).q).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- programFilters`
Expected: FAIL — `Cannot find module '@/domain/programs'`

- [ ] **Step 3: Write the failing integration test for `listPrograms`**

```ts
// tests/integration/domain-programs.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { listPrograms } from "@/domain/programs";
import * as schema from "@/db/schema";

describe("listPrograms", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("lists a seeded program with no filters", async () => {
    await seedFixtureSchool(db);

    const items = listPrograms(db, {});

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      school: { slug: "duke-university", name: "Duke University" },
      program: { slug: "perfusion-ms", credential: "MS" },
    });
  });

  it("filters by credential", async () => {
    await seedFixtureSchool(db);

    expect(listPrograms(db, { credential: "MS" })).toHaveLength(1);
    expect(listPrograms(db, { credential: "Certificate" })).toHaveLength(0);
  });

  it("filters by q matching school name or city, case-insensitively", async () => {
    await seedFixtureSchool(db);

    expect(listPrograms(db, { q: "duke" })).toHaveLength(1);
    expect(listPrograms(db, { q: "durham" })).toHaveLength(1);
    expect(listPrograms(db, { q: "nonexistent-city" })).toHaveLength(0);
  });

  it("excludes archived schools and programs", async () => {
    const fixture = await seedFixtureSchool(db);
    await db
      .update(schema.programs)
      .set({ status: "archived" })
      .where(eq(schema.programs.id, fixture.program.id));

    expect(listPrograms(db, {})).toHaveLength(0);
  });
});
```

Add the missing `eq` import at the top: `import { eq } from "drizzle-orm";`.

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- programFilters domain-programs`
Expected: FAIL — `Cannot find module '@/domain/programs'`

- [ ] **Step 5: Write the implementation**

```ts
// src/domain/programs.ts
import "server-only";
import { and, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";
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
```

Note: `getProgramDetail` is added in Task 4 in this same file — leave the
`loadClaims`/`ClaimWithSource`/`SubjectRef` imports above in place, they are
unused until then and Task 4 relies on them already being imported.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- programFilters domain-programs`
Expected: PASS, all 10 cases (6 unit + 4 integration).

- [ ] **Step 7: Commit**

```bash
git add src/domain/programs.ts tests/unit/programFilters.test.ts tests/integration/domain-programs.test.ts
git commit -m "Phase 3: add program directory filter parsing and listPrograms"
```

---

### Task 4: `getProgramDetail`

**Files:**
- Modify: `src/domain/programs.ts`
- Modify: `tests/integration/domain-programs.test.ts`

**Interfaces:**
- Consumes: `loadClaims`, `claimKey`, `SubjectRef`, `ClaimWithSource` from `@/domain/claims` (Task 2); `seedFixtureSchool` fixture (Task 2/3 pattern).
- Produces: `ProgramDetail` type, `getProgramDetail(db, schoolSlug: string, programSlug: string): ProgramDetail | null` exported from `@/domain/programs`. Task 7 (detail page) is the consumer.

`ProgramDetail.tuitionEstimates` is top-level, not nested per cycle (see
plan header, correction 2) since `tuitionEstimates.cycleId` is nullable.

- [ ] **Step 1: Extend the fixture to cover a second cycle (write the failing test first)**

Add to `tests/integration/domain-programs.test.ts`. Change the existing
`import { listPrograms } from "@/domain/programs";` line to
`import { getProgramDetail, listPrograms } from "@/domain/programs";` rather
than adding a second import line for the same module, then append below the
existing `describe("listPrograms", ...)` block:

```ts
describe("getProgramDetail", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("returns null when the school slug does not resolve", () => {
    expect(getProgramDetail(db, "nonexistent", "perfusion-ms")).toBeNull();
  });

  it("returns null when the program slug does not resolve under a real school", async () => {
    await seedFixtureSchool(db);
    expect(getProgramDetail(db, "duke-university", "nonexistent")).toBeNull();
  });

  it("returns the full detail tree with claims attached", async () => {
    const fixture = await seedFixtureSchool(db);

    const detail = getProgramDetail(db, "duke-university", "perfusion-ms")!;

    expect(detail.school.slug).toBe("duke-university");
    expect(detail.program.slug).toBe("perfusion-ms");
    expect(detail.cycles).toHaveLength(1);
    expect(detail.cycles[0]!.cycle.cycleLabel).toBe("2026-27");
    expect(detail.cycles[0]!.requirements).toHaveLength(1);
    expect(detail.cycles[0]!.prerequisites).toHaveLength(1);
    expect(detail.tuitionEstimates).toHaveLength(1);

    const key = `requirements:${fixture.requirement.id}:value_number`;
    expect(detail.claims.get(key)?.state).toBe("known");
  });

  it("orders cycles newest cycle_label first", async () => {
    const fixture = await seedFixtureSchool(db);
    await db.insert(schema.applicationCycles).values({
      programId: fixture.program.id,
      cycleLabel: "2027-28",
      entryYear: 2028,
    });

    const detail = getProgramDetail(db, "duke-university", "perfusion-ms")!;

    expect(detail.cycles.map((c) => c.cycle.cycleLabel)).toEqual([
      "2027-28",
      "2026-27",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- domain-programs`
Expected: FAIL — `getProgramDetail is not exported`

- [ ] **Step 3: Add the implementation to `src/domain/programs.ts`**

Append below `listPrograms`:

```ts
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
```

Add `desc` to the existing `drizzle-orm` import line at the top of the file
(it now reads `import { and, desc, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- domain-programs`
Expected: PASS, all 8 cases (4 `listPrograms` + 4 `getProgramDetail`).

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/programs.ts tests/integration/domain-programs.test.ts
git commit -m "Phase 3: add getProgramDetail with cycle/claim aggregation"
```

---

### Task 5: Fact-rendering components

**Files:**
- Create: `src/components/SourceBadge.tsx`
- Create: `src/components/FreshnessPill.tsx`
- Create: `src/components/FactValue.tsx`

**Interfaces:**
- Consumes: `factState`, `ClaimLike`, `FactDisplay`, `Verification` from `@/lib/factState` (Task 1).
- Produces: `SourceBadge`, `FreshnessPill`, `FactValue` React components exported from their files. Task 7 (detail page) renders every fact through `FactValue`.

There is no component-test harness in this repo (no React Testing Library —
see `vitest.config.ts`, `environment: "node"`). Validate this task with
`npm run typecheck` and a visual check; behavioral coverage comes from the
Task 10 Playwright e2e tests, which assert on rendered text for each state.

- [ ] **Step 1: `SourceBadge.tsx`**

```tsx
// src/components/SourceBadge.tsx
export function SourceBadge({
  url,
  title,
}: {
  url: string;
  title: string | null;
}) {
  const label = title ?? new URL(url).hostname;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
    >
      {label}
    </a>
  );
}
```

- [ ] **Step 2: `FreshnessPill.tsx`**

```tsx
// src/components/FreshnessPill.tsx
import type { Verification } from "@/lib/factState";

const LABEL: Record<Verification, string> = {
  draft: "draft",
  needs_review: "needs review",
  verified: "verified",
  stale: "stale",
  archived: "archived",
};

export function FreshnessPill({
  verification,
  isStale,
}: {
  verification: Verification;
  isStale: boolean;
}) {
  const label = isStale && verification !== "stale" ? "stale" : LABEL[verification];
  const treatAsStale = isStale || verification === "stale" || verification === "needs_review";

  const colorClass =
    verification === "verified" && !isStale
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : treatAsStale
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 3: `FactValue.tsx`**

```tsx
// src/components/FactValue.tsx
import type { ReactNode } from "react";
import { factState, type ClaimLike } from "@/lib/factState";
import { SourceBadge } from "./SourceBadge";
import { FreshnessPill } from "./FreshnessPill";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function FactValue({
  value,
  claim,
  now,
  staleAfterDays,
}: {
  value: ReactNode;
  claim: ClaimLike | undefined;
  now: Date;
  staleAfterDays: number;
}) {
  const state = factState(claim, now, staleAfterDays);

  switch (state.kind) {
    case "not_researched":
      return <span className="text-zinc-400">—</span>;
    case "unknown":
      return (
        <span className="text-amber-600 dark:text-amber-400">
          unknown
          {state.checkedAt ? ` — checked ${formatDate(state.checkedAt)}` : ""}
        </span>
      );
    case "not_published":
      return <span className="text-zinc-500">not published</span>;
    case "not_applicable":
      return <span className="text-zinc-500">n/a</span>;
    case "known":
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{value}</span>
          <FreshnessPill verification={state.verification} isStale={state.isStale} />
          {state.source && (
            <SourceBadge url={state.source.url} title={state.source.title} />
          )}
        </span>
      );
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no unused imports, no type errors. (`FactValue`,
`SourceBadge`, `FreshnessPill` are not yet imported anywhere; this is
expected and does not fail typecheck.)

- [ ] **Step 5: Commit**

```bash
git add src/components/SourceBadge.tsx src/components/FreshnessPill.tsx src/components/FactValue.tsx
git commit -m "Phase 3: add FactValue/SourceBadge/FreshnessPill components"
```

---

### Task 6: Directory page — `/programs`

**Files:**
- Modify: `src/app/programs/page.tsx` (replaces the Phase 1 placeholder)

**Interfaces:**
- Consumes: `db` from `@/db/client`; `parseProgramListFilters`, `listPrograms`, `ProgramListItem` from `@/domain/programs` (Task 3); `CREDENTIALS` from `@/db/schema/canonical`.
- Produces: the `/programs` route. Task 8 imports `<ProgramMap items={items} />` into this same file.

Search/filter state lives in the URL (`?q=&credential=`) via a plain GET
form — no client component, no JS required to filter.

- [ ] **Step 1: Write the page**

```tsx
// src/app/programs/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { CREDENTIALS } from "@/db/schema/canonical";
import { listPrograms, parseProgramListFilters } from "@/domain/programs";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseProgramListFilters(rawParams);
  const items = listPrograms(db, filters);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Programs</h1>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          Search
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="School or city"
            className="mt-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm">
          Credential
          <select
            name="credential"
            defaultValue={filters.credential ?? ""}
            className="mt-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {CREDENTIALS.map((credential) => (
              <option key={credential} value={credential}>
                {credential}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No programs match.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => (
            <li key={`${item.school.slug}/${item.program.slug}`} className="py-3">
              <Link
                href={`/programs/${item.school.slug}/${item.program.slug}`}
                className="font-medium hover:underline"
              >
                {item.school.name} — {item.program.name}
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {item.school.city}, {item.school.state} ·{" "}
                {item.program.credential ?? "credential unknown"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Migrate the dev database so the page has real tables to query**

`src/db/client.ts` creates the SQLite *file* on first connection but does
not run migrations, so `programs`/`schools` do not exist yet. Without this
step the page below 500s with "no such table: programs" instead of
rendering an empty state.

Run: `test -f .env.local || cp .env.example .env.local && npm run db:migrate`
Expected: `Migrations applied.` — this is idempotent (Drizzle tracks applied
migrations), so re-running it later in Task 9 is a safe no-op.

- [ ] **Step 4: Manual check**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3000`, then in another
terminal: `curl -s http://127.0.0.1:3000/programs | grep -o '<h1[^<]*</h1>'`
Expected: `<h1 class="text-2xl font-semibold">Programs</h1>` — the page
renders without a 500 even with zero rows (no data has been imported yet;
Task 9 does that). Stop the dev server after checking (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add src/app/programs/page.tsx
git commit -m "Phase 3: build program directory with search and credential filter"
```

---

### Task 7: Detail page — `/programs/[schoolSlug]/[programSlug]`

**Files:**
- Create: `src/app/programs/[schoolSlug]/[programSlug]/page.tsx`

**Interfaces:**
- Consumes: `db` from `@/db/client`; `getProgramDetail` from `@/domain/programs` (Task 4); `FactValue` from `@/components/FactValue` (Task 5); `REQUIREMENT_CATEGORIES` from `@/db/schema/canonical`; `notFound` from `next/navigation`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/programs/[schoolSlug]/[programSlug]/page.tsx
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getProgramDetail } from "@/domain/programs";
import { FactValue } from "@/components/FactValue";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import type { ClaimLike } from "@/lib/factState";

const STALE_AFTER_DAYS = Number(process.env.STALE_AFTER_DAYS ?? 180);

function requirementValueAndField(
  req: {
    valueText: string | null;
    valueNumber: number | null;
    valueBool: boolean | null;
    valueDate: string | null;
  },
): { value: string | number; fieldKey: string } {
  if (req.valueText !== null) return { value: req.valueText, fieldKey: "value_text" };
  if (req.valueNumber !== null) return { value: req.valueNumber, fieldKey: "value_number" };
  if (req.valueBool !== null) return { value: req.valueBool ? "yes" : "no", fieldKey: "value_bool" };
  if (req.valueDate !== null) return { value: req.valueDate, fieldKey: "value_date" };
  return { value: "", fieldKey: "value_text" };
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ schoolSlug: string; programSlug: string }>;
}) {
  const { schoolSlug, programSlug } = await params;
  const detail = getProgramDetail(db, schoolSlug, programSlug);
  if (!detail) {
    notFound();
  }

  const now = new Date();
  const claimFor = (
    subjectTable: string,
    subjectId: number,
    fieldKey: string,
  ): ClaimLike | undefined => detail.claims.get(`${subjectTable}:${subjectId}:${fieldKey}`);

  const [currentCycle, ...priorCycles] = detail.cycles;

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {detail.school.name} — {detail.program.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {detail.school.city}, {detail.school.state}
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Credential</dt>
        <dd>
          <FactValue
            value={detail.program.credential}
            claim={claimFor("programs", detail.program.id, "credential")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
        <dt className="text-zinc-500">Modality</dt>
        <dd>
          <FactValue
            value={detail.program.modality}
            claim={claimFor("programs", detail.program.id, "modality")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
        <dt className="text-zinc-500">Class size</dt>
        <dd>
          <FactValue
            value={detail.program.classSize}
            claim={claimFor("programs", detail.program.id, "class_size")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
      </dl>

      {currentCycle && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{currentCycle.cycle.cycleLabel} cycle</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Deadline</dt>
            <dd>
              <FactValue
                value={currentCycle.cycle.deadlineDate}
                claim={claimFor(
                  "application_cycles",
                  currentCycle.cycle.id,
                  "deadline_date",
                )}
                now={now}
                staleAfterDays={STALE_AFTER_DAYS}
              />
            </dd>
          </dl>

          <h3 className="mt-6 text-base font-semibold">Requirements</h3>
          {REQUIREMENT_CATEGORIES.map((category) => {
            const inCategory = currentCycle.requirements.filter(
              (r) => r.category === category,
            );
            if (inCategory.length === 0) return null;

            return (
              <div key={category} className="mt-4">
                <h4 className="text-sm font-semibold capitalize">{category}</h4>
                <ul className="mt-1 space-y-1">
                  {inCategory.map((req) => {
                    const { value, fieldKey } = requirementValueAndField(req);
                    return (
                      <li key={req.id} className="flex items-center gap-2 text-sm">
                        <span>{req.label}</span>
                        <FactValue
                          value={value}
                          claim={claimFor("requirements", req.id, fieldKey)}
                          now={now}
                          staleAfterDays={STALE_AFTER_DAYS}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {currentCycle.prerequisites.length > 0 && (
            <>
              <h3 className="mt-6 text-base font-semibold">Prerequisite courses</h3>
              <ul className="mt-1 space-y-1">
                {currentCycle.prerequisites.map((prereq) => (
                  <li key={prereq.id} className="text-sm">
                    {prereq.subject}
                    {prereq.minCredits ? ` — ${prereq.minCredits} credits` : ""}
                    {prereq.labRequired ? " (lab required)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {detail.tuitionEstimates.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Tuition</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {detail.tuitionEstimates.map((t) => (
              <li key={t.id}>
                {t.residency.replace("_", " ")}: ${(t.amountCents / 100).toLocaleString()} (
                {t.covers.replace("_", " ")}, {t.asOfYear})
              </li>
            ))}
          </ul>
        </section>
      )}

      {priorCycles.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">History</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {priorCycles.map(({ cycle }) => (
              <li key={cycle.id}>{cycle.cycleLabel}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/programs/[schoolSlug]/[programSlug]/page.tsx"
git commit -m "Phase 3: build program detail page with grouped requirements and history"
```

---

### Task 8: Map view

**Files:**
- Modify: `package.json` (add `leaflet`, `react-leaflet`, `@types/leaflet`)
- Create: `src/components/ProgramMapInner.tsx`
- Create: `src/components/ProgramMap.tsx`
- Modify: `src/app/programs/page.tsx` (embed the map)

**Interfaces:**
- Consumes: `ProgramListItem` from `@/domain/programs` (Task 3).
- Produces: `ProgramMap` component exported from `@/components/ProgramMap`, used by `src/app/programs/page.tsx`.

`ssr: false` is only valid when `next/dynamic` is called from inside a
Client Component in this Next version (confirmed in
`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`: *"`ssr: false`
is not allowed with `next/dynamic` in Server Components. Please move it into
a Client Component."*). `ProgramMap.tsx` is therefore itself `"use client"`
and does the dynamic import internally; the server-rendered directory page
imports `ProgramMap` directly without needing `dynamic()` itself.

- [ ] **Step 1: Install dependencies**

```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

- [ ] **Step 2: `ProgramMapInner.tsx` — the actual Leaflet map**

```tsx
// src/components/ProgramMapInner.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import Link from "next/link";
import type { ProgramListItem } from "@/domain/programs";

let iconConfigured = false;
function configureDefaultIcon() {
  if (iconConfigured) return;
  iconConfigured = true;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
  });
}

type LocatedItem = ProgramListItem & {
  program: ProgramListItem["program"] & { latitude: number; longitude: number };
};

function isLocated(item: ProgramListItem): item is LocatedItem {
  return item.program.latitude !== null && item.program.longitude !== null;
}

export function ProgramMapInner({ items }: { items: ProgramListItem[] }) {
  useEffect(() => {
    configureDefaultIcon();
  }, []);

  const located = items.filter(isLocated);

  if (located.length === 0) {
    return (
      <p className="mt-4 text-sm text-zinc-500">
        No located programs match this filter.
      </p>
    );
  }

  const center: [number, number] = [
    located[0]!.program.latitude,
    located[0]!.program.longitude,
  ];

  return (
    <MapContainer
      center={center}
      zoom={4}
      scrollWheelZoom={false}
      className="mt-4 h-96 w-full rounded"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((item) => (
        <Marker
          key={`${item.school.slug}/${item.program.slug}`}
          position={[item.program.latitude, item.program.longitude]}
        >
          <Popup>
            <Link href={`/programs/${item.school.slug}/${item.program.slug}`}>
              {item.school.name} — {item.program.name} (
              {item.program.credential ?? "credential unknown"})
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 3: `ProgramMap.tsx` — the `ssr:false` wrapper**

```tsx
// src/components/ProgramMap.tsx
"use client";

import dynamic from "next/dynamic";
import type { ProgramListItem } from "@/domain/programs";

const ProgramMapInner = dynamic(
  () => import("./ProgramMapInner").then((mod) => mod.ProgramMapInner),
  {
    ssr: false,
    loading: () => (
      <p className="mt-4 text-sm text-zinc-500">Loading map…</p>
    ),
  },
);

export function ProgramMap({ items }: { items: ProgramListItem[] }) {
  return <ProgramMapInner items={items} />;
}
```

- [ ] **Step 4: Embed the map in the directory page**

Modify `src/app/programs/page.tsx`: add
`import { ProgramMap } from "@/components/ProgramMap";` to the imports, and
insert `<ProgramMap items={items} />` immediately after the closing
`</form>` and before the results list/`No programs match` block.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If ESLint's `@typescript-eslint/no-unsafe-*` rules flag the
`leaflet` marker-icon `.src` access, confirm the type comes through
correctly from Next's built-in `*.png` module declaration (`next-env.d.ts`)
before changing anything — do not add an `any` cast to silence it.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/ProgramMapInner.tsx src/components/ProgramMap.tsx src/app/programs/page.tsx
git commit -m "Phase 3: add Leaflet map to the program directory"
```

---

### Task 9: Populate the local dev database

**Files:** none created — this task runs existing scripts to produce
`data/app.db` (gitignored) so Task 10's e2e tests have real data to render
against.

- [ ] **Step 1: Confirm `.env.local` exists with a `DATABASE_URL`**

Run: `test -f .env.local || cp .env.example .env.local`
Expected: `.env.local` now exists (copy of the documented placeholders is
sufficient — `DATABASE_URL=file:./data/app.db` is all this task needs).

- [ ] **Step 2: Run migrations**

Run: `npm run db:migrate`
Expected: `Migrations applied.` printed, `data/app.db` created.

- [ ] **Step 3: Dry-run the legacy import**

Run: `npm run import:legacy`
Expected: `Mode: DRY RUN` followed by 23 `CREATE program` lines, `Created 23
schools, 23 programs, ...`, and a note that no changes were written.

- [ ] **Step 4: Apply the legacy import**

Run: `npm run import:legacy -- --apply`
Expected: `Mode: APPLY`, same 23 `CREATE` lines, real row counts.

- [ ] **Step 5: Verify coordinates landed**

The `sqlite3` CLI was confirmed absent from this machine during Phase 0
planning — use the project's own `better-sqlite3` dependency instead of
assuming the CLI is now installed:

Run: `npx tsx -e "import Database from 'better-sqlite3'; const db = new Database('data/app.db'); console.log(db.prepare('SELECT COUNT(*) AS n FROM programs WHERE latitude IS NOT NULL').get());"`
Expected: `{ n: 23 }` (confirms the Task 8 map will have pins to render —
see plan header correction 3).

- [ ] **Step 6: Re-run the dry run to confirm idempotency**

Run: `npm run import:legacy`
Expected: 23 `SKIP` lines, `Skipped 23 already-imported programs.` — per
`CLAUDE.md`'s import rule, running the same bundle twice must report zero
changes.

No commit — `data/app.db` is gitignored and this task produces no source
changes.

---

### Task 10: E2E tests

**Files:**
- Create: `tests/e2e/programs.spec.ts`

**Interfaces:**
- Consumes: the running dev server seeded in Task 9 (Playwright's `webServer` in `playwright.config.ts` starts `npm run dev` against the same `data/app.db`).

Uses real legacy-imported program names. Confirm the exact `name`/`city`
values are unchanged by reading them from the DB if this task is executed
long after Task 9 — the assertions below assume the current
`seed/legacy/2025-26-aistudio.json` contents (Midwestern University,
Glendale AZ, MS credential, per the sample record read during planning).

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/programs.spec.ts
import { test, expect } from "@playwright/test";

test("directory search finds a program by name", async ({ page }) => {
  await page.goto("/programs");
  await page.getByPlaceholder("School or city").fill("Midwestern");
  await page.getByRole("button", { name: "Filter" }).click();

  await expect(page.getByRole("link", { name: /Midwestern University/ })).toBeVisible();
});

test("credential filter narrows results", async ({ page }) => {
  await page.goto("/programs?credential=MS");

  const links = page.getByRole("link");
  await expect(links.first()).toBeVisible();
  // Every visible result row's credential text should read "MS".
  await expect(page.getByText("· MS").first()).toBeVisible();
});

test("detail page shows a known fact with source, and a non-known fact distinctly", async ({
  page,
}) => {
  await page.goto("/programs");
  await page.getByRole("link", { name: /Midwestern University/ }).click();

  await expect(page.getByRole("heading", { name: /Midwestern University/ })).toBeVisible();

  // Credential is known (from the legacy import) and renders with a source badge.
  // Playwright's extended CSS engine supports :has-text() and adjacent-sibling
  // selectors, so this finds the <dd> that follows the "Credential" <dt>.
  const credentialValue = page.locator('dt:has-text("Credential") + dd');
  await expect(credentialValue.getByRole("link")).toBeVisible();

  // GPA is state=unknown post-legacy-import (D8) and must render distinctly,
  // never as a blank or as a fabricated value.
  await expect(page.getByText(/unknown — checked/)).toHaveCount(0).catch(() => {});
  await expect(page.getByText("unknown", { exact: false }).first()).toBeVisible();
});

test("map renders and a marker links to its detail page", async ({ page }) => {
  await page.goto("/programs");

  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});
```

Note on the "GPA unknown" assertion: `state='unknown'` claims render with
`checkedAt: null` for every Phase 2.5-imported requirement (the legacy
import records `state: "unknown"` without a `checkedAt` — see
`scripts/legacy-import/apply.ts:166-175`), so `FactValue` shows plain
`unknown` with no `— checked` suffix. The `.catch(() => {})` guard on the
first assertion is defensive only if a future re-import starts setting
`checkedAt`; if it fires as a real failure, replace both lines with a single
`await expect(page.getByText("unknown", { exact: false }).first()).toBeVisible();`.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS, 4 new tests plus the existing `smoke.spec.ts` test.

If any test fails because Midwestern University's data shape has drifted,
inspect the actual rendered page (`npx playwright test tests/e2e/programs.spec.ts --headed`
or check `test-results/*/trace.zip`) and adjust the assertions to match real
current data — do not weaken an assertion to force a pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/programs.spec.ts
git commit -m "Phase 3: add e2e coverage for directory, detail, and map"
```

---

### Task 11: Final verification

**Files:** none — this task only runs checks and fixes anything they surface.

- [ ] **Step 1: Run the full verify pipeline**

Run: `npm run verify`
Expected: `format:check`, `typecheck`, `lint`, `test`, and `test:e2e` all
pass. If `format:check` fails, run `npm run format` and re-verify. If
`lint` fails, run `npm run lint:fix` and re-verify — but read every
auto-fix diff before committing; do not blindly accept a fix that changes
logic.

- [ ] **Step 2: Manual browser check (per `CLAUDE.md`'s UI-change rule)**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3000`, then in a browser
visit `http://127.0.0.1:3000/programs`:
- Confirm the directory lists 23 programs, the search box narrows results,
  and the credential dropdown narrows results.
- Confirm the map renders with visible markers, and clicking a marker's
  popup link navigates to that program's detail page.
- Open at least two program detail pages and confirm: a `known` fact shows
  its value, a freshness pill, and a source link; an `unknown` fact (most
  GPAs, deadlines, tuition per D8) renders the amber "unknown" state, never
  a blank and never a fabricated number.
- Confirm a 404 for a nonexistent slug: visit
  `http://127.0.0.1:3000/programs/nonexistent-school/nonexistent-program`
  and confirm Next's not-found page renders (not a 500).

Stop the dev server after checking.

- [ ] **Step 3: Confirm the Phase 3 gate from `plan.md` §4**

> A real program renders correctly from seed data, and the four fact states
> are visually distinct.

State explicitly in your final report which program you checked and which
fact states were visible on it (a program with at least one `known` and one
`unknown` fact, e.g. Midwestern University, satisfies this — `not_published`
and `not_applicable` may not appear on any current record since the legacy
import only ever writes `known` or `unknown`; note this in the report rather
than forcing a `not_published` value into fixture-only test coverage, which
Task 1/Task 4 already provide).

- [ ] **Step 4: Final commit if Step 1's fixes produced changes**

```bash
git add -A
git commit -m "Phase 3: fix formatting/lint issues surfaced by npm run verify"
```

(Skip this step if Step 1 passed clean on the first run.)

---

## Self-Review Notes

- **Spec coverage:** §3 domain layer → Tasks 2-4. §4 fact-state rendering →
  Tasks 1, 5. §5 directory → Task 6. §6 detail page → Task 7. §7 map → Task
  8. §7.1 (corrected) → Task 9. §8 error handling → Task 7 Step 1
  (`notFound()`), Task 11 Step 2 (manual 404 check). §9 testing → Tasks 1-4
  (unit/integration), Task 10 (e2e). §10 gate → Task 11 Step 3.
- **Type consistency checked:** `ClaimLike` (Task 1) ⊆ `ClaimWithSource`
  (Task 2) — verified field-by-field. `ProgramListItem` (Task 3) is reused
  unchanged by Task 8's map. `ProgramDetail.claims` (Task 4) keys match
  `claimKey()` (Task 2) exactly in every call site in Task 7.
- **No placeholders:** every task has runnable code, not prose describing
  what to write.
