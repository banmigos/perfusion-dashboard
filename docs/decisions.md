# Decisions, Assumptions, and Risks

Status: **awaiting your sign-off.** Everything in §2 is a recommendation I adopted as a working
default so the plan is complete and executable. Override any of them before Phase 1 starts.

## 1. Locked by your specification

No approval needed; recorded so later sessions do not relitigate them.

Next.js + App Router + TypeScript · Tailwind · SQLite · Drizzle ORM with versioned migrations ·
Zod · Vitest · Playwright · npm · single user · tailnet-only at `https://perfusion.banmigos.dev` ·
no Firebase/Supabase/hosted DB/analytics/trackers/ads/third-party auth/public API · no Tailscale
Serve or Funnel · no public DNS A/AAAA record · Next.js binds 127.0.0.1:3000 only · no secrets or
Tailscale addresses in the repo.

## 2. Decisions needing your approval

### D1 — App-level authentication: **none**

Access control is Tailscale ACLs plus Caddy binding to tailnet-only addresses. No login screen.

**Accepted risk, stated plainly:** any device on your tailnet that can reach the VPS proxy gets
full read and write access, including admin data entry and deletion. A compromised or borrowed
tailnet device is a full compromise of this app.

Chosen because there is no second user to distinguish, and because a login form protects against
approximately nothing that Tailscale ACLs do not already cover.

*If you want a second layer:* one password from env behind a signed HttpOnly cookie, roughly a
half-day including the Playwright auth fixture. Say so now — retrofitting after Phase 4 means
touching every route.

### D2 — Provenance model: **hybrid `claims` sidecar**

Typed domain columns for values; a `claims` table for source, verbatim quote, `checked_at`,
verification status, and lock flag. Full reasoning in `data-model.md` §2.

**This is the highest-impact decision in the document.** Reversing it after Phase 3 means
rewriting the schema, the import diff engine, and every fact-rendering component. It is also the
only one of the three options that can distinguish "the school does not publish this" from "I have
not looked yet," which your spec requires.

Cost to acknowledge: `claims.subject_table` / `subject_id` is polymorphic and therefore cannot
carry a real foreign key. Mitigated by a CHECK on allowed table names, an orphan-detection script,
and archive-instead-of-delete everywhere.

### D3 — Canonical research round-trips to `seed/*.json`, committed to Git

SQLite stays the runtime source of record; `scripts/export.ts` writes human-readable JSON per
school that you commit. Git history becomes a diffable audit trail of every fact correction and a
second logical backup independent of SQLite. `data/` stays gitignored.

Cost: export and import must stay in sync, and you must remember to commit after data entry.

### D4 — Separate dev database on the laptop; production database only on the home server

Local `data/app.db` seeded from `seed/` for development and tests. Explicitly rejects developing
against the live database over Tailscale — **SQLite over a network mount is a known corruption
hazard**, not a theoretical one.

Cost: your real checklist state exists only on the home server, so you cannot exercise it locally
without exporting canonical data and re-creating personal state.

### D6 — Runtime: **Docker + Komodo**, superseding the systemd-first proposal

Revised after reading the 2025-26 dashboard repo. You already run Forgejo Actions -> registry ->
Komodo for this exact hostname; introducing a parallel systemd-and-rsync idiom would mean two
deployment stories on one server. SQLite lives on a **host bind mount**, never inside the
container or a named volume, so backups and restores stay ordinary host operations.
`deploy/systemd/*.example` is kept as a documented fallback.

**The exposure caveat you must not lose:** inside a container the process binds `0.0.0.0`, and the
`CLAUDE.md` loopback rule is honored at the publish boundary via `ports: "127.0.0.1:3000:3000"`.
Dropping that prefix publishes on every interface *and bypasses the host firewall through Docker's
iptables rules*. `deployment.md` §3 has the post-deploy `ss -ltnp` check.

### D7 — Registry: **Forgejo container registry, not public Docker Hub**

The old repo pushed `banhmigos/perfusion-dashboard:latest` to public Docker Hub. The image holds
no data, so this was not a leak, but a private research tool has no reason to publish its source
world-readably. Also: pin a real tag instead of `:latest` — with `:latest` you cannot roll Komodo
back to the image matching the pre-migration schema.

### D8 — Legacy data enters as **unverified leads, never as facts**

All 23 programs import with `verification='draft'`. Name, city, credential, and URL are `known`;
every GPA, deadline, tuition, class size, and GRE value is `state='unknown'` with the legacy number
preserved in `claims.note`.

This is not conservatism for its own sake. 17 of 23 GPAs are exactly `3.0`, 19 of 23 deadlines have
no year, and tuition mixes units by two orders of magnitude. Importing any of it as fact would
poison the dataset on day one and there would be no way to tell afterwards which numbers were real.

**Consequence to accept:** immediately after the legacy import, the app shows 23 programs with
mostly empty fields and a `/verify` queue 23 items long. That is an accurate picture of what you
actually know.

### D9 — Keep the map view

`programs.latitude`/`longitude` carry over the old Leaflet map. Geography genuinely matters for
relocation decisions. These two columns are the **only** fields exempt from the citation
requirement — a campus coordinate is display data, not a research claim.

### D5 — Secondary defaults

