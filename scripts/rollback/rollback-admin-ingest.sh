#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ai-knowledge-main}"
APP_NAME="${APP_NAME:-ai-knowledge-main}"
ROLLBACK_REF="${ROLLBACK_REF:-${1:-}}"
CONFIRM_ROLLBACK="${CONFIRM_ROLLBACK:-false}"
ALLOW_ARBITRARY_ROLLBACK="${ALLOW_ARBITRARY_ROLLBACK:-false}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3021/admin-ingest?app=ingest-admin&platform=web}"

if [[ -z "$ROLLBACK_REF" ]]; then
  echo "ROLLBACK_ERROR=ROLLBACK_REF_REQUIRED"
  echo "Usage: CONFIRM_ROLLBACK=true ROLLBACK_REF=release/admin-ingest-... bash scripts/rollback/rollback-admin-ingest.sh"
  exit 1
fi

if [[ "$CONFIRM_ROLLBACK" != "true" ]]; then
  echo "ROLLBACK_ERROR=CONFIRM_ROLLBACK_REQUIRED"
  exit 1
fi

if [[ "$ALLOW_ARBITRARY_ROLLBACK" != "true" ]]; then
  if [[ "$ROLLBACK_REF" != release/admin-ingest-* && "$ROLLBACK_REF" != backup/admin-ingest-* ]]; then
    echo "ROLLBACK_ERROR=UNSAFE_ROLLBACK_REF"
    echo "Rollback ref must start with release/admin-ingest- or backup/admin-ingest-."
    exit 1
  fi
fi

cd "$APP_DIR"
CURRENT_HEAD="$(git rev-parse HEAD)"
BACKUP_REF="backup/admin-ingest-before-rollback-$(date +%Y%m%d-%H%M%S)"

echo "ROLLBACK_START=true"
echo "APP_DIR=$APP_DIR"
echo "CURRENT_HEAD=$CURRENT_HEAD"
echo "ROLLBACK_REF=$ROLLBACK_REF"
echo "BACKUP_REF=$BACKUP_REF"

git fetch origin --tags
git branch "$BACKUP_REF" "$CURRENT_HEAD"
git checkout main
git reset --hard "$ROLLBACK_REF"
npm install --include=dev
npx prisma generate
npm run typecheck
npm run lint
npm run build
pm2 restart "$APP_NAME" --update-env
sleep 3
curl -fsS -I "$HEALTH_URL" >/tmp/admin-ingest-rollback-health.txt

echo "ROLLBACK_DONE=true"
echo "ROLLBACK_HEAD=$(git rev-parse HEAD)"
echo "BACKUP_REF=$BACKUP_REF"
