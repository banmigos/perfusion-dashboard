# Phase 3 — Read-Only Research UI, Design

Status: **approved, ready for implementation planning.**

Implements Phase 3 of `docs/plan.md` §4: program directory with search/filters,
program detail page rendering requirements with full provenance, cycle
history, and the Leaflet map view. No writes, no auth, no personal data (that
is Phase 4).

## 1. Context

Phase 2.5 landed the legacy import: 23 programs exist in the dev database with
`schools.name`, `schools.city`, `schools.state`, `programs.credential`, and
`*.website_url` as `known` claims. Every GPA, deadline, tuition, and class
size is `state='unknown'` with the legacy figure preserved in `claims.note`.
`programs.latitude`/`longitude` are unset — the legacy corpus never carried
coordinates.

Phase 3 is the first phase to cross the `src/domain/**` boundary described in
`plan.md` §2 (`server-only`, the actual DB-access boundary for application
code). `src/db/**` stays free of `server-only` so `drizzle-kit`, `tsx`
scripts, and Vitest keep working outside Next's bundler.

## 2. Non-goals

- No writes of any kind (no admin CRUD, no verify actions — Phase 5).
- No saved programs, checklists, or dashboard (Phase 4).
- No auth (per D1, Tailscale ACLs only).
- No new database schema or migrations. Phase 3 reads what Phase 2/2.5 built.

## 3. Domain layer

New directory `src/domain/`, each file starting with `import "server-only";`.

### 3.1 `src/domain/claims.ts`

```ts
export type SubjectRef = { subjectTable: SubjectTable; subjectId: number };
export type ClaimWithSource = typeof claims.$inferSelect & {
  source: typeof sources.$inferSelect | null;
};

// Bulk-loads every claim for the given subjects in one query, joined to
// sources. Returns a lookup map so callers never issue a query per field.
export async function loadClaims(
  subjects: SubjectRef[],
): Promise<Map<string, ClaimWithSource>>;

export function claimKey(subjectTable: SubjectTable, subjectId: number, fieldKey: string): string;
```

Implementation: one query with `WHERE (subject_table, subject_id) IN (...)`
(Drizzle: `or(...)` grouped by table, or an `inArray` per distinct
`subjectTable` present — SQLite has no native row-value `IN`, so group by
table and `inArray(subjectId, ids)` per group, then merge results), left-join
`sources`. Empty `subjects` returns an empty map without querying.

**Why bulk, not per-field:** a program detail page touches the program row,
its school, every cycle, every requirement, every prerequisite, and every
tuition estimate — each with several claim-bearing fields. Per-field lookups
would be 20-40 queries per page. One batched query plus an in-memory map
lookup keeps it constant regardless of fact count.

### 3.2 `src/domain/programs.ts`

```ts
export type ProgramListFilters = { q?: string; credential?: Credential };
export type ProgramListItem = {
  school: Pick<School, "slug" | "name" | "city" | "state">;
  program: Pick<Program, "slug" | "name" | "credential" | "modality">;
};

export async function listPrograms(filters: ProgramListFilters): Promise<ProgramListItem[]>;

export type ProgramDetail = {
  school: School;
  program: Program;
  cycles: Array<{
    cycle: ApplicationCycle;
    requirements: Requirement[];
    prerequisites: PrerequisiteCourse[];
    tuition: TuitionEstimate[];
  }>; // ordered newest cycle_label first
  claims: Map<string, ClaimWithSource>; // from loadClaims, keyed by claimKey
};

export async function getProgramDetail(
  schoolSlug: string,
  programSlug: string,
): Promise<ProgramDetail | null>;
```

`listPrograms`: `q` matches `schools.name` or `schools.city` via `LIKE
'%q%'` (case-insensitive via SQLite's default `NOCASE` on ASCII, sufficient
for this dataset — no ICU collation needed). `credential` is an exact match
against `programs.credential`. Both filter on `status != 'archived'`. No
joins to `claims` — the list view shows only canonical columns, not
provenance, so it stays cheap.

