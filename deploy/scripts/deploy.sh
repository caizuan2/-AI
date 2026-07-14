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
      PATH|HOME|LANG|LC_ALL|TZ|AI_TEAM_OS_CLEAN_ENVIRONMENT|AI_TEAM_OS_ENV_FILE|CONFIRM_MIGRATIONS|SSH_AUTH_SOCK|PWD|SHLVL|_|MSYSTEM|SYSTEMROOT|WINDIR) ;;
      *) return 1 ;;
    esac
  done < <(compgen -e)

  [[ ${PATH:-} == "$SAFE_PATH" && ${HOME:-} == /root \
    && ${LANG:-} == C.UTF-8 && ${LC_ALL:-} == C.UTF-8 && ${TZ:-} == UTC ]] \
    || return 1
  for allowed_name in AI_TEAM_OS_ENV_FILE CONFIRM_MIGRATIONS; do
    if [[ -v $allowed_name ]]; then
      allowed_value=${!allowed_name}
      [[ "$allowed_value" != *$'\n'* && "$allowed_value" != *$'\r'* ]] || return 1
    fi
  done
  if [[ -n ${SSH_AUTH_SOCK:-} ]]; then
    [[ "$SSH_AUTH_SOCK" =~ ^/[A-Za-z0-9._/-]+$ ]] || return 1
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
  for allowed_name in AI_TEAM_OS_ENV_FILE CONFIRM_MIGRATIONS; do
    if [[ -v $allowed_name ]]; then
      allowed_value=${!allowed_name}
      [[ "$allowed_value" != *$'\n'* && "$allowed_value" != *$'\r'* ]] || {
        printf 'Refusing a multiline value for %s.\n' "$allowed_name" >&2
        exit 1
      }
      CLEAN_ENV+=("${allowed_name}=${allowed_value}")
    fi
  done
  if [[ -n ${SSH_AUTH_SOCK:-} ]]; then
    [[ "$SSH_AUTH_SOCK" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
      printf 'SSH_AUTH_SOCK must be an absolute socket path with safe characters.\n' >&2
      exit 1
    }
    CLEAN_ENV+=("SSH_AUTH_SOCK=${SSH_AUTH_SOCK}")
  fi
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

PROGRAM=${0##*/}
ENV_FILE=${AI_TEAM_OS_ENV_FILE:-/etc/ai-team-os/ai-team-os.env}
CLI_SOURCE_MODE=""
CLI_RELEASE_REF=""
CLI_ARCHIVE=""
CLI_RELEASE_SHA=""
CLI_ARCHIVE_SHA256=""
MIGRATIONS_CONFIRMED=${CONFIRM_MIGRATIONS:-false}
STAGING_DIR=""
NEW_RELEASE_DIR=""
CUTOVER_STARTED=false
ACTIVATION_COMMITTED=false
VERSION_TARGET_BACKUP=""
ENV_SNAPSHOT_FILE=""

usage() {
  cat <<'USAGE'
Usage: deploy.sh [options]

  --env-file PATH       Root-owned production environment file (default:
                        /etc/ai-team-os/ai-team-os.env)
  --source-mode MODE    git or archive (overrides DEPLOY_SOURCE_MODE)
  --release-ref REF     Immutable commit or refs/tags/... for git mode
  --archive PATH        git-archive tar file for archive mode
  --release-sha SHA     Commit SHA represented by an archive
  --archive-sha256 SHA  Expected SHA-256 of the archive before extraction
  -h, --help            Show this help

This script creates an immutable release, backs up the database, runs
`prisma migrate deploy` in a one-shot container, and replaces only the
ai-team-os Compose service. It never rolls back a database migration.
Set CONFIRM_MIGRATIONS=true in the command environment after the exact
release SHA and migration contents have been approved.
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

require_trusted_orchestrator_file() {
  local file=$1
  [[ -f "$file" && ! -L "$file" ]] || die "trusted orchestrator file is missing or is a symlink: ${file}"
  [[ $(stat -c '%u' "$file") == 0 ]] || die "trusted orchestrator file must be owned by root: ${file}"
  local mode
  mode=$(stat -c '%a' "$file")
  (( (8#$mode & 022) == 0 )) || die "trusted orchestrator file must not be group/world writable: ${file}"
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

validate_production_environment() {
  node <<'NODE'
const env = process.env;
const errors = [];
const placeholder = /(?:replace|change|example|your-|dummy|sample|test-key|not-for-production|<[^>]+>|APP_USER|APP_PASSWORD|RDS_HOST|APP_DATABASE|BACKUP_USER|BACKUP_PASSWORD)/i;

function requireSecret(key, minimum = 24) {
  const value = (env[key] || "").trim();
  if (value.length < minimum || placeholder.test(value)) errors.push(key);
}

function parseUrl(key, protocols) {
  const value = (env[key] || "").trim();
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol) || !url.hostname || placeholder.test(value)) throw new Error("invalid");
    return url;
  } catch {
    errors.push(key);
    return null;
  }
}

const databaseCaCert = (env.DATABASE_CA_CERT || "").trim();

function requirePinnedDatabaseCa(key, url) {
  if (!url) return;
  if (url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.getAll("sslrootcert").length !== 1) {
    errors.push(`${key}_TLS_PARAMETERS`);
    return;
  }
  const sslMode = (url.searchParams.get("sslmode") || "").toLowerCase();
  const sslRootCert = url.searchParams.get("sslrootcert") || "";
  if (sslRootCert !== databaseCaCert) errors.push(`${key}_CA_PATH`);
  if (key === "BACKUP_DATABASE_URL") {
    if (sslMode !== "verify-full" || url.searchParams.has("sslaccept")) errors.push(`${key}_TLS`);
    return;
  }
  if (url.searchParams.getAll("sslaccept").length !== 1) {
    errors.push(`${key}_TLS_PARAMETERS`);
    return;
  }
  const sslAccept = (url.searchParams.get("sslaccept") || "").toLowerCase();
  if (sslMode !== "require" || sslAccept !== "strict") errors.push(`${key}_TLS`);
}

function requireLoopbackUrl(key) {
  const url = parseUrl(key, ["http:"]);
  if (url && !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) errors.push(`${key}_LOOPBACK`);
  if (url && (url.username || url.password)) errors.push(`${key}_CREDENTIALS`);
}

if (env.NODE_ENV !== "production") errors.push("NODE_ENV");
if (databaseCaCert !== "/etc/ai-team-os/rds-ca.pem") errors.push("DATABASE_CA_CERT");
const databaseUrl = parseUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
const directUrl = parseUrl("DIRECT_URL", ["postgres:", "postgresql:"]);
const backupUrl = parseUrl("BACKUP_DATABASE_URL", ["postgres:", "postgresql:"]);
requirePinnedDatabaseCa("DATABASE_URL", databaseUrl);
requirePinnedDatabaseCa("DIRECT_URL", directUrl);
requirePinnedDatabaseCa("BACKUP_DATABASE_URL", backupUrl);
if (backupUrl?.searchParams.has("schema")) errors.push("BACKUP_DATABASE_URL_SCHEMA_PARAM");
const publicUrl = parseUrl("NEXT_PUBLIC_APP_URL", ["https:"]);
const knowledgeUrl = parseUrl("APP_URL", ["https:"]);
if (publicUrl && knowledgeUrl && publicUrl.origin === knowledgeUrl.origin) errors.push("APP_URL_MUST_BE_SEPARATE");
const repositoryUrl = (env.DEPLOY_REPOSITORY_URL || "").trim();
if (repositoryUrl) {
  if (/^[^@\s]+@[^:\s]+:.+$/u.test(repositoryUrl)) {
    // SCP-style SSH URLs use a non-secret account name and an external key.
  } else {
    try {
      const parsedRepository = new URL(repositoryUrl);
      if (!["https:", "ssh:"].includes(parsedRepository.protocol)) errors.push("DEPLOY_REPOSITORY_URL_PROTOCOL");
      if (parsedRepository.password || (parsedRepository.protocol === "https:" && parsedRepository.username)) {
        errors.push("DEPLOY_REPOSITORY_URL_MUST_NOT_CONTAIN_CREDENTIALS");
      }
    } catch {
      errors.push("DEPLOY_REPOSITORY_URL");
    }
  }
}
if (env.TEAM_OS_BIND_ADDRESS !== "127.0.0.1") errors.push("TEAM_OS_BIND_ADDRESS");
if (env.TEAM_OS_PORT !== "3022") errors.push("TEAM_OS_PORT");
requireLoopbackUrl("TEAM_OS_HEALTH_URL");
requireLoopbackUrl("TEAM_OS_READINESS_URL");

requireSecret("SESSION_SECRET", 32);
requireSecret("LICENSE_SECRET", 24);
requireSecret("OPENAI_API_KEY", 20);
const encryptionKey = (env.ENCRYPTION_KEY || "").trim();
if (!/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43})$/.test(encryptionKey) || placeholder.test(encryptionKey)) {
  errors.push("ENCRYPTION_KEY");
}
const integrationEncryptionKey = (env.TEAM_OS_INTEGRATION_ENCRYPTION_KEY || "").trim();
if (integrationEncryptionKey && integrationEncryptionKey !== encryptionKey) {
  errors.push("TEAM_OS_INTEGRATION_ENCRYPTION_KEY_MISMATCH");
}
const provider = (env.AI_PROVIDER || "").trim().toLowerCase();
if (!["openai", "deepseek", "qwen"].includes(provider)) errors.push("AI_PROVIDER");
if (provider === "openai") requireSecret("OPENAI_API_KEY", 20);
if (provider === "deepseek") requireSecret("DEEPSEEK_API_KEY", 20);
if (provider === "qwen") requireSecret("QWEN_API_KEY", 20);

if (errors.length > 0) {
  console.error(`Production environment validation failed for: ${[...new Set(errors)].join(", ")}`);
  process.exit(1);
}
NODE
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

cleanup() {
  local exit_code=$?
  if (( exit_code != 0 )) && [[ "$CUTOVER_STARTED" == true && "$ACTIVATION_COMMITTED" != true ]]; then
    if declare -F restore_original_application >/dev/null 2>&1; then
      if ! restore_original_application; then
        log "CRITICAL: failed to restore the previously running Team OS application; manual recovery is required." >&2
      fi
    fi
    if declare -F restore_activation_state >/dev/null 2>&1; then
      if ! restore_activation_state; then
        log "CRITICAL: failed to restore deployment state pointers or version manifest; manual reconciliation is required." >&2
      fi
    fi
  fi
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
  if [[ -n "$VERSION_TARGET_BACKUP" ]]; then
    rm -f -- "$VERSION_TARGET_BACKUP"
  fi
  if [[ -n "$ENV_SNAPSHOT_FILE" ]]; then
    rm -f -- "$ENV_SNAPSHOT_FILE"
  fi
  if (( exit_code != 0 )); then
    log "Deployment failed. The database was not automatically rolled back." >&2
    if [[ -n "${PREVIOUS_RELEASE:-}" ]]; then
      log "Application rollback candidate: ${PREVIOUS_RELEASE}" >&2
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'die "command failed at line ${LINENO}"' ERR

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      (( $# >= 2 )) || die "--env-file requires a path"
      ENV_FILE=$2
      shift 2
      ;;
    --source-mode)
      (( $# >= 2 )) || die "--source-mode requires git or archive"
      CLI_SOURCE_MODE=$2
      shift 2
      ;;
    --release-ref)
      (( $# >= 2 )) || die "--release-ref requires a value"
      CLI_RELEASE_REF=$2
      shift 2
      ;;
    --archive)
      (( $# >= 2 )) || die "--archive requires a path"
      CLI_ARCHIVE=$2
      shift 2
      ;;
    --release-sha)
      (( $# >= 2 )) || die "--release-sha requires a value"
      CLI_RELEASE_SHA=$2
      shift 2
      ;;
    --archive-sha256)
      (( $# >= 2 )) || die "--archive-sha256 requires a value"
      CLI_ARCHIVE_SHA256=$2
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

[[ ${EUID} -eq 0 ]] || die "run as root so release and state ownership is deterministic"

TRUSTED_REPOSITORY_ROOT=$(readlink -f -- "$SCRIPT_DIR/../..")
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
ORCHESTRATOR_RELATIVE_FILES=("${ORCHESTRATOR_V2_RELATIVE_FILES[@]}")
TRUSTED_ORCHESTRATOR_FILES=()
for relative_path in "${ORCHESTRATOR_RELATIVE_FILES[@]}"; do
  TRUSTED_ORCHESTRATOR_FILES+=("$TRUSTED_REPOSITORY_ROOT/$relative_path")
done
for trusted_file in "${TRUSTED_ORCHESTRATOR_FILES[@]}"; do
  require_trusted_orchestrator_file "$trusted_file"
done
TRUSTED_ORCHESTRATOR_SHA256=$(calculate_orchestrator_sha256 "$TRUSTED_REPOSITORY_ROOT" "$ORCHESTRATOR_SCHEMA_CURRENT") \
  || die "failed to hash the trusted orchestrator bundle"

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
  || die "/run/ai-team-os must be backed by tmpfs for the deployment environment snapshot"
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
ENV_SNAPSHOT_FILE=$(mktemp /run/ai-team-os/deploy-env.XXXXXXXX)
install -o root -g root -m 0600 -- "$ENV_FILE" "$ENV_SNAPSHOT_FILE"
[[ $(sha256sum "$ENV_SNAPSHOT_FILE" | cut -d ' ' -f 1) == "$LIVE_ENV_SHA256" ]] \
  || die "production environment changed while its deployment snapshot was created"
[[ $(sha256sum "$ENV_FILE" | cut -d ' ' -f 1) == "$LIVE_ENV_SHA256" ]] \
  || die "production environment changed while its deployment snapshot was created"
ENV_FILE=$ENV_SNAPSHOT_FILE

ai_team_os_load_env "$ENV_FILE" || die "production environment parsing failed"

DEPLOY_SOURCE_MODE=${CLI_SOURCE_MODE:-${DEPLOY_SOURCE_MODE:-git}}
DEPLOY_RELEASE_REF=${CLI_RELEASE_REF:-${DEPLOY_RELEASE_REF:-}}
DEPLOY_SOURCE_ARCHIVE=${CLI_ARCHIVE:-${DEPLOY_SOURCE_ARCHIVE:-}}
DEPLOY_RELEASE_SHA=${CLI_RELEASE_SHA:-${DEPLOY_RELEASE_SHA:-}}
DEPLOY_SOURCE_ARCHIVE_SHA256=${CLI_ARCHIVE_SHA256:-${DEPLOY_SOURCE_ARCHIVE_SHA256:-}}
DEPLOY_BASE_DIR=${DEPLOY_BASE_DIR:-/opt/ai-team-os}
DEPLOY_STATE_DIR=${DEPLOY_STATE_DIR:-/var/lib/ai-team-os}
TEAM_OS_VERSION_TARGET=${TEAM_OS_VERSION_TARGET:-/var/www/ai-team-os/updates/VERSION_CHECK.json}
TEAM_OS_HEALTH_URL=${TEAM_OS_HEALTH_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/team-os/status}
TEAM_OS_READINESS_URL=${TEAM_OS_READINESS_URL:-http://127.0.0.1:${TEAM_OS_PORT:-3022}/api/health?database=true&schema=true&ai=true}
DEPLOY_LOCK_FILE=${DEPLOY_LOCK_FILE:-/run/ai-team-os/deploy.lock}

[[ "$MIGRATIONS_CONFIRMED" == true ]] || die "set CONFIRM_MIGRATIONS=true in the command environment after reviewing the exact release migrations"
[[ ${ENABLE_BUNDLED_POSTGRES:-false} != true ]] || die "production deploy.sh requires external RDS; the bundled database profile is for isolated manual testing only"
[[ ${ENABLE_BUNDLED_REDIS:-false} != true ]] || die "Redis is not used by the current runtime; do not enable the cache profile in production deploy.sh"
validate_production_environment

[[ "$DEPLOY_BASE_DIR" == /* && "$DEPLOY_BASE_DIR" != / ]] || die "DEPLOY_BASE_DIR must be a non-root absolute path"
[[ "$DEPLOY_STATE_DIR" == /* && "$DEPLOY_STATE_DIR" != / ]] || die "DEPLOY_STATE_DIR must be a non-root absolute path"
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

prepare_root_directory "$DEPLOY_BASE_DIR" 0750
prepare_root_directory "$DEPLOY_BASE_DIR/releases" 0750
prepare_root_directory "$DEPLOY_STATE_DIR" 0750
prepare_root_directory "$(dirname -- "$TEAM_OS_VERSION_TARGET")" 0755

CURRENT_RELEASE_FILE="$DEPLOY_STATE_DIR/current-release"
PREVIOUS_RELEASE_FILE="$DEPLOY_STATE_DIR/previous-release"
PREVIOUS_RELEASE=""
CURRENT_RELEASE_FILE_EXISTED=false
PREVIOUS_RELEASE_FILE_EXISTED=false
ORIGINAL_PREVIOUS_RELEASE=""
[[ ! -L "$CURRENT_RELEASE_FILE" && ! -L "$PREVIOUS_RELEASE_FILE" ]] \
  || die "deployment state files must not be symbolic links"
if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  require_root_control_file "$CURRENT_RELEASE_FILE"
  CURRENT_RELEASE_FILE_EXISTED=true
  PREVIOUS_RELEASE=$(<"$CURRENT_RELEASE_FILE")
fi
if [[ -f "$PREVIOUS_RELEASE_FILE" ]]; then
  require_root_control_file "$PREVIOUS_RELEASE_FILE"
  PREVIOUS_RELEASE_FILE_EXISTED=true
  ORIGINAL_PREVIOUS_RELEASE=$(<"$PREVIOUS_RELEASE_FILE")
fi
RELEASES_ROOT=$(readlink -m -- "$DEPLOY_BASE_DIR/releases")
ORIGINAL_COMPOSE_FILE=""
ORIGINAL_SOURCE_SHA=""
if [[ -n "$PREVIOUS_RELEASE" ]]; then
  PREVIOUS_RELEASE=$(readlink -f -- "$PREVIOUS_RELEASE") || die "recorded current release does not exist"
  case "$PREVIOUS_RELEASE" in
    "$RELEASES_ROOT"/*) ;;
    *) die "recorded current release escapes ${RELEASES_ROOT}" ;;
  esac
  require_root_release_tree "$PREVIOUS_RELEASE"
  ORIGINAL_COMPOSE_FILE="$PREVIOUS_RELEASE/deploy/docker/docker-compose.yml"
  ORIGINAL_METADATA_FILE="$PREVIOUS_RELEASE/.release.env"
  ORIGINAL_VERSION_FILE="$PREVIOUS_RELEASE/deploy/VERSION_CHECK.json"
  [[ -f "$ORIGINAL_COMPOSE_FILE" && -f "$ORIGINAL_METADATA_FILE" && -f "$ORIGINAL_VERSION_FILE" ]] \
    || die "recorded current release is missing Compose, version, or release metadata"
  require_root_control_file "$ORIGINAL_COMPOSE_FILE"
  require_root_control_file "$ORIGINAL_METADATA_FILE"
  require_root_control_file "$ORIGINAL_VERSION_FILE"
  load_release_snapshot "$ORIGINAL_METADATA_FILE" ORIGINAL \
    || die "recorded current release metadata could not be parsed"
  validate_release_snapshot ORIGINAL "$PREVIOUS_RELEASE" \
    || die "recorded current release metadata is inconsistent"
  [[ $(calculate_orchestrator_sha256 "$PREVIOUS_RELEASE" "$ORIGINAL_ORCHESTRATOR_SCHEMA") == "$ORIGINAL_ORCHESTRATOR_SHA256" ]] \
    || die "recorded current release orchestrator bundle hash is inconsistent"
fi
log "Current application baseline: ${PREVIOUS_RELEASE:-none}"

STAGING_DIR=$(mktemp -d "$DEPLOY_BASE_DIR/.incoming.XXXXXXXX")
SOURCE_SHA=""
SOURCE_REF=""

case "$DEPLOY_SOURCE_MODE" in
  git)
    command -v git >/dev/null 2>&1 || die "git is required for source mode git"
    [[ -n "${DEPLOY_REPOSITORY_URL:-}" ]] || die "DEPLOY_REPOSITORY_URL is required for git mode"
    [[ -n "$DEPLOY_RELEASE_REF" ]] || die "DEPLOY_RELEASE_REF must name an explicit commit or reviewed tag"
    validate_source_ref "$DEPLOY_RELEASE_REF" || die "DEPLOY_RELEASE_REF contains unsupported or ambiguous characters"
    if [[ ! "$DEPLOY_RELEASE_REF" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ \
      && "$DEPLOY_RELEASE_REF" != refs/tags/* ]]; then
      die "git mode accepts only a full commit SHA or a canonical refs/tags/... release ref"
    fi
    [[ "$DEPLOY_RELEASE_SHA" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] || die "git mode requires the full expected DEPLOY_RELEASE_SHA"
    log "Fetching the requested release ref into an isolated staging directory"
    git -C "$STAGING_DIR" init --quiet
    git -C "$STAGING_DIR" remote add origin "$DEPLOY_REPOSITORY_URL"
    git -C "$STAGING_DIR" fetch --quiet --depth=1 origin "$DEPLOY_RELEASE_REF"
    git -C "$STAGING_DIR" -c advice.detachedHead=false checkout --quiet --detach FETCH_HEAD
    SOURCE_SHA=$(git -C "$STAGING_DIR" rev-parse HEAD)
    [[ "${SOURCE_SHA,,}" == "${DEPLOY_RELEASE_SHA,,}" ]] || die "fetched git ref does not match the approved release SHA"
    SOURCE_REF=$DEPLOY_RELEASE_REF
    rm -rf -- "$STAGING_DIR/.git"
    ;;
  archive)
    command -v tar >/dev/null 2>&1 || die "tar is required for source mode archive"
    command -v git >/dev/null 2>&1 || die "git is required to verify the archive commit id"
    [[ -n "$DEPLOY_SOURCE_ARCHIVE" && -f "$DEPLOY_SOURCE_ARCHIVE" && ! -L "$DEPLOY_SOURCE_ARCHIVE" ]] \
      || die "DEPLOY_SOURCE_ARCHIVE must reference a regular tar archive, not a symbolic link"
    [[ -z "$DEPLOY_RELEASE_REF" ]] \
      || die "archive mode records commit/<sha> provenance and does not accept DEPLOY_RELEASE_REF"
    EXPECTED_ARCHIVE_SHA256=${DEPLOY_SOURCE_ARCHIVE_SHA256:-}
    [[ "$EXPECTED_ARCHIVE_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || die "archive mode requires DEPLOY_SOURCE_ARCHIVE_SHA256"

    # Freeze an untrusted uploaded archive into the root-owned release staging
    # tree. Every integrity/type check and the final extraction reads this one
    # 0600 copy, eliminating a checksum-to-extract replacement window.
    ARCHIVE_COPY="$STAGING_DIR/.approved-source.tar"
    install -o root -g root -m 0600 -- "$DEPLOY_SOURCE_ARCHIVE" "$ARCHIVE_COPY"
    [[ -f "$ARCHIVE_COPY" && ! -L "$ARCHIVE_COPY" ]] \
      || die "failed to create a regular root-owned archive snapshot"
    ACTUAL_ARCHIVE_SHA256=$(sha256sum "$ARCHIVE_COPY" | cut -d ' ' -f 1)
    [[ "${ACTUAL_ARCHIVE_SHA256,,}" == "${EXPECTED_ARCHIVE_SHA256,,}" ]] || die "source archive SHA-256 does not match"
    ARCHIVE_COMMIT_SHA=$(git get-tar-commit-id <"$ARCHIVE_COPY" 2>/dev/null || true)
    [[ "$ARCHIVE_COMMIT_SHA" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] \
      || die "archive must be a standard git archive with an embedded commit id"
    [[ "${ARCHIVE_COMMIT_SHA,,}" == "${DEPLOY_RELEASE_SHA,,}" ]] \
      || die "archive embedded commit id does not match DEPLOY_RELEASE_SHA"
    tar -tf "$ARCHIVE_COPY" >/dev/null \
      || die "source archive could not be listed safely"
    if tar -tf "$ARCHIVE_COPY" | grep -E '(^/|(^|/)\.\.(/|$))' >/dev/null; then
      die "archive contains an unsafe absolute or parent path"
    fi
    if tar -tvf "$ARCHIVE_COPY" | awk 'substr($1, 1, 1) !~ /^[-d]$/ { unsafe = 1 } END { exit unsafe ? 0 : 1 }'; then
      die "archive may contain only regular files and directories"
    fi
    tar -xf "$ARCHIVE_COPY" -C "$STAGING_DIR"
    rm -f -- "$ARCHIVE_COPY"
    SOURCE_SHA=${DEPLOY_RELEASE_SHA:-${WEB_RELEASE_SHA:-}}
    [[ "$SOURCE_SHA" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]] || die "archive mode requires a full DEPLOY_RELEASE_SHA"
    SOURCE_REF=commit/$SOURCE_SHA
    validate_source_ref "$SOURCE_REF" || die "archive release ref contains unsupported or ambiguous characters"
    ;;
  *)
    die "DEPLOY_SOURCE_MODE must be git or archive"
    ;;
esac

STAGING_UNSAFE_ENTRY=$(find "$STAGING_DIR" -mindepth 1 ! -type f ! -type d -print -quit) \
  || die "failed to inspect staged release entry types"
if [[ -n "$STAGING_UNSAFE_ENTRY" ]]; then
  die "release source contains a symlink or another non-regular filesystem entry"
fi
[[ ! -e "$STAGING_DIR/.release.env" && ! -L "$STAGING_DIR/.release.env" ]] \
  || die "release source must not pre-create deployment control metadata"

[[ -f "$STAGING_DIR/package.json" && -f "$STAGING_DIR/pnpm-lock.yaml" ]] || die "release source must contain package.json and pnpm-lock.yaml at its root"
[[ -f "$STAGING_DIR/deploy/docker/docker-compose.yml" ]] || die "release source is missing Phase 13 Compose configuration"
[[ -f "$STAGING_DIR/deploy/VERSION_CHECK.json" ]] || die "release source is missing VERSION_CHECK.json"
[[ -f "$STAGING_DIR/deploy/scripts/verify-team-os-schema.mjs" ]] || die "release source is missing the Team OS schema verifier"

# Application code and reviewed migrations come from the approved release SHA.
# Host orchestration remains fixed to this root-owned deployment bundle so a
# fetched release cannot replace Compose policy or scripts that receive secrets.
install -m 0644 "$TRUSTED_REPOSITORY_ROOT/.dockerignore" "$STAGING_DIR/.dockerignore"
install -m 0644 "$TRUSTED_REPOSITORY_ROOT/.env.production.template" "$STAGING_DIR/.env.production.template"
install -m 0644 "$TRUSTED_REPOSITORY_ROOT/deploy/docker/Dockerfile.production" "$STAGING_DIR/deploy/docker/Dockerfile.production"
install -m 0644 "$TRUSTED_REPOSITORY_ROOT/deploy/docker/docker-compose.yml" "$STAGING_DIR/deploy/docker/docker-compose.yml"
install -m 0644 "$TRUSTED_REPOSITORY_ROOT/deploy/nginx/ai-team-os.conf" "$STAGING_DIR/deploy/nginx/ai-team-os.conf"
    for trusted_script in backup.sh deploy.sh load-env.sh production-health-check.sh rollback.sh server-init.sh test-env-loader.sh verify-deployment.mjs verify-team-os-schema.mjs; do
  install -m 0644 "$TRUSTED_REPOSITORY_ROOT/deploy/scripts/$trusted_script" "$STAGING_DIR/deploy/scripts/$trusted_script"
done
ORCHESTRATOR_SHA256=$(calculate_orchestrator_sha256 "$STAGING_DIR" "$ORCHESTRATOR_SCHEMA_CURRENT") \
  || die "failed to hash the release orchestrator overlay"
[[ "$ORCHESTRATOR_SHA256" == "$TRUSTED_ORCHESTRATOR_SHA256" ]] \
  || die "release orchestrator overlay does not match the trusted bundle"

SHORT_SHA=${SOURCE_SHA:0:12}
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-${SHORT_SHA}"
NEW_RELEASE_DIR="$DEPLOY_BASE_DIR/releases/$RELEASE_ID"
[[ ! -e "$NEW_RELEASE_DIR" ]] || die "release directory already exists: ${NEW_RELEASE_DIR}"
mv -- "$STAGING_DIR" "$NEW_RELEASE_DIR"
STAGING_DIR=""

log "Prepared immutable release candidate ${RELEASE_ID}"
cd "$NEW_RELEASE_DIR"

RUNTIME_IMAGE="ai-team-os:${RELEASE_ID}"
MIGRATION_IMAGE="ai-team-os-migration:${RELEASE_ID}"
COMPOSE_FILE="$NEW_RELEASE_DIR/deploy/docker/docker-compose.yml"
EXPECTED_TEAM_OS_VERSION=$(read_manifest_field "$NEW_RELEASE_DIR/deploy/VERSION_CHECK.json" version) \
  || die "VERSION_CHECK.json is missing web.version"
EXPECTED_TEAM_OS_BUILD=$(read_manifest_field "$NEW_RELEASE_DIR/deploy/VERSION_CHECK.json" buildNumber) \
  || die "VERSION_CHECK.json is missing web.buildNumber"
export TEAM_OS_ENV_FILE="$ENV_FILE"
export TEAM_OS_IMAGE="$RUNTIME_IMAGE"
export TEAM_OS_MIGRATION_IMAGE="$MIGRATION_IMAGE"
export WEB_RELEASE_SHA="$SOURCE_SHA"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
ORIGINAL_COMPOSE=()
if [[ -n "$ORIGINAL_COMPOSE_FILE" ]]; then
  ORIGINAL_COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ORIGINAL_COMPOSE_FILE")
fi

log "Building versioned runtime and one-shot migration images"
"${COMPOSE[@]}" --profile tools build --pull team-os migrate
RUNTIME_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$RUNTIME_IMAGE")
MIGRATION_IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$MIGRATION_IMAGE")
[[ "$RUNTIME_IMAGE_ID" == sha256:* && "$MIGRATION_IMAGE_ID" == sha256:* ]] || die "built image IDs are not content-addressed"

if (( ${#ORIGINAL_COMPOSE[@]} > 0 )); then
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
    || die "running Team OS container does not match the recorded release image baseline"
  ORIGINAL_EXPECTED_VERSION=$(read_manifest_field "$ORIGINAL_VERSION_FILE" version) \
    || die "recorded current release VERSION_CHECK is missing web.version"
  ORIGINAL_EXPECTED_BUILD=$(read_manifest_field "$ORIGINAL_VERSION_FILE" buildNumber) \
    || die "recorded current release VERSION_CHECK is missing web.buildNumber"
  wait_for_status_identity "$TEAM_OS_HEALTH_URL" "$ORIGINAL_EXPECTED_VERSION" "$ORIGINAL_EXPECTED_BUILD" "$ORIGINAL_SOURCE_SHA" 5 \
    || die "running Team OS status does not match the recorded release baseline"
  wait_for_json_flag "$TEAM_OS_READINESS_URL" ok 5 \
    || die "running Team OS baseline is not database/schema/AI ready"
  log "Captured running image baseline: ${ORIGINAL_IMAGE_ID}"
elif [[ -n "$PREVIOUS_RELEASE" ]]; then
  die "recorded current release has no running Team OS container"
fi

restore_original_application() {
  if [[ -z "$ORIGINAL_IMAGE" || -z "$ORIGINAL_IMAGE_ID" || ${#ORIGINAL_COMPOSE[@]} -eq 0 ]]; then
    local remaining_container
    log "No prior Team OS baseline exists; removing the failed candidate application." >&2
    "${COMPOSE[@]}" stop team-os >/dev/null 2>&1 || true
    "${COMPOSE[@]}" rm -f team-os >/dev/null 2>&1 || true
    remaining_container=$("${COMPOSE[@]}" ps -aq team-os 2>/dev/null || true)
    [[ -z "$remaining_container" ]] || return 1
    if curl --disable --noproxy '*' --fail --silent --show-error --max-time 2 "$TEAM_OS_HEALTH_URL" >/dev/null 2>&1; then
      log "The failed candidate still responds on the private Team OS health endpoint." >&2
      return 1
    fi
    return 0
  fi
  local actual_image_id
  actual_image_id=$(docker image inspect --format '{{.Id}}' "$ORIGINAL_IMAGE" 2>/dev/null || true)
  [[ "$actual_image_id" == "$ORIGINAL_IMAGE_ID" ]] || return 1
  log "Restoring the previously running Team OS image ${ORIGINAL_IMAGE_ID}." >&2
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
    atomic_write_line "$CURRENT_RELEASE_FILE" "$PREVIOUS_RELEASE" || return 1
    ln -sfn "$PREVIOUS_RELEASE" "$DEPLOY_BASE_DIR/.current.restore" || return 1
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

log "Creating a pre-migration database backup"
bash "$TRUSTED_REPOSITORY_ROOT/deploy/scripts/backup.sh" \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --release "$RELEASE_ID" \
  --reason pre-migration

log "Applying committed Prisma migrations with a one-shot container"
"${COMPOSE[@]}" --profile tools run --rm --no-deps migrate migrate deploy
"${COMPOSE[@]}" --profile tools run --rm --no-deps migrate migrate status
verify_team_os_schema

{
  printf 'RELEASE_ID=%s\n' "$RELEASE_ID"
  printf 'RELEASE_PATH=%s\n' "$NEW_RELEASE_DIR"
  printf 'SOURCE_REF=%s\n' "$SOURCE_REF"
  printf 'SOURCE_SHA=%s\n' "$SOURCE_SHA"
  printf 'ORCHESTRATOR_SCHEMA=%s\n' "$ORCHESTRATOR_SCHEMA_CURRENT"
  printf 'ORCHESTRATOR_SHA256=%s\n' "$ORCHESTRATOR_SHA256"
  printf 'RUNTIME_IMAGE=%s\n' "$RUNTIME_IMAGE"
  printf 'RUNTIME_IMAGE_ID=%s\n' "$RUNTIME_IMAGE_ID"
  printf 'MIGRATION_IMAGE=%s\n' "$MIGRATION_IMAGE"
  printf 'MIGRATION_IMAGE_ID=%s\n' "$MIGRATION_IMAGE_ID"
} >"$NEW_RELEASE_DIR/.release.env"
chmod 0440 "$NEW_RELEASE_DIR/.release.env"

# Lock the release tree before it can become the active application. The
# container runs from versioned images, so no runtime write belongs here.
chmod -R a-w "$NEW_RELEASE_DIR"
require_root_release_tree "$NEW_RELEASE_DIR"

log "Replacing only the isolated team-os application service"
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
  die "team-os container replacement failed"
fi
if ! wait_for_status_identity "$TEAM_OS_HEALTH_URL" "$EXPECTED_TEAM_OS_VERSION" "$EXPECTED_TEAM_OS_BUILD" "$SOURCE_SHA" 60; then
  die "status identity check failed for ${EXPECTED_TEAM_OS_VERSION}/${EXPECTED_TEAM_OS_BUILD}/${SOURCE_SHA}: ${TEAM_OS_HEALTH_URL}"
fi
if ! verify_team_os_schema; then
  die "Team OS schema readiness check failed after cutover"
fi
if ! wait_for_json_flag "$TEAM_OS_READINESS_URL" ok 60; then
  die "database/schema/AI readiness check failed: ${TEAM_OS_READINESS_URL}"
fi

atomic_install_file "$NEW_RELEASE_DIR/deploy/VERSION_CHECK.json" "$TEAM_OS_VERSION_TARGET"
if [[ -n "$PREVIOUS_RELEASE" && "$PREVIOUS_RELEASE" != "$NEW_RELEASE_DIR" ]]; then
  atomic_write_line "$PREVIOUS_RELEASE_FILE" "$PREVIOUS_RELEASE"
fi
atomic_write_line "$CURRENT_RELEASE_FILE" "$NEW_RELEASE_DIR"
ln -sfn "$NEW_RELEASE_DIR" "$DEPLOY_BASE_DIR/.current.new"
mv -Tf "$DEPLOY_BASE_DIR/.current.new" "$DEPLOY_BASE_DIR/current"
ACTIVATION_COMMITTED=true
log "Deployment healthy: ${RELEASE_ID} (${SOURCE_SHA}, ${RUNTIME_IMAGE_ID})"
log "Rollback remains application-only; database restoration is a separate reviewed operation."
