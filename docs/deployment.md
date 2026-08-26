# Deployment

Status: **proposal.** Nothing has been deployed, installed, or configured.

> **The canonical URL is currently occupied.** `perfusion.banmigos.dev` today serves the
> 2025-26 AI Studio dashboard (Docker image `banhmigos/perfusion-dashboard:latest`, deployed by
> the Komodo stack `perfusion-dashboard`). This app replaces it. See §13 for the cutover.

All infrastructure values in this document are placeholders. Real IPs, hostnames beyond the
canonical URL, tokens, and keys are never committed — see §12.

## 1. Topology

```
Tailscale client (laptop, phone)
  |  split-horizon DNS: perfusion.banmigos.dev -> <VPS_TAILSCALE_IP>
  v
Oracle Ampere VPS
  Caddy, bound to <VPS_TAILSCALE_IP>:443 only
  TLS terminated here, certificate obtained via DNS-01
  |  Tailscale (WireGuard)
  v
Home application server
  Caddy, bound to <HOME_TAILSCALE_IP>:80 only
  |  loopback
  v
Next.js, 127.0.0.1:3000
  |
  v
SQLite at <DATA_DIR>/app.db
```

Per `CLAUDE.md`: no Tailscale Serve, no Funnel, no public deployment, no public DNS A/AAAA record.

## 2. Trust boundaries

| Hop | Encrypted by | Listens on | Reachable from |
|---|---|---|---|
| Client -> VPS Caddy | TLS 1.3 | `<VPS_TAILSCALE_IP>:443` | Tailnet only |
| VPS -> Home Caddy | WireGuard (Tailscale) | `<HOME_TAILSCALE_IP>:80` | `tag:proxy` only |
| Home Caddy -> Next.js | none (loopback) | `127.0.0.1:3000` | Same host only |

The VPS->home hop is plain HTTP **by deliberate choice**: Tailscale already provides
authenticated WireGuard encryption, and adding a second TLS layer would mean managing an internal
CA for no additional confidentiality. This is a decision, not an oversight — recorded as such in
`decisions.md`.

## 3. Home application server — runtime

**Recommendation: Docker image deployed by Komodo, matching the infrastructure you already run.**

The 2025-26 dashboard already ships via Forgejo Actions -> container registry -> Komodo stack, and
you operate that daily. Introducing a systemd-and-rsync path alongside it would mean maintaining
two deployment idioms for one server. The one thing that genuinely changes for this app is state:
the old dashboard was a stateless static site, this one owns a SQLite database.

### The rule that makes SQLite safe in a container

**The database lives on a host bind mount, never inside the container and never in a named
volume.** Backups, integrity checks, and restores all run on the host against a real path. A
database inside the container image is destroyed by the next deploy; one in a named volume is
awkward to back up and easy to orphan.

