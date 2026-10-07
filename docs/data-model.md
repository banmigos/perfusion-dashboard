# Data Model

Status: **proposal.** No schema, migration, or database exists yet.

## 1. Review of the proposed entities

| Proposed | Verdict | Notes |
|---|---|---|
| School | Keep | `schools` |
| Program | Keep | `programs`, child of school |
| ApplicationCycle | Keep | `application_cycles` — the unit that makes deadlines cycle-specific |
| OfficialRequirement | Keep, split | `requirements` for the long tail, plus `prerequisite_courses` for structured coursework |
| Source | Keep, normalize | `sources` — a document, shared by many facts |
| TuitionEstimate | Keep, extend | Needs residency tier, `covers`, and `as_of_year` |
| SavedProgram | Keep | `saved_programs` |
| PersonalChecklist | Keep | `personal_checklists` |
| ChecklistItem | Keep | `checklist_items` |
| ImportBatch / ImportAudit | Keep, split | `import_batches` (the run) + `import_conflicts` (what it refused to do) |
| AdminChangeLog / DataChangeLog | Merge | One `change_log`. Two tables would fragment the audit trail for no benefit. |
| **Add — `claims`** | New | The provenance sidecar. See §2. |
| **Add — `users`** | New | One seeded row. Cheap insurance against a painful migration later. |
| **Defer — `source_versions`** | Phase 5+ | MVP puts `content_hash` + `fetched_at` directly on `sources`. |
| **Add — `programs.legacy_key`** | New | Maps the old dashboard's name-keyed `localStorage` state onto real rows. See below. |
| **Add — `programs.latitude/longitude`** | New | Carries over the old map view. |

### On independently versioning sources

Worth doing eventually, not in the MVP. A school edits its admissions page mid-cycle; you want to
know the page changed and which facts were derived from the old text. The full version is a
`source_versions` table (`source_id`, `fetched_at`, `content_hash`, `snapshot_path`) with `claims`
pointing at a *version* rather than a source.

For the MVP, `sources.content_hash` plus a saved snapshot in `data/snapshots/` gets ~80% of the
value: you can detect that a page changed since you last verified it, which is enough to flip
affected claims to `needs_review`. Promoting to a versions table later is an additive migration
plus a backfill — deliberately deferrable. Do not build it now.

## 2. The provenance decision

**Recommendation: hybrid — typed domain tables plus a `claims` provenance sidecar.**

### The three options

**A. Inline source columns.** Put `source_url`, `source_quote`, and `source_checked_at` on every
record that carries a fact.

- Fewest joins, fastest to build, easiest to read in a raw SQL dump.
- But one admissions page backing twelve facts gets stored twelve times, and correcting the URL
  means twelve updates.
- Fatally: there is no way to represent *"the school does not publish this"* as distinct from
  *"I have not looked yet."* Both are a NULL. Your spec explicitly requires that distinction.
- Per-field verification status is also impossible without a status column per field.

**B. Full EAV fact table.** Every fact is a row: `(entity_type, entity_id, field_key, value, source_id, status)`.

- Maximum flexibility. New fields need no migration.
- But it discards column types and CHECK constraints — the database can no longer tell you that
  a GPA is a number between 0 and 4.3, or that a deadline is a date.
- Every read becomes a pivot, so `SELECT * FROM programs` stops being useful and every query
  grows a self-join per field.
- With Drizzle + Zod it throws away static type inference, which is the main reason to choose
  this stack at all. The UI degrades into a generic key/value renderer.

**C. Hybrid — RECOMMENDED.** Domain tables keep real, typed columns. A `claims` table stores
provenance keyed by `(subject_table, subject_id, field_key)`.

- Domain queries stay typed, indexed, and constrained. `deadline_date` is a real column you can
  sort and filter on.
- Provenance is first-class and shared: one `sources` row backs many claims.
- Costs exactly one join when you want to render "where did this come from," which is precisely
  the moment you are already doing detail-page work rather than list filtering.
- It is the only option of the three that natively expresses the four fact states in §4.

### Why this fits a *personal research directory* specifically

The distinguishing property of research data is that **the confidence in a fact changes far more
often than the fact itself.** A deadline of November 1 may stay true for two years while its
verification decays from `verified` to `stale` and back three times. Option A ties those two
lifecycles into one row and forces a write to the fact whenever confidence changes. Option B
decouples them but at the price of all type safety.

The hybrid separates the two lifecycles cleanly: the *value* lives in the domain table, the
*belief about the value* lives in `claims`. That is why a staleness sweep touches only `claims`
and never risks corrupting the research itself, and why import protection can be enforced on a
single table.

## 3. Schema

Conventions: every table has an integer `id` primary key. `created_at` / `updated_at` are INTEGER
epoch milliseconds. Canonical tables carry `status` and `archived_at` for soft delete.

### Canonical

**`users`** — `id`, `name`, `created_at`. Exactly one row, seeded by the initial migration.
Present so that personal tables can carry a real `user_id` FK from day one.