`getProgramDetail`: one query for school+program by slug pair, one for all
cycles + their requirements/prerequisites/tuition (three queries scoped to
the cycle id set), then `loadClaims` over every subject touched
(`schools:id`, `programs:id`, `application_cycles:id` per cycle,
`requirements:id` per requirement, `prerequisite_courses:id` per
prerequisite, `tuition_estimates:id` per tuition row). Returns `null` if the
slug pair does not resolve — the route handles that as `notFound()`.

## 4. Fact-state rendering

### 4.1 `src/lib/factState.ts` (pure, unit-tested, no DB/React)

```ts
export type FactDisplay =
  | { kind: "not_researched" }
  | { kind: "unknown"; checkedAt: Date | null }
  | { kind: "not_published"; checkedAt: Date | null }
  | { kind: "not_applicable"; checkedAt: Date | null }
  | {
      kind: "known";
      verification: Verification; // draft | needs_review | verified | stale | archived
      isStale: boolean; // derived, per data-model.md §6
      source: { url: string; title: string | null } | null;
      quote: string | null;
      checkedAt: Date | null;
    };

export function factState(
  claim: ClaimWithSource | undefined,
  now: Date,
  staleAfterDays: number,
): FactDisplay;
```

Maps directly to the table in `data-model.md` §4, plus the verification
sub-states for `known` (a known fact can still be `draft`, `needs_review`,
`verified`, or explicitly-retired `stale`; `isStale` is the *derived*
time-based flag layered on top, per `research-workflow.md` §2). No claim row
at all → `not_researched`, matching the "no claim row = not researched" rule
in `CLAUDE.md`.

### 4.2 Components (`src/components/`)

- `FactValue.tsx` — takes `{ value: React.ReactNode, claim: ClaimWithSource | undefined }`, calls `factState`, renders the value plus a `SourceBadge`/`FreshnessPill` for `known`, or the grey/amber state text otherwise. Fields with no rendered `value` (all non-`known` states) render only the state text, never a blank.
- `SourceBadge.tsx` — link to `claim.source.url`, shows `source.title ?? source.url`, opens in a new tab (`rel="noopener noreferrer"` — external site).
- `FreshnessPill.tsx` — colored pill from `isStale`/`verification`: green "verified", amber "stale"/"needs review", grey "draft".

Visual language (Tailwind, matching existing `zinc` palette in the scaffold):

| State | Treatment |
|---|---|
| not researched | grey dash `—`, muted text |
| unknown | amber text, "unknown — checked {date}" |
| not_published | grey text, "not published" |
| not_applicable | grey text, "n/a" |
| known, verified, fresh | value + green `FreshnessPill` + `SourceBadge` |
| known, draft/needs_review | value + grey/amber `FreshnessPill` + `SourceBadge` |
| known, stale (derived or stored) | value + amber `FreshnessPill` ("stale — recheck") + `SourceBadge` |

## 5. Directory — `/programs`

Server component. Filters live in `searchParams` (`q`, `credential`) per your
answer — no client component, no JS required for filtering, bookmarkable
URLs. A plain GET `<form method="get">` with a text input and a `<select>`
sourced from `CREDENTIALS`.

Each result row links to `/programs/[schoolSlug]/[programSlug]` and shows
school name, city/state, credential — the fields actually populated today.
Empty result set renders "No programs match" rather than nothing, so an
overly narrow filter is legible as zero-results, not a bug.

## 6. Detail page — `/programs/[schoolSlug]/[programSlug]`

`getProgramDetail` 404s via `notFound()` when the slug pair does not
resolve. Layout:

1. Header: school name, city/state, program name, `credential` via
   `FactValue` (program-level claims use `subjectTable: "programs"`).
2. Cycle selector: cycles ordered newest-first by `cycle_label`; the current
   (first) cycle is expanded, prior cycles collapsed under a "History"
   disclosure. With only 2026-27 present today, History renders empty but
   the structure doesn't special-case a single cycle.
