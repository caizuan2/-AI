#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077
ulimit -c 0

SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
validate_clean_environment() {
  local exported_name
  while IFS= read -r exported_name; do
    case "$exported_name" in
      PATH|HOME|LANG|LC_ALL|TZ|AI_TEAM_OS_CLEAN_ENVIRONMENT|AI_TEAM_OS_ENV_FILE|PWD|SHLVL|_|MSYSTEM|SYSTEMROOT|WINDIR) ;;
      *) return 1 ;;
    esac
  done < <(compgen -e)

  [[ ${PATH:-} == "$SAFE_PATH" && ${HOME:-} == /root \
    && ${LANG:-} == C.UTF-8 && ${LC_ALL:-} == C.UTF-8 && ${TZ:-} == UTC ]] \
    || return 1
  if [[ -v AI_TEAM_OS_ENV_FILE ]]; then
    [[ "$AI_TEAM_OS_ENV_FILE" != *$'\n'* && "$AI_TEAM_OS_ENV_FILE" != *$'\r'* ]] || return 1
  fi
}

if [[ ${AI_TEAM_OS_CLEAN_ENVIRONMENT:-} != 1 ]]; then
  [[ -x /usr/bin/env && -x /usr/bin/bash ]] || {
    printf 'A trusted /usr/bin/env and /usr/bin/bash are required.\n' >&2
    exit 1
  }
  CLEAN_ENV=(
    -i
    "PATH=$SAFE_PATH"
    HOME=/root
    LANG=C.UTF-8
    LC_ALL=C.UTF-8
    TZ=UTC
    AI_TEAM_OS_CLEAN_ENVIRONMENT=1
  )
  if [[ -v AI_TEAM_OS_ENV_FILE ]]; then
    [[ "$AI_TEAM_OS_ENV_FILE" != *$'\n'* && "$AI_TEAM_OS_ENV_FILE" != *$'\r'* ]] || {
      printf 'Refusing a multiline value for AI_TEAM_OS_ENV_FILE.\n' >&2
      exit 1
    }
    CLEAN_ENV+=("AI_TEAM_OS_ENV_FILE=${AI_TEAM_OS_ENV_FILE}")
  fi
  exec /usr/bin/env "${CLEAN_ENV[@]}" /usr/bin/bash --noprofile --norc "$0" "$@"
fi
validate_clean_environment || {
  printf 'Refusing a forged or contaminated clean-environment marker.\n' >&2
  exit 1
}
unset AI_TEAM_OS_CLEAN_ENVIRONMENT CLEAN_ENV
export PATH=$SAFE_PATH
readonly SAFE_PATH PATH

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
ENV_FILE=${AI_TEAM_OS_ENV_FILE:-/etc/ai-team-os/ai-team-os.env}
ENV_FILE_EXPLICIT=false
FORMAT=text
TIMEOUT_SECONDS=10
PROJECT_NAME=ai-team-os
MESSAGE_AUTH_FILE=""
MESSAGE_URL=""
TEMP_DIR=""
RUNTIME_DIR=/run/ai-team-os
HEALTH_LOCK_FILE=$RUNTIME_DIR/health.lock
DEPLOY_STATE_DIR=/var/lib/ai-team-os
CURRENT_RELEASE_FILE=$DEPLOY_STATE_DIR/current-release
EXPECTED_RELEASE_SHA=""
EXPECTED_RUNTIME_IMAGE_ID=""
ORCHESTRATOR_V1_RELATIVE_FILES=(
  .dockerignore
  .env.production.template
  deploy/docker/Dockerfile.production
  deploy/docker/docker-compose.yml
  deploy/nginx/ai-team-os.conf
  deploy/scripts/backup.sh
  deploy/scripts/deploy.sh
  deploy/scripts/load-env.sh
  deploy/scripts/rollback.sh
  deploy/scripts/test-env-loader.sh
  deploy/scripts/verify-deployment.mjs
  deploy/scripts/verify-team-os-schema.mjs
)
ORCHESTRATOR_V2_RELATIVE_FILES=(
  "${ORCHESTRATOR_V1_RELATIVE_FILES[@]}"
  deploy/scripts/production-health-check.sh
  deploy/scripts/server-init.sh
  deploy/scripts/cloud-preflight-check.sh
)