**`schools`**
`id`, `slug` UNIQUE, `name`, `city`, `state`, `country` (default `US`), `website_url`,
`status` (`draft|needs_review|verified|stale|archived`), `archived_at`, timestamps.

**`programs`**
`id`, `school_id` FK -> schools RESTRICT, `slug`, `name`,
`director_name` (claim-backed, field_key `director_name`), `legacy_key`,
`credential` (`MS|MPS|MHS|BS|Certificate|Other`), `modality` (`in_person|hybrid|online`),
`accreditation_status`, `cae_accredited` (bool), `program_length_months`, `class_size`,
`website_url`, `latitude`, `longitude`, `status`, `archived_at`, timestamps.
`UNIQUE(school_id, slug)`. Index on `credential`.

`latitude` / `longitude` carry the map view over from the 2025-26 dashboard. They are the one
field pair exempt from the citation requirement — a campus coordinate is a display convenience,
not a research claim, so it needs no `claims` row.

`legacy_key` stores the exact `School.name` string the old app used (e.g.
`"Medical University of South Carolina (MUSC)"`). The old app keyed personal state in
`localStorage` by that string, so this column is what lets a rescued state dump be mapped onto
real programs. It is nullable, write-once at legacy import, and used by nothing else.

**`application_cycles`**
`id`, `program_id` FK -> programs RESTRICT, `cycle_label` (e.g. `2026-27`), `entry_year`,
`application_opens_date`, `deadline_date`, `deadline_time_local`, `deadline_timezone`,
`deadline_type` (`rolling|firm|priority|unknown`), `cas_service` (`none|CASPA|other`),
`decision_notification_date`, `status`, `archived_at`, timestamps.
`UNIQUE(program_id, cycle_label)`. Indexes on `deadline_date` and `entry_year`.

**`requirements`** — the long tail of official requirements
`id`, `cycle_id` FK -> application_cycles RESTRICT,
`category` (`gpa|prerequisite|experience|shadowing|letters|test|transcript|essay|interview|fee|other`),
`label`, `value_text`, `value_number`, `value_bool`, `value_date`, `unit`,
`is_required` (bool), `sort_order`, `status`, `archived_at`, timestamps.
Index `(cycle_id, category)`.

The four typed `value_*` columns are a deliberate, bounded concession to variability — bounded
because the *hot, filterable* facts live as real columns on `application_cycles`, not here.
Anything you filter or sort the directory by is promoted to a real column; `requirements` holds
what you only ever read on a detail page.

**`prerequisite_courses`** — prerequisites have enough structure to deserve their own table
`id`, `cycle_id` FK RESTRICT, `subject`, `min_credits`, `lab_required` (bool), `min_grade`,
`recency_years`, `notes`, `sort_order`, timestamps.

**`tuition_estimates`**
`id`, `program_id` FK RESTRICT, `cycle_id` FK NULL, `residency`
(`in_state|out_of_state|international|flat`), `amount_cents`, `currency` (default `USD`),
`covers` (`total_program|per_year|per_credit`), `deposit_cents`, `fees_note`, `as_of_year`,
timestamps.

`covers` matters: a program quoting "$92,000" total and one quoting "$46,000 per year" are not
comparable, and storing only a number guarantees you will eventually compare them anyway.

The legacy corpus proves the point: it lists University of Iowa at `2100` and University of Utah
at `120000` in the same `tuition` field. Those are not the same measure, and there is no way to
tell which is which from the data. Every legacy tuition figure therefore imports as
`state='unknown'`.

### Provenance

**`sources`**
`id`, `url` UNIQUE, `canonical_url`, `title`, `publisher`,
`source_type` (`program_site|accreditor|cas|pdf|email|phone|other`),
`fetched_at`, `content_hash`, `snapshot_path`, `notes`, `created_at`.

`source_type` earns its place because `phone` and `email` are real sources for perfusion program
facts that are not published anywhere, and they need different trust handling than a web page.

**`claims`** — one row per tracked fact
`id`, `subject_table`, `subject_id`, `field_key`,
`state` (`known|unknown|not_published|not_applicable`),
`source_id` FK -> sources NULL, `quote`, `note`, `checked_at`,
`verification` (`draft|needs_review|verified|stale|archived`),
`locked` (bool, default false), `confidence` (`low|medium|high`), timestamps.
`UNIQUE(subject_table, subject_id, field_key)`. Indexes on `verification`, `checked_at`,
and `(subject_table, subject_id)`.

CHECK constraints to enforce in the migration:
- `state = 'known'` requires `source_id IS NOT NULL`
- `state != 'known'` requires the corresponding domain value to be NULL (enforced in the domain
  layer, since SQLite cannot reach across tables in a CHECK)
- `checked_at IS NOT NULL` whenever `verification != 'draft'`

`subject_table` / `subject_id` is a polymorphic reference and therefore **cannot** have a real
foreign key. That is the one genuine cost of this design. Mitigate it with: a CHECK restricting
`subject_table` to the known table names, a `scripts/` integrity check that reports orphaned
claims, and archive-instead-of-delete on every canonical table so rows never actually vanish.

