#!/usr/bin/env bash
set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077
ulimit -c 0

SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PREFLIGHT_ENV_ALLOWLIST=(
  AI_TEAM_OS_ENV_FILE
  AI_TEAM_OS_MIN_CPU
  AI_TEAM_OS_MIN_MEMORY_MIB
  AI_TEAM_OS_MIN_AVAILABLE_MEMORY_MIB
  AI_TEAM_OS_MIN_TOTAL_DISK_GIB
  AI_TEAM_OS_MIN_DISK_GIB
  AI_TEAM_OS_MIN_FREE_INODE_PERCENT
  AI_TEAM_OS_DATABASE_TIMEOUT_SECONDS
)
validate_clean_environment() {
  local exported_name allowed_name allowed_value
  while IFS= read -r exported_name; do
    case "$exported_name" in
      PATH|HOME|LANG|LC_ALL|TZ|AI_TEAM_OS_CLEAN_ENVIRONMENT|AI_TEAM_OS_ENV_FILE|AI_TEAM_OS_MIN_CPU|AI_TEAM_OS_MIN_MEMORY_MIB|AI_TEAM_OS_MIN_AVAILABLE_MEMORY_MIB|AI_TEAM_OS_MIN_TOTAL_DISK_GIB|AI_TEAM_OS_MIN_DISK_GIB|AI_TEAM_OS_MIN_FREE_INODE_PERCENT|AI_TEAM_OS_DATABASE_TIMEOUT_SECONDS|PWD|SHLVL|_|MSYSTEM|SYSTEMROOT|WINDIR) ;;
      *) return 1 ;;
    esac
  done < <(compgen -e)

  [[ ${PATH:-} == "$SAFE_PATH" && ${HOME:-} == /root \
    && ${LANG:-} == C.UTF-8 && ${LC_ALL:-} == C.UTF-8 && ${TZ:-} == UTC ]] \
    || return 1
  for allowed_name in "${PREFLIGHT_ENV_ALLOWLIST[@]}"; do
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
  for allowed_name in "${PREFLIGHT_ENV_ALLOWLIST[@]}"; do
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
ENV_FILE=${AI_TEAM_OS_ENV_FILE:-/etc/ai-team-os/ai-team-os.env}
MIN_CPU=${AI_TEAM_OS_MIN_CPU:-4}
MIN_MEMORY_MIB=${AI_TEAM_OS_MIN_MEMORY_MIB:-7000}
MIN_AVAILABLE_MEMORY_MIB=${AI_TEAM_OS_MIN_AVAILABLE_MEMORY_MIB:-2048}
MIN_TOTAL_DISK_GIB=${AI_TEAM_OS_MIN_TOTAL_DISK_GIB:-75}
MIN_DISK_GIB=${AI_TEAM_OS_MIN_DISK_GIB:-30}
MIN_FREE_INODE_PERCENT=${AI_TEAM_OS_MIN_FREE_INODE_PERCENT:-10}
DATABASE_TIMEOUT_SECONDS=${AI_TEAM_OS_DATABASE_TIMEOUT_SECONDS:-5}
PASS_COUNT=0
FAIL_COUNT=0

usage() {
  cat <<'USAGE'
Usage: cloud-preflight-check.sh [options]

Runs read-only AI Team OS production host checks. It never installs packages,
changes firewall rules, starts services, migrates a database, or prints secret
values. Run it manually on the approved ECS host before a deployment window.

  --env-file PATH       Root-owned production dotenv file
  --min-cpu COUNT       Minimum online CPU count (default: 4)
  --min-memory-mib MIB  Minimum total memory in MiB (default: 7000)
  --min-available-memory-mib MIB
                        Minimum currently available memory in MiB (default: 2048)
  --min-total-disk-gib GIB
                        Minimum total GiB on / (default: 75)
  --min-disk-gib GIB    Minimum free GiB on / (default: 30)
  --min-free-inode-percent PERCENT
                        Minimum free inode percentage on / (default: 10)
  --db-timeout SECONDS  Database connection timeout, 1-30 (default: 5)
  -h, --help            Show this help

Exit codes: 0 = every required check passed, 1 = one or more checks failed,
2 = invalid command usage.
Resource-threshold overrides may raise the production baselines, never lower them.
USAGE
}

pass() {
  ((PASS_COUNT += 1))
  printf 'PASS  %s\n' "$*"
}

fail() {
  ((FAIL_COUNT += 1))
  printf 'FAIL  %s\n' "$*"
}

usage_error() {
  printf 'ERROR %s\n' "$*" >&2
  usage >&2
  exit 2
}

positive_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 > 0 ))
}

