# Perfusion Path

Private, single-user application for researching cardiovascular perfusion
education programs and running an application cycle against them. It answers
one question at a glance: what needs doing next, and what is at risk. See
[CLAUDE.md](CLAUDE.md) for purpose, deployment topology, and data rules.

## Views

| View                         | Path                     | What it shows                                                                                                                                                 |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                     | `/`                      | Days until the nearest unsubmitted deadline, a 120-day deadline strip, at-risk applications and overdue tasks, the next five deadlines, pipeline, open tasks. |
| Programs                     | `/programs`              | Every program as a sortable table, a board grouped by application status, or a map. Filter by search, status, deadline window, credential.                    |
| Program detail               | `/programs/[school]/[p]` | Deadline countdown, status, per-program timeline, checklist grouped by kind, fit notes, official requirements and facts with their sources.                   |
| Timeline                     | `/timeline`              | Every deadline in the cycle on one month grid, shaded by status; a month-by-month agenda on phones.                                                           |
| Requirements                 | `/requirements`          | Checklist progress by kind across tracked programs (letters received vs pending, essays, transcripts...), per-program progress, official GPA minimums.        |
| Checklists                   | `/my`                    | Every tracked program's checklist in one place.                                                                                                               |
| Needs verification and Admin | `/verify`, `/admin`      | Research upkeep: the claim verification queue and canonical data editing.                                                                                     |

Light, dark, and automatic themes are available from the sidebar; the choice
is remembered per browser.

## Run locally

Requires Node.js 22 and npm.

```sh
npm install
cp .env.example .env.local   # edit with real local values; gitignored
npm run db:migrate           # creates or upgrades data/app.db
npm run dev                  # http://127.0.0.1:3100 (3000 is the production container)
```

The database starts empty. Load the committed research with
`npm run import -- seed/schools/*.json --apply` (imports are dry-run without
`--apply`; see [docs/research-workflow.md](docs/research-workflow.md)).

For a production build on the host: `npm run build && npm run start`.

## Run in Docker

The image is built by the `Dockerfile` (Next.js standalone output) and deployed
through Komodo; see [docs/deployment.md](docs/deployment.md) for the full
topology, backups, and migration procedure. In short:

```sh
docker build -t perfusion-dashboard:<tag> .
cp deploy/compose.yaml.example compose.yaml   # replace every <PLACEHOLDER>
docker compose up -d
ss -ltnp | grep 3000                          # must show 127.0.0.1 only
```

**Migrations.** The image does not yet contain a migration runner, so apply
schema changes from a checkout of the same commit, against the bind-mounted
database file, before starting the new image (back up first):

```sh
DATABASE_URL=file:<DATA_DIR>/app.db npm run db:migrate
```

A page that hits an unmigrated database shows an error naming this fix.

The container needs no outside service at runtime: fonts are bundled at build
time and SQLite lives on a host bind mount. The map view's tiles are the one
exception; they load from OpenStreetMap in the browser.

## Environment

| Variable           | Default              | Purpose                                                                                                                                     |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | `file:./data/app.db` | SQLite file.                                                                                                                                |
| `STALE_AFTER_DAYS` | `180`                | A verified fact older than this shows as stale.                                                                                             |
| `APP_TIME_ZONE`    | host zone            | IANA zone that decides what "today" is for countdowns. Set it in containers, which run in UTC and would otherwise roll over in the evening. |
| `BACKUP_DIR`       | `./data/backups`     | Output for `npm run backup`.                                                                                                                |

## Data format

SQLite is the working store; `seed/` holds the canonical research as committed
JSON bundles, one per school, round-tripped by `npm run export` and
`npm run import`. The full schema is in [docs/data-model.md](docs/data-model.md).
In brief:

- **Canonical data** describes programs as the schools publish them: `schools`,
  `programs`, `application_cycles` (one per program per cycle, holding the
  deadline as a `YYYY-MM-DD` date), `requirements`, `tuition_estimates`. Every
  value's provenance (source URL, quote, check date, verification state) is a
  row in `claims`. A missing claim means not researched; `unknown` and
  `not_published` are distinct states and are shown as such.
- **Personal data** is yours and never feeds back into canonical rows:
  `saved_programs` (a tracked program: `application_status` of
  `not_started | in_progress | submitted | interview | decision`, priority,
  fit notes) and per-cycle `personal_checklists` whose `checklist_items` carry
  a kind (`letters`, `essay`, `transcript`, `shadowing`, `interview`...), a due
  date, and a status. The Requirements view is built from these items.

Edits made in the UI (status changes, checklist ticks, notes) are written
straight to SQLite through server actions. `data/` is gitignored; back it up
with `npm run backup`.

## Scripts

| Script                 | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server.                                                      |
| `npm run build`        | Production build.                                                                  |
| `npm run start`        | Run the production build.                                                          |
| `npm run typecheck`    | `tsc --noEmit`.                                                                    |
| `npm run lint`         | ESLint.                                                                            |
| `npm run lint:fix`     | ESLint with autofix.                                                               |
| `npm run format`       | Prettier, writes changes.                                                          |
| `npm run format:check` | Prettier, check only.                                                              |
| `npm run test`         | Vitest unit and integration tests.                                                 |
| `npm run test:watch`   | Vitest in watch mode.                                                              |
| `npm run test:e2e`     | Playwright smoke tests (`tests/e2e`).                                              |
| `npm run verify`       | `format:check && typecheck && lint && test && test:e2e` — run before every commit. |
| `npm run db:migrate`   | Apply Drizzle migrations to `DATABASE_URL`.                                        |
| `npm run import`       | Dry-run a seed bundle import; add `--apply` to write.                              |
| `npm run export`       | Write the database's canonical data back to `seed/`.                               |
| `npm run backup`       | Snapshot the database to `BACKUP_DIR`.                                             |

## Documentation

- [docs/plan.md](docs/plan.md) — phases, folder structure, test strategy
- [docs/data-model.md](docs/data-model.md) — schema and provenance
- [docs/deployment.md](docs/deployment.md) — network topology and backups
- [docs/research-workflow.md](docs/research-workflow.md) — how facts are recorded and verified
- [docs/decisions.md](docs/decisions.md) — open decisions, assumptions, risks
