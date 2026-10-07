# Research Workflow

Status: **proposal.** Describes how the app is meant to be used once built.

## 1. Principles

1. **A fact without a source is not a fact.** If you cannot cite it, it does not go in a value column.
2. **Never invent a value to fill a field.** Empty is informative; a guess is corrosive.
3. **Deadlines belong to a cycle.** There is no such thing as "the deadline" — only the 2026-27
   deadline, which may differ from 2027-28.
4. **Official data and personal state never mix.** Ticking off a task changes nothing about what
   the school requires.
5. **The program's own site outranks every aggregator**, including directory sites and forums.

## 2. Fact lifecycle

```
draft ──> needs_review ──> verified ──> stale ──> archived
  ^                            |          |
  └────────────────────────────┴──────────┘
              (re-check moves it back)
```

| State | Meaning | Who sets it |
|---|---|---|
| `draft` | Entered, not yet checked against the source | You, on entry, or import |
| `needs_review` | Something changed or looks wrong | Import conflict, source hash change, or you |
| `verified` | You read the source and confirmed it | You, manually — **import can never set this** |
| `stale` | Explicitly retired or source changed underneath it | Sweep, or source hash mismatch |
| `archived` | No longer relevant; kept for history | You |

Time-based decay is separate and **derived**: any claim whose `checked_at` is older than
`STALE_AFTER_DAYS` (default 180) shows as stale in the UI regardless of its stored `verification`.
That way the clock moving never requires a write.

Only `verified` and `locked` claims are protected from import. That is the entire enforcement
mechanism for the `CLAUDE.md` rule *"never overwrite manually verified data with an automated import."*

## 3. The manual research loop

For one fact on one program:

1. **Find the official page.** Program site first; accreditor listing or a program PDF second;
   an email or phone call from the program is a legitimate source too — record it as
   `source_type = email` or `phone` with a note.
2. **Record the source** — URL, title, publisher, `fetched_at`. Optionally save a snapshot to
   `data/snapshots/` and store `content_hash` so a later change is detectable.
3. **Record the value** in its typed column (`application_cycles.deadline_date`,
   `requirements.value_number`, and so on). Never in the claim.
4. **Record the claim** — `field_key`, `state`, `source_id`, a **verbatim quote** from the page,
   and `checked_at = today`. The quote is what lets you resolve a future disagreement without
   re-reading the whole site.
5. **Set verification.** `verified` only if you actually read the source just now.

If the page does not state the fact, do not skip the claim — record it with the right state:

| Situation | `state` | Value column |
|---|---|---|
| The page states it | `known` | set |
| Page exists, fact genuinely absent | `not_published` | NULL |
| You looked, sources conflict or are unclear | `unknown` | NULL |
| Does not apply to this program | `not_applicable` | NULL |
| You have not looked yet | *no claim row* | NULL |

The distinction between "not published" and "no claim row" is the difference between the school's
incomplete disclosure and your incomplete work. Both look like a blank on a spreadsheet; here they
must not.

## 4. Import workflow

For adding or updating a batch of programs from a JSON bundle.

```
npm run import -- seed/schools/<slug>.json           # DRY RUN — default
# read the plan, resolve conflicts in /admin/imports
npm run import -- seed/schools/<slug>.json --apply
```

1. **Dry run.** Validates with Zod, opens a transaction, computes the diff, prints the plan,
   rolls back. Real constraints are exercised, so a dry run that passes is meaningful.
2. **Read the plan.** `CREATE` / `UPDATE` / `SKIP` / `UNCHANGED`, plus conflict and error counts.
3. **Resolve conflicts.** Any `SKIP` on a `verified` or `locked` claim writes an
   `import_conflicts` row. Accept or reject each one in `/admin/imports`. Accepting is a manual,
   logged act — which is the point.
4. **Apply.** One transaction, all-or-nothing. No `--partial` mode: a half-applied research
   bundle is worse than no bundle.
5. **Verify.** Re-run the dry run. It must report zero changes. If it does not, the import is not
   idempotent and that is a bug.

### Export round trip

`npm run export` writes the database back out to `seed/schools/*.json` in the same shape the
importer consumes. Commit the result. Git history then becomes a diffable record of every fact
correction, and `git log -p seed/schools/foo.json` answers "when did this deadline change and
what was it before" without a database query.

## 5. Cycle rollover

When a program opens its next cycle, **do not edit the existing cycle row.** Deadlines are
cycle-specific records, not timeless facts.

1. Clone `application_cycles` for the program with the new `cycle_label` and `entry_year`.
2. Clone its `requirements` and `prerequisite_courses` as a starting point.
3. **Reset every cloned claim to `draft`** with `checked_at = NULL`. Last year's verification says
   nothing about this year's requirements.
4. Leave the prior cycle untouched, `status` unchanged. It becomes history on the detail page.
5. Re-verify fact by fact against the new cycle's published materials.

Step 3 is the one people skip. Carrying `verified` forward across a rollover silently launders
last year's research into this year's confidence.

## 6. Staleness sweep

Run `scripts/sweep-staleness.ts` (Phase 8, on a timer) to:

- Flag claims whose `checked_at` exceeds `STALE_AFTER_DAYS`.
- Re-fetch sources with a stored `content_hash`, and set every claim on a changed page to
  `needs_review`. This is the highest-value automated signal in the system: it tells you a school
  edited its admissions page.
- Never change a value. The sweep only touches confidence.

The `/verify` queue orders work by what actually matters:

1. Claims on **saved** programs, nearest deadline first
2. Claims on saved programs with no deadline yet
3. Everything else

## 7. Checklist generation

From a saved program's current cycle, generate checklist items from its `requirements`:

- One item per required requirement, `derived_from_requirement_id` set.
- Due dates default relative to the cycle deadline; you adjust them freely.
- Add private tasks freely — they simply have a NULL `derived_from_requirement_id`.

**Generated items are copies, not views.** Editing, renaming, reordering, or deleting a checklist
item never writes back to `requirements`. If a requirement later changes, the app flags the
derived item as out of date and offers to regenerate — it never silently rewrites your task list,
because your notes and adjustments on that item are your work, not the school's.

## 8. Triaging the 2025-26 legacy corpus

`seed/legacy/2025-26-aistudio.json` is a lead list, not research. Work it program by program; the
`/verify` queue will hold all 23 after the Phase 2.5 import.

**The rule:** a legacy number is a *hint*, never a value. It goes in `claims.note` as
`"legacy 2025-26 dashboard said 3.0"` with `state='unknown'` and a NULL value column. It moves
into a value column only when you have read the school's page yourself and can attach a quote and
a `checked_at`.

This feels pedantic for about four programs and then stops feeling pedantic. 17 of the 23 legacy
GPA values are exactly `3.0`, which is not what 23 independently-researched schools look like.

### Per-program pass

1. Open the legacy `url` — verify it still resolves and still describes the same program.
2. Record it as a `source` with today's `fetched_at`.
3. Anchor the deadline to the **2026-27** cycle. 19 of 23 legacy deadlines carry no year, so
   `"Mar 1"` tells you roughly when to look, not what to record. `"Rolling"` and `"CLOSED"` are
   `deadline_type` values, not dates.
4. Re-source GPA, prerequisites, tuition, class size, and test requirements one at a time, each
   with its own quote. Use `not_published` freely — several of these programs genuinely do not
   publish a minimum GPA, and recording that is real research, not a gap.
5. Convert the abbreviated prereqs (`"Bio"`, `"Chem I/II"`, `"Stats"`) into
   `prerequisite_courses` rows with credits, lab requirement, minimum grade, and recency.

### Known special cases

- **Baylor College of Medicine / Texas Heart Institute** share a URL and are one program in the
  legacy data ("Certificate (via THI)"). Decide whether Baylor is a separate program or an
  affiliation of THI, then record it once.
- **Vanderbilt** is marked closed for 2025-2027. Model that as a 2026-27 cycle with
  `deadline_type='unknown'` and a claim explaining the closure — do not delete the program.
- **University of Iowa** at `2100` and **UTHealth** at `18000` are almost certainly not
  program-total tuition. Re-source with an explicit `covers` value.
- **UTHealth** and **Vanderbilt** carry free-text `notes` about observation-hour requirements.
  These are real requirements — convert them into `requirements` rows under the `shadowing`
  category, with the note text as the starting quote to verify.

### Directory lead bundles

An aggregator directory (principle 5: the program's own site outranks it) can be captured as a
**lead bundle** in `seed/leads/` (format `directory-lead-capture/v1`). The first is
`seed/leads/2026-10-06-perfusionprep.json`, transcribed from perfusionprep.com/schools.

```bash
npm run import:leads                     # dry run of the default bundle
npm run import:leads -- <file> --apply   # write, in one transaction
```

Requires the legacy import to have been applied first. The importer creates one `sources` row
(`source_type='other'`) for the directory and records every directory value as a note line
`perfusionprep.com/schools (captured 2026-10-06): "<value>"` on an `unknown`, `draft` claim —
appended to an existing unknown claim's note, never replacing it. On existing rows it never sets a
value column. The one accepted exception is the create path: for the programs the legacy corpus
lacks (three in the first bundle) it must write the columns a row cannot exist without — school
name/city/state, program name/credential/slug, and a cycle row with only its label, entry year and
an `unknown` deadline type — but no coordinates, URLs, or requirement values, and the claims on
those new rows stay `unknown`/`draft`. It never creates a `known` claim, leaves `known` claims
alone, and records an `import_conflicts` row instead of touching a verified or locked claim. Every
write carries the run's `import_batches` id in `change_log`. Re-running the same bundle writes
nothing.

### Rescuing personal state

The old app's `localStorage` (`perfusion_app_state_v2`) holds your application statuses and
prerequisite checkboxes, keyed by school name. **It exists only in the browsers you used it in and
is unrecoverable once DNS moves** — see `deployment.md` §13, step 1.

Map it onto the new schema by hand via `programs.legacy_key`: each old status becomes a
`saved_programs` row with a `priority`, and each checked prerequisite becomes a completed
`checklist_items` row. Roughly 23 rows of manual work, best done during the per-program pass above
so you only read each program's page once.
