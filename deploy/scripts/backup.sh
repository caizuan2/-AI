#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

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

ENV_FILE=${AI_TEAM_OS_ENV_FILE:-/etc/ai-team-os/ai-team-os.env}
COMPOSE_FILE=""
RELEASE_NAME="manual"
BACKUP_REASON="manual"

usage() {
  cat <<'USAGE'
Usage: backup.sh [options]

  --env-file PATH       Root-owned production environment file
  --compose-file PATH   Compose file for an opt-in bundled PostgreSQL service
  --release NAME        Release identifier written to backup metadata
  --reason TEXT         Short audit reason (for example pre-migration)
  -h, --help            Show this help
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
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
  [[ -f "$file" && ! -L "$file" ]] || die "backup control file is missing, non-regular, or a symbolic link: ${file}"
  [[ $(stat -c '%u' "$file") == 0 && $(stat -c '%g' "$file") == 0 ]] \
    || die "backup control file must be root-owned: ${file}"
  mode=$(stat -c '%a' "$file")
  (( (8#$mode & 022) == 0 )) || die "backup control file must not be group/world writable: ${file}"
}

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      (( $# >= 2 )) || die "--env-file requires a path"
      ENV_FILE=$2
      shift 2
      ;;
    --compose-file)
      (( $# >= 2 )) || die "--compose-file requires a path"
      COMPOSE_FILE=$2
      shift 2
      ;;
    --release)
      (( $# >= 2 )) || die "--release requires a value"
      RELEASE_NAME=$2
      shift 2
      ;;
    --reason)
      (( $# >= 2 )) || die "--reason requires a value"
      BACKUP_REASON=$2
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

[[ ${EUID} -eq 0 ]] || die "run as root so backup ownership is deterministic"
for command_name in chmod chown docker find flock install readlink sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command not found: ${command_name}"
done

[[ -f "$ENV_FILE" ]] || die "environment file not found: ${ENV_FILE}"
ENV_FILE=$(readlink -f -- "$ENV_FILE")
[[ $(stat -c '%u' "$ENV_FILE") == 0 ]] || die "environment file must be owned by root"
ENV_MODE=$(stat -c '%a' "$ENV_FILE")
(( (8#$ENV_MODE & 077) == 0 )) || die "environment file must not be accessible by group or world (use mode 0600)"

ai_team_os_load_env "$ENV_FILE" || die "production environment parsing failed"

DEPLOY_BACKUP_DIR=${DEPLOY_BACKUP_DIR:-/var/backups/ai-team-os}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
BACKUP_LOCK_FILE=${BACKUP_LOCK_FILE:-/run/ai-team-os/backup.lock}
PG_BACKUP_IMAGE=${PG_BACKUP_IMAGE:-postgres@sha256:081f1bc7bd5e143dbb6e487b710bbc27712cdcfaced4c071b8e47349aa1b4171}

[[ "$DEPLOY_BACKUP_DIR" == /* && "$DEPLOY_BACKUP_DIR" != / ]] || die "DEPLOY_BACKUP_DIR must be a non-root absolute path"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a non-negative integer"
[[ "$PG_BACKUP_IMAGE" =~ ^[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
  || die "PG_BACKUP_IMAGE must be an immutable image@sha256 reference"
case "$DEPLOY_BACKUP_DIR" in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
    die "refusing unsafe backup directory: ${DEPLOY_BACKUP_DIR}"
    ;;
esac

prepare_root_directory "$DEPLOY_BACKUP_DIR" 0700
prepare_root_directory "$(dirname -- "$BACKUP_LOCK_FILE")" 0750
[[ -z $(find "$DEPLOY_BACKUP_DIR" -xdev ! -user root -print -quit) ]] \
  || die "backup directory contains a non-root-owned entry"
[[ -z $(find "$DEPLOY_BACKUP_DIR" -xdev -perm /022 -print -quit) ]] \
  || die "backup directory contains a group/world-writable entry"
[[ -z $(find "$DEPLOY_BACKUP_DIR" -xdev ! -type f ! -type d -print -quit) ]] \
  || die "backup directory contains a symlink or non-regular entry"
if [[ -e "$BACKUP_LOCK_FILE" || -L "$BACKUP_LOCK_FILE" ]]; then
  require_root_control_file "$BACKUP_LOCK_FILE"
fi
exec 8>"$BACKUP_LOCK_FILE"
chown root:root "$BACKUP_LOCK_FILE"
chmod 0640 "$BACKUP_LOCK_FILE"
flock -n 8 || die "another AI Team OS backup is active"

SAFE_RELEASE=$(printf '%s' "$RELEASE_NAME" | tr -cs 'A-Za-z0-9._-' '_' | cut -c1-80)
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="$DEPLOY_BACKUP_DIR/ai-team-os-${TIMESTAMP}-${SAFE_RELEASE}.dump"
PARTIAL_FILE="${BACKUP_FILE}.partial"
trap 'rm -f -- "$PARTIAL_FILE"' EXIT

if [[ ${ENABLE_BUNDLED_POSTGRES:-false} == true ]]; then
  [[ -n "$COMPOSE_FILE" && -f "$COMPOSE_FILE" ]] || die "--compose-file is required for bundled PostgreSQL backup"
  export TEAM_OS_ENV_FILE="$ENV_FILE"
  COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  log "Creating a custom-format dump from the opt-in bundled PostgreSQL service"
  "${COMPOSE[@]}" --profile database exec -T postgres \
    pg_dump \
      --username "${POSTGRES_USER:-ai_team_os}" \
      --dbname "${POSTGRES_DB:-ai_team_os}" \
      --format custom \
      --no-owner \
      --no-privileges >"$PARTIAL_FILE"
else
  BACKUP_CONNECTION_URL=${BACKUP_DATABASE_URL:-}
  [[ -n "$BACKUP_CONNECTION_URL" ]] || die "BACKUP_DATABASE_URL is required for an external PostgreSQL backup"
  LOWER_BACKUP_CONNECTION_URL=${BACKUP_CONNECTION_URL,,}
  [[ "$LOWER_BACKUP_CONNECTION_URL" != *"schema="* ]] || die "BACKUP_DATABASE_URL must be a libpq URL without Prisma's schema query parameter"
  [[ "$LOWER_BACKUP_CONNECTION_URL" =~ [\?\&]sslmode=(require|verify-ca|verify-full)($|\&) ]] \
    || die "BACKUP_DATABASE_URL must enforce PostgreSQL TLS with sslmode=require, verify-ca, or verify-full"
  export BACKUP_CONNECTION_URL
  log "Creating a custom-format dump from the configured external PostgreSQL database"
  docker run --rm \
    --env BACKUP_CONNECTION_URL \
    --user 999:999 \
    --read-only \
    --tmpfs /tmp:size=64m,mode=1777 \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --network bridge \
    --entrypoint /bin/sh \
    "$PG_BACKUP_IMAGE" \
    -ec 'exec pg_dump --dbname="$BACKUP_CONNECTION_URL" --format=custom --no-owner --no-privileges' \
    >"$PARTIAL_FILE"
fi

[[ -s "$PARTIAL_FILE" ]] || die "database dump is empty"
docker run --rm -i \
  --user 999:999 \
  --read-only \
  --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --network none \
  --entrypoint pg_restore \
  "$PG_BACKUP_IMAGE" \
  --list >/dev/null <"$PARTIAL_FILE"
mv -- "$PARTIAL_FILE" "$BACKUP_FILE"
chmod 0600 "$BACKUP_FILE"

(
  cd "$DEPLOY_BACKUP_DIR"
  sha256sum "$(basename -- "$BACKUP_FILE")" >"$(basename -- "$BACKUP_FILE").sha256"
)
chmod 0600 "${BACKUP_FILE}.sha256"

SAFE_REASON=$(printf '%s' "$BACKUP_REASON" | tr '\r\n' ' ' | cut -c1-160)
cat >"${BACKUP_FILE}.meta" <<METADATA
created_at=${TIMESTAMP}
release=${SAFE_RELEASE}
reason=${SAFE_REASON}
format=postgresql-custom
sha256_file=$(basename -- "$BACKUP_FILE").sha256
METADATA
chmod 0600 "${BACKUP_FILE}.meta"

while IFS= read -r -d '' expired_backup; do
  rm -f -- "$expired_backup" "${expired_backup}.sha256" "${expired_backup}.meta"
done < <(find "$DEPLOY_BACKUP_DIR" -maxdepth 1 -type f -name 'ai-team-os-*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -print0)

log "Backup complete: ${BACKUP_FILE}"
log "Checksum: ${BACKUP_FILE}.sha256"
