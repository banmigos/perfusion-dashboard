# Perfusion 2026-27 — Implementation Plan

Status: **proposal, awaiting approval.** No code, packages, database, or
migrations have been created.

## 1. Context

### Why this project exists

Applying to cardiovascular perfusion programs means tracking a few dozen
programs whose admission requirements are scattered across program websites,
accreditor listings, and PDF handbooks. That information changes every cycle,
is frequently incomplete, and is sometimes wrong on the page itself. A
spreadsheet loses the provenance of each fact and silently mixes "the school
requires 40 shadowing hours" with "I still need to schedule shadowing."

This application separates those two things permanently:

- **Canonical research data** — what a program officially requires, each fact
  carrying a source URL, a verbatim quote, a last-verified date, and a
  verification status.
- **Personal application state** — what *I* have done, what is due, and what
  is blocked.

The intended outcome is that at any moment I can answer: *what is due next,
which of my saved programs have stale facts, and where did this number come
from?*

### Current repository state (inspected 2026-08-25)

| Item | State |
|---|---|
| Git | Initialized on `main`, **zero commits** |
| Files | `CLAUDE.md` only, untracked |
| `package.json` | Absent |
| `src/`, `docs/`, `drizzle/` | Absent |
| `.gitignore`, `.env.example` | Absent |
| Node / npm | v24.14.0 / 11.9.0 |
| `tailscale` binary | Present |
| `caddy` binary | Not installed on this machine |
| `sqlite3` CLI | Not installed on this machine |

`CLAUDE.md` already encodes purpose, stack, network topology, data rules, and
workflow. It needs only additive rules, not a rewrite.

## 2. Recommended stack

Locked by your specification:

- Next.js (App Router) + TypeScript, `strict: true`
- Tailwind CSS
- SQLite + Drizzle ORM + versioned Drizzle migrations
- Zod for validation
- Vitest (unit + integration), Playwright (smoke only)
- npm

My additions, each open to override:

| Choice | Recommendation | Why |
|---|---|---|
| SQLite driver | `better-sqlite3` | Synchronous, mature, ideal for a single-writer local app. Node 24's built-in `node:sqlite` is a viable zero-dependency alternative but has less Drizzle mileage. |
| Build output | `output: 'standalone'` | Ships a self-contained server directory; no `node_modules` on the home server. |
| Server writes | Server Actions | Avoids inventing HTTP endpoints, which also keeps the "no public API" rule easy to honor. |
| DB access boundary | `src/domain/**` imports `server-only` (Phase 3+) | Deferred from `src/db/**`: `server-only` throws unconditionally outside Next's bundler, breaking `drizzle-kit`, `tsx`, and Vitest. `src/domain/**` is the actual boundary application code crosses to reach the database. |
| Formatting / linting | Prettier + ESLint (`next/core-web-vitals`) | Matches the `CLAUDE.md` workflow rule. |
| Dates | See `data-model.md` §7 | Deadlines are calendar dates, not instants. This distinction is load-bearing. |

Explicitly excluded, per your spec: Firebase, Supabase, hosted databases,
external analytics, trackers, ads, third-party auth, public APIs.

## 3. Recommended folder structure

