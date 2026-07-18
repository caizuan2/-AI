#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027
ulimit -c 0

SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
validate_clean_environment() {
  local exported_name allowed_name allowed_value
  while IFS= read -r exported_name; do
    case "$exported_name" in
      PATH|HOME|LANG|LC_ALL|TZ|AI_TEAM_OS_CLEAN_ENVIRONMENT|AI_TEAM_OS_ENV_FILE|CONFIRM_ROLLBACK|PWD|SHLVL|_|MSYSTEM|SYSTEMROOT|WINDIR) ;;
      *) return 1 ;;
    esac
  done < <(compgen -e)

  [[ ${PATH:-} == "$SAFE_PATH" && ${HOME:-} == /root \
    && ${LANG:-} == C.UTF-8 && ${LC_ALL:-} == C.UTF-8 && ${TZ:-} == UTC ]] \
    || return 1
  for allowed_name in AI_TEAM_OS_ENV_FILE CONFIRM_ROLLBACK; do
    if [[ -v $allowed_name ]]; then
      allowed_value=${!allowed_name}
      [[ "$allowed_value" != *$'\n'* && "$allowed_value" != *$'\r'* ]] || return 1
    fi
  done
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
  for allowed_name in AI_TEAM_OS_ENV_FILE CONFIRM_ROLLBACK; do
    if [[ -v $allowed_name ]]; then
      allowed_value=${!allowed_name}
      [[ "$allowed_value" != *$'\n'* && "$allowed_value" != *$'\r'* ]] || {
        printf 'Refusing a multiline value for %s.\n' "$allowed_name" >&2
        exit 1
      }
      CLEAN_ENV+=("${allowed_name}=${allowed_value}")
    fi
  done
  exec /usr/bin/env "${CLEAN_ENV[@]}" /usr/bin/bash --noprofile --norc "$0" "$@"