declare -a CHECK_ORDER=(release container api database ai message)
declare -A CHECK_STATUS=()
declare -A CHECK_DETAIL=()
declare -A CHECK_HTTP=()
declare -A CHECK_DURATION_MS=()

usage() {
  cat <<'USAGE'
Usage: production-health-check.sh [options]

Runs read-only production checks and emits a sanitized health report. Response
bodies, URLs, cookies, bearer tokens, database targets, and API keys are never
included in the report.

  --env-file PATH          Strict production dotenv file
  --format text|json       Report format (default: text)
  --timeout SECONDS        Per-request timeout from 1 through 60 (default: 10)
  --project NAME           Docker Compose project name (default: ai-team-os)
  --message-url URL        Override the notification readiness URL
  --message-auth-file PATH One-line Cookie or Authorization header file. The
                           path, not its contents, is passed to curl.
  -h, --help               Show this help

Without --message-auth-file, HTTP 401/403 from the notification endpoint is
reported unverified: the authentication boundary is reachable, but message
storage and delivery readiness have not been verified. A 200 response is only
healthy when an auth file was supplied and the body contains success=true.

Exit codes: 0 = healthy, 1 = unhealthy, 2 = degraded/unverified.
USAGE
}

die() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

now_milliseconds() {
  date +%s%3N
}

prepare_sensitive_runtime() {
  local mode owner stale

  (( EUID == 0 )) || die "production health checks must run as root"
  [[ -d /run && ! -L /run ]] || die "/run must be a real directory"
  [[ ! -L "$RUNTIME_DIR" ]] || die "health runtime directory must not be a symbolic link"
  install -d -o root -g root -m 0750 -- "$RUNTIME_DIR"
  [[ -d "$RUNTIME_DIR" && ! -L "$RUNTIME_DIR" ]] \
    || die "health runtime directory is invalid"
  owner=$(stat -c '%u' "$RUNTIME_DIR")
  mode=$(stat -c '%a' "$RUNTIME_DIR")
  [[ "$owner" == 0 ]] || die "health runtime directory must be owned by root"
  (( (8#$mode & 022) == 0 )) \
    || die "health runtime directory must not be group/world writable"
  [[ $(findmnt -n -o FSTYPE -T "$RUNTIME_DIR") == tmpfs ]] \
    || die "health response files require a tmpfs-backed /run/ai-team-os"
  [[ -r /proc/swaps ]] || die "active swap state could not be inspected"
  if awk 'NR > 1 { active = 1 } END { exit active ? 0 : 1 }' /proc/swaps; then
    die "health response files require swap to be disabled"
  fi

  if [[ -e "$HEALTH_LOCK_FILE" || -L "$HEALTH_LOCK_FILE" ]]; then
    [[ -f "$HEALTH_LOCK_FILE" && ! -L "$HEALTH_LOCK_FILE" ]] \
      || die "health lock file must be a regular file, not a symbolic link or special file"
  fi
  exec 8>"$HEALTH_LOCK_FILE"
  chown root:root "$HEALTH_LOCK_FILE"
  chmod 0600 "$HEALTH_LOCK_FILE"
  [[ -f "$HEALTH_LOCK_FILE" && ! -L "$HEALTH_LOCK_FILE" ]] \
    || die "health lock file is invalid"
  [[ $(stat -c '%u' "$HEALTH_LOCK_FILE") == 0 ]] \
    || die "health lock file must be owned by root"
  flock -n 8 || die "another production health check is already running"

  # A SIGKILL cannot run the EXIT trap. The root-only lock lets the next run
  # safely remove response directories left behind on the non-persistent tmpfs.
  shopt -s nullglob
  for stale in "$RUNTIME_DIR"/.health.*; do
    [[ -d "$stale" && ! -L "$stale" ]] \
      || die "unexpected health response artifact found in the runtime directory"
    [[ $(stat -c '%u' "$stale") == 0 ]] \
      || die "stale health response directory is not owned by root"
    rm -rf -- "$stale"
  done
  shopt -u nullglob

  TEMP_DIR=$(mktemp -d "$RUNTIME_DIR/.health.XXXXXXXX")
  chown root:root "$TEMP_DIR"
  chmod 0700 "$TEMP_DIR"
}

set_check() {
  local name=$1
  local status=$2
  local detail=$3
  local http_code=${4:-0}
  local duration=${5:-0}
  CHECK_STATUS["$name"]=$status
  CHECK_DETAIL["$name"]=$detail
  CHECK_HTTP["$name"]=$http_code
  CHECK_DURATION_MS["$name"]=$duration
}

calculate_orchestrator_sha256() {
  local root=$1
  local schema=$2
  local selected_array relative_path file_hash
  case "$schema" in
    1) selected_array=ORCHESTRATOR_V1_RELATIVE_FILES ;;
    2) selected_array=ORCHESTRATOR_V2_RELATIVE_FILES ;;
    *) return 1 ;;
  esac
  local -n selected_files="$selected_array"
  {
    for relative_path in "${selected_files[@]}"; do
      [[ -f "$root/$relative_path" && ! -L "$root/$relative_path" ]] || return 1
      file_hash=$(sha256sum "$root/$relative_path" | cut -d ' ' -f 1) || return 1
      printf '%s %s\n' "$relative_path" "$file_hash"
    done
  } | sha256sum | cut -d ' ' -f 1
}