```yaml
# Komodo stack — compose fragment
services:
  perfusion:
    image: <REGISTRY>/perfusion-dash:<TAG>
    restart: unless-stopped
    user: "<APP_UID>:<APP_GID>"        # must own <DATA_DIR> on the host
    environment:
      NODE_ENV: production
      HOSTNAME: 0.0.0.0                # see note below
      PORT: 3000
      DATABASE_URL: file:/data/app.db
      STALE_AFTER_DAYS: 180
    volumes:
      - <DATA_DIR>:/data               # bind mount, not a named volume
    ports:
      - "127.0.0.1:3000:3000"          # published to loopback ONLY
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**On `HOSTNAME=0.0.0.0` inside the container.** `CLAUDE.md` requires that Next.js bind only to
127.0.0.1. Inside a container, binding to container-loopback would make the process unreachable
even from the host. The rule is honored at the **publish** boundary instead:
`ports: "127.0.0.1:3000:3000"` means Docker listens on the host's loopback only. Omitting the
`127.0.0.1:` prefix publishes on all interfaces **and punches through the host firewall via
Docker's iptables rules** — the single most likely way to accidentally expose this app. Verify
after every deploy:

```
ss -ltnp | grep 3000        # must show 127.0.0.1:3000, never 0.0.0.0:3000
```

### Dockerfile shape

Multi-stage on `node:22-alpine`: build with `output: 'standalone'`, then copy
`.next/standalone`, `.next/static`, and `public` into a runtime stage. Run as a non-root user
whose uid matches the host owner of `<DATA_DIR>`. Do **not** bake `.env`, `data/`, or `seed/` into
the image.

### Migrations

Run as an explicit step, never on container start:

```
docker compose exec perfusion node scripts/migrate.js
```

Take a backup first (§10). An auto-migrating container that crash-loops will run a broken
migration on every restart.

### What not to carry over from the old repo

| Old pattern | Why it must not carry forward |
|---|---|
| `\|\| true` on the Komodo webhook curl | Swallows deploy failures silently; the workflow reports success either way |
| `define: { 'process.env.API_KEY': ... }` in Vite config | Bakes a build-time secret into the client bundle. The key was never used, but the pattern is a live foot-gun |
| Public Docker Hub repo | See §3.1 |
| `metadata.json` geolocation permission | Not needed; do not request it |

### 3.1 Registry

**Recommendation: push to the Forgejo container registry, not public Docker Hub.** The image
contains no data, so a public image is not a data leak, but a private research tool has no reason
to publish its source in a world-readable image — and it avoids Docker Hub pull limits. Credentials
come from Forgejo Actions secrets.

### 3.2 systemd alternative

If you prefer to drop Docker for this app, the equivalent unit is in
`deploy/systemd/perfusion-dash.service.example`: `ExecStart=/usr/bin/node <APP_DIR>/server.js`
with `Environment=HOSTNAME=127.0.0.1`, `EnvironmentFile=`, `Restart=on-failure`,
`ProtectSystem=strict`, `ReadWritePaths=<DATA_DIR>`, `NoNewPrivileges=true`, and a dedicated
non-login user. In this path `HOSTNAME=127.0.0.1` is literal and the publish-boundary caveat above
does not apply. Keep the file as documentation even if you deploy with Docker.

## 4. Home Caddy

`deploy/caddy/Caddyfile.home.example`:

```
{
    admin off
}

http://<HOME_TAILSCALE_IP>:80 {
    bind <HOME_TAILSCALE_IP>

    reverse_proxy 127.0.0.1:3000 {
        health_uri /api/health
        health_interval 30s
        health_timeout 5s
    }

    log {
        output file /var/log/caddy/perfusion.log
    }
}
```

The `bind` directive is what keeps this off the LAN interface. Without it, Caddy listens on all
interfaces and anything on the home network can reach the app.

## 5. VPS Caddy

`deploy/caddy/Caddyfile.vps.example`:

```
{
    admin off
}

perfusion.banmigos.dev {
    bind <VPS_TAILSCALE_IP>

    tls {
        dns <DNS_PROVIDER> {env.DNS_API_TOKEN}
        resolvers 1.1.1.1 9.9.9.9
    }

    reverse_proxy http://<HOME_TAILSCALE_IP>:80 {
        health_uri /api/health
        health_interval 30s
    }

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
    }
}
```

Requires a Caddy binary built with the `<DNS_PROVIDER>` DNS module (`xcaddy build --with ...`).
`DNS_API_TOKEN` comes from the systemd `EnvironmentFile`, never from the Caddyfile.

## 6. Split-horizon DNS and DNS-01 — read this carefully

The part that is easy to get backwards:

- **The public zone for `banmigos.dev` must exist and must be writable by the ACME client**, because
  DNS-01 validation works by publishing a `_acme-challenge.perfusion.banmigos.dev` TXT record that
  Let's Encrypt reads from the public internet. Caddy creates and removes this automatically.
- **The hostname must still have no public A or AAAA record.** The TXT record proves control of the
  name; the A record would publish the address. You need the first and must not have the second.
- **Tailnet resolution** comes from Tailscale split DNS: add a split-DNS nameserver restricted to
  `banmigos.dev`, or a per-host override, resolving `perfusion.banmigos.dev` to `<VPS_TAILSCALE_IP>`.
  Configured in the Tailscale admin console under DNS, not in this repo.

Verification after setup:

```
# From a tailnet client — must return the Tailscale address
dig +short perfusion.banmigos.dev

