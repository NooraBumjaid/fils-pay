#!/usr/bin/env bash
# Runs ON the Dilmune box from GitHub Actions over SSH.
# Never print env files, tokens, or key material. Never `set -x`.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/dilmune/fils-pay}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/dilmune/fils-pay-backups}"
DEPLOY_SHA="${DEPLOY_SHA:?DEPLOY_SHA is required}"
APPLY_HOSTED_CONFIG="${APPLY_HOSTED_CONFIG:-0}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"
CONFIRM_MIGRATION="${CONFIRM_MIGRATION:-}"
BUNDLE_PATH="${BUNDLE_PATH:?BUNDLE_PATH is required}"
SPA_WEB_PATH="${SPA_WEB_PATH:?SPA_WEB_PATH is required}"
SPA_ADMIN_PATH="${SPA_ADMIN_PATH:?SPA_ADMIN_PATH is required}"

if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: DEPLOY_SHA must be a 40-character lowercase hex commit" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
LOCK_FILE="$BACKUP_ROOT/deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "error: another deployment holds $LOCK_FILE" >&2
  exit 1
fi

cd "$REPO_DIR"

if [[ ! -f ops/.env.hosted ]]; then
  echo "error: ops/.env.hosted is missing on the server (not shipped by CI)" >&2
  exit 1
fi
chmod 600 ops/.env.hosted

if [[ ! -d .git ]]; then
  echo "error: $REPO_DIR is not a git checkout" >&2
  exit 1
fi

if [[ "$APPLY_HOSTED_CONFIG" != "1" ]]; then
  dirty="$(git status --porcelain --untracked-files=no | grep -vE 'ops/docker-compose\.yml|ops/docker-compose\.hosted\.yml|ops/nginx\.hosted\.conf' || true)"
else
  dirty="$(git status --porcelain --untracked-files=no || true)"
fi
if [[ -n "$dirty" ]]; then
  echo "error: tracked files have uncommitted changes; aborting so live edits are not overwritten" >&2
  echo "$dirty" >&2
  echo "Reconcile those files (see docs/hackathon/GITHUB_ACTIONS_DEPLOYMENT.md) then retry." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP_DIR/ops" "$BACKUP_DIR/spa"
PREVIOUS_HEAD="$(git rev-parse HEAD)"
printf '%s\n' "$PREVIOUS_HEAD" >"$BACKUP_DIR/previous-head"
printf '%s\n' "$DEPLOY_SHA" >"$BACKUP_DIR/target-sha"
cp -a ops/docker-compose.yml "$BACKUP_DIR/ops/" 2>/dev/null || true
cp -a ops/docker-compose.hosted.yml "$BACKUP_DIR/ops/" 2>/dev/null || true
cp -a ops/nginx.hosted.conf "$BACKUP_DIR/ops/" 2>/dev/null || true
if [[ -d ops/spa/web ]]; then cp -a ops/spa/web "$BACKUP_DIR/spa/"; fi
if [[ -d ops/spa/admin ]]; then cp -a ops/spa/admin "$BACKUP_DIR/spa/"; fi
# Private copy of secrets for operator rollback only. Never sent back to GitHub.
cp -a ops/.env.hosted "$BACKUP_DIR/ops/.env.hosted"
chmod 600 "$BACKUP_DIR/ops/.env.hosted"

compose() {
  docker compose \
    -f ops/docker-compose.yml \
    -f ops/docker-compose.hosted.yml \
    --env-file ops/.env.hosted \
    "$@"
}

tag_rollback_image() {
  local svc="$1"
  local cid
  cid="$(compose ps -q "$svc" 2>/dev/null || true)"
  if [[ -n "$cid" ]]; then
    local img
    img="$(docker inspect -f '{{.Image}}' "$cid")"
    docker tag "$img" "filspay-rollback-${svc}:predeploy"
    printf '%s %s\n' "$svc" "$img" >>"$BACKUP_DIR/images.txt"
  fi
}

tag_rollback_image api || true
tag_rollback_image settlement || true
tag_rollback_image reporting || true
tag_rollback_image proxy || true