```
perfusion-dash/
├── CLAUDE.md
├── README.md
├── .env.example                  # placeholders only, committed
├── .env.local                    # real values, gitignored
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
│
├── docs/
│   ├── plan.md                   # this file
│   ├── data-model.md
│   ├── deployment.md
│   ├── research-workflow.md
│   └── decisions.md
│
├── drizzle/                      # generated SQL migrations — COMMITTED
│   ├── 0000_init.sql
│   └── meta/
│
├── data/                         # GITIGNORED entirely
│   ├── app.db  app.db-wal  app.db-shm
│   ├── snapshots/                # saved copies of source pages
│   └── legacy/                   # rescued localStorage dumps — personal, never committed
│
├── seed/                         # human-readable canonical research — COMMITTED
│   ├── schools/
│   │   └── <school-slug>.json
│   └── legacy/
│       └── 2025-26-aistudio.json # verbatim capture of the old app's SCHOOLS array
│
├── scripts/
│   ├── import.ts                 # dry-run by default
│   ├── export.ts                 # DB -> seed/*.json round trip
│   ├── backup.ts
│   └── sweep-staleness.ts
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                          # Dashboard
│   │   ├── programs/
│   │   │   ├── page.tsx                      # Directory: search + filters
│   │   │   └── [schoolSlug]/[programSlug]/page.tsx
│   │   ├── my/
│   │   │   ├── page.tsx                      # My applications
│   │   │   └── [programSlug]/page.tsx        # Checklist + notes
│   │   ├── verify/page.tsx                   # Needs-verification queue
│   │   ├── admin/
│   │   │   ├── schools/  programs/  cycles/
│   │   │   ├── sources/  imports/  changes/
│   │   └── api/health/route.ts               # internal liveness only
│   │
│   ├── db/
│   │   ├── client.ts              # connection + PRAGMAs
│   │   ├── schema/                # one file per concern
│   │   │   ├── canonical.ts       # schools, programs, cycles, requirements
│   │   │   ├── provenance.ts      # sources, claims
│   │   │   ├── personal.ts        # saved, checklists, items
│   │   │   └── audit.ts           # change_log, import_batches, conflicts
│   │   └── index.ts
│   │
│   ├── domain/                    # server-only query + mutation layer
│   │   ├── programs.ts  cycles.ts  claims.ts
│   │   ├── checklists.ts  dashboard.ts
│   │   └── import/                # pure diff engine + appliers
│   │       ├── diff.ts            # PURE — no DB, fully unit-testable
│   │       └── apply.ts
│   │
│   ├── lib/
│   │   ├── zod/                   # validation schemas, shared with import
│   │   ├── freshness.ts  slug.ts  money.ts  dates.ts
│   │
│   ├── components/
│   │   ├── FactValue.tsx          # renders value + provenance badge
│   │   ├── SourceBadge.tsx  FreshnessPill.tsx
│   │   └── ui/
│   └── types/
│
├── tests/
│   ├── unit/                      # pure functions
│   ├── integration/               # real migrations against a temp SQLite file
│   ├── e2e/                       # Playwright
│   └── fixtures/                  # import bundles, incl. regression cases
│
└── deploy/
    ├── caddy/Caddyfile.vps.example
    ├── caddy/Caddyfile.home.example
    ├── systemd/perfusion-dash.service.example
    ├── systemd/perfusion-backup.service.example
    ├── systemd/perfusion-backup.timer.example
    └── README.md
```

Two structural points worth defending:

- **`src/domain/import/diff.ts` is pure.** It takes `(currentState, incomingBundle)`
  and returns a list of planned operations. No database handle. This is what
  makes dry-run trivially correct and import logic cheap to test exhaustively.
- **`seed/` is committed, `data/` is not.** Canonical research is reviewable in
  Git; personal checklist state and the live DB never leave the home server.

## 4. Phased implementation sequence

Each phase ends at a reviewable commit. Nothing in a later phase is required
to make an earlier phase useful.

### Phase 0 — Planning (this document)
Deliverable: the five `docs/*.md` files plus additive `CLAUDE.md` rules.
**Gate: your approval of `docs/decisions.md`.**

### Phase 1 — Scaffold, no database
Next.js + TS + Tailwind, strict tsconfig, ESLint/Prettier, Vitest and
Playwright configured, `.gitignore`, `.env.example`, an app shell with
navigation, `/api/health` returning `{ ok: true }`, one passing unit test and
one passing Playwright smoke test.
**Gate: `npm run verify` green from a clean clone.**

### Phase 2 — Schema and validation
Drizzle schema, `0000_init` migration, `src/db/client.ts` with PRAGMAs, Zod
schemas mirroring the schema, integration tests that run real migrations
against a temp file and assert every constraint. One hand-written fixture
school. No UI.
**Gate: constraint tests prove unique keys, FK restrict, and soft-delete work.**

### Phase 2.5 — Legacy triage import
Convert `seed/legacy/2025-26-aistudio.json` into real `schools`, `programs`, and 2026-27
`application_cycles` rows. Every record enters as `verification='draft'`. Only name, city,
credential, and URL become `state='known'`; **every GPA, deadline, tuition, class size, and GRE
value enters as `state='unknown'`** with the legacy number preserved in `claims.note` as a research
hint, never in a value column. Resolve the Baylor/Texas Heart duplicate and normalise the four
credential spellings. See §9 and `research-workflow.md` §8.
**Gate: 23 programs exist, zero claims are `verified`, and the `/verify` queue lists all of them.**