fi
validate_clean_environment || {
  printf 'Refusing a forged or contaminated clean-environment marker.\n' >&2
  exit 1
}
unset AI_TEAM_OS_CLEAN_ENVIRONMENT CLEAN_ENV allowed_name allowed_value
export PATH=$SAFE_PATH
readonly SAFE_PATH PATH

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if (( EUID == 0 )); then
  [[ -f "$SCRIPT_DIR/load-env.sh" && ! -L "$SCRIPT_DIR/load-env.sh" ]] || {
    printf 'Trusted dotenv loader is missing or is a symbolic link.\n' >&2
    exit 1
  }
  LOADER_MODE=$(stat -c '%a' "$SCRIPT_DIR/load-env.sh")
  [[ $(stat -c '%u' "$SCRIPT_DIR/load-env.sh") == 0 && $((8#$LOADER_MODE & 022)) == 0 ]] || {
    printf 'Trusted dotenv loader must be root-owned and not group/world writable.\n' >&2
    exit 1
  }
fi
# shellcheck source=deploy/scripts/load-env.sh
source "$SCRIPT_DIR/load-env.sh"

ORCHESTRATOR_SCHEMA_CURRENT=2
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

ENV_FILE=${AI_TEAM_OS_ENV_FILE:-/etc/ai-team-os/ai-team-os.env}
TARGET_RELEASE=""
TARGET_TAG=""
TARGET_TAG_REF=""
ROLLBACK_CONFIRMED=${CONFIRM_ROLLBACK:-false}
CUTOVER_STARTED=false
ACTIVATION_COMMITTED=false
VERSION_TARGET_BACKUP=""
ENV_SNAPSHOT_FILE=""

usage() {
  cat <<'USAGE'
Usage: rollback.sh [options]

  --env-file PATH       Root-owned production environment file
  --target RELEASE      Release id or absolute release directory. When omitted,
                        the recorded previous release is used.
  --tag TAG             Select the unique immutable release recorded from this
                        Git tag (or refs/tags/TAG).
  -h, --help            Show this help

Rollback switches only the team-os application image and VERSION_CHECK file.
It never runs Prisma, restores a dump, or reverses a database migration.
Set CONFIRM_ROLLBACK=true in the command environment to authorize the switch.
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

validate_source_ref() {
  local source_ref=$1
  [[ "$source_ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] || return 1
  [[ "$source_ref" != *".."* && "$source_ref" != *"//"* && "$source_ref" != */ ]] || return 1
  [[ "$source_ref" != *"@{"* && "$source_ref" != *.lock ]] || return 1
}

prepare_root_directory() {
  local directory=${1%/}
  local leaf_mode=$2
  local current=""
  local index part mode
  local -a parts=()

  [[ "$directory" =~ ^/[A-Za-z0-9._/-]+$ && "$directory" != *"//"* ]] \
    || die "unsafe managed directory path: ${directory}"
  [[ "$directory" != *"/./"* && "$directory" != *"/../"* && "$directory" != */. && "$directory" != */.. ]] \
    || die "managed directory path must not contain dot segments: ${directory}"

  IFS='/' read -r -a parts <<< "${directory#/}"
  for index in "${!parts[@]}"; do
    part=${parts[$index]}
    [[ -n "$part" ]] || die "managed directory path contains an empty component: ${directory}"
    current="${current}/${part}"
    [[ ! -L "$current" ]] || die "managed directory path contains a symbolic link: ${current}"
    if (( index == ${#parts[@]} - 1 )); then
      [[ ! -e "$current" || -d "$current" ]] || die "managed directory path is not a directory: ${current}"
      install -d -o root -g root -m "$leaf_mode" -- "$current"
    elif [[ ! -e "$current" ]]; then
      install -d -o root -g root -m 0755 -- "$current"
    fi
    [[ -d "$current" ]] || die "managed directory component is not a directory: ${current}"
    [[ $(stat -c '%u' "$current") == 0 && $(stat -c '%g' "$current") == 0 ]] \
      || die "managed directory component must be root-owned: ${current}"
    mode=$(stat -c '%a' "$current")
    (( (8#$mode & 022) == 0 )) || die "managed directory component must not be group/world writable: ${current}"
  done
}

require_root_control_file() {
  local file=$1
  local mode
  [[ -f "$file" && ! -L "$file" ]] || die "deployment control file is missing, non-regular, or a symbolic link: ${file}"
  [[ $(stat -c '%u' "$file") == 0 && $(stat -c '%g' "$file") == 0 ]] \
    || die "deployment control file must be root-owned: ${file}"
  mode=$(stat -c '%a' "$file")
  (( (8#$mode & 022) == 0 )) || die "deployment control file must not be group/world writable: ${file}"
}

cleanup_stale_environment_snapshots() {
  local candidate mode nullglob_was_set=false
  local -a candidates=()

  shopt -q nullglob && nullglob_was_set=true
  shopt -s nullglob
  candidates=(/run/ai-team-os/deploy-env.* /run/ai-team-os/rollback-env.*)
  [[ "$nullglob_was_set" == true ]] || shopt -u nullglob

  for candidate in "${candidates[@]}"; do
    case "$candidate" in
      /run/ai-team-os/deploy-env.*|/run/ai-team-os/rollback-env.*) ;;
      *) die "refusing an unexpected stale environment snapshot path" ;;
    esac
    [[ -f "$candidate" && ! -L "$candidate" ]] \
      || die "stale environment snapshot is not a regular file: ${candidate}"
    [[ $(stat -c '%u' "$candidate") == 0 && $(stat -c '%g' "$candidate") == 0 ]] \
      || die "stale environment snapshot is not root-owned: ${candidate}"
    [[ $(stat -c '%h' "$candidate") == 1 ]] \
      || die "stale environment snapshot has multiple hard links: ${candidate}"
    mode=$(stat -c '%a' "$candidate")
    (( (8#$mode & 077) == 0 )) \
      || die "stale environment snapshot is accessible outside root: ${candidate}"
    rm -f -- "$candidate"
  done
}

require_root_release_tree() {
  local release_root=$1
  local unsafe_entry
  [[ -d "$release_root" && ! -L "$release_root" ]] || die "release root is missing or is a symbolic link: ${release_root}"
  unsafe_entry=$(find "$release_root" -xdev ! -user root -print -quit) \
    || die "failed to inspect release ownership: ${release_root}"
  [[ -z "$unsafe_entry" ]] \
    || die "release tree contains a non-root-owned entry: ${release_root}"
  unsafe_entry=$(find "$release_root" -xdev -perm /022 -print -quit) \
    || die "failed to inspect release permissions: ${release_root}"
  [[ -z "$unsafe_entry" ]] \
    || die "release tree contains a group/world-writable entry: ${release_root}"
  unsafe_entry=$(find "$release_root" -xdev ! -type f ! -type d -print -quit) \
    || die "failed to inspect release entry types: ${release_root}"
  [[ -z "$unsafe_entry" ]] \
    || die "release tree contains a symlink or non-regular entry: ${release_root}"
}

check_json_flag() {
  local url=$1
  local key=$2
  curl --disable --noproxy '*' --fail --silent --show-error --max-time 10 "$url" \
    | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        try {
          const payload = JSON.parse(input);
          if (payload[process.argv[1]] !== true) process.exit(1);
        } catch {
          process.exit(1);
        }
      });
    ' "$key"
}

wait_for_json_flag() {
  local url=$1
  local key=$2
  local attempts=${3:-60}
  local attempt
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    if check_json_flag "$url" "$key"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

check_status_identity() {
  local url=$1
  local expected_version=$2
  local expected_build=$3
  local expected_sha=$4
  curl --disable --noproxy '*' --fail --silent --show-error --max-time 10 "$url" \
    | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        try {
          const payload = JSON.parse(input);
          const valid = payload.success === true
            && payload.module === "AI Team OS"
            && payload.version === process.argv[1]
            && payload.buildNumber === process.argv[2]
            && payload.environment === "production"
            && payload.releaseSha === process.argv[3].toLowerCase();
          if (!valid) process.exit(1);
        } catch {
          process.exit(1);
        }
      });
    ' "$expected_version" "$expected_build" "$expected_sha"
}

wait_for_status_identity() {
  local url=$1
  local expected_version=$2
  local expected_build=$3
  local expected_sha=$4
  local attempts=${5:-60}
  local attempt
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    if check_status_identity "$url" "$expected_version" "$expected_build" "$expected_sha"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

read_manifest_field() {
  local manifest_file=$1
  local field=$2
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = manifest.web?.[process.argv[2]];
    if (typeof value !== "string" || value.length === 0) process.exit(1);
    process.stdout.write(value);
  ' "$manifest_file" "$field"
}

calculate_orchestrator_sha256() {
  local root=$1
  local schema=${2:-$ORCHESTRATOR_SCHEMA_CURRENT}
  local selected_array
  local relative_path file_hash
  case "$schema" in
    1) selected_array=ORCHESTRATOR_V1_RELATIVE_FILES ;;
    2) selected_array=ORCHESTRATOR_V2_RELATIVE_FILES ;;
    *) return 1 ;;
  esac
  local -n selected_files="$selected_array"
  {
    for relative_path in "${selected_files[@]}"; do
      file_hash=$(sha256sum "$root/$relative_path" | cut -d ' ' -f 1) || return 1
      printf '%s %s\n' "$relative_path" "$file_hash"
    done
  } | sha256sum | cut -d ' ' -f 1
}

load_release_snapshot() {
  local metadata_file=$1
  local prefix=$2
  local payload
  local -a values

  payload=$(
    unset RELEASE_ID RELEASE_PATH SOURCE_REF SOURCE_SHA ORCHESTRATOR_SCHEMA ORCHESTRATOR_SHA256 RUNTIME_IMAGE RUNTIME_IMAGE_ID MIGRATION_IMAGE MIGRATION_IMAGE_ID
    ai_team_os_load_env "$metadata_file" release || exit 1
    printf '%s\n' "$RELEASE_ID" "$RELEASE_PATH" "${SOURCE_REF:-commit/${SOURCE_SHA:-unknown}}" "${SOURCE_SHA:-}" "${ORCHESTRATOR_SCHEMA:-1}" "${ORCHESTRATOR_SHA256:-}" "${RUNTIME_IMAGE:-}" "${RUNTIME_IMAGE_ID:-}" "${MIGRATION_IMAGE:-}" "${MIGRATION_IMAGE_ID:-}"
  ) || return 1
  mapfile -t values <<<"$payload"
  (( ${#values[@]} == 10 )) || return 1

  printf -v "${prefix}_RELEASE_ID" '%s' "${values[0]}"
  printf -v "${prefix}_RELEASE_PATH" '%s' "${values[1]}"
  printf -v "${prefix}_SOURCE_REF" '%s' "${values[2]}"
  printf -v "${prefix}_SOURCE_SHA" '%s' "${values[3]}"
  printf -v "${prefix}_ORCHESTRATOR_SCHEMA" '%s' "${values[4]}"
  printf -v "${prefix}_ORCHESTRATOR_SHA256" '%s' "${values[5]}"
  printf -v "${prefix}_RUNTIME_IMAGE" '%s' "${values[6]}"
  printf -v "${prefix}_RUNTIME_IMAGE_ID" '%s' "${values[7]}"
  printf -v "${prefix}_MIGRATION_IMAGE" '%s' "${values[8]}"
  printf -v "${prefix}_MIGRATION_IMAGE_ID" '%s' "${values[9]}"
}

validate_release_snapshot() {
  local prefix=$1
  local expected_path=$2
  local -n release_id="${prefix}_RELEASE_ID"
  local -n release_path="${prefix}_RELEASE_PATH"
  local -n source_ref="${prefix}_SOURCE_REF"
  local -n source_sha="${prefix}_SOURCE_SHA"
  local -n orchestrator_schema="${prefix}_ORCHESTRATOR_SCHEMA"
  local -n orchestrator_sha256="${prefix}_ORCHESTRATOR_SHA256"
  local -n runtime_image="${prefix}_RUNTIME_IMAGE"
  local -n runtime_image_id="${prefix}_RUNTIME_IMAGE_ID"
  local -n migration_image="${prefix}_MIGRATION_IMAGE"
  local -n migration_image_id="${prefix}_MIGRATION_IMAGE_ID"

  [[ "$release_path" == "$expected_path" ]] || return 1
  [[ "$release_id" =~ ^[0-9]{14}-[0-9a-fA-F]{12}$ ]] || return 1
  validate_source_ref "$source_ref" || return 1
  [[ "$source_sha" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] || return 1
  [[ "$orchestrator_schema" == 1 || "$orchestrator_schema" == 2 ]] || return 1
  [[ "$orchestrator_sha256" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
  [[ "$runtime_image" == "ai-team-os:${release_id}" ]] || return 1
  [[ "$runtime_image_id" =~ ^sha256:[0-9a-fA-F]{64}$ ]] || return 1
  [[ "$migration_image" == "ai-team-os-migration:${release_id}" ]] || return 1
  [[ "$migration_image_id" =~ ^sha256:[0-9a-fA-F]{64}$ ]] || return 1
}

verify_team_os_schema() {
  "${COMPOSE[@]}" --profile tools run --rm --no-deps \
    --entrypoint node migrate deploy/scripts/verify-team-os-schema.mjs
}

atomic_write_line() {
  local target=$1
  local value=$2
  local temporary="${target}.new.$$"
  (umask 027; printf '%s\n' "$value" >"$temporary")
  chmod 0640 "$temporary"
  mv -Tf -- "$temporary" "$target"
}

atomic_install_file() {
  local source=$1
  local target=$2
  local temporary="${target}.new.$$"
  install -m 0644 "$source" "$temporary"
  mv -Tf -- "$temporary" "$target"
}

cleanup_environment_snapshot() {
  if [[ -n "$ENV_SNAPSHOT_FILE" ]]; then
    rm -f -- "$ENV_SNAPSHOT_FILE"
  fi
}

trap cleanup_environment_snapshot EXIT

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      (( $# >= 2 )) || die "--env-file requires a path"
      ENV_FILE=$2
      shift 2
      ;;
    --target)
      (( $# >= 2 )) || die "--target requires a release id or path"
      TARGET_RELEASE=$2
      shift 2
      ;;
    --tag)
      (( $# >= 2 )) || die "--tag requires a Git tag"
      TARGET_TAG=$2
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

[[ -z "$TARGET_RELEASE" || -z "$TARGET_TAG" ]] || die "--target and --tag are mutually exclusive"
if [[ -n "$TARGET_TAG" ]]; then
  validate_source_ref "$TARGET_TAG" || die "--tag contains unsupported or ambiguous characters"
  if [[ "$TARGET_TAG" == refs/tags/* ]]; then
    TARGET_TAG_REF=$TARGET_TAG
  else
    TARGET_TAG_REF="refs/tags/$TARGET_TAG"
  fi
fi

[[ ${EUID} -eq 0 ]] || die "run as root so release and state ownership is deterministic"
for command_name in awk chmod chown docker curl find findmnt flock install mktemp node readlink rm sed sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command not found: ${command_name}"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"

[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || die "environment file is missing or is a symbolic link: ${ENV_FILE}"
ENV_FILE=$(readlink -f -- "$ENV_FILE")
[[ $(stat -c '%u' "$ENV_FILE") == 0 ]] || die "environment file must be owned by root"
ENV_MODE=$(stat -c '%a' "$ENV_FILE")
(( (8#$ENV_MODE & 077) == 0 )) || die "environment file must not be accessible by group or world (use mode 0600)"

prepare_root_directory /run/ai-team-os 0750
[[ $(findmnt -n -o FSTYPE -T /run/ai-team-os) == tmpfs ]] \
  || die "/run/ai-team-os must be backed by tmpfs for the rollback environment snapshot"
[[ -r /proc/swaps && $(awk 'NR > 1 { active = 1 } END { print active + 0 }' /proc/swaps) == 0 ]] \
  || die "swap must be disabled while the production environment snapshot is held in tmpfs"
DEPLOY_LOCK_FILE=/run/ai-team-os/deploy.lock
if [[ -e "$DEPLOY_LOCK_FILE" || -L "$DEPLOY_LOCK_FILE" ]]; then
  require_root_control_file "$DEPLOY_LOCK_FILE"
fi
exec 9>"$DEPLOY_LOCK_FILE"
chown root:root "$DEPLOY_LOCK_FILE"
chmod 0640 "$DEPLOY_LOCK_FILE"
flock -n 9 || die "another AI Team OS deployment or rollback is active"
cleanup_stale_environment_snapshots

LIVE_ENV_SHA256=$(sha256sum "$ENV_FILE" | cut -d ' ' -f 1)
ENV_SNAPSHOT_FILE=$(mktemp /run/ai-team-os/rollback-env.XXXXXXXX)
install -o root -g root -m 0600 -- "$ENV_FILE" "$ENV_SNAPSHOT_FILE"
[[ $(sha256sum "$ENV_SNAPSHOT_FILE" | cut -d ' ' -f 1) == "$LIVE_ENV_SHA256" ]] \
  || die "production environment changed while its rollback snapshot was created"
[[ $(sha256sum "$ENV_FILE" | cut -d ' ' -f 1) == "$LIVE_ENV_SHA256" ]] \
  || die "production environment changed while its rollback snapshot was created"
ENV_FILE=$ENV_SNAPSHOT_FILE

ai_team_os_load_env "$ENV_FILE" || die "production environment parsing failed"

[[ "$ROLLBACK_CONFIRMED" == true ]] || die "set CONFIRM_ROLLBACK=true in the command environment before rollback"

DEPLOY_BASE_DIR=${DEPLOY_BASE_DIR:-/opt/ai-team-os}
DEPLOY_STATE_DIR=${DEPLOY_STATE_DIR:-/var/lib/ai-team-os}
TEAM_OS_VERSION_TARGET=${TEAM_OS_VERSION_TARGET:-/var/www/ai-team-os/updates/VERSION_CHECK.json}
TEAM_OS_HEALTH_URL=${TEAM_OS_HEALTH_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/team-os/status}
TEAM_OS_READINESS_URL=${TEAM_OS_READINESS_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/health?database=true&schema=true&ai=true}
DEPLOY_LOCK_FILE=${DEPLOY_LOCK_FILE:-/run/ai-team-os/deploy.lock}
[[ "$DEPLOY_BASE_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "DEPLOY_BASE_DIR contains unsupported characters"
[[ "$DEPLOY_STATE_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "DEPLOY_STATE_DIR contains unsupported characters"
[[ "$TEAM_OS_VERSION_TARGET" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "TEAM_OS_VERSION_TARGET contains unsupported characters"
[[ "$DEPLOY_BASE_DIR" == /opt/ai-team-os ]] || die "DEPLOY_BASE_DIR must remain /opt/ai-team-os"
[[ "$DEPLOY_STATE_DIR" == /var/lib/ai-team-os ]] || die "DEPLOY_STATE_DIR must remain /var/lib/ai-team-os"
[[ "$TEAM_OS_VERSION_TARGET" == /var/www/ai-team-os/updates/VERSION_CHECK.json ]] \
  || die "TEAM_OS_VERSION_TARGET must remain /var/www/ai-team-os/updates/VERSION_CHECK.json"
[[ "${TEAM_OS_PORT:-}" == 3022 ]] || die "TEAM_OS_PORT must remain 3022"
[[ "$TEAM_OS_HEALTH_URL" == http://127.0.0.1:3022/api/team-os/status ]] \
  || die "TEAM_OS_HEALTH_URL must remain the fixed loopback Team OS status endpoint"
[[ "$TEAM_OS_READINESS_URL" == 'http://127.0.0.1:3022/api/health?database=true&schema=true&ai=true' ]] \
  || die "TEAM_OS_READINESS_URL must remain the fixed loopback readiness endpoint"
[[ "$DEPLOY_LOCK_FILE" == /run/ai-team-os/deploy.lock ]] \
  || die "DEPLOY_LOCK_FILE must remain /run/ai-team-os/deploy.lock"
CURRENT_RELEASE_FILE="$DEPLOY_STATE_DIR/current-release"
PREVIOUS_RELEASE_FILE="$DEPLOY_STATE_DIR/previous-release"
RELEASES_ROOT=$(readlink -m -- "$DEPLOY_BASE_DIR/releases")
prepare_root_directory "$DEPLOY_BASE_DIR" 0750
[[ -d "$RELEASES_ROOT" && ! -L "$RELEASES_ROOT" ]] || die "release directory does not exist or is a symbolic link: ${RELEASES_ROOT}"
prepare_root_directory "$DEPLOY_BASE_DIR/releases" 0750
prepare_root_directory "$DEPLOY_STATE_DIR" 0750
prepare_root_directory "$(dirname -- "$TEAM_OS_VERSION_TARGET")" 0755

[[ ! -L "$CURRENT_RELEASE_FILE" && ! -L "$PREVIOUS_RELEASE_FILE" ]] \
  || die "deployment state files must not be symbolic links"
CURRENT_RELEASE_FILE_EXISTED=false
PREVIOUS_RELEASE_FILE_EXISTED=false
ORIGINAL_PREVIOUS_RELEASE=""
if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  require_root_control_file "$CURRENT_RELEASE_FILE"
  CURRENT_RELEASE_FILE_EXISTED=true
fi
if [[ -f "$PREVIOUS_RELEASE_FILE" ]]; then
  require_root_control_file "$PREVIOUS_RELEASE_FILE"
  PREVIOUS_RELEASE_FILE_EXISTED=true
  ORIGINAL_PREVIOUS_RELEASE=$(<"$PREVIOUS_RELEASE_FILE")
fi

if [[ -n "$TARGET_TAG" ]]; then
  TAG_MATCHES=()
  shopt -s nullglob
  CANDIDATE_RELEASES=("$RELEASES_ROOT"/*)
  shopt -u nullglob
  for candidate_release in "${CANDIDATE_RELEASES[@]}"; do
    [[ -d "$candidate_release" && ! -L "$candidate_release" ]] || continue
    candidate_metadata="$candidate_release/.release.env"
    [[ -f "$candidate_metadata" && ! -L "$candidate_metadata" ]] || continue
    require_root_release_tree "$candidate_release"
    require_root_control_file "$candidate_metadata"
    load_release_snapshot "$candidate_metadata" CANDIDATE \
      || die "release metadata could not be parsed while resolving tag: ${candidate_release}"
    validate_release_snapshot CANDIDATE "$candidate_release" \
      || die "release metadata is inconsistent while resolving tag: ${candidate_release}"
    if [[ "$CANDIDATE_SOURCE_REF" == "$TARGET_TAG_REF" ]]; then
      TAG_MATCHES+=("$candidate_release")
    fi
  done
  (( ${#TAG_MATCHES[@]} == 1 )) \
    || die "--tag must match exactly one immutable release; found ${#TAG_MATCHES[@]} for ${TARGET_TAG}"
  TARGET_RELEASE=${TAG_MATCHES[0]}
elif [[ -z "$TARGET_RELEASE" ]]; then
  [[ -s "$PREVIOUS_RELEASE_FILE" ]] || die "no previous release is recorded; pass --target or --tag explicitly"
  TARGET_RELEASE=$(<"$PREVIOUS_RELEASE_FILE")
elif [[ "$TARGET_RELEASE" != /* ]]; then
  TARGET_RELEASE="$RELEASES_ROOT/$TARGET_RELEASE"
fi

TARGET_RELEASE=$(readlink -f -- "$TARGET_RELEASE") || die "target release does not exist"
case "$TARGET_RELEASE" in
  "$RELEASES_ROOT"/*) ;;
  *) die "target must stay inside ${RELEASES_ROOT}" ;;
esac
require_root_release_tree "$TARGET_RELEASE"

METADATA_FILE="$TARGET_RELEASE/.release.env"
COMPOSE_FILE="$TARGET_RELEASE/deploy/docker/docker-compose.yml"
VERSION_FILE="$TARGET_RELEASE/deploy/VERSION_CHECK.json"
[[ -f "$METADATA_FILE" && -f "$COMPOSE_FILE" && -f "$VERSION_FILE" ]] || die "target is not a complete immutable release"
require_root_control_file "$METADATA_FILE"
require_root_control_file "$COMPOSE_FILE"
require_root_control_file "$VERSION_FILE"
EXPECTED_TEAM_OS_VERSION=$(read_manifest_field "$VERSION_FILE" version) \
  || die "VERSION_CHECK.json is missing web.version"
EXPECTED_TEAM_OS_BUILD=$(read_manifest_field "$VERSION_FILE" buildNumber) \
  || die "VERSION_CHECK.json is missing web.buildNumber"

unset RELEASE_ID RELEASE_PATH SOURCE_REF SOURCE_SHA ORCHESTRATOR_SCHEMA ORCHESTRATOR_SHA256 RUNTIME_IMAGE RUNTIME_IMAGE_ID MIGRATION_IMAGE MIGRATION_IMAGE_ID
ai_team_os_load_env "$METADATA_FILE" release || die "release metadata parsing failed"
SOURCE_REF=${SOURCE_REF:-commit/${SOURCE_SHA:-unknown}}
ORCHESTRATOR_SCHEMA=${ORCHESTRATOR_SCHEMA:-1}
[[ "${RELEASE_PATH:-}" == "$TARGET_RELEASE" ]] || die "release metadata path mismatch"
[[ "${RELEASE_ID:-}" =~ ^[0-9]{14}-[0-9a-fA-F]{12}$ ]] || die "release metadata has an invalid RELEASE_ID"
validate_source_ref "$SOURCE_REF" || die "release metadata has an invalid SOURCE_REF"
[[ "${SOURCE_SHA:-}" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] || die "release metadata has an invalid SOURCE_SHA"
[[ "$ORCHESTRATOR_SCHEMA" == 1 || "$ORCHESTRATOR_SCHEMA" == 2 ]] || die "release metadata has an invalid ORCHESTRATOR_SCHEMA"
[[ "${ORCHESTRATOR_SHA256:-}" =~ ^[0-9a-fA-F]{64}$ ]] || die "release metadata has an invalid ORCHESTRATOR_SHA256"
[[ "${RUNTIME_IMAGE:-}" == "ai-team-os:${RELEASE_ID}" ]] || die "release metadata has an invalid RUNTIME_IMAGE"
[[ "${MIGRATION_IMAGE:-}" == "ai-team-os-migration:${RELEASE_ID}" ]] || die "release metadata has an invalid MIGRATION_IMAGE"
[[ "${RUNTIME_IMAGE_ID:-}" =~ ^sha256:[0-9a-fA-F]{64}$ ]] || die "release metadata is missing a content-addressed RUNTIME_IMAGE_ID"
[[ "${MIGRATION_IMAGE_ID:-}" =~ ^sha256:[0-9a-fA-F]{64}$ ]] || die "release metadata is missing a content-addressed MIGRATION_IMAGE_ID"
[[ $(calculate_orchestrator_sha256 "$TARGET_RELEASE" "$ORCHESTRATOR_SCHEMA") == "$ORCHESTRATOR_SHA256" ]] \
  || die "target release orchestrator bundle hash is inconsistent"
docker image inspect "$RUNTIME_IMAGE" >/dev/null 2>&1 || die "rollback image is not present locally: ${RUNTIME_IMAGE}"
ACTUAL_RUNTIME_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$RUNTIME_IMAGE")
[[ "$ACTUAL_RUNTIME_IMAGE_ID" == "$RUNTIME_IMAGE_ID" ]] || die "rollback image tag no longer matches the recorded image ID"
docker image inspect "$MIGRATION_IMAGE" >/dev/null 2>&1 || die "rollback migration image is not present locally: ${MIGRATION_IMAGE}"
ACTUAL_MIGRATION_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$MIGRATION_IMAGE")
[[ "$ACTUAL_MIGRATION_IMAGE_ID" == "$MIGRATION_IMAGE_ID" ]] || die "rollback migration image tag no longer matches the recorded image ID"

ORIGINAL_RELEASE=""
if [[ -s "$CURRENT_RELEASE_FILE" ]]; then
  ORIGINAL_RELEASE=$(<"$CURRENT_RELEASE_FILE")
fi

ORIGINAL_COMPOSE_FILE=""
ORIGINAL_SOURCE_SHA=""
if [[ -n "$ORIGINAL_RELEASE" ]]; then
  ORIGINAL_RELEASE=$(readlink -f -- "$ORIGINAL_RELEASE") || die "recorded current release does not exist"
  case "$ORIGINAL_RELEASE" in
    "$RELEASES_ROOT"/*) ;;
    *) die "recorded current release escapes ${RELEASES_ROOT}" ;;
  esac
  require_root_release_tree "$ORIGINAL_RELEASE"
  ORIGINAL_COMPOSE_FILE="$ORIGINAL_RELEASE/deploy/docker/docker-compose.yml"
  ORIGINAL_METADATA_FILE="$ORIGINAL_RELEASE/.release.env"
  [[ -f "$ORIGINAL_COMPOSE_FILE" && -f "$ORIGINAL_METADATA_FILE" ]] \
    || die "recorded current release is missing Compose or release metadata"
  require_root_control_file "$ORIGINAL_COMPOSE_FILE"
  require_root_control_file "$ORIGINAL_METADATA_FILE"
  load_release_snapshot "$ORIGINAL_METADATA_FILE" ORIGINAL \
    || die "recorded current release metadata could not be parsed"
  validate_release_snapshot ORIGINAL "$ORIGINAL_RELEASE" \
    || die "recorded current release metadata is inconsistent"
  [[ $(calculate_orchestrator_sha256 "$ORIGINAL_RELEASE" "$ORIGINAL_ORCHESTRATOR_SCHEMA") == "$ORIGINAL_ORCHESTRATOR_SHA256" ]] \
    || die "recorded current release orchestrator bundle hash is inconsistent"
fi

ORIGINAL_COMPOSE=()
if [[ -n "$ORIGINAL_COMPOSE_FILE" ]]; then
  ORIGINAL_COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ORIGINAL_COMPOSE_FILE")
  ORIGINAL_CONTAINER_ID=$("${ORIGINAL_COMPOSE[@]}" ps -q team-os 2>/dev/null || true)
else
  ORIGINAL_CONTAINER_ID=$(docker ps --filter label=com.docker.compose.project=ai-team-os \
    --filter label=com.docker.compose.service=team-os --format '{{.ID}}' | sed -n '1p')
  [[ -z "$ORIGINAL_CONTAINER_ID" ]] \
    || die "a running Team OS container exists without a recorded immutable release baseline"
fi
ORIGINAL_IMAGE=""
ORIGINAL_IMAGE_ID=""
if [[ -n "$ORIGINAL_CONTAINER_ID" ]]; then
  ORIGINAL_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$ORIGINAL_CONTAINER_ID")
  ORIGINAL_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$ORIGINAL_IMAGE")
  [[ "$ORIGINAL_IMAGE" == "$ORIGINAL_RUNTIME_IMAGE" && "$ORIGINAL_IMAGE_ID" == "$ORIGINAL_RUNTIME_IMAGE_ID" ]] \
    || die "running Team OS container does not match the recorded pre-rollback image baseline"
elif [[ -n "$ORIGINAL_RELEASE" ]]; then
  die "recorded current release has no running Team OS container"
fi

export TEAM_OS_ENV_FILE="$ENV_FILE"
export TEAM_OS_IMAGE="$RUNTIME_IMAGE"
export TEAM_OS_MIGRATION_IMAGE="$MIGRATION_IMAGE"
export WEB_RELEASE_SHA="${SOURCE_SHA:-rollback}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

restore_original_application() {
  if [[ -z "$ORIGINAL_IMAGE" || -z "$ORIGINAL_IMAGE_ID" || ${#ORIGINAL_COMPOSE[@]} -eq 0 ]]; then
    local remaining_container
    log "No pre-rollback Team OS baseline exists; removing the failed candidate application." >&2
    "${COMPOSE[@]}" stop team-os >/dev/null 2>&1 || true
    "${COMPOSE[@]}" rm -f team-os >/dev/null 2>&1 || true
    remaining_container=$("${COMPOSE[@]}" ps -aq team-os 2>/dev/null || true)
    [[ -z "$remaining_container" ]] || return 1
    if curl --disable --noproxy '*' --fail --silent --show-error --max-time 2 "$TEAM_OS_HEALTH_URL" >/dev/null 2>&1; then
      log "The failed rollback candidate still responds on the private Team OS health endpoint." >&2
      return 1
    fi
    return 0
  fi
  local actual_image_id
  actual_image_id=$(docker image inspect --format '{{.Id}}' "$ORIGINAL_IMAGE" 2>/dev/null || true)
  [[ "$actual_image_id" == "$ORIGINAL_IMAGE_ID" ]] || return 1
  log "Restoring the pre-rollback Team OS image ${ORIGINAL_IMAGE_ID}." >&2
  export TEAM_OS_IMAGE="$ORIGINAL_IMAGE"
  export WEB_RELEASE_SHA="$ORIGINAL_SOURCE_SHA"
  "${ORIGINAL_COMPOSE[@]}" up -d --no-deps --no-build team-os || return 1
  wait_for_json_flag "$TEAM_OS_HEALTH_URL" success 30 \
    && wait_for_json_flag "$TEAM_OS_READINESS_URL" ok 30
}

restore_activation_state() {
  if [[ "$VERSION_TARGET_EXISTED" == true ]]; then
    atomic_install_file "$VERSION_TARGET_BACKUP" "$TEAM_OS_VERSION_TARGET" || return 1
  else
    rm -f -- "$TEAM_OS_VERSION_TARGET" || return 1
  fi

  if [[ "$CURRENT_RELEASE_FILE_EXISTED" == true ]]; then
    atomic_write_line "$CURRENT_RELEASE_FILE" "$ORIGINAL_RELEASE" || return 1
    ln -sfn "$ORIGINAL_RELEASE" "$DEPLOY_BASE_DIR/.current.restore" || return 1
    mv -Tf -- "$DEPLOY_BASE_DIR/.current.restore" "$DEPLOY_BASE_DIR/current" || return 1
  else
    rm -f -- "$CURRENT_RELEASE_FILE" "$DEPLOY_BASE_DIR/current" || return 1
  fi

  if [[ "$PREVIOUS_RELEASE_FILE_EXISTED" == true ]]; then
    atomic_write_line "$PREVIOUS_RELEASE_FILE" "$ORIGINAL_PREVIOUS_RELEASE" || return 1
  else
    rm -f -- "$PREVIOUS_RELEASE_FILE" || return 1
  fi
}

cleanup() {
  local exit_code=$?
  if (( exit_code != 0 )) && [[ "$CUTOVER_STARTED" == true && "$ACTIVATION_COMMITTED" != true ]]; then
    if ! restore_original_application; then
      log "CRITICAL: failed to restore the pre-rollback Team OS application; manual recovery is required." >&2
    fi
    if ! restore_activation_state; then
      log "CRITICAL: failed to restore rollback state pointers or version manifest; manual reconciliation is required." >&2
    fi
  fi
  if [[ -n "$VERSION_TARGET_BACKUP" ]]; then
    rm -f -- "$VERSION_TARGET_BACKUP"
  fi
  cleanup_environment_snapshot
  exit "$exit_code"
}
trap cleanup EXIT

log "Switching only the team-os service to ${RELEASE_ID:-$(basename -- "$TARGET_RELEASE")}."
log "Database migrations and database contents will not be changed."
VERSION_TARGET_EXISTED=false
[[ ! -L "$TEAM_OS_VERSION_TARGET" ]] || die "version manifest target must not be a symbolic link"
[[ ! -e "$DEPLOY_BASE_DIR/current" || -L "$DEPLOY_BASE_DIR/current" ]] \
  || die "current release pointer must be a symbolic link"
if [[ -f "$TEAM_OS_VERSION_TARGET" ]]; then
  require_root_control_file "$TEAM_OS_VERSION_TARGET"
  VERSION_TARGET_EXISTED=true
  VERSION_TARGET_BACKUP=$(mktemp "$DEPLOY_STATE_DIR/.version-manifest.before.XXXXXXXX")
  install -m 0600 "$TEAM_OS_VERSION_TARGET" "$VERSION_TARGET_BACKUP"
fi
CUTOVER_STARTED=true
if ! "${COMPOSE[@]}" up -d --no-deps --no-build team-os; then
  die "rollback container replacement failed; state pointers were not changed"
fi
if ! wait_for_status_identity "$TEAM_OS_HEALTH_URL" "$EXPECTED_TEAM_OS_VERSION" "$EXPECTED_TEAM_OS_BUILD" "$SOURCE_SHA" 60; then
  die "rollback image failed status identity check; state pointers were not changed"
fi
if ! wait_for_json_flag "$TEAM_OS_READINESS_URL" ok 60; then
  die "rollback image failed database/schema/AI readiness; state pointers were not changed"
fi
if ! verify_team_os_schema; then
  die "rollback image failed Team OS schema readiness; state pointers were not changed"
fi

atomic_install_file "$VERSION_FILE" "$TEAM_OS_VERSION_TARGET"
if [[ -n "$ORIGINAL_RELEASE" && "$ORIGINAL_RELEASE" != "$TARGET_RELEASE" ]]; then
  atomic_write_line "$PREVIOUS_RELEASE_FILE" "$ORIGINAL_RELEASE"
fi
atomic_write_line "$CURRENT_RELEASE_FILE" "$TARGET_RELEASE"
ln -sfn "$TARGET_RELEASE" "$DEPLOY_BASE_DIR/.current.new"
mv -Tf "$DEPLOY_BASE_DIR/.current.new" "$DEPLOY_BASE_DIR/current"
ACTIVATION_COMMITTED=true

log "Application rollback is healthy: ${TARGET_RELEASE}"
log "No database rollback was attempted; use the reviewed restore procedure only when explicitly approved."