3. Requirements grouped by `category` (in `REQUIREMENT_CATEGORIES` order),
   each row: `label` + `FactValue` over `valueText`/`valueNumber`/etc.
   (whichever is non-null) + the row's claim.
4. Prerequisite courses as a small table (subject, credits, lab, min grade,
   recency) — each cell wrapped in `FactValue` since prerequisites carry
   their own claims.
5. Tuition estimates grouped by `residency`, `amountCents` formatted from
   integer cents per `CLAUDE.md`'s money rule.

## 7. Map — `/programs` (embedded) 

`react-leaflet` + `leaflet` added as dependencies. `ProgramMap.tsx` is a
client component, imported via `next/dynamic` with `ssr: false` (Leaflet
requires `window`). Props: the same `ProgramListItem[]` as the directory,
extended with `latitude`/`longitude`.

- Programs with coordinates get a marker; programs without are simply
  omitted from the map (not an error state — coordinates are optional
  display data per `data-model.md` §3).
- If zero programs in the current filter have coordinates, render a small
  "no located programs match this filter" note instead of an empty map.
- Marker popup: school name, program name, credential — links to the detail
  page.
- Tile source: OpenStreetMap's standard tile server, loaded directly by the
  browser (client-side `<img>`-equivalent requests), consistent with D9
  carrying the old dashboard's map forward. This is an outbound resource
  fetch from the viewer's own device, not a server-side integration, and
  adds no analytics or tracking — no `CLAUDE.md` rule bars it.

### 7.1 Coordinate backfill (one-time data task, not app code)

Per your answer, before Phase 3 ships I will geocode the 23 legacy schools'
city/state pairs (already `known`, already citation-exempt per
`data-model.md` §1) and write `latitude`/`longitude` directly via a small
one-off script (`scripts/backfill-coordinates.ts`, not part of `npm run
verify`, deleted or left as a documented manual tool after use — team
decision at implementation time). This is a data-entry action, not a design
decision requiring its own migration or domain function: it's a plain
`UPDATE programs SET latitude = ?, longitude = ? WHERE id = ?` for known
city centroids.

## 8. Error handling

- Detail route: unresolvable slug pair → Next `notFound()` → standard 404.
- Domain functions never throw for "no data" (empty arrays, `null` for a
  missing detail) — only for actual DB errors, which propagate to Next's
  default error boundary. Phase 3 adds no custom error UI beyond that.
- `loadClaims` with an empty `subjects` array short-circuits to an empty map
  without a query (guards the case where a program has zero cycles, though
  none exist in current data).

## 9. Testing

| Layer | Target |
|---|---|
| Unit (Vitest) | `factState.ts` — all 5 top-level states × verification sub-states × `isStale` boundary (reuses the existing `isStale` cases from `freshness.test.ts` as a pattern); `listPrograms` filter-predicate building if extracted as a pure query-builder. |
| Integration (Vitest, real migrated temp DB) | `loadClaims` batching correctness (multiple subject tables in one call, empty input); `listPrograms` filters (`q`, `credential`, archived exclusion); `getProgramDetail` (found, not-found, cycle ordering, claim attachment). |
| E2E (Playwright) | Directory search finds a program by name; credential filter narrows results; detail page shows a `known` fact with source link + quote + verified date, and shows the distinct visual treatment for at least one non-`known` state (per Phase 3 gate); map renders and a marker (if any exist post-backfill) links to its detail page. |

## 10. Gate (from `plan.md` §4, restated)

A real program renders correctly from seed data, and the four fact states
(plus the `known` verification sub-states) are visually distinct.

## 11. Open items deferred past Phase 3

- ICU/locale-aware search matching — not needed at 23-60 programs.
- `source_versions` / content-hash change detection — Phase 8 per
  `data-model.md` §1.
- Any write path (verify actions, admin) — Phases 4-5.