| Decision | Default | Reversibility |
|---|---|---|
| SQLite driver | `better-sqlite3` | Easy — swap in `src/db/client.ts` |
| Write mechanism | Server Actions, no REST | Easy, and keeps "no public API" simple to honor |
| `STALE_AFTER_DAYS` | 180 | Trivial — env var |
| Import format | JSON only; CSV deferred to a converter | Easy — additive |
| Import atomicity | One transaction, no `--partial` | Easy |
| Canonical deletes | Soft delete only | Moderate — affects every query |
| VPS -> home hop | Plain HTTP over WireGuard | Easy — see `deployment.md` §2 |
| Multi-user | `users` table with one seeded row now | Hard to retrofit later; cheap now |

## 3. Assumptions

1. Your tailnet is trusted — every device on it is yours and current.
2. You are the only writer. No concurrent editing, so SQLite's single-writer model is ample.
3. The Oracle VPS and home server already run Tailscale and you can add ACL tags to both.
4. You control the public DNS zone for `banmigos.dev` well enough to let ACME write TXT records.
5. Program websites are the authority; aggregators are leads, not sources.
6. Roughly 20-60 programs and a few thousand claims. Every query in this design is well within
   SQLite's comfort zone at that size; no performance work is warranted yet.
7. The home server has a durable disk and enough space for the database plus 34 retained backups.
8. `2026-27` is the first cycle you will track, with `2027-28` the first rollover. The legacy
   corpus is 2025-26 and is imported as leads against the 2026-27 cycle, not as history — the old
   app never recorded which cycle its deadlines belonged to, so there is no honest 2025-26 cycle
   to reconstruct.
9. You can still open the old dashboard in the browsers where you used it, so its `localStorage`
   state is recoverable **until DNS moves**. If you have already lost those browser profiles, that
   personal state is simply gone and the schema work in `deployment.md` §13 step 1 is moot.
10. You control the Forgejo instance well enough to add a container registry and Actions secrets.

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| An import silently overwrites hand-verified research | High — destroys trust in the whole dataset | `verified`/`locked` guard, dry-run default, conflicts surfaced not auto-applied, `change_log` with before/after |
| Verification laundered across a cycle rollover | High — last year's confidence applied to this year's facts | Rollover **must** reset claims to `draft`; see `research-workflow.md` §5 |
| Timezone bug shifts a deadline by one day | High — you miss a deadline | Calendar dates stored as `TEXT YYYY-MM-DD`, never epoch; explicit unit tests |
| `PRAGMA foreign_keys` left OFF | High — every FK constraint silently void | Set in `src/db/client.ts`; asserted by an integration test |
| Accidental public exposure via an A record | High — violates the core constraint | `dig @1.1.1.1` check in `deployment.md` §6; Caddy `bind`; firewall deny |
| Single-disk SQLite loss | High — personal checklist state is not in Git | Verified daily backups, off-box copy, quarterly restore drill |
| Live-WAL `cp` "backups" that do not restore | High and silent until you need it | `db.backup()` only; `integrity_check` on the copy; drill |
| Research goes stale unnoticed near a deadline | Medium | Derived staleness, `/verify` queue ordered by saved programs then nearest deadline, source `content_hash` change detection |
| Scope creep toward a public directory | Medium | Forbidden by `CLAUDE.md`; re-read before adding any sharing feature |
| Effort spent on schema rather than applications | Medium — the actual goal is getting into a program | Phases 3-4 deliver usable value before admin and import machinery; stop at Phase 4 if time is short |
| Legacy `localStorage` state lost at cutover | Medium — irrecoverable, no server copy | Rescue **before** DNS moves; `deployment.md` §13 step 1 |
| Docker port published on all interfaces | **High** — bypasses the host firewall entirely | `127.0.0.1:` prefix on the port mapping; `ss -ltnp` check after every deploy |
| Legacy placeholder numbers mistaken for research | High — silently corrupts the dataset | D8: everything numeric enters as `unknown`; legacy values live in `claims.note` only |
| Both apps claiming `perfusion.banmigos.dev` | Medium | Cutover is a discrete step with the old stack stopped, not deleted, for one cycle |

## 5. Placeholders to fill before Phase 7

`<VPS_TAILSCALE_IP>` · `<HOME_TAILSCALE_IP>` · `<DNS_PROVIDER>` · `<DNS_API_TOKEN>` ·
`<APP_DIR>` · `<DATA_DIR>` · `<APP_USER>` / `<APP_GROUP>` · `<BACKUP_DIR>` · `<BACKUP_REMOTE>` ·
`<BACKUP_TIME>` · `<ADMIN_SOURCE>`

These live in `.env.production` and systemd `EnvironmentFile`s on the servers — never in the repo.

## 6. Sign-off

- [ ] D1 authentication — accept "none", or request the password gate
- [ ] D2 provenance model — accept the hybrid, or choose inline / EAV
- [ ] D3 research data in Git — accept, or database-only
- [ ] D4 dev database location — accept, or choose another
- [ ] D5 secondary defaults — accept as a block, or call out exceptions
- [ ] D6 Docker + Komodo runtime — accept, or keep the systemd path
- [ ] D7 Forgejo registry over public Docker Hub — accept, or stay on Docker Hub
- [ ] D8 legacy data enters unverified — accept, or nominate specific fields you trust
- [ ] D9 keep the map view — accept, or drop it and the two coordinate columns
- [ ] **Rescue the old app's `localStorage` before anything touches DNS** (`deployment.md` §13)
- [ ] Assumptions in §3 are correct
- [ ] Phase ordering in `plan.md` §4 matches your priorities

Once signed off, paste the Phase 1 prompt from `plan.md` §8 into a fresh session.
