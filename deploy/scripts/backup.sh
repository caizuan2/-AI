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

cleanup_stale_backup_runtime_files() {
  local candidate mode nullglob_was_set=false
  local -a candidates=()

  shopt -q nullglob && nullglob_was_set=true
  shopt -s nullglob
  candidates=(
    /run/ai-team-os/backup-env.*
    /run/ai-team-os/database.dump.*
    /run/ai-team-os/expired-backups.*
  )
  [[ "$nullglob_was_set" == true ]] || shopt -u nullglob

  for candidate in "${candidates[@]}"; do
    case "$candidate" in
      /run/ai-team-os/backup-env.*|/run/ai-team-os/database.dump.*|/run/ai-team-os/expired-backups.*) ;;
      *) die "refusing an unexpected stale backup runtime path" ;;
    esac
    [[ -f "$candidate" && ! -L "$candidate" ]] \
      || die "stale backup runtime entry is not a regular file: ${candidate}"
    [[ $(stat -c '%u' "$candidate") == 0 && $(stat -c '%g' "$candidate") == 0 ]] \
      || die "stale backup runtime entry is not root-owned: ${candidate}"
    [[ $(stat -c '%h' "$candidate") == 1 ]] \
      || die "stale backup runtime entry has multiple hard links: ${candidate}"
    mode=$(stat -c '%a' "$candidate")
    (( (8#$mode & 077) == 0 )) \
      || die "stale backup runtime entry is accessible outside root: ${candidate}"
    rm -f -- "$candidate"
  done
}

prepare_plaintext_dump_limit() {
  local database_size_bytes=$1
  local tmpfs_available_bytes safe_bytes estimated_bytes
  local reserve_bytes=268435456
  local format_overhead_bytes=67108864

  [[ "$database_size_bytes" =~ ^[0-9]+$ ]] \
    || die "database size preflight returned a non-numeric value"
  (( database_size_bytes > 0 )) || die "database size preflight returned zero bytes"
  tmpfs_available_bytes=$(df -P -B1 /run/ai-team-os | awk 'NR == 2 { print $4 }')
  [[ "$tmpfs_available_bytes" =~ ^[0-9]+$ ]] \
    || die "could not determine available tmpfs capacity"
  (( tmpfs_available_bytes > reserve_bytes )) \
    || die "tmpfs has less than the required 256 MiB system safety reserve"

  safe_bytes=$((tmpfs_available_bytes - reserve_bytes))
  estimated_bytes=$((database_size_bytes + format_overhead_bytes))
  (( estimated_bytes <= safe_bytes )) \
    || die "database size plus dump overhead exceeds safe tmpfs capacity; use an approved encrypted backup worker instead"

  DUMP_FILE_LIMIT_BLOCKS=$(((estimated_bytes + 1023) / 1024))
  log "Plaintext dump preflight passed: database bytes=${database_size_bytes}, tmpfs safe bytes=${safe_bytes}"
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
for command_name in awk chmod chown df docker find findmnt flock grep install mktemp openssl readlink rm sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command not found: ${command_name}"
done

[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || die "environment file is missing or is a symbolic link: ${ENV_FILE}"
ENV_FILE=$(readlink -f -- "$ENV_FILE")
[[ $(stat -c '%u' "$ENV_FILE") == 0 ]] || die "environment file must be owned by root"
ENV_MODE=$(stat -c '%a' "$ENV_FILE")
(( (8#$ENV_MODE & 077) == 0 )) || die "environment file must not be accessible by group or world (use mode 0600)"

ENV_SNAPSHOT_FILE=""
BUNDLE_DIR=""
PLAIN_DUMP_FILE=""
RETENTION_LIST_FILE=""

cleanup_working_files() {
  if [[ -n "${BUNDLE_DIR:-}" && -d "$BUNDLE_DIR" ]]; then
    rm -rf -- "$BUNDLE_DIR"
  fi
  [[ -z "${ENV_SNAPSHOT_FILE:-}" ]] || rm -f -- "$ENV_SNAPSHOT_FILE"
  [[ -z "${PLAIN_DUMP_FILE:-}" ]] || rm -f -- "$PLAIN_DUMP_FILE"
  [[ -z "${RETENTION_LIST_FILE:-}" ]] || rm -f -- "$RETENTION_LIST_FILE"
}
trap cleanup_working_files EXIT

# Serialize before creating plaintext material. With the lock held, entries
# matching these fixed root-only names can only be remnants of an interrupted
# prior backup, so they are safe to validate and remove fail-closed.
prepare_root_directory /run/ai-team-os 0750
[[ $(findmnt -n -o FSTYPE -T /run/ai-team-os) == tmpfs ]] \
  || die "/run/ai-team-os must be backed by tmpfs so plaintext recovery material never reaches persistent disk"
[[ -r /proc/swaps && $(awk 'NR > 1 { active = 1 } END { print active + 0 }' /proc/swaps) == 0 ]] \
  || die "swap must be disabled while plaintext recovery material exists in tmpfs"
BACKUP_LOCK_FILE=/run/ai-team-os/backup.lock
if [[ -e "$BACKUP_LOCK_FILE" || -L "$BACKUP_LOCK_FILE" ]]; then
  require_root_control_file "$BACKUP_LOCK_FILE"
fi
exec 8>"$BACKUP_LOCK_FILE"
chown root:root "$BACKUP_LOCK_FILE"
chmod 0640 "$BACKUP_LOCK_FILE"
flock -n 8 || die "another AI Team OS backup is active"
cleanup_stale_backup_runtime_files

# Capture one root-only snapshot before parsing any deployment value. The same
# immutable snapshot drives dotenv loading, encryption, and database selection,
# so a concurrent credential rotation cannot create a mixed recovery set.
ENV_SNAPSHOT_FILE=$(mktemp /run/ai-team-os/backup-env.XXXXXXXX)

CONFIG_SOURCE_SHA256=$(sha256sum "$ENV_FILE" | cut -d ' ' -f 1)
install -o root -g root -m 0600 -- "$ENV_FILE" "$ENV_SNAPSHOT_FILE"
SNAPSHOT_SHA256=$(sha256sum "$ENV_SNAPSHOT_FILE" | cut -d ' ' -f 1)
[[ "$SNAPSHOT_SHA256" == "$CONFIG_SOURCE_SHA256" ]] \
  || die "production environment changed while its root-only snapshot was created"
[[ $(sha256sum "$ENV_FILE" | cut -d ' ' -f 1) == "$CONFIG_SOURCE_SHA256" ]] \
  || die "production environment changed while its root-only snapshot was created"

ai_team_os_load_env "$ENV_SNAPSHOT_FILE" || die "production environment parsing failed"

DEPLOY_BACKUP_DIR=${DEPLOY_BACKUP_DIR:-/var/backups/ai-team-os}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
BACKUP_LOCK_FILE=${BACKUP_LOCK_FILE:-/run/ai-team-os/backup.lock}
PG_BACKUP_IMAGE=${PG_BACKUP_IMAGE:-postgres@sha256:081f1bc7bd5e143dbb6e487b710bbc27712cdcfaced4c071b8e47349aa1b4171}
DATABASE_CA_CERT=${DATABASE_CA_CERT:-/etc/ai-team-os/rds-ca.pem}
BACKUP_ENCRYPTION_CERT=${BACKUP_ENCRYPTION_CERT:-/etc/ai-team-os/backup-encryption-cert.pem}

[[ "$DEPLOY_BACKUP_DIR" == /* && "$DEPLOY_BACKUP_DIR" != / ]] || die "DEPLOY_BACKUP_DIR must be a non-root absolute path"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a non-negative integer"
[[ "$PG_BACKUP_IMAGE" =~ ^[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
  || die "PG_BACKUP_IMAGE must be an immutable image@sha256 reference"
case "$DEPLOY_BACKUP_DIR" in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
    die "refusing unsafe backup directory: ${DEPLOY_BACKUP_DIR}"
    ;;
esac
[[ "$DEPLOY_BACKUP_DIR" == /var/backups/ai-team-os ]] \
  || die "DEPLOY_BACKUP_DIR must remain /var/backups/ai-team-os"
[[ "$BACKUP_LOCK_FILE" == /run/ai-team-os/backup.lock ]] \
  || die "BACKUP_LOCK_FILE must remain /run/ai-team-os/backup.lock"
[[ "$DATABASE_CA_CERT" == /etc/ai-team-os/rds-ca.pem ]] \
  || die "DATABASE_CA_CERT must remain /etc/ai-team-os/rds-ca.pem"
[[ -f "$DATABASE_CA_CERT" && ! -L "$DATABASE_CA_CERT" ]] \
  || die "database CA certificate is missing or is a symbolic link"
[[ $(stat -c '%u:%g' "$DATABASE_CA_CERT") == 0:0 ]] \
  || die "database CA certificate must be owned by root:root"
DATABASE_CA_MODE=$(stat -c '%a' "$DATABASE_CA_CERT")
[[ "$DATABASE_CA_MODE" == 444 || "$DATABASE_CA_MODE" == 644 ]] \
  || die "database CA certificate must use mode 0444 or 0644"
openssl x509 -in "$DATABASE_CA_CERT" -noout >/dev/null 2>&1 \
  || die "DATABASE_CA_CERT must contain a valid X.509 CA certificate"
if grep -Eq 'BEGIN ([A-Z0-9]+ )*PRIVATE KEY' "$DATABASE_CA_CERT"; then
  die "DATABASE_CA_CERT must not contain a private key"
fi
[[ "$BACKUP_ENCRYPTION_CERT" == /etc/ai-team-os/backup-encryption-cert.pem ]] \
  || die "BACKUP_ENCRYPTION_CERT must remain /etc/ai-team-os/backup-encryption-cert.pem"
[[ -f "$BACKUP_ENCRYPTION_CERT" && ! -L "$BACKUP_ENCRYPTION_CERT" ]] \
  || die "backup encryption certificate is missing or is a symbolic link"
[[ $(stat -c '%u' "$BACKUP_ENCRYPTION_CERT") == 0 ]] \
  || die "backup encryption certificate must be owned by root"
CERT_MODE=$(stat -c '%a' "$BACKUP_ENCRYPTION_CERT")
(( (8#$CERT_MODE & 022) == 0 )) \
  || die "backup encryption certificate must not be group/world writable"
openssl x509 -in "$BACKUP_ENCRYPTION_CERT" -noout >/dev/null 2>&1 \
  || die "BACKUP_ENCRYPTION_CERT must contain a valid X.509 recipient certificate"
if grep -Eq 'BEGIN ([A-Z0-9]+ )*PRIVATE KEY' "$BACKUP_ENCRYPTION_CERT"; then
  die "BACKUP_ENCRYPTION_CERT must not contain a private key"
fi
BACKUP_CERT_FINGERPRINT_SHA256=$(openssl x509 \
  -in "$BACKUP_ENCRYPTION_CERT" \
  -noout \
  -fingerprint \
  -sha256)
BACKUP_CERT_FINGERPRINT_SHA256=${BACKUP_CERT_FINGERPRINT_SHA256#*=}
BACKUP_CERT_FINGERPRINT_SHA256=${BACKUP_CERT_FINGERPRINT_SHA256//:/}
BACKUP_CERT_FINGERPRINT_SHA256=${BACKUP_CERT_FINGERPRINT_SHA256,,}
[[ "$BACKUP_CERT_FINGERPRINT_SHA256" =~ ^[0-9a-f]{64}$ ]] \
  || die "backup recipient certificate fingerprint could not be parsed"

prepare_root_directory "$DEPLOY_BACKUP_DIR" 0700
UNSAFE_BACKUP_ENTRY=$(find "$DEPLOY_BACKUP_DIR" -xdev ! -user root -print -quit) \
  || die "failed to inspect backup ownership"
[[ -z "$UNSAFE_BACKUP_ENTRY" ]] \
  || die "backup directory contains a non-root-owned entry"
UNSAFE_BACKUP_ENTRY=$(find "$DEPLOY_BACKUP_DIR" -xdev -perm /022 -print -quit) \
  || die "failed to inspect backup permissions"
[[ -z "$UNSAFE_BACKUP_ENTRY" ]] \
  || die "backup directory contains a group/world-writable entry"
UNSAFE_BACKUP_ENTRY=$(find "$DEPLOY_BACKUP_DIR" -xdev ! -type f ! -type d -print -quit) \
  || die "failed to inspect backup entry types"
[[ -z "$UNSAFE_BACKUP_ENTRY" ]] \
  || die "backup directory contains a symlink or non-regular entry"
SAFE_RELEASE=$(printf '%s' "$RELEASE_NAME" | tr -cs 'A-Za-z0-9._-' '_' | cut -c1-80)
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BUNDLE_NAME="ai-team-os-${TIMESTAMP}-${SAFE_RELEASE}"
FINAL_BUNDLE_DIR="$DEPLOY_BACKUP_DIR/$BUNDLE_NAME"
[[ ! -e "$FINAL_BUNDLE_DIR" && ! -L "$FINAL_BUNDLE_DIR" ]] \
  || die "backup bundle already exists: ${FINAL_BUNDLE_DIR}"
BUNDLE_DIR=$(mktemp -d "$DEPLOY_BACKUP_DIR/.incoming.XXXXXXXX")
chown root:root "$BUNDLE_DIR"
chmod 0700 "$BUNDLE_DIR"
BACKUP_FILE="$BUNDLE_DIR/database.dump.cms"
DATABASE_PARTIAL_FILE="$BUNDLE_DIR/database.dump.cms.partial"
CONFIG_BACKUP_FILE="$BUNDLE_DIR/configuration.env.cms"
CONFIG_PARTIAL_FILE="$BUNDLE_DIR/configuration.env.cms.partial"

PLAIN_DUMP_FILE=$(mktemp /run/ai-team-os/database.dump.XXXXXXXX)
chown root:root "$PLAIN_DUMP_FILE"
chmod 0600 "$PLAIN_DUMP_FILE"

# Encrypt configuration before the database dump and verify that the source
# file remains unchanged for the entire dump window. The corresponding private
# key stays outside this host (KMS/HSM or an offline recovery vault).
openssl cms -encrypt \
  -binary \
  -aes-256-cbc \
  -outform DER \
  -in "$ENV_SNAPSHOT_FILE" \
  -out "$CONFIG_PARTIAL_FILE" \
  "$BACKUP_ENCRYPTION_CERT"
[[ -s "$CONFIG_PARTIAL_FILE" ]] || die "encrypted configuration backup is empty"
openssl cms -cmsout -inform DER -in "$CONFIG_PARTIAL_FILE" -noout >/dev/null 2>&1 \
  || die "encrypted configuration backup could not be parsed"
[[ $(sha256sum "$ENV_SNAPSHOT_FILE" | cut -d ' ' -f 1) == "$CONFIG_SOURCE_SHA256" ]] \
  || die "root-only environment snapshot changed while its encrypted recovery copy was created"

if [[ ${ENABLE_BUNDLED_POSTGRES:-false} == true ]]; then
  [[ -n "$COMPOSE_FILE" && -f "$COMPOSE_FILE" ]] || die "--compose-file is required for bundled PostgreSQL backup"
  export TEAM_OS_ENV_FILE="$ENV_SNAPSHOT_FILE"
  COMPOSE=(docker compose --env-file "$ENV_SNAPSHOT_FILE" -f "$COMPOSE_FILE")
  DATABASE_SIZE_BYTES=$("${COMPOSE[@]}" --profile database exec -T postgres \
    psql \
      --username "${POSTGRES_USER:-ai_team_os}" \
      --dbname "${POSTGRES_DB:-ai_team_os}" \
      --no-psqlrc \
      --tuples-only \
      --no-align \
      --command 'SELECT pg_database_size(current_database())')
  DATABASE_SIZE_BYTES=${DATABASE_SIZE_BYTES//[[:space:]]/}
  prepare_plaintext_dump_limit "$DATABASE_SIZE_BYTES"
  log "Creating a custom-format dump from the opt-in bundled PostgreSQL service"
  (
    ulimit -f "$DUMP_FILE_LIMIT_BLOCKS"
    "${COMPOSE[@]}" --profile database exec -T postgres \
      pg_dump \
        --username "${POSTGRES_USER:-ai_team_os}" \
        --dbname "${POSTGRES_DB:-ai_team_os}" \
        --format custom \
        --no-owner \
        --no-privileges
  ) >"$PLAIN_DUMP_FILE"
else
  BACKUP_CONNECTION_URL=${BACKUP_DATABASE_URL:-}
  [[ -n "$BACKUP_CONNECTION_URL" ]] || die "BACKUP_DATABASE_URL is required for an external PostgreSQL backup"
  [[ "$BACKUP_CONNECTION_URL" == *\?* ]] || die "BACKUP_DATABASE_URL must include an explicit TLS query"
  BACKUP_QUERY=${BACKUP_CONNECTION_URL#*\?}
  BACKUP_QUERY=${BACKUP_QUERY%%#*}
  IFS='&' read -r -a BACKUP_QUERY_PARTS <<<"$BACKUP_QUERY"
  BACKUP_SSLMODE_COUNT=0
  BACKUP_SSLROOTCERT_COUNT=0
  for BACKUP_QUERY_PART in "${BACKUP_QUERY_PARTS[@]}"; do
    BACKUP_QUERY_KEY=${BACKUP_QUERY_PART%%=*}
    BACKUP_QUERY_VALUE=${BACKUP_QUERY_PART#*=}
    case "$BACKUP_QUERY_KEY" in
      schema)
        die "BACKUP_DATABASE_URL must be a libpq URL without Prisma's schema query parameter"
        ;;
      sslaccept)
        die "BACKUP_DATABASE_URL must not contain Prisma's sslaccept parameter"
        ;;
      sslmode)
        ((BACKUP_SSLMODE_COUNT += 1))
        [[ "$BACKUP_QUERY_VALUE" == verify-full ]] \
          || die "BACKUP_DATABASE_URL must enforce PostgreSQL TLS with sslmode=verify-full"
        ;;
      sslrootcert)
        ((BACKUP_SSLROOTCERT_COUNT += 1))
        BACKUP_QUERY_VALUE=${BACKUP_QUERY_VALUE,,}
        [[ "$BACKUP_QUERY_VALUE" == /etc/ai-team-os/rds-ca.pem \
          || "$BACKUP_QUERY_VALUE" == %2fetc%2fai-team-os%2frds-ca.pem ]] \
          || die "BACKUP_DATABASE_URL must use the fixed DATABASE_CA_CERT path"
        ;;
    esac
  done
  (( BACKUP_SSLMODE_COUNT == 1 )) \
    || die "BACKUP_DATABASE_URL must contain exactly one sslmode parameter"
  (( BACKUP_SSLROOTCERT_COUNT == 1 )) \
    || die "BACKUP_DATABASE_URL must contain exactly one sslrootcert parameter"
  unset BACKUP_QUERY BACKUP_QUERY_PARTS BACKUP_QUERY_PART BACKUP_QUERY_KEY \
    BACKUP_QUERY_VALUE BACKUP_SSLMODE_COUNT BACKUP_SSLROOTCERT_COUNT
  export BACKUP_CONNECTION_URL
  DATABASE_SIZE_BYTES=$(docker run --rm \
    --ulimit core=0 \
    --env BACKUP_CONNECTION_URL \
    --user 999:999 \
    --read-only \
    --tmpfs /tmp:size=64m,mode=1777 \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --network bridge \
    --mount "type=bind,source=${DATABASE_CA_CERT},target=/etc/ai-team-os/rds-ca.pem,readonly" \
    --entrypoint /bin/sh \
    "$PG_BACKUP_IMAGE" \
    -ec 'exec psql "$BACKUP_CONNECTION_URL" --no-psqlrc --tuples-only --no-align --command="SELECT pg_database_size(current_database())"')
  DATABASE_SIZE_BYTES=${DATABASE_SIZE_BYTES//[[:space:]]/}
  prepare_plaintext_dump_limit "$DATABASE_SIZE_BYTES"
  log "Creating a custom-format dump from the configured external PostgreSQL database"
  (
    ulimit -f "$DUMP_FILE_LIMIT_BLOCKS"
    docker run --rm \
      --ulimit core=0 \
      --env BACKUP_CONNECTION_URL \
      --user 999:999 \
      --read-only \
      --tmpfs /tmp:size=64m,mode=1777 \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --network bridge \
      --mount "type=bind,source=${DATABASE_CA_CERT},target=/etc/ai-team-os/rds-ca.pem,readonly" \
      --entrypoint /bin/sh \
      "$PG_BACKUP_IMAGE" \
      -ec 'exec pg_dump --dbname="$BACKUP_CONNECTION_URL" --format=custom --no-owner --no-privileges'
  ) >"$PLAIN_DUMP_FILE"
fi

[[ -s "$PLAIN_DUMP_FILE" ]] || die "database dump is empty"
docker run --rm -i \
  --ulimit core=0 \
  --user 999:999 \
  --read-only \
  --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --network none \
  --entrypoint pg_restore \
  "$PG_BACKUP_IMAGE" \
  --list >/dev/null <"$PLAIN_DUMP_FILE"
[[ $(sha256sum "$ENV_SNAPSHOT_FILE" | cut -d ' ' -f 1) == "$CONFIG_SOURCE_SHA256" ]] \
  || die "root-only environment snapshot changed while the database dump was running"

# The validated custom dump exists only on tmpfs. Publish only a CMS-encrypted
# recovery object to persistent storage; the private key remains off-host.
openssl cms -encrypt \
  -binary \
  -aes-256-cbc \
  -outform DER \
  -in "$PLAIN_DUMP_FILE" \
  -out "$DATABASE_PARTIAL_FILE" \
  "$BACKUP_ENCRYPTION_CERT"
[[ -s "$DATABASE_PARTIAL_FILE" ]] || die "encrypted database backup is empty"
openssl cms -cmsout -inform DER -in "$DATABASE_PARTIAL_FILE" -noout >/dev/null 2>&1 \
  || die "encrypted database backup could not be parsed"
rm -f -- "$PLAIN_DUMP_FILE"
PLAIN_DUMP_FILE=""

mv -- "$DATABASE_PARTIAL_FILE" "$BACKUP_FILE"
chmod 0600 "$BACKUP_FILE"
mv -- "$CONFIG_PARTIAL_FILE" "$CONFIG_BACKUP_FILE"
chmod 0600 "$CONFIG_BACKUP_FILE"

(
  cd "$BUNDLE_DIR"
  sha256sum database.dump.cms >database.dump.cms.sha256
  sha256sum configuration.env.cms >configuration.env.cms.sha256
)
chmod 0600 "$BUNDLE_DIR/database.dump.cms.sha256" "$BUNDLE_DIR/configuration.env.cms.sha256"

SAFE_REASON=$(printf '%s' "$BACKUP_REASON" | tr '\r\n' ' ' | cut -c1-160)
cat >"$BUNDLE_DIR/metadata.txt" <<METADATA
created_at=${TIMESTAMP}
release=${SAFE_RELEASE}
reason=${SAFE_REASON}
database_format=postgresql-custom
database_encryption=openssl-cms-der-aes-256-cbc
database_file=database.dump.cms
database_sha256_file=database.dump.cms.sha256
config_format=openssl-cms-der-aes-256-cbc
config_file=configuration.env.cms
config_sha256_file=configuration.env.cms.sha256
recipient_cert_fingerprint_sha256=${BACKUP_CERT_FINGERPRINT_SHA256}
METADATA
chmod 0600 "$BUNDLE_DIR/metadata.txt"

# A directory rename on the same filesystem publishes the verified recovery set
# as one unit. Before this point only the hidden .incoming directory exists.
mv -- "$BUNDLE_DIR" "$FINAL_BUNDLE_DIR"
BUNDLE_DIR=""

RETENTION_LIST_FILE=$(mktemp /run/ai-team-os/expired-backups.XXXXXXXX)
if ! find "$DEPLOY_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'ai-team-os-*' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print0 >"$RETENTION_LIST_FILE"; then
  die "failed to enumerate expired backup bundles"
fi
while IFS= read -r -d '' expired_backup; do
  [[ "$expired_backup" == "$DEPLOY_BACKUP_DIR"/ai-team-os-* && -d "$expired_backup" && ! -L "$expired_backup" ]] \
    || die "refusing to remove an unsafe expired backup path"
  [[ $(stat -c '%u' "$expired_backup") == 0 ]] \
    || die "refusing to remove a non-root-owned expired backup"
  rm -rf -- "$expired_backup"
done <"$RETENTION_LIST_FILE"
rm -f -- "$RETENTION_LIST_FILE"
RETENTION_LIST_FILE=""

log "Backup bundle complete: ${FINAL_BUNDLE_DIR}"
log "Encrypted database checksum: ${FINAL_BUNDLE_DIR}/database.dump.cms.sha256"
log "Encrypted configuration backup: ${FINAL_BUNDLE_DIR}/configuration.env.cms"
