# GitHub Actions CI/CD for Dilmune

**Repository:** `NooraBumjaid/fils-pay`  
**Branch:** `hackathon/fixes`  
**Server user:** `dilmune`  
**Server checkout:** `/home/dilmune/fils-pay`

This pipeline does **not** deploy on push. Production deploys are a manual
`workflow_dispatch` against GitHub environment `dilmune-production`.

Do not put `ops/.env.hosted` in git. Do not run `seed`. Do not
`docker compose down -v`. Do not `git reset --hard`.

---

## 1. Required one-time setup

### 1.1 GitHub environment

In the GitHub repo: **Settings → Environments → New environment** named
`dilmune-production`.

Recommended protection:

- Required reviewers (at least one teammate) before a deploy job starts
- Deployment branch rule: `hackathon/fixes` only

Create the environment **before** the first `workflow_dispatch`. The
workflow will sit on “waiting for environment” until this exists.

### 1.2 Dedicated SSH deploy key (on a laptop, not committed)

```
ssh-keygen -t ed25519 -a 64 -f dilmune-github-deploy -C "filspay-gha-dilmune"
```

- Private file `dilmune-github-deploy` → GitHub secret `DILMUNE_SSH_PRIVATE_KEY`
- Public file `dilmune-github-deploy.pub` → Dilmune `~dilmune/.ssh/authorized_keys`

Do **not** reuse a personal laptop key. Do **not** grant this key `sudo`.
The `dilmune` user only needs:

- Own the checkout `/home/dilmune/fils-pay`
- Membership in the `docker` group (`docker compose` without sudo)
- Write access to `/home/dilmune/fils-pay-backups`

`authorized_keys` options (single line, then the public key):

```
no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... filspay-gha-dilmune
```

Avoid `command=` restriction unless you wrap the whole remote script;
this workflow runs a multi-step bash script.

### 1.3 Pin the SSH host key

On a trusted machine (not blindly from a café Wi‑Fi MITM):

```
ssh-keyscan -t ed25519 YOUR_DILMUNE_HOST
ssh-keygen -lf - <<< "$(ssh-keyscan -t ed25519 YOUR_DILMUNE_HOST)"
```

Compare the fingerprint with one taken **on the server**:

```
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Put the `ssh-keyscan` line (host name or IP **exactly** as
`DILMUNE_SSH_HOST`) into GitHub secret `DILMUNE_SSH_KNOWN_HOSTS`.
The deploy job uses `StrictHostKeyChecking=yes` and will refuse to
connect if this does not match.

Do not invent or guess a fingerprint in this repository.

### 1.4 Server git checkout

`/home/dilmune/fils-pay` must already be a git clone owned by `dilmune`,
with `ops/.env.hosted` present (mode `600`). The deploy job fetches
objects from a **git bundle** copied over SSH, so the box does not need
a GitHub token.

If `git status` on the server shows tracked modifications **other than**
the live compose/nginx files (when **apply_hosted_config** is off), the
deploy **aborts**. Complete the reconciliation checklist in §7 first.
With **apply_hosted_config** on, *any* tracked modification aborts.

### 1.5 GitHub Secrets

Store these on environment `dilmune-production` (preferred) or as repo
secrets. Never log them. Never paste them into workflow files.

| Secret | Value |
|---|---|
| `DILMUNE_SSH_HOST` | Dilmune hostname or IP (must match the `known_hosts` line) |
| `DILMUNE_SSH_PRIVATE_KEY` | Full OpenSSH private key, including `BEGIN/END` lines |
| `DILMUNE_SSH_KNOWN_HOSTS` | One or more `ssh-keyscan` lines for that host |

User is hardcoded as `dilmune`. Path is hardcoded as
`/home/dilmune/fils-pay`.

---

## 2. GitHub Actions configuration

| Workflow | File | Trigger |
|---|---|---|
| CI | `.github/workflows/ci.yml` | `push` and `pull_request` to `hackathon/fixes` |
| Deploy | `.github/workflows/deploy-dilmune.yml` | **manual** `workflow_dispatch` only |

CI (no production secrets):

- Node.js **22**, `npm ci` from the lockfile
- `npm run typecheck`
- Overlay/deploy-script tests + `@filspay/money` tests
- `vite build` for `apps/web` and `apps/admin` (`VITE_BASE=/admin/`)
- `docker compose … config` with `ops/env.compose-check.env` (dummy values)
- Fails if the merge still publishes host port `3000`
- Go 1.22 `go test ./...` in `apps/settlement`

Full `npm test` for the API is **not** the CI gate: those files need a
migrated Postgres and include pre-existing failures unrelated to hosting.
Do not point CI at the Dilmune database.

Deploy:

- Environment `dilmune-production`
- Concurrency group `dilmune-production` (no overlapping deploys)
- Builds SPAs in GitHub Actions (spares the 1 vCPU box)
- Copies a git bundle + SPA tarballs + `scripts/deploy/dilmune-remote.sh`
- Remote script: flock, backup, dirty-tree check, checkout SHA, optional
  preserve of live compose/nginx, rebuild **api / settlement / reporting**
  only, nginx reload, health checks
- **Does not** copy or rewrite `ops/.env.hosted`
- **Does not** run migrations unless both dispatch inputs are set
- **Does not** run `seed`, `down -v`, `git reset --hard`, or volume deletes

---

## 3. Required GitHub Secrets

See the table in §1.5. After adding them, GitHub Actions will mask their
values in logs. Still:

- Never `echo` the private key
- Never `cat ops/.env.hosted` in a workflow
- Never enable `ACTIONS_STEP_DEBUG` / `ACTIONS_RUNNER_DEBUG` on a deploy
  that might dump env
- Rotate the deploy key if a log or laptop copy leaks

---

## 4. How to deploy from the GitHub website

1. Confirm CI is green for the commit you want.
2. Copy the **full 40-character** SHA (`git rev-parse HEAD` on
   `hackathon/fixes`).
3. GitHub → **Actions → Deploy Dilmune → Run workflow**.
4. Fields:
   - **git_sha**: that SHA
   - **apply_hosted_config**: leave **unchecked** until §7 is done and
     the repo files match the live box
   - **run_migrations**: leave **unchecked** for the initial deploys
   - **confirm_migration**: leave empty unless you intend to migrate
5. Run workflow. Approve the `dilmune-production` environment if
   reviewers are required.
6. Watch the job. It must print `deploy ok sha=…` and not dump secrets.

To migrate later (only when operators agree):

1. Take the automatic `pg_dump` the script writes under
   `/home/dilmune/fils-pay-backups/<stamp>/filspay.dump.sql`
2. Check **run_migrations**
3. Set **confirm_migration** to exactly `MIGRATE`
4. If the dump is empty, the script refuses to migrate

---

## 5. How to verify deployment success

From the Actions log (non-secret lines): `deploy ok sha=… previous=…`.

On Dilmune (operator SSH, not this workflow):

```
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/readyz
curl -sS -D- http://127.0.0.1/v1/transactions -o /dev/null
# expect 401 from the API, not the merchant SPA

curl -sS http://127.0.0.1/admin/ | head
# must not be the merchant checkout title

curl -sS -o /dev/null -w "%{http_code}\n" --max-time 3 http://127.0.0.1:3000/healthz
# connection refused once port 3000 is unpublished

cd /home/dilmune/fils-pay
git rev-parse HEAD
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted ps
```

`ops/.env.hosted` must still exist and must not appear in `git status`
as a tracked file.

---

## 6. How to roll back

Backups land in `/home/dilmune/fils-pay-backups/<UTC-stamp>/`
(`previous-head`, compose/nginx copies, SPA dirs, optional `pg_dump`,
image IDs). `.env.hosted` is copied there with mode `600` and is **not**
sent to GitHub.

### Fast path (images tagged `filspay-rollback-*:predeploy`)

```
cd /home/dilmune/fils-pay
# Identify the compose image names, then retag the rollback images onto them.
docker images | grep filspay-rollback
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d --no-deps --no-build api settlement reporting
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted exec -T proxy nginx -s reload
```

If image names do not match, skip to the git path.

### Git path (always available)

```
cd /home/dilmune/fils-pay
BACKUP=/home/dilmune/fils-pay-backups/STAMP_FROM_THE_FAILED_DEPLOY
git checkout --detach "$(cat "$BACKUP/previous-head")"
cp -a "$BACKUP/ops/docker-compose.yml" ops/
cp -a "$BACKUP/ops/docker-compose.hosted.yml" ops/
cp -a "$BACKUP/ops/nginx.hosted.conf" ops/
rm -rf ops/spa/web ops/spa/admin
cp -a "$BACKUP/spa/web" ops/spa/web
cp -a "$BACKUP/spa/admin" ops/spa/admin
# restore env only if the live file was damaged:
# cp -a "$BACKUP/ops/.env.hosted" ops/.env.hosted && chmod 600 ops/.env.hosted
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d --build --no-deps api settlement reporting
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted exec -T proxy nginx -t
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted exec -T proxy nginx -s reload
```

### Database

Restore `filspay.dump.sql` **only** if a migration in that deploy was
applied and must be undone. Restoring a dump overwrites live data — get
a second operator to confirm. There is no automated DB rollback in
GitHub Actions.

Do not `git reset --hard`. Do not `down -v`.

---

## 7. How to preserve existing Dilmune configuration

Known live modifications vs this repository (Phase 1 reconciliation).
**Do not assume the live files are identical.** An operator must diff
them on the box before the first deploy with **apply_hosted_config**
checked.

| Live change | In this repo? | Notes |
|---|---|---|
| API ports unpublished with `ports: !override []` | Yes — `ops/docker-compose.hosted.yml` | A bare `ports: []` does **not** unpublish |
| Settlement `command: ["daemon"]` | Yes — overlay **and** base compose | Matches `ENTRYPOINT ["/settlement"]` in `ops/Dockerfile.go` |
| Merchant SPA mounted at `ops/spa/web` → nginx `/` | Yes | Dist is gitignored except a placeholder |
| Admin SPA mounted at `ops/spa/admin` → nginx `/admin/` | Yes | Built with Vite base `/admin/` |
| Admin Vite base `/admin/` | Yes — `apps/admin/vite.config.ts` uses `/admin/` on `vite build` | Local `vite` dev stays `/` |
| Admin React Router basename `/admin` | Yes — `basename` derived from Vite `BASE_URL` | Production → `/admin`; local → `/` |
| Nginx `/admin/` separate from merchant `/` | Yes — `ops/nginx.hosted.conf` | Live file may still have extra `server_name` / TLS |
| `ops/.env.hosted` | **Never in git** | `ops/env.hosted.example` is the template only |

### Checklist before the first deploy (run on Dilmune)

```
cd /home/dilmune/fils-pay
git status --porcelain --untracked-files=no
# must be empty, or the workflow will abort