git fetch --quiet "$BUNDLE_PATH" "$DEPLOY_SHA:refs/tmp/gha-deploy"
git checkout --detach "$DEPLOY_SHA"
HEAD_NOW="$(git rev-parse HEAD)"
if [[ "$HEAD_NOW" != "$DEPLOY_SHA" ]]; then
  echo "error: checkout HEAD $HEAD_NOW does not match $DEPLOY_SHA" >&2
  exit 1
fi

# git checkout must not drop the server-only env file (it is gitignored).
if [[ ! -f ops/.env.hosted ]]; then
  echo "error: ops/.env.hosted disappeared after checkout; restoring from backup" >&2
  cp -a "$BACKUP_DIR/ops/.env.hosted" ops/.env.hosted
  chmod 600 ops/.env.hosted
  echo "error: refusing to continue until an operator confirms why it vanished" >&2
  exit 1
fi

if [[ "$APPLY_HOSTED_CONFIG" != "1" ]]; then
  echo "preserving live compose/nginx (APPLY_HOSTED_CONFIG=0)"
  if [[ -f "$BACKUP_DIR/ops/docker-compose.yml" ]]; then
    cp -a "$BACKUP_DIR/ops/docker-compose.yml" ops/docker-compose.yml
  fi
  if [[ -f "$BACKUP_DIR/ops/docker-compose.hosted.yml" ]]; then
    cp -a "$BACKUP_DIR/ops/docker-compose.hosted.yml" ops/docker-compose.hosted.yml
  fi
  if [[ -f "$BACKUP_DIR/ops/nginx.hosted.conf" ]]; then
    cp -a "$BACKUP_DIR/ops/nginx.hosted.conf" ops/nginx.hosted.conf
  fi
fi

mkdir -p ops/spa/web ops/spa/admin
rm -rf ops/spa/web/* ops/spa/admin/*
cp -a "$SPA_WEB_PATH"/. ops/spa/web/
cp -a "$SPA_ADMIN_PATH"/. ops/spa/admin/

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  if [[ "$CONFIRM_MIGRATION" != "MIGRATE" ]]; then
    echo "error: run_migrations requested but confirm_migration is not MIGRATE" >&2
    exit 1
  fi
  echo "taking pg_dump before migrate"
  compose exec -T postgres pg_dump -U filspay -d filspay --no-owner --no-acl \
    >"$BACKUP_DIR/filspay.dump.sql"
  chmod 600 "$BACKUP_DIR/filspay.dump.sql"
  if [[ ! -s "$BACKUP_DIR/filspay.dump.sql" ]]; then
    echo "error: pg_dump produced an empty file; refusing to migrate" >&2
    exit 1
  fi
  compose run --rm --no-deps migrate
else
  echo "skipping migrations (RUN_MIGRATIONS=0)"
fi

# Build/recreate app services only. Do not remove volumes. Do not run seed.
compose up -d --build --no-deps api settlement reporting

echo "waiting for API health inside the compose network"
ok=0
for _ in $(seq 1 30); do
  if compose exec -T api node -e "fetch('http://127.0.0.1:3000/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" != "1" ]]; then
  echo "error: API /healthz failed after rebuild" >&2
  exit 1
fi

if compose ps -q proxy >/dev/null 2>&1 && [[ -n "$(compose ps -q proxy)" ]]; then
  compose exec -T proxy nginx -t
  compose exec -T proxy nginx -s reload
else
  compose up -d --no-deps proxy
fi

echo "public health checks via loopback nginx"
curl -fsS --max-time 10 http://127.0.0.1/healthz >/dev/null
curl -fsS --max-time 10 http://127.0.0.1/readyz >/dev/null

admin_body="$(curl -fsS --max-time 10 http://127.0.0.1/admin/ | head -c 2000 || true)"
if echo "$admin_body" | grep -qi "FilsPay Checkout"; then
  echo "error: /admin/ looks like the merchant checkout SPA" >&2
  exit 1
fi

printf 'deploy ok sha=%s previous=%s backup=%s apply_hosted_config=%s migrations=%s\n' \
  "$DEPLOY_SHA" "$PREVIOUS_HEAD" "$BACKUP_DIR" "$APPLY_HOSTED_CONFIG" "$RUN_MIGRATIONS"