version_at_least() {
  local actual=$1
  local required=$2
  local first
  first=$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n 1)
  [[ "$first" == "$required" ]]
}

check_required_host_commands() {
  local command_name missing=false
  for command_name in awk date df findmnt grep head openssl readlink sort ss stat uname; do
    if command -v "$command_name" >/dev/null 2>&1; then
      pass "required host command is available: ${command_name}"
    else
      fail "required host command is missing: ${command_name}"
      missing=true
    fi
  done
  [[ "$missing" != true ]]
}

check_operating_system() {
  if [[ ! -r /etc/os-release ]]; then
    fail 'Ubuntu release metadata is unavailable'
    return
  fi

  local id version_id pretty_name
  id=$(awk -F= '$1 == "ID" { gsub(/^"|"$/, "", $2); print $2 }' /etc/os-release)
  version_id=$(awk -F= '$1 == "VERSION_ID" { gsub(/^"|"$/, "", $2); print $2 }' /etc/os-release)
  pretty_name=$(awk -F= '$1 == "PRETTY_NAME" { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print }' /etc/os-release)
  if [[ "$id" == ubuntu && ( "$version_id" == 22.04 || "$version_id" == 24.04 ) ]]; then
    pass "supported operating system: ${pretty_name:-Ubuntu ${version_id}}"
  else
    fail "unsupported operating system; Ubuntu 22.04 or 24.04 is required"
  fi
}

check_architecture() {
  local architecture
  architecture=$(uname -m 2>/dev/null || true)
  case "$architecture" in
    x86_64|amd64)
      pass "supported CPU architecture: ${architecture}"
      ;;
    *)
      fail "unsupported CPU architecture: ${architecture:-unknown}; x86_64/amd64 is required"
      ;;
  esac
}

check_cpu() {
  local count
  if command -v nproc >/dev/null 2>&1; then
    count=$(nproc)
  else
    count=$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '0')
  fi
  if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= MIN_CPU )); then
    pass "online CPU count ${count} meets minimum ${MIN_CPU}"
  else
    fail "online CPU count ${count:-unknown} is below minimum ${MIN_CPU}"
  fi
}

check_memory() {
  local total_mib available_mib
  total_mib=$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo 2>/dev/null || true)
  available_mib=$(awk '/^MemAvailable:/ { printf "%d", $2 / 1024 }' /proc/meminfo 2>/dev/null || true)
  if [[ "$total_mib" =~ ^[0-9]+$ ]] && (( total_mib >= MIN_MEMORY_MIB )); then
    pass "memory ${total_mib} MiB meets minimum ${MIN_MEMORY_MIB} MiB"
  else
    fail "memory ${total_mib:-unknown} MiB is below minimum ${MIN_MEMORY_MIB} MiB"
  fi
  if [[ "$available_mib" =~ ^[0-9]+$ ]] && (( available_mib >= MIN_AVAILABLE_MEMORY_MIB )); then
    pass "available memory ${available_mib} MiB meets minimum ${MIN_AVAILABLE_MEMORY_MIB} MiB"
  else
    fail "available memory ${available_mib:-unknown} MiB is below minimum ${MIN_AVAILABLE_MEMORY_MIB} MiB"
  fi
}

check_disk() {
  local disk_values total_kib available_kib total_gib available_gib
  local inode_values inode_total inode_available inode_free_percent
  disk_values=$(df -Pk / 2>/dev/null | awk 'NR == 2 { printf "%s:%s", $2, $4 }')
  IFS=: read -r total_kib available_kib <<<"$disk_values"
  if [[ ! "$total_kib" =~ ^[0-9]+$ || ! "$available_kib" =~ ^[0-9]+$ ]]; then
    fail 'disk capacity on / could not be determined'
    return
  fi
  total_gib=$((total_kib / 1024 / 1024))
  available_gib=$((available_kib / 1024 / 1024))
  if (( total_gib >= MIN_TOTAL_DISK_GIB )); then
    pass "total disk ${total_gib} GiB meets minimum ${MIN_TOTAL_DISK_GIB} GiB"
  else
    fail "total disk ${total_gib} GiB is below minimum ${MIN_TOTAL_DISK_GIB} GiB"
  fi
  if (( available_gib >= MIN_DISK_GIB )); then
    pass "free disk ${available_gib} GiB meets minimum ${MIN_DISK_GIB} GiB"
  else
    fail "free disk ${available_gib} GiB is below minimum ${MIN_DISK_GIB} GiB"
  fi

  inode_values=$(df -Pi / 2>/dev/null | awk 'NR == 2 { printf "%s:%s", $2, $4 }')
  IFS=: read -r inode_total inode_available <<<"$inode_values"
  if [[ ! "$inode_total" =~ ^[0-9]+$ || ! "$inode_available" =~ ^[0-9]+$ ]] \
    || (( inode_total == 0 )); then
    fail 'free inode capacity on / could not be determined'
    return
  fi
  inode_free_percent=$((inode_available * 100 / inode_total))
  if (( inode_free_percent >= MIN_FREE_INODE_PERCENT )); then
    pass "free inodes ${inode_free_percent}% meet minimum ${MIN_FREE_INODE_PERCENT}%"
  else
    fail "free inodes ${inode_free_percent}% are below minimum ${MIN_FREE_INODE_PERCENT}%"
  fi
}