### Personal — never written by import, ever

**`saved_programs`** — `id`, `user_id` FK CASCADE, `program_id` FK RESTRICT, `added_at`,
`priority` (`reach|target|likely|dropped`), `personal_note`. `UNIQUE(user_id, program_id)`.

**`personal_checklists`** — `id`, `user_id` FK CASCADE, `saved_program_id` FK CASCADE,
`cycle_id` FK NULL RESTRICT, `title`, `created_at`.

**`checklist_items`** — `id`, `checklist_id` FK CASCADE, `title`, `detail`, `category`, `due_at`,
`status` (`todo|in_progress|blocked|done|skipped`), `completed_at`, `link_url`,
`derived_from_requirement_id` FK NULL SET NULL, `sort_order`, timestamps.
Index `(status, due_at)` — this is the dashboard's primary query.

`derived_from_requirement_id` records where a generated task came from **without** creating a
write path back to canonical data. Editing a checklist item never touches `requirements`.

### Audit

**`import_batches`** — `id`, `started_at`, `finished_at`, `mode` (`dry_run|apply`), `source_label`,
`file_hash`, `actor`, `summary_json`, `status` (`running|succeeded|failed|rolled_back`).

**`import_conflicts`** — `id`, `batch_id` FK CASCADE, `subject_table`, `subject_id`, `field_key`,
`current_json`, `proposed_json`, `reason`, `resolved_at`, `resolution` (`accepted|rejected|pending`).

**`change_log`** — `id`, `at`, `actor`, `action` (`create|update|delete|archive|verify`),
`subject_table`, `subject_id`, `field_key` NULL, `before_json`, `after_json`, `batch_id` NULL,
`note`. Index `(subject_table, subject_id)` and `at`.

Every canonical mutation writes here. Phase 5 asserts this with a test rather than a convention.

## 4. The four fact states

This is the requirement *"use explicit unknown, not published, or null fields rather than
inventing values"* made concrete. The UI must render all four differently.

| Domain value | Claim row | Meaning | Renders as |
|---|---|---|---|
| NULL | none | Not researched yet | Grey dash, "not researched" |
| NULL | `state='unknown'` | Looked, could not determine | Amber, "unknown — checked {date}" |
| NULL | `state='not_published'` | School does not publish it | Grey, "not published" |
| NULL | `state='not_applicable'` | Does not apply to this program | Grey, "n/a" |
| set | `state='known'` | A real, sourced fact | Value + source link + freshness pill |

The difference between row 1 and row 3 is the difference between *your* incomplete work and *the
school's* incomplete disclosure. Collapsing them is the single most common way a research
database becomes untrustworthy.

## 5. Deletion and archive behavior

- **Canonical data is never hard-deleted.** Set `status='archived'` and `archived_at`. All
  default queries filter `status != 'archived'`.
- **Personal data may be hard-deleted** by explicit user action. A deleted checklist item is
  noise, not history.
- **FK policy:** `RESTRICT` on canonical parents (you cannot delete a school out from under a
  program), `CASCADE` on personal children (deleting a checklist takes its items).
- Archiving a program does **not** archive its claims. They remain for the audit trail and are
  simply not surfaced.

## 6. Verification and freshness

Lifecycle: `draft -> needs_review -> verified -> stale -> archived`.

- **Staleness is derived, never stored.** `isStale = checked_at IS NULL OR checked_at < now - STALE_AFTER_DAYS`
  (placeholder: **180 days**, from env). A stored boolean would be wrong the moment the clock moved.
- `verification='stale'` as a *stored* value is reserved for facts explicitly retired by a human
  or invalidated because `sources.content_hash` changed — a different thing from time-based decay.
- The needs-verification queue is `verification IN ('draft','needs_review','stale') OR isStale`,
  prioritized by saved programs first, then nearest deadline.

## 7. SQLite specifics that will bite if ignored

- **`PRAGMA foreign_keys = ON` per connection.** SQLite defaults to OFF, which silently voids every
  FK constraint in this document. Set it in `src/db/client.ts` and assert it in an integration test.
- **`PRAGMA journal_mode = WAL`**, plus `busy_timeout = 5000` and `synchronous = NORMAL`.
- **Dates are not all the same kind.** A deadline of "November 1" is a *calendar date in the
  school's timezone*, not an instant. Storing it as an epoch timestamp introduces a timezone bug
  that surfaces as an off-by-one-day deadline — the worst possible bug for this app.
  - Calendar dates -> `TEXT` `YYYY-MM-DD` (`deadline_date`, `application_opens_date`)
  - Optional published time -> `deadline_time_local` + `deadline_timezone`, both or neither
  - Audit instants -> `INTEGER` epoch ms (`checked_at`, `created_at`, `completed_at`)
- **Money is integer cents** plus `currency` plus `as_of_year`. Never a float.
- Booleans are `INTEGER 0/1` via Drizzle's `{ mode: 'boolean' }`.
