#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=deploy/scripts/load-env.sh
source "$SCRIPT_DIR/load-env.sh"

TEST_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEST_DIR"' EXIT

cat >"$TEST_DIR/literal.env" <<'ENV'
SESSION_SECRET='$(printf should-not-run)'
OPENAI_API_KEY='`printf should-not-run`'
NEXT_PUBLIC_APP_URL='https://team-os.example.com/path?literal=$HOME'
ENV

ai_team_os_load_env "$TEST_DIR/literal.env"
[[ "$SESSION_SECRET" == '$(printf should-not-run)' ]]
[[ "$OPENAI_API_KEY" == '`printf should-not-run`' ]]
[[ "$NEXT_PUBLIC_APP_URL" == 'https://team-os.example.com/path?literal=$HOME' ]]

cat >"$TEST_DIR/duplicate.env" <<'ENV'
NODE_ENV=production
NODE_ENV=development
ENV
if (ai_team_os_load_env "$TEST_DIR/duplicate.env" 2>/dev/null); then
  echo "duplicate dotenv keys were accepted" >&2
  exit 1
fi

cat >"$TEST_DIR/unknown.env" <<'ENV'
PATH=/tmp/untrusted
ENV
if (ai_team_os_load_env "$TEST_DIR/unknown.env" 2>/dev/null); then
  echo "an unsupported dotenv key was accepted" >&2
  exit 1
fi

cat >"$TEST_DIR/authorization.env" <<'ENV'
CONFIRM_MIGRATIONS=true
ENV
if (ai_team_os_load_env "$TEST_DIR/authorization.env" 2>/dev/null); then
  echo "deployment authorization was accepted from dotenv" >&2
  exit 1
fi

cat >"$TEST_DIR/release.env" <<'ENV'
RELEASE_ID=20260713010101-aaaaaaaaaaaa
RELEASE_PATH=/opt/ai-team-os/releases/20260713010101-aaaaaaaaaaaa
SOURCE_REF=refs/tags/ai-team-os-phase14-production-live-ready
SOURCE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ORCHESTRATOR_SCHEMA=2
ORCHESTRATOR_SHA256=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
RUNTIME_IMAGE=ai-team-os:20260713010101-aaaaaaaaaaaa
RUNTIME_IMAGE_ID=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
MIGRATION_IMAGE=ai-team-os-migration:20260713010101-aaaaaaaaaaaa
MIGRATION_IMAGE_ID=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
ENV
ai_team_os_load_env "$TEST_DIR/release.env" release
[[ "$SOURCE_REF" == 'refs/tags/ai-team-os-phase14-production-live-ready' ]]
[[ "$SOURCE_SHA" == 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ]]
[[ "$ORCHESTRATOR_SCHEMA" == 2 ]]

echo "Strict dotenv loader tests passed."