This phase is deliberately placed before the UI so Phase 3 has real data to render, including the
awkward cases — a `CLOSED` program, a `Rolling` deadline, and a program with no year on its
deadline.

### Phase 3 — Read-only research UI
Program directory with search and filters; program detail page rendering
requirements grouped by category with source link, verbatim quote, verified
date, and a visual distinction between *verified*, *unverified*, *unknown*,
*not published*, and *not researched*. Previous cycles listed as history. Map view (Leaflet) carried over from the old dashboard,
plotting programs by `latitude`/`longitude` and colored by application status.
**Gate: a real program renders correctly from seed data, and the four fact states are visually
distinct.**

### Phase 4 — Personal layer
Save-to-list, checklist generation from a cycle's requirements, private tasks,
due dates, statuses, completion timestamps, notes, links, and the dashboard.
**Gate: end-to-end "save program -> generate checklist -> complete task ->
see it on dashboard" passes in Playwright.**

### Phase 5 — Admin data entry and verification
CRUD for schools, programs, cycles, requirements, sources. Per-fact
verify/needs-review actions. `change_log` written on every canonical mutation.
The needs-verification queue becomes actionable.
**Gate: every canonical write produces a change_log row — asserted in tests.**

### Phase 6 — Import pipeline
`scripts/import.ts` with dry-run default, JSON bundle validation, diff output,
locked/verified-record protection, conflict recording, `import_batches`, and
`scripts/export.ts` for the round trip. Then load real research data.
**Gate: importing the same bundle twice reports zero changes on the second run.**

### Phase 7 — Deployment and cutover
Dockerfile, Forgejo Actions workflow, Komodo stack definition, both Caddy
example configs, backup script and timer, health checks, and the runbook in
`docs/deployment.md`. Rescue the old app's `localStorage` state **before** DNS
moves, then cut `perfusion.banmigos.dev` over from the old stack per
`deployment.md` §13.
**Gate: the canonical URL serves the new app over the tailnet, `ss -ltnp`
confirms loopback-only publishing, and a restore drill succeeds.**

### Phase 8 — Hardening
Staleness sweep on a timer, backup verification, off-box backup copy,
Playwright smoke run against the deployed host, cycle-rollover procedure
exercised once.

## 5. Import format recommendation

**Recommendation: JSON as the canonical import format. Add CSV later as a
converter that emits JSON, not as a second import path.**

The data is nested — a school contains programs, a program contains cycles, a
cycle contains requirements, prerequisites, and per-fact citations. CSV forces
either one wide denormalized row per fact (losing structure) or five
correlated files with hand-maintained foreign keys (losing safety). Since you
are the sole author and will mostly hand-edit or have Claude generate the
bundles, JSON's structure is an asset rather than a burden.

Bundle shape: **one file per school**, at `seed/schools/<school-slug>.json`,
which is also exactly what `scripts/export.ts` emits. The import format and the
export format being identical is the whole point — it makes the round trip
testable and makes Git diffs meaningful.

### Validation rules

Enforced by Zod before any database contact:

1. Every school, program, and cycle carries a stable `slug` — the idempotency key.
2. Every `cycle` carries an explicit `cycle_label` (e.g. `"2026-27"`). Never inferred.
3. Every fact intended as official carries a `citation` with `source_url` and
   `checked_at`. A fact with a value but no citation is a **hard error**, not a warning.
4. `state` must be one of `known | unknown | not_published | not_applicable`.
   A `state` other than `known` must have a `null` value. A `known` state must have a value.
5. `checked_at` must parse as ISO-8601 and must not be in the future.
6. Deadlines require `deadline_date` plus, when a time is published,
   `deadline_time_local` and `deadline_timezone` together — never one alone.
7. Money is integer cents plus an explicit `currency` and `as_of_year`.
8. Unknown top-level keys are rejected, so a typo'd field never silently vanishes.

### Dry-run behavior

`npm run import -- seed/schools/foo.json` is **dry-run by default**. Applying
requires `--apply`. Dry run opens a transaction, computes the diff, prints it,
and rolls back — so it exercises real constraints rather than guessing.

