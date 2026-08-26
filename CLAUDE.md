# Perfusion Path

## Purpose
Private, single-user application for researching cardiovascular perfusion
education programs and tracking application tasks. It is available only within
my Tailscale tailnet.

## Stack
- Next.js + TypeScript + App Router
- SQLite database
- Drizzle ORM and Drizzle migrations
- Tailwind CSS
- Vitest for unit tests
- Playwright for browser smoke tests

## Deployment and network topology

- This application is private and must never be exposed to the public internet.
- Canonical URL: https://perfusion.banmigos.dev
- DNS is split-horizon: inside the tailnet the hostname resolves to the
  Oracle VPS Tailscale address; it must not have a public A/AAAA record.
- TLS terminates at Caddy on the Oracle Ampere VPS using a DNS-01 certificate.
- VPS Caddy proxies through Tailscale to Caddy on the home application server.
- Home Caddy proxies to Next.js at 127.0.0.1:3000.
- Next.js must bind only to 127.0.0.1:3000.
- Do not use Tailscale Serve or Funnel.
- Do not add any public deployment, external analytics, or public API endpoint.
- Do not hard-code Tailscale IP addresses, hostnames, DNS tokens, or credentials.

## Data rules
- Every school/program fact must retain an official source URL.
- Record source_checked_at for every imported or edited fact.
- Treat program deadlines as year/cycle-specific records, never timeless facts.
- Separate official program requirements from my personal checklist tasks.
- Never overwrite manually verified data with an automated import.

## Workflow
- For non-trivial changes, propose a plan before editing.
- Run formatting, type checking, linting, and relevant tests after changes.
- Make small, reviewable commits.
## Planning documents
See `docs/` before non-trivial work: `plan.md` (phases, folder structure, test
strategy), `data-model.md` (schema and provenance), `deployment.md` (topology
and backups), `research-workflow.md` (how facts are recorded and verified),
`decisions.md` (open decisions, assumptions, risks).

## Additional stack rules
- npm is the package manager.
- Zod validates all external input, including import bundles.
- No app-level authentication; Tailscale ACLs are the only access gate.

## Additional data rules
- Values live in typed domain columns; provenance lives in the `claims` table
  (source, verbatim quote, checked_at, verification status, locked flag).
- Distinguish four fact states, never collapse them: no claim row = not
  researched; `unknown` = looked, undetermined; `not_published` = school does
  not publish it; `known` = a sourced fact. Never invent a value.
- Calendar dates (deadlines) are TEXT `YYYY-MM-DD`, never epoch timestamps.
  Audit instants are INTEGER epoch ms. Money is integer cents.
- Canonical data is soft-deleted via `status='archived'`, never hard-deleted.
- Cycle rollover clones the cycle and resets every claim to `draft`.

## Import rules
- Imports are dry-run by default; `--apply` is required to write.
- Imports never overwrite claims that are `verified` or `locked`; they record
  an `import_conflicts` row for manual resolution instead.
- An apply runs in one transaction. There is no partial mode.
- Running the same bundle twice must report zero changes.

## Repository conventions
- `data/` is gitignored (database, WAL, snapshots). `seed/` is committed and
  holds canonical research as JSON, round-tripped by the export script.
- `drizzle/` migrations are committed. Integration tests run real migrations,
  never `db.push()`.
- Infrastructure values are placeholders in `.example` files only.

## Legacy data
- `seed/legacy/2025-26-aistudio.json` is the 23-program capture from the old AI
  Studio dashboard. It is a research lead list, not verified data: it carries no
  per-fact citation, quote, or check date.
- Legacy numbers and dates import as `state='unknown'` with the old value kept in
  `claims.note`. Only name, city, credential, and URL import as `known`. Never
  import legacy data as `verified`.
- `programs.legacy_key` holds the old app's school-name string, used only to map
  rescued `localStorage` state onto real rows.
- `programs.latitude`/`longitude` are display data for the map view and are the
  only fields exempt from the citation requirement.

## Container deployment caveat
- The app is deployed as a Docker image via Komodo. Inside a container the Next.js
  process binds `0.0.0.0`; the loopback-only rule is enforced at the publish
  boundary with `ports: "127.0.0.1:3000:3000"`. Omitting that prefix exposes the
  app on every interface and bypasses the host firewall via Docker's iptables
  rules. Verify with `ss -ltnp | grep 3000` after every deploy.
- SQLite lives on a host bind mount, never inside the container or a named volume.
- Pin image tags; never deploy `:latest`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
