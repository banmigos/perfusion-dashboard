# Perfusion Path

Private, single-user application for researching cardiovascular perfusion
education programs and tracking application tasks. See [CLAUDE.md](CLAUDE.md)
for purpose, stack, deployment topology, and data rules.

## Status

Phase 1: project scaffold. No database, no domain logic, no import script yet.
See [docs/plan.md](docs/plan.md) for the full phased implementation sequence.

## Setup

```sh
npm install
cp .env.example .env.local   # edit with real local values; gitignored
npm run dev                  # http://127.0.0.1:3100 (3000 is the production container)
```

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
| `npm run test`         | Vitest unit tests (`tests/unit`).                                                  |
| `npm run test:watch`   | Vitest in watch mode.                                                              |
| `npm run test:e2e`     | Playwright smoke tests (`tests/e2e`).                                              |
| `npm run verify`       | `format:check && typecheck && lint && test && test:e2e` — run before every commit. |

## Documentation

See [docs/](docs/) for the implementation plan, data model, deployment
topology, research workflow, and open decisions:

- [docs/plan.md](docs/plan.md) — phases, folder structure, test strategy
- [docs/data-model.md](docs/data-model.md) — schema and provenance
- [docs/deployment.md](docs/deployment.md) — network topology and backups
- [docs/research-workflow.md](docs/research-workflow.md) — how facts are recorded and verified
- [docs/decisions.md](docs/decisions.md) — open decisions, assumptions, risks