# From any machine NOT on the tailnet, using a public resolver — must return nothing
dig +short perfusion.banmigos.dev @1.1.1.1
```

If the second command returns an address, the app is exposed. Stop and fix it before proceeding.

## 7. Firewall

**VPS**

```
# inbound
deny  443/tcp   on the public interface     # Caddy's bind is primary; this is belt and braces
deny  80/tcp    on the public interface
allow 41641/udp                              # Tailscale
allow 22/tcp    from <ADMIN_SOURCE> only     # or Tailscale SSH, preferred
```

**Home server**

- **Zero** port forwards on the router. Nothing about this design requires inbound WAN access.
- Local firewall: allow 80/tcp from `<VPS_TAILSCALE_IP>` only.

## 8. Tailscale ACLs

Tag the VPS `tag:proxy` and the home server `tag:app`. Sketch:

```jsonc
{
  "tagOwners": {
    "tag:proxy": ["autogroup:admin"],
    "tag:app":   ["autogroup:admin"]
  },
  "acls": [
    { "action": "accept", "src": ["tag:proxy"],       "dst": ["tag:app:80"] },
    { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:proxy:443"] }
  ]
}
```

Everything else is denied by Tailscale's default-deny. Notably this means your laptop cannot reach
`tag:app` directly — traffic must go through the proxy, which is the intent.

## 9. Health checks

- `/api/health` returns `{ ok, version, db }` after running `SELECT 1`. It is an **internal
  liveness endpoint**, reachable only inside the tailnet — not a public API, and it must never
  return data about programs or personal state.
- Both Caddy instances poll it via `health_uri`, so a failed upstream is removed rather than
  serving 502s.
- systemd `Restart=on-failure` handles process death.
- Optional Phase 8: a systemd timer that curls the health endpoint and notifies on repeated failure.

## 10. Backup and recovery

### The rule that matters most

**Never `cp` a live SQLite database in WAL mode.** The `.db` file alone is an inconsistent
snapshot; you will get a backup that restores to a corrupt or stale state. Use `sqlite3 .backup`
or better-sqlite3's `db.backup()`, both of which take a consistent snapshot under concurrent access.

### Procedure — `scripts/backup.ts`

1. `db.backup()` to `<BACKUP_DIR>/app-YYYYMMDD-HHMM.db`
2. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` **on the copy**. Non-`ok` fails the
   run loudly and leaves the file for inspection.
3. gzip the verified copy.
4. Prune to retention: **14 daily, 8 weekly, 12 monthly.**
5. Copy off-box over Tailscale to `<BACKUP_REMOTE>`. *A backup on the same disk is not a backup.*

### Schedule

`deploy/systemd/perfusion-backup.{service,timer}.example`, daily at `<BACKUP_TIME>`,
`Persistent=true` so a missed run fires on next boot.

**Backups run on the host, not inside the container**, against the bind-mounted
`<DATA_DIR>/app.db`. This is the main practical reason §3 insists on a bind mount: the backup
timer, integrity checks, and restores are all ordinary host operations that keep working when the
container is stopped, rebuilt, or rolled back.

### Restore

```
docker compose stop perfusion        # or: systemctl stop perfusion-dash
gunzip -c <BACKUP_FILE>.gz > <DATA_DIR>/app.db
rm -f <DATA_DIR>/app.db-wal <DATA_DIR>/app.db-shm
sqlite3 <DATA_DIR>/app.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
docker compose start perfusion       # or: systemctl start perfusion-dash
curl -s http://127.0.0.1:3000/api/health
```

Deleting the stale `-wal` and `-shm` files is required; leaving them next to a restored database
is a common way to reintroduce the corruption you just restored away from.

### Restore drill — quarterly, non-negotiable

Restore the most recent backup into a scratch copy, start the app against it, and confirm the
dashboard renders and a known program's facts are intact. Record the date in this file.
**An untested backup is a rumor.**

### What Git does and does not cover

- **Covered:** canonical research, via `seed/*.json` committed on every export. Full diffable
  history of every fact correction, independent of SQLite.
- **Not covered:** personal checklists, task status, completion timestamps, private notes. These
  exist only in SQLite and its backups. If backups fail, this is what you lose.

## 11. Release procedure

1. `npm run verify` locally — everything green.
2. Commit, tag, push to Forgejo. Actions builds and pushes `<REGISTRY>/perfusion-dash:<TAG>`.
3. **Back up first** (§10) — before any deploy that carries a migration.
4. Komodo deploys the stack.
5. `docker compose exec perfusion node scripts/migrate.js` — explicit, never automatic.
6. `curl -s http://127.0.0.1:3000/api/health`, then `ss -ltnp | grep 3000` to confirm the
   loopback-only publish survived the deploy.
7. Load the canonical URL from a tailnet client.

Pin a real tag rather than `:latest`. The old dashboard used `:latest`, which is tolerable for a
stateless static site and a bad idea for something that owns a database — with `:latest` you
cannot tell Komodo to roll back to the image that matched the pre-migration schema.

## 12. Placeholders

Nothing below is ever committed with a real value. Only `.example` files live in the repo.

| Placeholder | Meaning |
|---|---|
| `<VPS_TAILSCALE_IP>` | Oracle VPS address on the tailnet |
| `<HOME_TAILSCALE_IP>` | Home server address on the tailnet |
| `<DNS_PROVIDER>` | Caddy DNS module name for the registrar holding `banmigos.dev` |
| `<DNS_API_TOKEN>` | ACME DNS-01 API token — env only, scoped to the one zone |
| `<APP_DIR>` / `<DATA_DIR>` | Deployment and database directories on the home server |
| `<APP_USER>` / `<APP_GROUP>` | Dedicated non-login service account |
| `<APP_UID>` / `<APP_GID>` | Numeric ids the container runs as; must own `<DATA_DIR>` |
| `<REGISTRY>` / `<TAG>` | Forgejo container registry path and pinned image tag |
| `<STAGING_HOST>` | Temporary tailnet-only hostname for pre-cutover verification |
| `<BACKUP_DIR>` / `<BACKUP_REMOTE>` / `<BACKUP_TIME>` | Local backups, off-box target, daily time |
| `<ADMIN_SOURCE>` | Admin SSH source restriction, if not using Tailscale SSH |

## 13. Cutover from the 2025-26 dashboard

The old app currently serves `perfusion.banmigos.dev` from the Komodo stack `perfusion-dashboard`
(image `banhmigos/perfusion-dashboard:latest`, a Caddy container serving a static Vite build).
Both apps want the same hostname, so the switch is a discrete step rather than a gradual migration.

### Before cutover

1. **Rescue the personal state.** The old app stores application status and prerequisite progress
   in `localStorage` under the key `perfusion_app_state_v2`, keyed by school *name*. It exists only
   in the browsers you used. Open the old site in **each** browser and save the value:

   ```js
   copy(localStorage.getItem('perfusion_app_state_v2'))
   ```

   Save each to `data/legacy/appstate-<browser>.json` — gitignored, since this is personal state.
   **Once DNS moves, this data is unreachable.** There is no server-side copy.

2. Confirm the canonical research is captured: `seed/legacy/2025-26-aistudio.json` (already
   committed, 23 programs from commit `91a8370`).

3. Verify the new app on a temporary tailnet-only hostname (e.g. `<STAGING_HOST>`), including a
   restore drill, before touching the canonical name.

### Cutover

4. Stop the old Komodo stack. Do **not** delete it or its image yet.
5. Point the home Caddy site block for `perfusion.banmigos.dev` at the new container.
6. Deploy the new stack, run migrations, check `/api/health`.
7. Load the canonical URL from a tailnet client and re-run the §6 DNS exposure checks — the
   split-horizon setup is unchanged, but confirm rather than assume.

### After cutover

8. Keep the old stack stopped-but-present for one full application cycle. It is the only rendering
   of the 2025-26 data as you actually used it.
9. Archive the old repo read-only rather than deleting it; `seed/legacy/` records its commit hash.

### What does not transfer

- **localStorage progress** — must be re-entered by hand as `saved_programs` and `checklist_items`.
  It is keyed by school name, so the mapping to program slugs is a manual pass over ~23 rows,
  best done at the same time as the source re-verification in `research-workflow.md` §8.
- **Docker Hub image** — the new image goes to the Forgejo registry (§3.1).
- **The Gemini API key wiring** — dead config, deliberately dropped.