diff -u ops/docker-compose.yml                # vs GitHub copy after git fetch, or scp
diff -u ops/docker-compose.hosted.yml
diff -u ops/nginx.hosted.conf
grep -n "ports:" ops/docker-compose.hosted.yml
grep -n "daemon" ops/docker-compose.yml ops/docker-compose.hosted.yml
grep -n "location /admin" ops/nginx.hosted.conf
ls -l ops/.env.hosted ops/spa/web ops/spa/admin
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted config | sed -n '/^  api:/,/^  [a-z]/p'
```

Copy any live-only lines (TLS paths, `server_name`, extra locations)
into the GitHub files **before** ticking **apply_hosted_config**. Until
then, leave that checkbox off so the remote script **restores** the
backed-up compose/nginx after checking out application code.

SPA files are always replaced from the GitHub Actions build (not from
git). Merchant `/` and admin `/admin/` routing in `nginx.hosted.conf`
must stay split.

---

## 8. How to troubleshoot common failures

| Symptom | Likely cause | What to do |
|---|---|---|
| Deploy waits on environment | `dilmune-production` missing or needs approval | Create the environment; approve the run |
| `Missing DILMUNE_SSH_*` | Secrets not on that environment | Add environment secrets; re-run |
| `Host key verification failed` | `DILMUNE_SSH_HOST` ≠ `known_hosts` name, or key rotated | Re-run `ssh-keyscan` on a trusted path; update the secret |
| `Permission denied (publickey)` | Public key not in `authorized_keys`, or wrong user | User must be `dilmune`; confirm the matching `.pub` |
| `tracked files have uncommitted changes` | Live compose/nginx/app edits | Diff, commit into GitHub or stash on the server **without** `reset --hard` |
| `ops/.env.hosted is missing` | File never created or deleted | Restore from a backup dir; do not invent secrets in git |
| `confirm_migration is not MIGRATE` | Migrations checkbox without the word | Leave migrations off, or type `MIGRATE` |
| `pg_dump produced an empty file` | Postgres not healthy | Fix DB first; migrations did not run |
| `API /healthz failed after rebuild` | Image build OOM on 1 vCPU, or bad env | `docker compose logs api`; retry when the box is idle |
| `/admin/` is checkout HTML | Nginx still serving merchant dist for `/admin` | Keep **apply_hosted_config** off until `location /admin/` exists live, or merge that location by hand |
| CI fails `published: "3000"` | Overlay port reset lost | Restore `ports: !override []` |
| CI Go timezone flakes | Should not appear on `ubuntu-24.04` | Re-run the Go job; do not skip tests |

---

## What this pipeline will not do

- SSH or deploy from a developer laptop automatically
- Push-to-production on `git push`
- Seed the database
- Recreate Docker volumes
- Overwrite `ops/.env.hosted`
- Run migrations on the first workflow without explicit dual confirmation
- Generate real TLS certificates or SSH keys into the repo