check_release_state() {
  local started finished current_release metadata_file mode unsafe_entry actual_orchestrator_sha256
  started=$(now_milliseconds)

  if [[ ! -f "$CURRENT_RELEASE_FILE" || -L "$CURRENT_RELEASE_FILE" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'recorded current release is missing or invalid' 0 "$((finished - started))"
    return
  fi
  mode=$(stat -c '%a' "$CURRENT_RELEASE_FILE" 2>/dev/null || printf '777')
  if [[ $(stat -c '%u' "$CURRENT_RELEASE_FILE" 2>/dev/null || printf 'unknown') != 0 ]] \
    || (( (8#$mode & 022) != 0 )) \
    || (( $(stat -c '%s' "$CURRENT_RELEASE_FILE" 2>/dev/null || printf '4097') > 4096 )); then
    finished=$(now_milliseconds)
    set_check release unhealthy 'recorded current release control file failed ownership or permission checks' 0 "$((finished - started))"
    return
  fi

  current_release=$(<"$CURRENT_RELEASE_FILE")
  if [[ ! "$current_release" =~ ^/opt/ai-team-os/releases/[0-9]{14}-[0-9a-fA-F]{12}$ ]] \
    || [[ ! -d "$current_release" || -L "$current_release" ]] \
    || [[ $(readlink -f -- "$current_release" 2>/dev/null || true) != "$current_release" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'recorded current release path failed validation' 0 "$((finished - started))"
    return
  fi

  unsafe_entry=$(find "$current_release" -xdev ! -user root -print -quit 2>/dev/null) || {
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release ownership could not be inspected' 0 "$((finished - started))"
    return
  }
  if [[ -n "$unsafe_entry" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release contains a non-root-owned entry' 0 "$((finished - started))"
    return
  fi
  unsafe_entry=$(find "$current_release" -xdev -perm /022 -print -quit 2>/dev/null) || {
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release permissions could not be inspected' 0 "$((finished - started))"
    return
  }
  if [[ -n "$unsafe_entry" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release contains a group/world-writable entry' 0 "$((finished - started))"
    return
  fi
  unsafe_entry=$(find "$current_release" -xdev ! -type f ! -type d -print -quit 2>/dev/null) || {
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release entry types could not be inspected' 0 "$((finished - started))"
    return
  }
  if [[ -n "$unsafe_entry" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release contains a symlink or special entry' 0 "$((finished - started))"
    return
  fi

  metadata_file="$current_release/.release.env"
  if [[ ! -f "$metadata_file" || -L "$metadata_file" ]] \
    || [[ $(stat -c '%u' "$metadata_file" 2>/dev/null || printf 'unknown') != 0 ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release metadata is missing or invalid' 0 "$((finished - started))"
    return
  fi
  mode=$(stat -c '%a' "$metadata_file" 2>/dev/null || printf '777')
  if (( (8#$mode & 022) != 0 )) \
    || (( $(stat -c '%s' "$metadata_file" 2>/dev/null || printf '16385') > 16384 )); then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release metadata failed permission or size checks' 0 "$((finished - started))"
    return
  fi

  unset RELEASE_ID RELEASE_PATH SOURCE_REF SOURCE_SHA ORCHESTRATOR_SCHEMA ORCHESTRATOR_SHA256 \
    RUNTIME_IMAGE RUNTIME_IMAGE_ID MIGRATION_IMAGE MIGRATION_IMAGE_ID
  if ! ai_team_os_load_env "$metadata_file" release; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release metadata could not be parsed' 0 "$((finished - started))"
    return
  fi
  if [[ "${RELEASE_PATH:-}" != "$current_release" ]] \
    || [[ ! "${RELEASE_ID:-}" =~ ^[0-9]{14}-[0-9a-fA-F]{12}$ ]] \
    || [[ "${current_release##*/}" != "${RELEASE_ID:-}" ]] \
    || [[ ! "${SOURCE_REF:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] \
    || [[ "${SOURCE_REF:-}" == *".."* || "${SOURCE_REF:-}" == *"//"* || "${SOURCE_REF:-}" == */ ]] \
    || [[ "${SOURCE_REF:-}" == *"@{"* || "${SOURCE_REF:-}" == *.lock ]] \
    || [[ ! "${SOURCE_SHA:-}" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] \
    || [[ "${RELEASE_ID:15:12}" != "${SOURCE_SHA:0:12}" ]] \
    || [[ "${ORCHESTRATOR_SCHEMA:-}" != 1 && "${ORCHESTRATOR_SCHEMA:-}" != 2 ]] \
    || [[ ! "${ORCHESTRATOR_SHA256:-}" =~ ^[0-9a-fA-F]{64}$ ]] \
    || [[ "${RUNTIME_IMAGE:-}" != "ai-team-os:${RELEASE_ID:-invalid}" ]] \
    || [[ ! "${RUNTIME_IMAGE_ID:-}" =~ ^sha256:[0-9a-fA-F]{64}$ ]] \
    || [[ "${MIGRATION_IMAGE:-}" != "ai-team-os-migration:${RELEASE_ID:-invalid}" ]] \
    || [[ ! "${MIGRATION_IMAGE_ID:-}" =~ ^sha256:[0-9a-fA-F]{64}$ ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release metadata identity is inconsistent' 0 "$((finished - started))"
    return
  fi

  actual_orchestrator_sha256=$(calculate_orchestrator_sha256 "$current_release" "$ORCHESTRATOR_SCHEMA" 2>/dev/null) || {
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release orchestrator bundle could not be hashed' 0 "$((finished - started))"
    return
  }
  if [[ "${actual_orchestrator_sha256,,}" != "${ORCHESTRATOR_SHA256,,}" ]]; then
    finished=$(now_milliseconds)
    set_check release unhealthy 'current release orchestrator hash does not match immutable metadata' 0 "$((finished - started))"
    return
  fi

  EXPECTED_RELEASE_SHA=${SOURCE_SHA,,}
  EXPECTED_RUNTIME_IMAGE_ID=${RUNTIME_IMAGE_ID,,}
  finished=$(now_milliseconds)
  set_check release healthy 'current release tree, metadata, and orchestrator hash are consistent' 0 "$((finished - started))"
}

validate_safe_url() {
  local label=$1
  local value=$2
  [[ "$value" =~ ^https?://[^/@[:space:]]+(/[^[:space:]]*)?$ ]] \
    || die "${label} must be an HTTP(S) URL without embedded credentials or whitespace"
  [[ "$value" != *$'\r'* && "$value" != *$'\n'* ]] \
    || die "${label} contains a line break"
}

validate_env_loader() {
  local loader="$SCRIPT_DIR/load-env.sh"
  [[ -f "$loader" && ! -L "$loader" ]] \
    || die "strict environment loader is missing or is a symbolic link"
  if (( EUID == 0 )); then
    local mode
    [[ $(stat -c '%u' "$loader") == 0 ]] \
      || die "strict environment loader must be owned by root"
    mode=$(stat -c '%a' "$loader")
    (( (8#$mode & 022) == 0 )) \
      || die "strict environment loader must not be group/world writable"
  fi

  # shellcheck source=deploy/scripts/load-env.sh
  source "$loader"
}

load_environment_if_available() {
  validate_env_loader
  if [[ ! -e "$ENV_FILE" && ! -L "$ENV_FILE" ]]; then
    [[ "$ENV_FILE_EXPLICIT" != true ]] \
      || die "environment file not found"
    return 0
  fi

  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] \
    || die "environment file must be a regular file, not a symbolic link"
  ENV_FILE=$(readlink -f -- "$ENV_FILE")
  if (( EUID == 0 )); then
    local mode
    [[ $(stat -c '%u' "$ENV_FILE") == 0 ]] \
      || die "environment file must be owned by root"
    mode=$(stat -c '%a' "$ENV_FILE")
    (( (8#$mode & 077) == 0 )) \
      || die "environment file must use mode 0600 or stricter"
  fi

  ai_team_os_load_env "$ENV_FILE" \
    || die "production environment parsing failed"
}

validate_message_auth_file() {
  [[ -n "$MESSAGE_AUTH_FILE" ]] || return 0
  [[ -f "$MESSAGE_AUTH_FILE" && ! -L "$MESSAGE_AUTH_FILE" ]] \
    || die "message auth file must be a regular file, not a symbolic link"
  MESSAGE_AUTH_FILE=$(readlink -f -- "$MESSAGE_AUTH_FILE")
  local mode owner
  mode=$(stat -c '%a' "$MESSAGE_AUTH_FILE")
  owner=$(stat -c '%u' "$MESSAGE_AUTH_FILE")
  (( (8#$mode & 077) == 0 )) \
    || die "message auth file must use mode 0600 or stricter"
  if (( EUID == 0 )); then
    [[ "$owner" == 0 ]] || die "message auth file must be owned by root"
  else
    [[ "$owner" == "$EUID" ]] || die "message auth file must be owned by the current user"
  fi
  node - "$MESSAGE_AUTH_FILE" <<'NODE' \
    || die "message auth file must contain exactly one Cookie or Authorization Bearer header"
const fs = require("node:fs");
let value = fs.readFileSync(process.argv[2], "utf8");
if (value.endsWith("\n")) value = value.slice(0, -1);
const valid = value.length > 0
  && !value.includes("\n")
  && !value.includes("\r")
  && (/^Cookie:\s+\S/u.test(value) || /^Authorization:\s+Bearer\s+\S/u.test(value));
process.exit(valid ? 0 : 1);
NODE
}

validate_authenticated_message_target() {
  [[ -n "$MESSAGE_AUTH_FILE" ]] || return 0
  node - "$MESSAGE_URL" "${NEXT_PUBLIC_APP_URL:-}" <<'NODE' \
    || die "authenticated message target must be loopback or the exact production HTTPS origin"
const [targetValue, publicValue] = process.argv.slice(2);
try {
  const target = new URL(targetValue);
  const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(target.hostname)
    && ["http:", "https:"].includes(target.protocol);
  let isProductionOrigin = false;
  if (publicValue) {
    const production = new URL(publicValue);
    isProductionOrigin = production.protocol === "https:" && target.origin === production.origin;
  }
  process.exit(isLoopback || isProductionOrigin ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

probe_http() {
  local url=$1
  local output_file=$2
  local code curl_status
  shift 2
  set +e
  code=$(curl --disable --noproxy '*' \
    --silent \
    --output "$output_file" \
    --write-out '%{http_code}' \
    --connect-timeout "$TIMEOUT_SECONDS" \
    --max-time "$TIMEOUT_SECONDS" \
    --max-redirs 0 \
    --max-filesize 1048576 \
    --proto '=http,https' \
    --header 'Accept: application/json' \
    "$@" \
    -- "$url" 2>/dev/null)
  curl_status=$?
  set -e
  if (( curl_status != 0 )); then
    printf '000'
  else
    printf '%s' "$code"
  fi
}

json_flag_is_true() {
  local file=$1
  local expression=$2
  node - "$file" "$expression" <<'NODE'
const fs = require("node:fs");
const [file, expression] = process.argv.slice(2);
try {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = expression.split(".").reduce((current, key) => current?.[key], payload);
  process.exit(value === true ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

database_readiness_is_ready() {
  local file=$1
  node - "$file" <<'NODE'
const fs = require("node:fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.exit(
    payload.checks?.database?.connected === true && payload.checks?.schema?.ready === true
      ? 0
      : 1
  );
} catch {
  process.exit(1);
}
NODE
}

ai_readiness_is_ready() {
  local file=$1
  node - "$file" <<'NODE'
const fs = require("node:fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const missing = payload.checks?.ai?.missingEnv;
  process.exit(
    payload.checks?.ai?.checked === true
      && Array.isArray(missing)
      && missing.length === 0
      && payload.checks?.embedding?.configured === true
      ? 0
      : 1
  );
} catch {
  process.exit(1);
}
NODE
}

readiness_response_is_ready() {
  local file=$1
  node - "$file" <<'NODE'
const fs = require("node:fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const availabilityIsReady = (value) => {
    if (typeof value === "boolean") return value;
    if (!value || typeof value !== "object") return false;
    return value.ok === true
      || value.ready === true
      || value.available === true
      || value.configured === true;
  };
  const selectAvailability = (name) => (
    Object.prototype.hasOwnProperty.call(payload, name)
      ? payload[name]
      : payload.checks?.[name]
  );
  process.exit(
    payload.ok === true
      && availabilityIsReady(selectAvailability("auth"))
      && availabilityIsReady(selectAvailability("license"))
      ? 0
      : 1
  );
} catch {
  process.exit(1);
}
NODE
}

status_identity_is_ready() {
  local file=$1
  local expected_sha=$2
  node - "$file" "$expected_sha" <<'NODE'
const fs = require("node:fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const expectedSha = process.argv[3];
  const ready = payload.success === true
    && payload.module === "AI Team OS"
    && payload.environment === "production"
    && payload.releaseSha === expectedSha;
  process.exit(ready ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

check_container() {
  local started finished container_ids container_id running health image_id
  started=$(now_milliseconds)
  container_ids=$(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter 'label=com.docker.compose.service=team-os' \
    --format '{{.ID}}' 2>/dev/null || true)
  finished=$(now_milliseconds)

  if [[ -z "$container_ids" ]]; then
    set_check container unhealthy 'team-os container is not running' 0 "$((finished - started))"
    return
  fi
  if [[ "$container_ids" == *$'\n'* ]]; then
    set_check container unhealthy 'multiple team-os containers are running' 0 "$((finished - started))"
    return
  fi

  container_id=$container_ids
  running=$(docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null || true)
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id" 2>/dev/null || true)
  image_id=$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || true)
  finished=$(now_milliseconds)
  if [[ "${CHECK_STATUS[release]:-unhealthy}" != healthy ]]; then
    set_check container unhealthy 'container identity cannot be trusted without valid release state' 0 "$((finished - started))"
  elif [[ "$running" == true && "$health" == healthy && "${image_id,,}" == "$EXPECTED_RUNTIME_IMAGE_ID" ]]; then
    set_check container healthy 'single container, Docker health, and recorded image ID are consistent' 0 "$((finished - started))"
  elif [[ "$running" == true && "$health" == healthy ]]; then
    set_check container unhealthy 'container image ID does not match the recorded release' 0 "$((finished - started))"
  elif [[ "$running" == true ]]; then
    set_check container unhealthy "container is running but Docker health is ${health:-unknown}" 0 "$((finished - started))"
  else
    set_check container unhealthy 'container is not in running state' 0 "$((finished - started))"
  fi
}

check_api() {
  local started finished code response_file
  response_file="$TEMP_DIR/api.json"
  started=$(now_milliseconds)
  code=$(probe_http "$HEALTH_URL" "$response_file")
  finished=$(now_milliseconds)
  if [[ "${CHECK_STATUS[release]:-unhealthy}" == healthy && "$code" == 200 ]] \
    && status_identity_is_ready "$response_file" "$EXPECTED_RELEASE_SHA"; then
    set_check api healthy 'status identity and release SHA match the recorded current release' "$code" "$((finished - started))"
  else
    set_check api unhealthy 'status endpoint did not return a valid production release identity' "$code" "$((finished - started))"
  fi
}

check_readiness() {
  local started finished code response_file duration response_ready=false
  response_file="$TEMP_DIR/readiness.json"
  started=$(now_milliseconds)
  code=$(probe_http "$READINESS_URL" "$response_file")
  finished=$(now_milliseconds)
  duration=$((finished - started))

  if [[ "$code" == 200 ]] && readiness_response_is_ready "$response_file"; then
    response_ready=true
  fi

  if [[ "$response_ready" == true ]] && database_readiness_is_ready "$response_file"; then
    set_check database healthy 'database connection and required schema reported ready' "$code" "$duration"
  else
    set_check database unhealthy 'readiness endpoint, auth/license, database, or required schema check failed' "$code" "$duration"
  fi

  if [[ "$response_ready" == true ]] && ai_readiness_is_ready "$response_file"; then
    set_check ai healthy 'AI and embedding configuration reported ready; provider reachability was not exercised' "$code" "$duration"
  else
    set_check ai unhealthy 'readiness endpoint, auth/license, AI, or embedding configuration check failed' "$code" "$duration"
  fi
}

check_message() {
  local started finished code response_file
  local -a auth_arguments=()
  response_file="$TEMP_DIR/message.json"
  if [[ -n "$MESSAGE_AUTH_FILE" ]]; then
    auth_arguments=(--header "@${MESSAGE_AUTH_FILE}")
  fi

  started=$(now_milliseconds)
  code=$(probe_http "$MESSAGE_URL" "$response_file" "${auth_arguments[@]}")
  finished=$(now_milliseconds)

  if [[ -n "$MESSAGE_AUTH_FILE" && "$code" == 200 ]] \
    && json_flag_is_true "$response_file" success; then
    set_check message healthy 'authenticated notification list/store query succeeded; external delivery was not exercised' "$code" "$((finished - started))"
  elif [[ -z "$MESSAGE_AUTH_FILE" && ( "$code" == 401 || "$code" == 403 ) ]]; then
    set_check message unverified 'authentication boundary is reachable; storage and delivery readiness were not verified' "$code" "$((finished - started))"
  elif [[ -z "$MESSAGE_AUTH_FILE" && "$code" == 200 ]]; then
    set_check message unhealthy 'notification endpoint accepted an unauthenticated request' "$code" "$((finished - started))"
  else
    set_check message unhealthy 'notification readiness check failed' "$code" "$((finished - started))"
  fi
}

emit_text_report() {
  local name
  printf 'AI Team OS production health report\n'
  printf 'generatedAt=%s project=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$PROJECT_NAME"
  for name in "${CHECK_ORDER[@]}"; do
    printf '%-10s %-9s http=%s durationMs=%s detail=%s\n' \
      "$name" "${CHECK_STATUS[$name]}" "${CHECK_HTTP[$name]}" \
      "${CHECK_DURATION_MS[$name]}" "${CHECK_DETAIL[$name]}"
  done
  printf 'overall=%s\n' "$OVERALL_STATUS"
}

emit_json_report() {
  local name payload=""
  for name in "${CHECK_ORDER[@]}"; do
    payload+="${name}"$'\t'"${CHECK_STATUS[$name]}"$'\t'"${CHECK_HTTP[$name]}"$'\t'"${CHECK_DURATION_MS[$name]}"$'\t'"${CHECK_DETAIL[$name]}"$'\n'
  done

  HEALTH_PAYLOAD=$payload \
  HEALTH_OVERALL=$OVERALL_STATUS \
  HEALTH_PROJECT=$PROJECT_NAME \
  node <<'NODE'
const checks = {};
for (const line of (process.env.HEALTH_PAYLOAD || "").trimEnd().split("\n")) {
  if (!line) continue;
  const [name, status, httpStatus, durationMs, detail] = line.split("\t");
  checks[name] = {
    status,
    httpStatus: Number(httpStatus),
    durationMs: Number(durationMs),
    detail
  };
}
console.log(JSON.stringify({
  product: "AI Team OS",
  generatedAt: new Date().toISOString(),
  project: process.env.HEALTH_PROJECT,
  overall: process.env.HEALTH_OVERALL,
  checks
}, null, 2));
NODE
}

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      (( $# >= 2 )) || die "--env-file requires a path"
      ENV_FILE=$2
      ENV_FILE_EXPLICIT=true
      shift 2
      ;;
    --format)
      (( $# >= 2 )) || die "--format requires text or json"
      FORMAT=$2
      shift 2
      ;;
    --timeout)
      (( $# >= 2 )) || die "--timeout requires seconds"
      TIMEOUT_SECONDS=$2
      shift 2
      ;;
    --project)
      (( $# >= 2 )) || die "--project requires a name"
      PROJECT_NAME=$2
      shift 2
      ;;
    --message-url)
      (( $# >= 2 )) || die "--message-url requires a URL"
      MESSAGE_URL=$2
      shift 2
      ;;
    --message-auth-file)
      (( $# >= 2 )) || die "--message-auth-file requires a path"
      MESSAGE_AUTH_FILE=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ "$FORMAT" == text || "$FORMAT" == json ]] || die "--format must be text or json"
[[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] \
  && (( TIMEOUT_SECONDS >= 1 && TIMEOUT_SECONDS <= 60 )) \
  || die "--timeout must be an integer from 1 through 60"
[[ "$PROJECT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$ ]] \
  || die "--project contains unsupported characters"

for command_name in awk chown chmod curl cut date docker find findmnt flock install mktemp node readlink rm sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "required command not found: ${command_name}"
done

load_environment_if_available
prepare_sensitive_runtime

HEALTH_URL=${TEAM_OS_HEALTH_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/team-os/status}
READINESS_URL=${TEAM_OS_READINESS_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/health?database=true&schema=true&ai=true}
if [[ -z "$MESSAGE_URL" ]]; then
  MESSAGE_URL="http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/team-os/notifications?page=1&pageSize=1"
fi
validate_safe_url TEAM_OS_HEALTH_URL "$HEALTH_URL"
validate_safe_url TEAM_OS_READINESS_URL "$READINESS_URL"
validate_safe_url MESSAGE_URL "$MESSAGE_URL"
validate_message_auth_file
validate_authenticated_message_target

check_release_state
check_container
check_api
check_readiness
check_message

OVERALL_STATUS=healthy
for check_name in "${CHECK_ORDER[@]}"; do
  if [[ "${CHECK_STATUS[$check_name]}" == unhealthy ]]; then
    OVERALL_STATUS=unhealthy
    break
  elif [[ "${CHECK_STATUS[$check_name]}" == unverified ]]; then
    OVERALL_STATUS=degraded
  fi
done

if [[ "$FORMAT" == json ]]; then
  emit_json_report
else
  emit_text_report
fi

case "$OVERALL_STATUS" in
  healthy)
    exit 0
    ;;
  degraded)
    exit 2
    ;;
  *)
    exit 1
    ;;
esac
