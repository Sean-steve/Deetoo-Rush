#!/usr/bin/env bash
# Install outside Git to /srv/deetoo/shared/deploy.sh; run as deploy.
# Invocation: bash /srv/deetoo/shared/deploy.sh <40-character-main-commit-sha>
set -Eeuo pipefail

SHA="${1:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full lowercase 40-character commit SHA' >&2; exit 2; }

BASE=/srv/deetoo
REPO=https://github.com/Sean-steve/Deetoo-Rush.git
REL="$BASE/releases/$SHA"
mkdir -p "$BASE/releases" "$BASE/shared/migration-approved"
exec 9>"$BASE/shared/deploy.lock"
flock -x 9

[[ -r "$BASE/shared/.env" ]] || { echo 'Missing production shared/.env' >&2; exit 3; }
[[ -r "$BASE/shared/ecosystem.config.cjs" ]] || { echo 'Missing PM2 ecosystem configuration' >&2; exit 3; }

# A delayed/replayed workflow must never deploy an older main commit.
MAIN_SHA="$(git ls-remote "$REPO" refs/heads/main | awk '{print $1}')"
[[ "$MAIN_SHA" == "$SHA" ]] || { echo "Refusing stale deployment; main=$MAIN_SHA requested=$SHA" >&2; exit 4; }

if [[ ! -d "$REL/.git" ]]; then
  [[ ! -e "$REL" ]] || { echo "Incomplete release directory exists: $REL" >&2; exit 5; }
  git clone --depth 1 --branch main --single-branch "$REPO" "$REL"
fi
ACTUAL="$(git -C "$REL" rev-parse HEAD)"
[[ "$ACTUAL" == "$SHA" ]] || { echo "Cloned SHA $ACTUAL differs from CI SHA $SHA" >&2; exit 5; }

ln -s "$BASE/shared/.env" "$REL/.env" 2>/dev/null || {
  [[ "$(readlink "$REL/.env" || true)" == "$BASE/shared/.env" ]] || exit 5
}
PREVIOUS="$(readlink -f "$BASE/current" 2>/dev/null || true)"

# Review, back up and approve altered production schema BEFORE deployment.
if [[ -n "$PREVIOUS" && -d "$PREVIOUS/apps/api/src/db/migrations" ]]; then
  if ! diff -qr "$PREVIOUS/apps/api/src/db/migrations" "$REL/apps/api/src/db/migrations" >/dev/null; then
    [[ -f "$BASE/shared/migration-approved/$SHA" ]] || {
      echo "Schema change blocked. Review migration SQL, test staging and verify an off-host DB backup." >&2
      echo "After explicit approval: touch $BASE/shared/migration-approved/$SHA" >&2
      exit 6
    }
  fi
fi

cd "$REL"
# Workers and migration commands need tsx (currently a devDependency).
pnpm install --frozen-lockfile --prod=false
pnpm typecheck
pnpm build
# Transactional/checksum-protected migration runner; DB rollback is NOT automatic.
pnpm db:migrate

ACTIVATED=0
rollback_on_error() {
  local rc=$?
  trap - ERR
  if [[ "$ACTIVATED" == 1 ]]; then
    if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
      echo 'Deploy failed after cutover: restoring previous application files/processes.' >&2
      ln -sfn "$PREVIOUS" "$BASE/current.rollback"
      mv -Tf "$BASE/current.rollback" "$BASE/current"
      pm2 startOrReload "$BASE/shared/ecosystem.config.cjs" --update-env || true
      pm2 save || true
    else
      echo 'First deploy failed: no previous version to roll back to. Inspect PM2 and correct the deployment.' >&2
    fi
  fi
  exit "$rc"
}
trap rollback_on_error ERR

ln -sfn "$REL" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
ACTIVATED=1
pm2 startOrReload "$BASE/shared/ecosystem.config.cjs" --update-env
pm2 save
# /health/ready checks the actual DB, PostGIS and Redis, unlike /health/live.
curl --retry 10 --retry-delay 2 --retry-connrefused -fsS http://127.0.0.1:3000/health/ready >/dev/null
printf 'Deetoo production application deployed: %s\n' "$SHA"