check_runtime_memory_safety() {
  local runtime_filesystem active_swap_count
  runtime_filesystem=$(findmnt -n -o FSTYPE -T /run 2>/dev/null || true)
  if [[ "$runtime_filesystem" == tmpfs ]]; then
    pass '/run is backed by tmpfs for protected deployment snapshots'
  else
    fail '/run must be backed by tmpfs for protected deployment snapshots'
  fi

  if [[ ! -r /proc/swaps ]]; then
    fail 'active swap state could not be inspected'
    return
  fi
  active_swap_count=$(awk 'NR > 1 { count += 1 } END { print count + 0 }' /proc/swaps)
  if [[ "$active_swap_count" == 0 ]]; then
    pass 'no active swap can persist plaintext deployment snapshots'
  else
    fail 'active swap must be disabled before backup, migration, or health checks'
  fi
}

check_git() {
  local version
  if ! command -v git >/dev/null 2>&1; then
    fail 'Git is not installed'
    return
  fi
  version=$(git --version 2>/dev/null || true)
  pass "${version:-Git is installed}"
}

check_node() {
  local version
  if ! command -v node >/dev/null 2>&1; then
    fail 'Node.js is not installed'
    return
  fi
  version=$(node --version 2>/dev/null || true)
  version=${version#v}
  version=${version%%[^0-9.]*}
  if [[ "$version" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] && version_at_least "$version" 22.13.0; then
    pass "Node.js ${version} meets minimum 22.13.0"
  else
    fail "Node.js ${version:-unknown} is below minimum 22.13.0"
  fi
}

check_docker() {
  local server_version
  if ! command -v docker >/dev/null 2>&1; then
    fail 'Docker Engine is not installed'
    return
  fi
  server_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)
  if [[ -n "$server_version" ]]; then
    pass "Docker daemon is reachable (server ${server_version})"
  else
    fail 'Docker CLI exists but the daemon is not reachable'
  fi
}

check_compose() {
  local version
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    fail 'Docker Compose v2 is not installed or not usable'
    return
  fi
  version=$(docker compose version --short 2>/dev/null || true)
  version=${version#v}
  version=${version%%[^0-9.]*}
  if [[ "$version" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] && version_at_least "$version" 2.33.1; then
    pass "Docker Compose ${version} meets minimum 2.33.1"
  else
    fail "Docker Compose ${version:-unknown} is below minimum 2.33.1"
  fi
}

check_buildx() {
  local version
  if ! command -v docker >/dev/null 2>&1; then
    fail 'Docker Buildx could not be checked because Docker is missing'
    return
  fi
  version=$(docker buildx version 2>/dev/null || true)
  if [[ -n "$version" ]]; then
    pass 'Docker Buildx is installed and usable'
  else
    fail 'Docker Buildx is not installed or not usable'
  fi
}

check_ingress_port() {
  local port=$1
  local label=$2
  local listeners
  if ! listeners=$(ss -H -ltnp "sport = :${port}" 2>/dev/null); then
    fail "${label} port ${port} listeners could not be inspected"
    return
  fi
  if [[ -z "$listeners" ]]; then
    pass "${label} port ${port} is locally available for Nginx"
    return
  fi
  if (( EUID != 0 )); then
    fail "${label} port ${port} is occupied and listener ownership cannot be verified without root"
    return
  fi
  if awk '
    {
      rest = $0
      found = 0
      while (match(rest, /"[^"]+"/)) {
        name = substr(rest, RSTART + 1, RLENGTH - 2)
        if (name != "nginx") bad = 1
        found = 1
        rest = substr(rest, RSTART + RLENGTH)
      }
      if (!found) bad = 1
    }
    END { exit bad ? 1 : 0 }
  ' <<<"$listeners"; then
    pass "${label} port ${port} is managed only by Nginx"
  else
    fail "${label} port ${port} is occupied by a non-Nginx or unidentified listener"
  fi
}

check_private_team_os_listener() {
  local listeners
  if ! listeners=$(ss -H -ltn 'sport = :3022' 2>/dev/null); then
    fail 'Team OS port 3022 listeners could not be inspected'
    return
  fi
  if [[ -z "$listeners" ]]; then
    pass 'Team OS loopback port 3022 is locally available for the future container'
    return
  fi
  if awk '$4 !~ /^127\.0\.0\.1:3022$/ && $4 !~ /^\[::1\]:3022$/ { bad = 1 } END { exit bad ? 0 : 1 }' <<<"$listeners"; then
    fail 'Team OS port 3022 is listening on a non-loopback address'
  else
    pass 'Team OS port 3022 is loopback-only'
  fi
}

load_production_environment() {
  local loader="$SCRIPT_DIR/load-env.sh"
  local mode

  if (( EUID != 0 )); then
    fail 'run the preflight as root so the protected environment file can be verified'
    return 1
  fi
  if [[ ! -f "$loader" || -L "$loader" ]]; then
    fail 'strict environment loader is missing or is a symbolic link'
    return 1
  fi
  mode=$(stat -c '%a' "$loader" 2>/dev/null || printf '777')
  if [[ $(stat -c '%u' "$loader" 2>/dev/null || printf 'unknown') != 0 ]] || (( (8#$mode & 022) != 0 )); then
    fail 'strict environment loader must be root-owned and not group/world writable'
    return 1
  fi
  if [[ ! -f "$ENV_FILE" || -L "$ENV_FILE" ]]; then
    fail 'production environment file is missing or is a symbolic link'
    return 1
  fi
  ENV_FILE=$(readlink -f -- "$ENV_FILE")
  mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || printf '777')
  if [[ $(stat -c '%u' "$ENV_FILE" 2>/dev/null || printf 'unknown') != 0 ]] || (( (8#$mode & 077) != 0 )); then
    fail 'production environment file must be root-owned with mode 0600 or stricter'
    return 1
  fi

  # shellcheck source=deploy/scripts/load-env.sh
  source "$loader"
  if ! ai_team_os_load_env "$ENV_FILE"; then
    fail 'production environment file failed strict parsing'
    return 1
  fi
  pass 'production environment file ownership, permissions, and syntax are valid'
}

contains_placeholder() {
  local value=${1,,}
  [[ "$value" == *replace* \
    || "$value" == *change* \
    || "$value" == *example* \
    || "$value" == *your-* \
    || "$value" == *dummy* \
    || "$value" == *sample* \
    || "$value" == *test-key* \
    || "$value" == *app_user* \
    || "$value" == *app_password* \
    || "$value" == *rds_host* \
    || "$value" == *app_database* \
    || "$value" == *backup_user* \
    || "$value" == *backup_password* \
    || "$value" == *'<'* \
    || "$value" == *'>'* ]]
}

check_required_environment_values() {
  local missing=false provider provider_key provider_value app_origin public_origin
  local key source_mode repository_url actual_value expected_value
  for key in DATABASE_CA_CERT DATABASE_URL DIRECT_URL BACKUP_DATABASE_URL NEXT_PUBLIC_APP_URL APP_URL \
    SESSION_SECRET ENCRYPTION_KEY LICENSE_SECRET AI_PROVIDER OPENAI_API_KEY \
    BACKUP_ENCRYPTION_CERT; do
    if [[ -z ${!key:-} ]]; then
      fail "required production environment value is empty: ${key}"
      missing=true
    elif contains_placeholder "${!key}"; then
      fail "required production environment value still contains a placeholder: ${key}"
      missing=true
    fi
  done

  provider=${AI_PROVIDER:-}
  provider=${provider,,}
  case "$provider" in
    openai)
      provider_key=OPENAI_API_KEY
      ;;
    deepseek)
      provider_key=DEEPSEEK_API_KEY
      ;;
    qwen)
      provider_key=QWEN_API_KEY
      ;;
    *)
      fail 'AI_PROVIDER must be openai, deepseek, or qwen'
      missing=true
      ;;
  esac
  if [[ -n ${provider_key:-} ]]; then
    provider_value=${!provider_key:-}
    if [[ ${#provider_value} -lt 20 ]] || contains_placeholder "$provider_value"; then
      fail "selected AI provider key is missing, too short, or a placeholder: ${provider_key}"
      missing=true
    fi
  fi
  if [[ -n ${OPENAI_API_KEY:-} && ${#OPENAI_API_KEY} -lt 20 ]]; then
    fail 'OPENAI_API_KEY is shorter than the current deploy contract minimum of 20 characters'
    missing=true
  fi

  if [[ -n ${SESSION_SECRET:-} && ${#SESSION_SECRET} -lt 32 ]]; then
    fail 'SESSION_SECRET is shorter than 32 characters'
    missing=true
  fi
  if [[ -n ${LICENSE_SECRET:-} && ${#LICENSE_SECRET} -lt 24 ]]; then
    fail 'LICENSE_SECRET is shorter than the current deploy contract minimum of 24 characters'
    missing=true
  fi
  if [[ -n ${ENCRYPTION_KEY:-} ]] \
    && [[ ! "$ENCRYPTION_KEY" =~ ^([0-9a-fA-F]{64}|[A-Za-z0-9_-]{43})$ ]]; then
    fail 'ENCRYPTION_KEY is not a 64-hex or 32-byte base64url value'
    missing=true
  fi
  if [[ -n ${TEAM_OS_INTEGRATION_ENCRYPTION_KEY:-} \
    && ${TEAM_OS_INTEGRATION_ENCRYPTION_KEY} != "${ENCRYPTION_KEY:-}" ]]; then
    fail 'TEAM_OS_INTEGRATION_ENCRYPTION_KEY must be empty or exactly match ENCRYPTION_KEY'
    missing=true
  fi
  if [[ -n ${APP_URL:-} && ! "$APP_URL" =~ ^https://[^/@[:space:]]+(/[^[:space:]]*)?$ ]]; then
    fail 'APP_URL must be an HTTPS URL without embedded credentials'
    missing=true
  fi
  if [[ -n ${NEXT_PUBLIC_APP_URL:-} \
    && ! "$NEXT_PUBLIC_APP_URL" =~ ^https://[^/@[:space:]]+(/[^[:space:]]*)?$ ]]; then
    fail 'NEXT_PUBLIC_APP_URL must be an HTTPS URL without embedded credentials'
    missing=true
  fi
  if [[ ${APP_URL:-} =~ ^(https://[^/]+) ]]; then
    app_origin=${BASH_REMATCH[1],,}
    app_origin=${app_origin%:443}
  fi
  if [[ ${NEXT_PUBLIC_APP_URL:-} =~ ^(https://[^/]+) ]]; then
    public_origin=${BASH_REMATCH[1],,}
    public_origin=${public_origin%:443}
  fi
  if [[ -n ${app_origin:-} && "$app_origin" == "${public_origin:-}" ]]; then
    fail 'APP_URL must be a separate origin from NEXT_PUBLIC_APP_URL'
    missing=true
  fi

  source_mode=${DEPLOY_SOURCE_MODE:-}
  case "$source_mode" in
    git)
      repository_url=${DEPLOY_REPOSITORY_URL:-}
      if [[ -z "$repository_url" ]] || contains_placeholder "$repository_url"; then
        fail 'DEPLOY_REPOSITORY_URL is required without placeholders when DEPLOY_SOURCE_MODE=git'
        missing=true
      elif [[ "$repository_url" =~ ^[^:@[:space:]]+@[^:[:space:]]+:.+$ \
        || "$repository_url" =~ ^https://[^/@[:space:]]+(/[^[:space:]]*)?$ \
        || "$repository_url" =~ ^ssh://([^:/@[:space:]]+@)?[^/@[:space:]]+(/[^[:space:]]*)?$ ]]; then
        :
      else
        fail 'DEPLOY_REPOSITORY_URL must be a credential-free HTTPS/SSH Git URL'
        missing=true
      fi
      ;;
    archive)
      ;;
    *)
      fail 'DEPLOY_SOURCE_MODE must be git or archive'
      missing=true
      ;;
  esac

  while IFS='|' read -r key expected_value; do
    actual_value=${!key:-}
    if [[ "$actual_value" != "$expected_value" ]]; then
      fail "fixed production value mismatch: ${key}"
      missing=true
    fi
  done <<'FIXED_VALUES'
NODE_ENV|production
TEAM_OS_ENVIRONMENT|production
TEAM_OS_BIND_ADDRESS|127.0.0.1
TEAM_OS_PORT|3022
ENABLE_BUNDLED_POSTGRES|false
ENABLE_BUNDLED_REDIS|false
DEPLOY_BASE_DIR|/opt/ai-team-os
DEPLOY_STATE_DIR|/var/lib/ai-team-os
DEPLOY_BACKUP_DIR|/var/backups/ai-team-os
DEPLOY_LOCK_FILE|/run/ai-team-os/deploy.lock
BACKUP_LOCK_FILE|/run/ai-team-os/backup.lock
DATABASE_CA_CERT|/etc/ai-team-os/rds-ca.pem
BACKUP_ENCRYPTION_CERT|/etc/ai-team-os/backup-encryption-cert.pem
TEAM_OS_HEALTH_URL|http://127.0.0.1:3022/api/team-os/status
TEAM_OS_READINESS_URL|http://127.0.0.1:3022/api/health?database=true&schema=true&ai=true
TEAM_OS_VERSION_TARGET|/var/www/ai-team-os/updates/VERSION_CHECK.json
FIXED_VALUES

  if [[ "$missing" != true ]]; then
    pass 'required production environment values match the deployment contract without printing secrets'
  fi
}

clear_non_database_secrets() {
  # The strict loader exports every production value. Remove credentials that
  # the database probe does not need before starting any child process.
  unset POSTGRES_PASSWORD REDIS_PASSWORD OPENAI_API_KEY DEEPSEEK_API_KEY \
    QWEN_API_KEY SESSION_SECRET ENCRYPTION_KEY \
    TEAM_OS_INTEGRATION_ENCRYPTION_KEY LICENSE_SECRET ADMIN_TOKEN CRON_SECRET \
    NETLIFY_BLOBS_SITE_ID NETLIFY_BLOBS_TOKEN NODE_OPTIONS NODE_PATH
}

check_database_ca_certificate() {
  local certificate_mode
  if [[ ${DATABASE_CA_CERT:-} != /etc/ai-team-os/rds-ca.pem ]]; then
    fail 'DATABASE_CA_CERT must remain /etc/ai-team-os/rds-ca.pem'
    return 1
  fi
  if [[ ! -f "$DATABASE_CA_CERT" || -L "$DATABASE_CA_CERT" ]]; then
    fail 'database CA certificate is missing, not regular, or is a symbolic link'
    return 1
  fi
  if [[ $(stat -c '%u:%g' "$DATABASE_CA_CERT") != 0:0 ]]; then
    fail 'database CA certificate must be owned by root:root'
    return 1
  fi
  certificate_mode=$(stat -c '%a' "$DATABASE_CA_CERT")
  if [[ "$certificate_mode" != 444 && "$certificate_mode" != 644 ]]; then
    fail 'database CA certificate must use mode 0444 or 0644 so non-root containers can read it'
    return 1
  fi
  if ! openssl x509 -in "$DATABASE_CA_CERT" -noout >/dev/null 2>&1; then
    fail 'DATABASE_CA_CERT does not contain a valid X.509 CA certificate'
    return 1
  fi
  if grep -Eq 'BEGIN ([A-Z0-9]+ )*PRIVATE KEY' "$DATABASE_CA_CERT"; then
    fail 'DATABASE_CA_CERT must not contain a private key'
    return 1
  fi
  pass 'database CA certificate path, ownership, permissions, and X.509 format are valid'
}

check_backup_encryption_certificate() {
  local certificate_mode
  if [[ ${BACKUP_ENCRYPTION_CERT:-} != /etc/ai-team-os/backup-encryption-cert.pem ]]; then
    fail 'BACKUP_ENCRYPTION_CERT must remain /etc/ai-team-os/backup-encryption-cert.pem'
    return 1
  fi
  if [[ ! -f "$BACKUP_ENCRYPTION_CERT" || -L "$BACKUP_ENCRYPTION_CERT" ]]; then
    fail 'backup encryption certificate is missing, not regular, or is a symbolic link'
    return 1
  fi
  if [[ $(stat -c '%u:%g' "$BACKUP_ENCRYPTION_CERT") != 0:0 ]]; then
    fail 'backup encryption certificate must be owned by root:root'
    return 1
  fi
  certificate_mode=$(stat -c '%a' "$BACKUP_ENCRYPTION_CERT")
  if [[ "$certificate_mode" != 444 && "$certificate_mode" != 644 ]]; then
    fail 'backup encryption certificate must use mode 0444 or 0644'
    return 1
  fi
  if ! openssl x509 -in "$BACKUP_ENCRYPTION_CERT" -noout >/dev/null 2>&1; then
    fail 'BACKUP_ENCRYPTION_CERT does not contain a valid X.509 recipient certificate'
    return 1
  fi
  if grep -Eq 'BEGIN ([A-Z0-9]+ )*PRIVATE KEY' "$BACKUP_ENCRYPTION_CERT"; then
    fail 'BACKUP_ENCRYPTION_CERT must not contain a private key'
    return 1
  fi
  pass 'backup encryption certificate path, ownership, permissions, and X.509 format are valid'
}

parse_database_url() {
  local database_url_name=$1
  DATABASE_PARTS=()
  mapfile -d '' -t DATABASE_PARTS < <(node - "$database_url_name" <<'NODE'
const key = process.argv[2] || "";
const raw = process.env[key] || "";
try {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("protocol");
  const normalizedHost = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(normalizedHost)) throw new Error("loopback");
  const decode = (value) => decodeURIComponent(value || "");
  for (const parameter of ["sslmode", "sslrootcert"]) {
    if (url.searchParams.getAll(parameter).length !== 1) throw new Error("duplicate");
  }
  if (key === "BACKUP_DATABASE_URL") {
    if (url.searchParams.has("sslaccept")) throw new Error("backup-sslaccept");
  } else if (url.searchParams.getAll("sslaccept").length !== 1) {
    throw new Error("sslaccept");
  }
  const values = [
    url.hostname,
    url.port || "5432",
    decode(url.pathname.replace(/^\//u, "")),
    decode(url.username),
    decode(url.password),
    (url.searchParams.get("sslmode") || "").toLowerCase(),
    decode(url.searchParams.get("sslrootcert") || ""),
    (url.searchParams.get("sslaccept") || "").toLowerCase(),
    url.searchParams.has("schema") ? "true" : "false",
  ];
  if (values.slice(0, 5).some((value) => !value)) throw new Error("required");
  if (values.some((value) => /[\u0000\r\n]/u.test(value))) throw new Error("control");
  process.stdout.write(`${values.join("\0")}\0`);
} catch {
  process.exit(1);
}
NODE
  )
  [[ ${#DATABASE_PARTS[@]} -eq 9 ]]
}

check_database_connection() {
  local database_url_name=$1
  local identity_label=$2
  local db_host db_port db_name db_user db_password ssl_mode ssl_root_cert ssl_accept has_schema
  if ! command -v psql >/dev/null 2>&1; then
    fail 'psql is required for the authenticated database connection check'
    return
  fi
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js is required to parse ${database_url_name} without exposing it"
    return
  fi
  if ! parse_database_url "$database_url_name"; then
    unset "$database_url_name"
    unset DATABASE_PARTS
    fail "${database_url_name} could not be parsed safely or contains ambiguous TLS parameters"
    return
  fi

  db_host=${DATABASE_PARTS[0]}
  db_port=${DATABASE_PARTS[1]}
  db_name=${DATABASE_PARTS[2]}
  db_user=${DATABASE_PARTS[3]}
  db_password=${DATABASE_PARTS[4]}
  ssl_mode=${DATABASE_PARTS[5]}
  ssl_root_cert=${DATABASE_PARTS[6]}
  ssl_accept=${DATABASE_PARTS[7]}
  has_schema=${DATABASE_PARTS[8]}
  unset DATABASE_PARTS
  unset "$database_url_name"
  if [[ "$ssl_root_cert" != "${DATABASE_CA_CERT:-}" ]]; then
    fail "${database_url_name} must use the fixed DATABASE_CA_CERT path"
    db_password=''
    return
  fi
  if [[ "$database_url_name" == BACKUP_DATABASE_URL ]]; then
    if [[ "$ssl_mode" != verify-full || -n "$ssl_accept" || "$has_schema" != false ]]; then
      fail 'BACKUP_DATABASE_URL must use sslmode=verify-full, omit sslaccept, and omit Prisma schema parameters'
      db_password=''
      return
    fi
  elif [[ "$ssl_mode" != require || "$ssl_accept" != strict ]]; then
    fail "${database_url_name} must use Prisma sslmode=require with sslaccept=strict"
    db_password=''
    return
  fi

  # Do not use `env KEY=value ...`: that would place the password in the short-
  # lived env utility's argv. A subshell exports the libpq variables and then
  # replaces itself with psql, so the secret is never a command-line argument.
  if (
    exported_names=$(compgen -e)
    while IFS= read -r exported_name; do
      [[ -n "$exported_name" ]] && unset "$exported_name"
    done <<<"$exported_names"
    unset exported_names exported_name
    export PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    export PGHOST="$db_host"
    export PGPORT="$db_port"
    export PGDATABASE="$db_name"
    export PGUSER="$db_user"
    export PGPASSWORD="$db_password"
    # psql/libpq does not consume Prisma's sslaccept flag. Probe the equivalent
    # strongest libpq contract so every identity verifies both CA and hostname.
    export PGSSLMODE=verify-full
    export PGCONNECT_TIMEOUT="$DATABASE_TIMEOUT_SECONDS"
    export PGSSLROOTCERT="$ssl_root_cert"
    exec psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
      --command 'SELECT 1' >/dev/null 2>&1
  ); then
    pass "${identity_label} authenticated PostgreSQL SELECT 1 succeeded with CA and hostname verification"
  else
    fail "${identity_label} authenticated PostgreSQL connection or SELECT 1 failed; connection details were suppressed"
  fi
  db_password=''
}

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      (( $# >= 2 )) || usage_error '--env-file requires a path'
      ENV_FILE=$2
      shift 2
      ;;
    --min-cpu)
      (( $# >= 2 )) || usage_error '--min-cpu requires a value'
      MIN_CPU=$2
      shift 2
      ;;
    --min-memory-mib)
      (( $# >= 2 )) || usage_error '--min-memory-mib requires a value'
      MIN_MEMORY_MIB=$2
      shift 2
      ;;
    --min-available-memory-mib)
      (( $# >= 2 )) || usage_error '--min-available-memory-mib requires a value'
      MIN_AVAILABLE_MEMORY_MIB=$2
      shift 2
      ;;
    --min-total-disk-gib)
      (( $# >= 2 )) || usage_error '--min-total-disk-gib requires a value'
      MIN_TOTAL_DISK_GIB=$2
      shift 2
      ;;
    --min-disk-gib)
      (( $# >= 2 )) || usage_error '--min-disk-gib requires a value'
      MIN_DISK_GIB=$2
      shift 2
      ;;
    --min-free-inode-percent)
      (( $# >= 2 )) || usage_error '--min-free-inode-percent requires a value'
      MIN_FREE_INODE_PERCENT=$2
      shift 2
      ;;
    --db-timeout)
      (( $# >= 2 )) || usage_error '--db-timeout requires a value'
      DATABASE_TIMEOUT_SECONDS=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage_error "unknown option: $1"
      ;;
  esac
done

positive_integer "$MIN_CPU" || usage_error '--min-cpu must be a positive integer'
positive_integer "$MIN_MEMORY_MIB" || usage_error '--min-memory-mib must be a positive integer'
positive_integer "$MIN_AVAILABLE_MEMORY_MIB" \
  || usage_error '--min-available-memory-mib must be a positive integer'
positive_integer "$MIN_TOTAL_DISK_GIB" \
  || usage_error '--min-total-disk-gib must be a positive integer'
positive_integer "$MIN_DISK_GIB" || usage_error '--min-disk-gib must be a positive integer'
positive_integer "$MIN_FREE_INODE_PERCENT" \
  && (( MIN_FREE_INODE_PERCENT <= 100 )) \
  || usage_error '--min-free-inode-percent must be an integer from 1 through 100'
positive_integer "$DATABASE_TIMEOUT_SECONDS" \
  && (( DATABASE_TIMEOUT_SECONDS <= 30 )) \
  || usage_error '--db-timeout must be an integer from 1 through 30'
(( MIN_CPU >= 4 )) || usage_error '--min-cpu cannot lower the production baseline below 4'
(( MIN_MEMORY_MIB >= 7000 )) \
  || usage_error '--min-memory-mib cannot lower the production baseline below 7000'
(( MIN_AVAILABLE_MEMORY_MIB >= 2048 )) \
  || usage_error '--min-available-memory-mib cannot lower the production baseline below 2048'
(( MIN_TOTAL_DISK_GIB >= 75 )) \
  || usage_error '--min-total-disk-gib cannot lower the production baseline below 75'
(( MIN_DISK_GIB >= 30 )) \
  || usage_error '--min-disk-gib cannot lower the production baseline below 30'
(( MIN_FREE_INODE_PERCENT >= 10 )) \
  || usage_error '--min-free-inode-percent cannot lower the production baseline below 10'

printf '%s\n' 'AI Team OS Alibaba Cloud production preflight'
printf 'mode=read-only generatedAt=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

if check_required_host_commands; then
  check_operating_system
  check_architecture
  check_cpu
  check_memory
  check_disk
  check_runtime_memory_safety
  check_git
  check_node
  check_docker
  check_compose
  check_buildx
  check_ingress_port 80 HTTP
  check_ingress_port 443 HTTPS
  check_private_team_os_listener
else
  fail 'host checks were incomplete because required commands are missing'
fi

if load_production_environment; then
  check_required_environment_values
  clear_non_database_secrets
  check_backup_encryption_certificate || true
  if check_database_ca_certificate; then
    check_database_connection DATABASE_URL runtime
    check_database_connection DIRECT_URL migration
    check_database_connection BACKUP_DATABASE_URL backup
  else
    unset DATABASE_URL DIRECT_URL BACKUP_DATABASE_URL DATABASE_CA_CERT
    fail 'database identity probes were skipped because the pinned CA contract is invalid'
  fi
else
  fail 'environment and database checks were not completed'
fi

if (( FAIL_COUNT > 0 )); then
  printf 'SUMMARY pass=%d fail=%d result=FAIL\n' "$PASS_COUNT" "$FAIL_COUNT"
  exit 1
fi
printf 'SUMMARY pass=%d fail=%d result=PASS\n' "$PASS_COUNT" "$FAIL_COUNT"
