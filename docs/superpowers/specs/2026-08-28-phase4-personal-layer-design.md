# Phase 4 Personal Layer — Design

**Status:** approved. Implements `docs/plan.md` Phase 4.

## Goal

Save-to-list, checklist generation from a cycle's requirements, private
tasks, due dates, statuses, completion timestamps, notes, links, and a live
dashboard.

**Gate:** end-to-end "save program -> generate checklist -> complete task ->
see it on dashboard" passes in Playwright.

## Context

Schema already exists (`src/db/schema/personal.ts`): `saved_programs`,
`personal_checklists`, `checklist_items`, all FK'd to `users`. No `users`
row exists yet, and this is the first phase that writes to the database —
Phase 3 was read-only.

`applicationCycles` has no `isCurrent` flag, only `cycleLabel` (e.g.
`"2026-27"`). "Current cycle" for a program is defined as the non-archived
cycle with the highest `cycleLabel`, matching the ordering the Phase 3
detail page already uses.

## Decisions

1. **User identity:** single fixed user. `src/domain/user.ts` exports
   `CURRENT_USER_ID = 1`. A one-time seed inserts that `users` row. No
   session/auth — matches CLAUDE.md ("No app-level authentication;
   Tailscale ACLs are the only access gate").
2. **Checklist generation scope:** one checklist item per requirement row
   in the program's current cycle, every category included (no filtering
   by `category` or `isRequired`).
3. **Regeneration:** `generateChecklist` is idempotent per
   `(savedProgramId, cycleId)` — if a checklist already exists for that
   pair, return it unchanged rather than creating a duplicate. No merge/diff
   logic; Phase 5 (admin edits to requirements) doesn't exist yet, so
   there's no live scenario requiring re-sync.
4. **Manual checklist items:** full CRUD. Users can add, edit, and delete
   checklist items that aren't derived from any requirement
   (`derivedFromRequirementId: null`), matching `plan.md`'s "private tasks"
   phrasing in the Phase 4 scope line.
5. **Priority/note editing:** in scope for Phase 4 — `saved_programs.priority`
   and `.personalNote` get inline editing UI, not deferred.
6. **Dashboard content:** a flat, due-date-sorted list of open checklist
   items (`status` not in `done`/`skipped`) across all saved programs,
   overdue first then soonest-due, undated items last, each showing its
   program and linking to `/my`. Plus a one-line summary ("N saved
   programs — R reach / T target / L likely").

## Architecture

Two new domain modules under `src/domain/`, both starting with
`import "server-only";` and following the existing synchronous,
`db`-first-parameter convention (`fn(db, ...args)` — matches
`getProgramDetail(db, ...)` from Phase 3, required because the
`better-sqlite3` driver is synchronous).

Mutations are exposed as Next.js Server Actions (`"use server"`),
colocated per page as `actions.ts`, called directly from client components.
No new API routes — matches `plan.md`'s "Server writes -> Server Actions"
choice. Each mutating action calls a domain function, then
`revalidatePath` on the affected page(s).

### `src/domain/user.ts`

- `CURRENT_USER_ID = 1` — a constant, not a query.

### `src/domain/saved.ts`

- `saveProgram(db, programId)` — insert into `saved_programs`
  (`userId: CURRENT_USER_ID`, `programId`), `onConflictDoNothing` against
  the existing `saved_programs_user_program_unique` constraint.
- `unsaveProgram(db, programId)` — delete the row. FK cascade already
  takes `personal_checklists`/`checklist_items` with it.
- `updateSavedProgram(db, savedProgramId, patch: { priority?; personalNote? })`
  — partial update.
- `getSavedProgram(db, programId)` — single lookup for the program detail
  page's save-state UI.
- `listSavedPrograms(db)` — for `/my`, joined with `schools`/`programs`,
  ordered by `addedAt` desc.

### `src/domain/checklists.ts`

- `generateChecklist(db, savedProgramId)` — resolves the program's current
  cycle (see "Current cycle" above). If a `personal_checklists` row already
  exists for `(savedProgramId, cycleId)`, returns it unchanged. Otherwise,
  in one transaction: inserts the checklist (`title` = program name + cycle
  label) and one `checklist_items` row per requirement in that cycle
  (`title` = requirement label, `category` copied, `derivedFromRequirementId`
  set, `sortOrder` following the requirement's own `sortOrder`).
- `addChecklistItem(db, checklistId, { title, detail?, dueAt?, linkUrl? })`
  — manual item, `derivedFromRequirementId: null`.
- `updateChecklistItem(db, itemId, patch)` — title/detail/dueAt/linkUrl/status.
  Setting `status: "done"` stamps `completedAt`; any other status clears it.
- `deleteChecklistItem(db, itemId)`.
- `listChecklistsForSavedProgram(db, savedProgramId)` — checklist + items,
  for `/my`.
- `listDueItems(db)` — all `checklist_items` for `CURRENT_USER_ID` joined
  through `personal_checklists` -> `saved_programs` -> `programs`/`schools`,
  filtered to `status not in ('done', 'skipped')`, ordered
  `dueAt IS NULL, dueAt ASC` (undated last, overdue/soonest-due first). The
  dashboard's one query.

## UI

- **Program detail page** (`src/app/programs/[schoolSlug]/[programSlug]/page.tsx`)
  gains `<SaveProgramControl>` (client component): save/unsave toggle;
  when saved, an inline priority `<select>`
  (reach/target/likely/dropped/unset) and a note `<textarea>`
  (blur-to-save); and a "Generate checklist" button, disabled/relabeled
  once a checklist exists for the current cycle, linking to it on `/my`.
- **`/my`** (`src/app/my/page.tsx`) — server component listing saved
  programs (`listSavedPrograms`) as cards: program name, priority badge,
  note preview, and each checklist's items via `<ChecklistItemRow>`
  (client component: status cycles todo -> in_progress -> done via
  checkbox/control, due date input, delete button) plus an
  `<AddChecklistItemForm>` per checklist. A saved program with no
  checklist yet shows an inline "Generate checklist" button.
- **Dashboard** (`src/app/page.tsx`) — server component calling
  `listDueItems`: summary line, then a list using the same
  `<ChecklistItemRow>`, each showing its program name (linking to `/my`)
  and due date, overdue rows styled distinctly.
- New shared component: `src/components/ChecklistItemRow.tsx`, used by
  both `/my` and the dashboard so status-toggling isn't duplicated.

## Testing

- **Unit (Vitest):** `generateChecklist`'s requirement-to-item mapping;
  `listDueItems`'s sort ordering (undated-last, overdue-first) against
  fixture dates; idempotency (second `generateChecklist` call for the same
  `(savedProgramId, cycleId)` returns the existing checklist, no insert).
- **Integration (Vitest + temp SQLite, real migrations):** full
  `saveProgram -> generateChecklist -> updateChecklistItem(status: done) ->
  listDueItems` round trip; `unsaveProgram` cascade deletes
  checklists/items; double-`saveProgram` is a no-op against the unique
  constraint.
- **E2E (Playwright):** from a program detail page, save it, generate its
  checklist, go to `/my`, mark one item done, go to `/`, confirm it no
  longer appears in the due list (done items are excluded by
  `listDueItems`).

## Error handling

Server Actions validate input with Zod (`dueAt` as `YYYY-MM-DD` or
rejected, empty titles rejected), consistent with "Zod validates all
external input." No bespoke user-facing error UI beyond standard form
validation — single-user private tool, not defending adversarial input.