Output is a per-record plan:

```
CREATE  program   duke/perfusion-ms
UPDATE  cycle     duke/perfusion-ms@2026-27   deadline_date  2026-11-01 -> 2026-10-15
SKIP    claim     cycle:41:min_gpa_overall    reason=verified  (proposed 3.0, current 2.8)
UNCHANGED 37 records
CONFLICTS 1   ERRORS 0
```

### Conflict and manual-edit protection

A claim is protected when `verification = 'verified'` **or** `locked = true`.
Import never overwrites a protected claim. Instead it writes an
`import_conflicts` row holding the current value, the proposed value, and the
reason, surfaced in the admin UI for a manual accept/reject. This is the
mechanism that satisfies the `CLAUDE.md` rule *"Never overwrite manually
verified data with an automated import."*

Unprotected records update normally, and every change writes a `change_log`
row with before/after JSON linked to the `import_batches` row.

The entire apply runs in **one transaction**. Any error rolls the whole thing
back; there is no `--partial` mode, because a half-applied research bundle is
worse than no bundle.

### Seed data strategy

`seed/` is the canonical committed corpus. Tests use small fixtures in
`tests/fixtures/`, never the real corpus, so test expectations do not churn
every time you correct a deadline.

## 6. Test strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Zod validators, freshness calculation, slug generation, money parsing, date/deadline handling, checklist-generation-from-requirements, and the **pure import diff engine** — the highest-value target in the codebase. |
| Integration | Vitest + temp-file SQLite, real migrations | Unique constraints, FK `RESTRICT` on canonical parents, `CASCADE` on personal children, soft-delete filtering, claim upsert semantics, protected-record refusal, change_log emission on every canonical write, idempotency (import twice -> second run all-unchanged). |
| E2E smoke | Playwright | Six flows, deliberately no more: directory search finds a program; detail page shows source URL + quote + verified date; save a program; add and complete a task; dashboard reflects it; needs-verification view lists a stale record. |
| Health | Vitest | `/api/health` returns 200 and confirms `SELECT 1` against the DB. |

Rules that matter more than coverage numbers:

- **Integration tests run real migrations**, never `db.push()`. A migration that
  fails on a fresh database is the single most likely way to break a deploy.
- **Every import bug earns a permanent fixture** in `tests/fixtures/`.
- Playwright stays small on purpose. Its job is catching "the page 500s," not
  business logic — that belongs in Vitest where it is fast.

`npm run verify` = `format:check && typecheck && lint && test && test:e2e`.

## 7. Backup and recovery — summary

Full procedure in `docs/deployment.md` §10. Essentials:

- **Never `cp` a live WAL database.** Use `sqlite3 .backup` or better-sqlite3's
  `db.backup()`, which take a consistent snapshot under concurrent access.
- `scripts/backup.ts` writes `${BACKUP_DIR}/app-YYYYMMDD-HHMM.db.gz`, then runs
  `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the copy and fails
  loudly if either does.
- Retention: 14 daily, 8 weekly, 12 monthly.
- Off-box copy over Tailscale to `<BACKUP_REMOTE>`. A backup on the same disk
  is not a backup.
- **Restore drill quarterly**, written down. An untested backup is a rumor.
- Git is a second, independent logical backup of canonical research via
  `seed/*.json`. It does **not** cover personal checklist state — that exists
  only in SQLite and its backups.

## 8. The legacy corpus — what it is and is not

`seed/legacy/2025-26-aistudio.json` holds all 23 programs from the old dashboard, verbatim, with
the origin commit recorded and per-record triage flags attached. Treat it as a **lead list**.

Measured problems in that corpus:

| Finding | Count | Consequence |
|---|---|---|
| GPA exactly `3.0` | 17 of 23 | Almost certainly a placeholder, not a sourced minimum |
| Deadlines with no year | 19 of 23 | `"Mar 1"`, `"Dec 1"` — cycle-ambiguous, the exact antipattern `CLAUDE.md` forbids |
| Non-date deadlines | 2 | `"Rolling"`, `"CLOSED"` — these are `deadline_type`, not dates |
| Past-cycle deadlines | 2 | Baylor `"July 1 2025"`, Vanderbilt closed 2025-2027 |
| Credential spellings | 6 for 4 real values | `Cert`, `Certificate`, `Certificate (via THI)`, plus MS/MHS/MPS |
| Duplicate program | 1 | Baylor and Texas Heart share a URL and a program |
| Facts per source URL | all of them | One URL backs every field on a school; no quotes, no check dates |

None of it carries a `source_checked_at` or a verbatim quote, so **none of it can enter as
`verified`** without violating the project's own data rules. The import policy embedded in the
file enforces this: name, city, credential, and URL enter as `known`; every number and date enters
as `state='unknown'` with the legacy value preserved in `claims.note` as a hint for the researcher.

That is the correct outcome, not a limitation. The old dashboard's real value was telling you
*which 23 programs exist and where their admissions pages are* — which is most of the work. The
numbers were always going to need re-sourcing.

## 9. Exact Phase 1 implementation prompt

Paste this into a fresh Claude Code session after approving theon plan.

```text
Implement Phase 1 of docs/plan.md for the Perfusion 2026-27 project.
Read CLAUDE.md and docs/plan.md first and follow them exactly.

Scope: project scaffold only. NO database, NO Drizzle schema, NO migrations,
NO domain logic, NO import script. Those are Phase 2 and later.

Do all of this:

1. Initialize an npm project and scaffold Next.js with TypeScript, the App
   Router, Tailwind CSS, ESLint, and the `src/` directory. Use npm. Do not use
   any hosted service, analytics, tracker, or third-party auth.

2. Set tsconfig to strict mode with noUncheckedIndexedAccess enabled.

3. Configure next.config.ts with `output: 'standalone'`.

4. Add and configure Prettier alongside the Next ESLint config.

5. Configure Vitest for unit tests under tests/unit with a `@/` path alias
   matching tsconfig.

6. Configure Playwright for tests/e2e. Its webServer must start the dev server
   bound to 127.0.0.1:3000 and baseURL must be http://127.0.0.1:3000.

7. Create the empty directory structure from docs/plan.md section 3 for the
   directories Phase 1 legitimately needs: src/app, src/components, src/lib,
   src/types, tests/unit, tests/e2e, tests/fixtures, scripts, deploy, seed.
   Add .gitkeep where a directory would otherwise be empty. Do NOT create
   src/db, src/domain, or drizzle yet.

8. Write .gitignore covering at minimum: node_modules, .next, out,
   .env*.local, .env, data/, *.db, *.db-wal, *.db-shm, coverage,
   playwright-report, test-results, .DS_Store.

9. Write .env.example with documented placeholder values only — no real
   secrets, no Tailscale IPs, no hostnames beyond the canonical URL already in
   CLAUDE.md. Include at least: DATABASE_URL=file:./data/app.db,
   NODE_ENV=development, HOSTNAME=127.0.0.1, PORT=3000,
   STALE_AFTER_DAYS=180, BACKUP_DIR=./data/backups.

10. Build a minimal app shell: a root layout with Tailwind base styles and a
    nav linking Dashboard (/), Programs (/programs), My Applications (/my),
    Needs Verification (/verify), and Admin (/admin). Create placeholder pages
    for each that render a heading and a short "Phase N" note. No data access.

11. Add src/app/api/health/route.ts returning JSON { ok: true, version } with
    status 200. Add a comment noting this is an internal liveness endpoint
    reachable only inside the tailnet, not a public API.

12. Add src/lib/freshness.ts with a single pure exported function
    `isStale(checkedAt: Date | null, now: Date, staleAfterDays: number): boolean`
    that returns true when checkedAt is null or older than the threshold.
    Add tests/unit/freshness.test.ts covering: null input, exactly at the
    threshold, one day inside, one day past, and a future date.

13. Add tests/e2e/smoke.spec.ts asserting the dashboard page loads and the nav
    contains all five links.

14. Add these package.json scripts: dev, build, start, typecheck, lint,
    lint:fix, format, format:check, test, test:watch, test:e2e, and
    `verify` which runs format:check, typecheck, lint, test, and test:e2e in
    sequence.

15. Write README.md with setup steps, the script list, and a pointer to docs/.

Then run `npm run verify` and show me the real output. If anything fails, fix
it and run it again. Do not claim success without pasting the passing output.

Finally, make one commit. Do not push, do not create a remote, and do not
create a GitHub repository.
```
