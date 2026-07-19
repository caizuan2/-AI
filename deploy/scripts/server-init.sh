#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027
ulimit -c 0

SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
validate_clean_environment() {
  local exported_name
  while IFS= read -r exported_name; do
    case "$exported_name" in
      PATH|HOME|LANG|LC_ALL|TZ|AI_TEAM_OS_CLEAN_ENVIRONMENT|CONFIRM_SERVER_INIT_INSTALL|PWD|SHLVL|_|MSYSTEM|SYSTEMROOT|WINDIR) ;;
      *) return 1 ;;
    esac
  done < <(compgen -e)

  [[ ${PATH:-} == "$SAFE_PATH" && ${HOME:-} == /root \
    && ${LANG:-} == C.UTF-8 && ${LC_ALL:-} == C.UTF-8 && ${TZ:-} == UTC ]] \
    || return 1
  if [[ -v CONFIRM_SERVER_INIT_INSTALL ]]; then
    [[ "$CONFIRM_SERVER_INIT_INSTALL" != *$'\n'* && "$CONFIRM_SERVER_INIT_INSTALL" != *$'\r'* ]] \
      || return 1
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
  if [[ -v CONFIRM_SERVER_INIT_INSTALL ]]; then
    [[ "$CONFIRM_SERVER_INIT_INSTALL" != *$'\n'* && "$CONFIRM_SERVER_INIT_INSTALL" != *$'\r'* ]] || {
      printf 'Refusing a multiline value for CONFIRM_SERVER_INIT_INSTALL.\n' >&2
      exit 1
    }
    CLEAN_ENV+=("CONFIRM_SERVER_INIT_INSTALL=${CONFIRM_SERVER_INIT_INSTALL}")
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

INSTALL_REQUESTED=false
INSTALL_CONFIRMED=${CONFIRM_SERVER_INIT_INSTALL:-false}
GUARD_STATE_DIRECTORY=/var/lib/ai-team-os
GUARD_STATE_PATH="$GUARD_STATE_DIRECTORY/server-init-guard.state"
GUARD_STATE_ACTIVE=false
GUARD_NONCE=""
POLICY_OWNED_BY_TRANSACTION=false
STATE_NONCE=""
STATE_POLICY_OWNED=""
STATE_POLICY_SHA256=""
STATE_PRESET_OWNED=""
STATE_PRESET_SHA256=""
GUARD_VALIDATION_ERROR=""
POLICY_CREATED=false
POLICY_PATH=/usr/sbin/policy-rc.d
POLICY_CONTENT_SHA256=""
PRESET_CREATED=false
PRESET_DIRECTORY_CREATED=false
PRESET_DIRECTORY=/etc/systemd/system-preset
PRESET_PATH="$PRESET_DIRECTORY/00-000000-ai-team-os-no-auto-enable.preset"
PRESET_CONTENT_SHA256=""
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
SERVICE_SNAPSHOT_TAKEN=false

declare -A SERVICE_ACTIVE_BEFORE=()
declare -A SERVICE_ENABLED_BEFORE=()

usage() {
  cat <<'USAGE'
Usage: server-init.sh [options]

By default this script performs a read-only server audit and never changes a
service. Install mode is a maintenance action: Debian start/preset hooks are
blocked and target service states are compared before/after, but package-manager
behavior must still be reviewed for the approved Ubuntu repository snapshot.

  --install           Install only missing dependency packages
  --confirm-install   Second confirmation required with --install
  -h, --help          Show this help

For non-interactive automation, --confirm-install may be replaced with the
command environment variable CONFIRM_SERVER_INIT_INSTALL=true. Passing the
environment variable alone does not enable installation; --install is always
required.
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

pass() {
  ((PASS_COUNT += 1))
  printf 'PASS  %s\n' "$*"
}

warn() {
  ((WARN_COUNT += 1))
  printf 'WARN  %s\n' "$*" >&2
}

fail() {
  ((FAIL_COUNT += 1))
  printf 'FAIL  %s\n' "$*" >&2
}

die() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

version_at_least() {
  local actual=$1
  local required=$2
  local ordered first
  ordered=$(printf '%s\n%s\n' "$required" "$actual" | sort -V)
  first=${ordered%%$'\n'*}
  [[ "$first" == "$required" ]]
}

command_version() {
  local command_name=$1
  local output
  shift
  output=$("$command_name" "$@" 2>&1) || true
  printf '%s\n' "${output%%$'\n'*}"
}

read_service_state() {
  local service_name=$1
  local state_type=$2
  local state

  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'unavailable'
    return 0
  fi

  case "$state_type" in
    active)
      state=$(systemctl is-active "$service_name" 2>/dev/null || true)
      [[ "$state" == active ]] && printf 'active' || printf 'inactive'
      ;;
    enabled)
      state=$(systemctl is-enabled "$service_name" 2>/dev/null || true)
      case "$state" in
        enabled|enabled-runtime|linked|linked-runtime)
          printf 'enabled'
          ;;
        *)
          printf 'not-enabled'
          ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac
}

snapshot_service_states() {
  local service_name
  for service_name in docker docker.socket containerd nginx; do
    SERVICE_ACTIVE_BEFORE["$service_name"]=$(read_service_state "$service_name" active)
    SERVICE_ENABLED_BEFORE["$service_name"]=$(read_service_state "$service_name" enabled)
  done
  SERVICE_SNAPSHOT_TAKEN=true
}

verify_service_states_unchanged() {
  local service_name active_after enabled_after changed=false
  for service_name in docker docker.socket containerd nginx; do
    active_after=$(read_service_state "$service_name" active)
    enabled_after=$(read_service_state "$service_name" enabled)
    if [[ "$active_after" != "${SERVICE_ACTIVE_BEFORE[$service_name]}" ]]; then
      fail "${service_name}.service active state changed unexpectedly (${SERVICE_ACTIVE_BEFORE[$service_name]} -> ${active_after})"
      changed=true
    fi
    if [[ "$enabled_after" != "${SERVICE_ENABLED_BEFORE[$service_name]}" ]]; then
      fail "${service_name}.service enablement changed unexpectedly (${SERVICE_ENABLED_BEFORE[$service_name]} -> ${enabled_after})"
      changed=true
    fi
  done
  [[ "$changed" != true ]]
}

path_present() {
  [[ -e "$1" || -L "$1" ]]
}

validate_root_directory() {
  local directory=$1
  local mode

  GUARD_VALIDATION_ERROR=""
  if ! path_present "$directory"; then
    GUARD_VALIDATION_ERROR="required directory is missing: ${directory}"
    return 1
  fi
  if [[ ! -d "$directory" || -L "$directory" ]]; then
    GUARD_VALIDATION_ERROR="directory must not be a symbolic link: ${directory}"
    return 1
  fi
  if [[ $(stat -c '%u:%g' "$directory" 2>/dev/null || printf 'unknown') != '0:0' ]]; then
    GUARD_VALIDATION_ERROR="directory must be owned by root:root: ${directory}"
    return 1
  fi
  mode=$(stat -c '%a' "$directory" 2>/dev/null || printf 'unknown')
  if [[ ! "$mode" =~ ^[0-7]{3,4}$ ]] || (( (8#$mode & 022) != 0 )); then
    GUARD_VALIDATION_ERROR="directory must not be group/world writable: ${directory}"
    return 1
  fi
}

prepare_guard_state_directory() {
  validate_root_directory /var \
    || die "$GUARD_VALIDATION_ERROR"
  validate_root_directory /var/lib \
    || die "$GUARD_VALIDATION_ERROR"

  if ! path_present "$GUARD_STATE_DIRECTORY"; then
    install -d -o root -g root -m 0750 -- "$GUARD_STATE_DIRECTORY"
  fi
  validate_root_directory "$GUARD_STATE_DIRECTORY" \
    || die "$GUARD_VALIDATION_ERROR"
}

read_guard_state() {
  local mode size
  local -a lines=()

  GUARD_VALIDATION_ERROR=""
  if ! path_present "$GUARD_STATE_PATH"; then
    GUARD_VALIDATION_ERROR="guard state does not exist: ${GUARD_STATE_PATH}"
    return 1
  fi
  validate_root_directory "$GUARD_STATE_DIRECTORY" || return 1
  if [[ ! -f "$GUARD_STATE_PATH" || -L "$GUARD_STATE_PATH" ]]; then
    GUARD_VALIDATION_ERROR="guard state must be a regular, non-symlink file: ${GUARD_STATE_PATH}"
    return 1
  fi
  if [[ $(stat -c '%u:%g' "$GUARD_STATE_PATH" 2>/dev/null || printf 'unknown') != '0:0' ]]; then
    GUARD_VALIDATION_ERROR="guard state must be owned by root:root: ${GUARD_STATE_PATH}"
    return 1
  fi
  if [[ $(stat -c '%h' "$GUARD_STATE_PATH" 2>/dev/null || printf 'unknown') != 1 ]]; then
    GUARD_VALIDATION_ERROR="guard state must not have additional hard links: ${GUARD_STATE_PATH}"
    return 1
  fi
  mode=$(stat -c '%a' "$GUARD_STATE_PATH" 2>/dev/null || printf 'unknown')
  if [[ "$mode" != 600 ]]; then
    GUARD_VALIDATION_ERROR="guard state mode must be 0600: ${GUARD_STATE_PATH}"
    return 1
  fi
  size=$(stat -c '%s' "$GUARD_STATE_PATH" 2>/dev/null || printf 'unknown')
  if [[ ! "$size" =~ ^[0-9]+$ ]] || (( size == 0 || size > 1024 )); then
    GUARD_VALIDATION_ERROR="guard state size is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  if [[ ! -r "$GUARD_STATE_PATH" ]]; then
    GUARD_VALIDATION_ERROR="guard state is not readable by the current user: ${GUARD_STATE_PATH}"
    return 1
  fi

  mapfile -t lines <"$GUARD_STATE_PATH"
  if (( ${#lines[@]} != 6 )); then
    GUARD_VALIDATION_ERROR="guard state has an unexpected record count: ${GUARD_STATE_PATH}"
    return 1
  fi
  if [[ ${lines[0]} != 'FORMAT=1' ]]; then
    GUARD_VALIDATION_ERROR="guard state format is unsupported: ${GUARD_STATE_PATH}"
    return 1
  fi
  if [[ ! ${lines[1]} =~ ^NONCE=([0-9a-f]{32})$ ]]; then
    GUARD_VALIDATION_ERROR="guard state nonce is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  STATE_NONCE=${BASH_REMATCH[1]}
  if [[ ! ${lines[2]} =~ ^POLICY_OWNED=(true|false)$ ]]; then
    GUARD_VALIDATION_ERROR="guard state policy ownership flag is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  STATE_POLICY_OWNED=${BASH_REMATCH[1]}
  if [[ ! ${lines[3]} =~ ^POLICY_SHA256=([0-9a-f]{64})$ ]]; then
    GUARD_VALIDATION_ERROR="guard state policy hash is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  STATE_POLICY_SHA256=${BASH_REMATCH[1]}
  if [[ ${lines[4]} != 'PRESET_OWNED=true' ]]; then
    GUARD_VALIDATION_ERROR="guard state preset ownership flag is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  STATE_PRESET_OWNED=true
  if [[ ! ${lines[5]} =~ ^PRESET_SHA256=([0-9a-f]{64})$ ]]; then
    GUARD_VALIDATION_ERROR="guard state preset hash is invalid: ${GUARD_STATE_PATH}"
    return 1
  fi
  STATE_PRESET_SHA256=${BASH_REMATCH[1]}

  if [[ "$STATE_POLICY_OWNED" == false ]] \
    && [[ "$STATE_POLICY_SHA256" != '0000000000000000000000000000000000000000000000000000000000000000' ]]; then
    GUARD_VALIDATION_ERROR="unowned policy must use the zero hash in guard state: ${GUARD_STATE_PATH}"
    return 1
  fi
}

validate_owned_guard_if_present() {
  local path=$1
  local expected_mode=$2
  local expected_hash=$3
  local nonce=$4
  local actual_hash mode line marker_found=false

  GUARD_VALIDATION_ERROR=""
  if ! path_present "$path"; then
    return 0
  fi
  if [[ ! -f "$path" || -L "$path" ]]; then
    GUARD_VALIDATION_ERROR="owned guard is not a regular, non-symlink file: ${path}"
    return 1
  fi
  if [[ $(stat -c '%u:%g' "$path" 2>/dev/null || printf 'unknown') != '0:0' ]]; then
    GUARD_VALIDATION_ERROR="owned guard is not owned by root:root: ${path}"
    return 1
  fi
  if [[ $(stat -c '%h' "$path" 2>/dev/null || printf 'unknown') != 1 ]]; then
    GUARD_VALIDATION_ERROR="owned guard has additional hard links: ${path}"
    return 1
  fi
  mode=$(stat -c '%a' "$path" 2>/dev/null || printf 'unknown')
  if [[ "$mode" != "$expected_mode" ]]; then
    GUARD_VALIDATION_ERROR="owned guard mode changed from ${expected_mode}: ${path}"
    return 1
  fi
  actual_hash=$(sha256sum "$path" 2>/dev/null | cut -d ' ' -f 1 || true)
  if [[ "$actual_hash" != "$expected_hash" ]]; then
    GUARD_VALIDATION_ERROR="owned guard content hash changed: ${path}"
    return 1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "# ai-team-os-server-init nonce=${nonce}" ]]; then
      marker_found=true
    fi
  done <"$path"
  if [[ "$marker_found" != true ]]; then
    GUARD_VALIDATION_ERROR="owned guard nonce marker is missing: ${path}"
    return 1
  fi
}

validate_existing_policy() {
  local mode policy_result

  [[ -f "$POLICY_PATH" && ! -L "$POLICY_PATH" ]] \
    || die "existing ${POLICY_PATH} must be a regular file, not a symbolic link"
  [[ $(stat -c '%u' "$POLICY_PATH") == 0 ]] \
    || die "existing ${POLICY_PATH} must be owned by root"
  mode=$(stat -c '%a' "$POLICY_PATH")
  (( (8#$mode & 022) == 0 )) \
    || die "existing ${POLICY_PATH} must not be group/world writable"

  set +e
  "$POLICY_PATH" ai-team-os-safety-probe start >/dev/null 2>&1
  policy_result=$?
  set -e
  [[ $policy_result -eq 101 ]] \
    || die "existing ${POLICY_PATH} does not deny service starts; refusing unattended package installation"
}

sync_guard_filesystems() {
  local directory
  for directory in /usr/sbin "$PRESET_DIRECTORY" "$GUARD_STATE_DIRECTORY"; do
    [[ -d "$directory" && ! -L "$directory" ]] || continue
    sync -f -- "$directory" || return 1
  done
}

write_guard_state() {
  local temporary

  prepare_guard_state_directory
  ! path_present "$GUARD_STATE_PATH" \
    || die "guard state already exists after recovery: ${GUARD_STATE_PATH}"
  temporary=$(mktemp "$GUARD_STATE_DIRECTORY/.server-init-guard.state.XXXXXXXX")
  printf '%s\n' \
    'FORMAT=1' \
    "NONCE=${GUARD_NONCE}" \
    "POLICY_OWNED=${POLICY_OWNED_BY_TRANSACTION}" \
    "POLICY_SHA256=${POLICY_CONTENT_SHA256}" \
    'PRESET_OWNED=true' \
    "PRESET_SHA256=${PRESET_CONTENT_SHA256}" >"$temporary" \
    || { rm -f -- "$temporary"; die "could not write guard state"; }
  chown root:root -- "$temporary" \
    || { rm -f -- "$temporary"; die "could not set guard state ownership"; }
  chmod 0600 -- "$temporary" \
    || { rm -f -- "$temporary"; die "could not set guard state permissions"; }
  mv -T -- "$temporary" "$GUARD_STATE_PATH" \
    || { rm -f -- "$temporary"; die "could not publish guard state atomically"; }
  GUARD_STATE_ACTIVE=true

  read_guard_state \
    || die "new guard state failed validation: ${GUARD_VALIDATION_ERROR}"
  [[ "$STATE_NONCE" == "$GUARD_NONCE" \
    && "$STATE_POLICY_OWNED" == "$POLICY_OWNED_BY_TRANSACTION" \
    && "$STATE_POLICY_SHA256" == "$POLICY_CONTENT_SHA256" \
    && "$STATE_PRESET_SHA256" == "$PRESET_CONTENT_SHA256" ]] \
    || die "new guard state does not match the active transaction"
  sync -f -- "$GUARD_STATE_DIRECTORY" \
    || die "guard state could not be made durable before global guards were installed"
}

recover_stale_guard_transaction() {
  local nonce policy_owned policy_hash preset_hash

  if ! path_present "$GUARD_STATE_PATH"; then
    if path_present "$PRESET_PATH"; then
      die "unknown systemd guard exists without a trusted state record: ${PRESET_PATH}"
    fi
    return 0
  fi

  read_guard_state \
    || die "stale guard state is not trusted; no file was removed: ${GUARD_VALIDATION_ERROR}"
  nonce=$STATE_NONCE
  policy_owned=$STATE_POLICY_OWNED
  policy_hash=$STATE_POLICY_SHA256
  preset_hash=$STATE_PRESET_SHA256

  if [[ "$policy_owned" == true ]]; then
    validate_owned_guard_if_present "$POLICY_PATH" 755 "$policy_hash" "$nonce" \
      || die "stale service-start guard is not trusted; no file was removed: ${GUARD_VALIDATION_ERROR}"
  fi
  validate_owned_guard_if_present "$PRESET_PATH" 644 "$preset_hash" "$nonce" \
    || die "stale systemd preset guard is not trusted; no file was removed: ${GUARD_VALIDATION_ERROR}"

  # Re-read the root-only record immediately before removal. Any change aborts
  # recovery while both guards are still untouched.
  read_guard_state \
    || die "stale guard state changed during validation; no file was removed: ${GUARD_VALIDATION_ERROR}"
  [[ "$STATE_NONCE" == "$nonce" \
    && "$STATE_POLICY_OWNED" == "$policy_owned" \
    && "$STATE_POLICY_SHA256" == "$policy_hash" \
    && "$STATE_PRESET_SHA256" == "$preset_hash" ]] \
    || die "stale guard state changed during validation; no file was removed"
  if [[ "$policy_owned" == true ]]; then
    validate_owned_guard_if_present "$POLICY_PATH" 755 "$policy_hash" "$nonce" \
      || die "stale service-start guard changed during validation; no file was removed: ${GUARD_VALIDATION_ERROR}"
  fi
  validate_owned_guard_if_present "$PRESET_PATH" 644 "$preset_hash" "$nonce" \
    || die "stale systemd preset guard changed during validation; no file was removed: ${GUARD_VALIDATION_ERROR}"

  if [[ "$policy_owned" == true ]] && path_present "$POLICY_PATH"; then
    rm -f -- "$POLICY_PATH"
  fi
  if path_present "$PRESET_PATH"; then
    rm -f -- "$PRESET_PATH"
  fi
  sync_guard_filesystems \
    || die "stale guards were removed, but their deletion could not be made durable; the trusted state record was retained"
  rm -f -- "$GUARD_STATE_PATH"
  sync -f -- "$GUARD_STATE_DIRECTORY" \
    || die "stale guards are absent, but guard-state removal could not be made durable"
  log "Recovered only nonce/hash-matched guards from an interrupted server-init transaction."
}

begin_guard_transaction() {
  local digest raw_nonce

  command -v sha256sum >/dev/null 2>&1 \
    || die "sha256sum is required before stale or new global package guards can be validated"
  command -v sync >/dev/null 2>&1 \
    || die "sync is required before stale or new global package guards can be changed"
  recover_stale_guard_transaction
  ! path_present "$GUARD_STATE_PATH" \
    || die "guard state remains after recovery: ${GUARD_STATE_PATH}"
  ! path_present "$PRESET_PATH" \
    || die "temporary systemd preset path already exists without trusted ownership: ${PRESET_PATH}"

  if path_present "$POLICY_PATH"; then
    validate_existing_policy
    POLICY_OWNED_BY_TRANSACTION=false
    POLICY_CONTENT_SHA256='0000000000000000000000000000000000000000000000000000000000000000'
    log "Existing service-start denial policy will be preserved and honored."
  else
    POLICY_OWNED_BY_TRANSACTION=true
  fi

  [[ -r /proc/sys/kernel/random/uuid ]] \
    || die "kernel UUID source is unavailable; refusing to create global package guards"
  IFS= read -r raw_nonce </proc/sys/kernel/random/uuid
  GUARD_NONCE=${raw_nonce//-/}
  [[ "$GUARD_NONCE" =~ ^[0-9a-f]{32}$ ]] \
    || die "kernel UUID source returned an invalid guard nonce"

  if [[ "$POLICY_OWNED_BY_TRANSACTION" == true ]]; then
    digest=$(printf '%s\n' \
      '#!/bin/sh' \
      "# ai-team-os-server-init nonce=${GUARD_NONCE}" \
      'exit 101' | sha256sum) \
      || die "could not calculate the service-start guard hash"
    POLICY_CONTENT_SHA256=${digest%% *}
  fi
  digest=$(printf '%s\n' \
    "# ai-team-os-server-init nonce=${GUARD_NONCE}" \
    'disable *' | sha256sum) \
    || die "could not calculate the systemd preset guard hash"
  PRESET_CONTENT_SHA256=${digest%% *}
  [[ "$POLICY_CONTENT_SHA256" =~ ^[0-9a-f]{64}$ \
    && "$PRESET_CONTENT_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || die "calculated guard hash is invalid"

  # The durable record is published before either global guard. A later
  # confirmed install can therefore recover safely after SIGKILL or power loss.
  write_guard_state
}

cleanup_policy() {
  if [[ "$POLICY_CREATED" != true ]]; then
    return 0
  fi

  if validate_owned_guard_if_present \
    "$POLICY_PATH" 755 "$POLICY_CONTENT_SHA256" "$GUARD_NONCE"; then
    rm -f -- "$POLICY_PATH"
    POLICY_CREATED=false
  else
    printf 'WARN  temporary %s was not removed: %s\n' \
      "$POLICY_PATH" "$GUARD_VALIDATION_ERROR" >&2
  fi
}

cleanup_preset() {
  if [[ "$PRESET_CREATED" == true ]]; then
    if validate_owned_guard_if_present \
      "$PRESET_PATH" 644 "$PRESET_CONTENT_SHA256" "$GUARD_NONCE"; then
      rm -f -- "$PRESET_PATH"
      PRESET_CREATED=false
    else
      printf 'WARN  temporary %s was not removed: %s\n' \
        "$PRESET_PATH" "$GUARD_VALIDATION_ERROR" >&2
    fi
  fi

  if [[ "$PRESET_DIRECTORY_CREATED" == true && -d "$PRESET_DIRECTORY" && ! -L "$PRESET_DIRECTORY" ]]; then
    rmdir --ignore-fail-on-non-empty -- "$PRESET_DIRECTORY" 2>/dev/null || true
    PRESET_DIRECTORY_CREATED=false
  fi
}

cleanup_guard_state() {
  if [[ "$GUARD_STATE_ACTIVE" != true ]]; then
    return 0
  fi
  if [[ "$POLICY_OWNED_BY_TRANSACTION" == true ]] && path_present "$POLICY_PATH"; then
    printf 'WARN  guard state was retained because %s still exists\n' "$POLICY_PATH" >&2
    return 0
  fi
  if path_present "$PRESET_PATH"; then
    printf 'WARN  guard state was retained because %s still exists\n' "$PRESET_PATH" >&2
    return 0
  fi
  if ! read_guard_state; then
    printf 'WARN  guard state was not removed: %s\n' "$GUARD_VALIDATION_ERROR" >&2
    return 0
  fi
  if [[ "$STATE_NONCE" != "$GUARD_NONCE" \
    || "$STATE_POLICY_OWNED" != "$POLICY_OWNED_BY_TRANSACTION" \
    || "$STATE_POLICY_SHA256" != "$POLICY_CONTENT_SHA256" \
    || "$STATE_PRESET_SHA256" != "$PRESET_CONTENT_SHA256" ]]; then
    printf 'WARN  guard state changed during execution and was not removed: %s\n' "$GUARD_STATE_PATH" >&2
    return 0
  fi
  if ! sync_guard_filesystems; then
    printf 'WARN  guard state was retained because guard deletion durability could not be confirmed\n' >&2
    return 0
  fi
  rm -f -- "$GUARD_STATE_PATH"
  if ! sync -f -- "$GUARD_STATE_DIRECTORY"; then
    printf 'WARN  guard-state removal durability could not be confirmed; a harmless stale state record may reappear\n' >&2
  fi
  GUARD_STATE_ACTIVE=false
}

cleanup() {
  cleanup_policy
  cleanup_preset
  cleanup_guard_state
  if [[ "$SERVICE_SNAPSHOT_TAKEN" == true ]] && ! verify_service_states_unchanged; then
    printf 'CRITICAL package installation changed a target service state; keep deployment stopped and inspect the host\n' >&2
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

prepare_no_service_start_policy() {
  local temporary

  [[ "$GUARD_STATE_ACTIVE" == true ]] \
    || die "guard transaction state must exist before installing package guards"
  if [[ "$POLICY_OWNED_BY_TRANSACTION" != true ]]; then
    validate_existing_policy
    return 0
  fi
  ! path_present "$POLICY_PATH" \
    || die "service-start guard path appeared after transaction validation: ${POLICY_PATH}"

  temporary=$(mktemp /tmp/ai-team-os-policy-rc.d.XXXXXX)
  printf '%s\n' \
    '#!/bin/sh' \
    "# ai-team-os-server-init nonce=${GUARD_NONCE}" \
    'exit 101' >"$temporary"
  [[ $(sha256sum "$temporary" | cut -d ' ' -f 1) == "$POLICY_CONTENT_SHA256" ]] \
    || { rm -f -- "$temporary"; die "service-start guard template hash mismatch"; }
  install -o root -g root -m 0755 -- "$temporary" "$POLICY_PATH"
  POLICY_CREATED=true
  rm -f -- "$temporary"
  validate_owned_guard_if_present \
    "$POLICY_PATH" 755 "$POLICY_CONTENT_SHA256" "$GUARD_NONCE" \
    || die "installed service-start guard failed validation: ${GUARD_VALIDATION_ERROR}"
  log "Installed a temporary policy that blocks package scripts from starting or restarting services."
}

prepare_no_service_enable_policy() {
  local temporary first_preset
  local preset_directory
  local -a preset_directories=()
  [[ "$GUARD_STATE_ACTIVE" == true ]] \
    || die "guard transaction state must exist before installing package guards"
  command -v systemctl >/dev/null 2>&1 \
    || die "systemctl is required to prevent package post-install scripts from enabling units"
  [[ ! -e "$PRESET_PATH" && ! -L "$PRESET_PATH" ]] \
    || die "temporary systemd preset path already exists: ${PRESET_PATH}"

  if [[ ! -e "$PRESET_DIRECTORY" ]]; then
    install -d -o root -g root -m 0755 -- "$PRESET_DIRECTORY"
    PRESET_DIRECTORY_CREATED=true
  fi
  [[ -d "$PRESET_DIRECTORY" && ! -L "$PRESET_DIRECTORY" ]] \
    || die "systemd preset directory must be a regular directory"
  [[ $(stat -c '%u' "$PRESET_DIRECTORY") == 0 ]] \
    || die "systemd preset directory must be owned by root"
  local directory_mode
  directory_mode=$(stat -c '%a' "$PRESET_DIRECTORY")
  (( (8#$directory_mode & 022) == 0 )) \
    || die "systemd preset directory must not be group/world writable"

  temporary=$(mktemp /tmp/ai-team-os-systemd-preset.XXXXXX)
  printf '%s\n' \
    "# ai-team-os-server-init nonce=${GUARD_NONCE}" \
    'disable *' >"$temporary"
  [[ $(sha256sum "$temporary" | cut -d ' ' -f 1) == "$PRESET_CONTENT_SHA256" ]] \
    || { rm -f -- "$temporary"; die "systemd preset guard template hash mismatch"; }
  install -o root -g root -m 0644 -- "$temporary" "$PRESET_PATH"
  PRESET_CREATED=true
  rm -f -- "$temporary"
  validate_owned_guard_if_present \
    "$PRESET_PATH" 644 "$PRESET_CONTENT_SHA256" "$GUARD_NONCE" \
    || die "installed systemd preset guard failed validation: ${GUARD_VALIDATION_ERROR}"

  for preset_directory in \
    /etc/systemd/system-preset \
    /run/systemd/system-preset \
    /usr/local/lib/systemd/system-preset \
    /usr/lib/systemd/system-preset; do
    [[ -d "$preset_directory" ]] && preset_directories+=("$preset_directory")
  done
  first_preset=$(find "${preset_directories[@]}" \
    -maxdepth 1 -type f -name '*.preset' -printf '%f\n' \
    | LC_ALL=C sort -u)
  first_preset=${first_preset%%$'\n'*}
  [[ "$first_preset" == "${PRESET_PATH##*/}" ]] \
    || die "a higher-priority systemd preset prevents a no-auto-enable guarantee"
  log "Installed a temporary highest-priority systemd preset that prevents new units from being enabled."
}

available_package() {
  apt-cache show "$1" >/dev/null 2>&1
}

package_candidate_version() {
  local package_name=$1
  local policy candidate
  policy=$(apt-cache policy "$package_name") || return 1
  candidate=$(sed -n 's/^[[:space:]]*Candidate:[[:space:]]*//p' <<<"$policy")
  [[ -n "$candidate" && "$candidate" != '(none)' ]] || return 1
  printf '%s\n' "$candidate"
}

candidate_semver() {
  local candidate=${1#*:}
  sed -E 's/^[^0-9]*([0-9]+\.[0-9]+(\.[0-9]+)?).*/\1/' <<<"$candidate"
}

package_candidate_at_least() {
  local package_name=$1
  local required=$2
  local candidate parsed
  candidate=$(package_candidate_version "$package_name") || return 1
  parsed=$(candidate_semver "$candidate")
  [[ "$parsed" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
    && version_at_least "$parsed" "$required"
}

validate_selected_package_candidates() {
  local package_name candidate parsed
  for package_name in "${PACKAGES_TO_INSTALL[@]:-}"; do
    case "$package_name" in
      nodejs)
        candidate=$(package_candidate_version "$package_name") \
          || die "nodejs has no install candidate in the approved apt sources"
        parsed=$(candidate_semver "$candidate")
        [[ "$parsed" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
          && version_at_least "$parsed" 22.13.0 \
          || die "nodejs candidate ${candidate} is below 22.13.0; configure an approved Node 22 source before installation"
        ;;
      docker-compose-v2|docker-compose-plugin)
        candidate=$(package_candidate_version "$package_name") \
          || die "${package_name} has no install candidate in the approved apt sources"
        parsed=$(candidate_semver "$candidate")
        [[ "$parsed" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
          && version_at_least "$parsed" 2.33.1 \
          || die "${package_name} candidate ${candidate} is below 2.33.1; configure an approved Docker source before installation"
        ;;
    esac
  done
}

append_unique_package() {
  local candidate=$1
  local existing
  for existing in "${PACKAGES_TO_INSTALL[@]:-}"; do
    [[ "$existing" != "$candidate" ]] || return 0
  done
  PACKAGES_TO_INSTALL+=("$candidate")
}

select_missing_packages() {
  PACKAGES_TO_INSTALL=()

  command -v curl >/dev/null 2>&1 || append_unique_package curl
  command -v git >/dev/null 2>&1 || append_unique_package git
  command -v awk >/dev/null 2>&1 || append_unique_package gawk
  command -v find >/dev/null 2>&1 || append_unique_package findutils
  command -v flock >/dev/null 2>&1 || append_unique_package util-linux
  command -v grep >/dev/null 2>&1 || append_unique_package grep
  command -v node >/dev/null 2>&1 || append_unique_package nodejs
  command -v nginx >/dev/null 2>&1 || append_unique_package nginx
  command -v openssl >/dev/null 2>&1 || append_unique_package openssl
  command -v sed >/dev/null 2>&1 || append_unique_package sed
  command -v sha256sum >/dev/null 2>&1 || append_unique_package coreutils
  command -v sync >/dev/null 2>&1 || append_unique_package coreutils
  command -v tar >/dev/null 2>&1 || append_unique_package tar

  if ! command -v docker >/dev/null 2>&1; then
    append_unique_package docker.io
  fi

  if ! docker compose version >/dev/null 2>&1; then
    if available_package docker-compose-v2 && package_candidate_at_least docker-compose-v2 2.33.1; then
      append_unique_package docker-compose-v2
    elif available_package docker-compose-plugin && package_candidate_at_least docker-compose-plugin 2.33.1; then
      append_unique_package docker-compose-plugin
    else
      fail "no Docker Compose v2 candidate at 2.33.1 or newer is available from the configured apt repositories"
    fi
  fi

  if ! docker buildx version >/dev/null 2>&1; then
    if available_package docker-buildx-plugin; then
      append_unique_package docker-buildx-plugin
    elif available_package docker-buildx; then
      append_unique_package docker-buildx
    else
      fail "Docker Buildx package is not available from the configured apt repositories"
    fi
  fi
}

install_missing_packages() {
  [[ "$INSTALL_REQUESTED" == true ]] || return 0
  [[ "$INSTALL_CONFIRMED" == true ]] \
    || die "--install requires --confirm-install or CONFIRM_SERVER_INIT_INSTALL=true"
  [[ $EUID -eq 0 ]] || die "--install must be run as root"
  command -v apt-get >/dev/null 2>&1 || die "apt-get is required for installation"
  command -v apt-cache >/dev/null 2>&1 || die "apt-cache is required for installation"

  snapshot_service_states
  begin_guard_transaction
  prepare_no_service_start_policy
  prepare_no_service_enable_policy

  log "Refreshing apt metadata under temporary Debian service-start and systemd preset guards."
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get update
  select_missing_packages
  validate_selected_package_candidates

  if (( ${#PACKAGES_TO_INSTALL[@]} == 0 )); then
    log "No missing dependency package was detected."
  else
    log "Installing only missing packages: ${PACKAGES_TO_INSTALL[*]}"
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get \
      -y \
      -o Dpkg::Options::=--force-confold \
      --no-install-recommends \
      install -- "${PACKAGES_TO_INSTALL[@]}"
  fi

  cleanup_policy
  cleanup_preset
  cleanup_guard_state
  verify_service_states_unchanged \
    || die "package installation changed an existing service state; inspect the host before continuing"
  SERVICE_SNAPSHOT_TAKEN=false
}

check_ubuntu() {
  if [[ ! -r /etc/os-release ]]; then
    fail "/etc/os-release is unavailable; Ubuntu could not be verified"
    return
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ ${ID:-} != ubuntu ]]; then
    fail "unsupported operating system: ${PRETTY_NAME:-unknown}; Ubuntu is required"
    return
  fi

  if [[ -z ${VERSION_ID:-} ]]; then
    fail "Ubuntu VERSION_ID is missing"
  elif version_at_least "$VERSION_ID" 22.04; then
    pass "Ubuntu ${VERSION_ID} (${VERSION_CODENAME:-unknown codename})"
  else
    fail "Ubuntu ${VERSION_ID} is below the supported baseline 22.04"
  fi
}

require_supported_ubuntu_for_install() {
  [[ -r /etc/os-release ]] \
    || die "/etc/os-release is unavailable; refusing package installation"
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ ${ID:-} == ubuntu ]] \
    || die "package installation is supported on Ubuntu only"
  [[ -n ${VERSION_ID:-} ]] && version_at_least "$VERSION_ID" 22.04 \
    || die "package installation requires Ubuntu 22.04 or newer"
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    fail "Docker Engine is not installed"
    return
  fi

  pass "$(command_version docker --version)"
  local daemon_state
  daemon_state=$(read_service_state docker active)
  if [[ "$daemon_state" == active ]]; then
    pass "docker.service is active"
  else
    fail "docker.service is not active (${daemon_state}); activate it only during an approved maintenance action"
  fi
}

check_compose() {
  local compose_version
  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 is not installed"
    return
  fi

  compose_version=$(docker compose version --short 2>/dev/null | sed -E 's/^v//; s/[^0-9.].*$//')
  if [[ -z "$compose_version" ]]; then
    fail "Docker Compose version could not be parsed"
  elif version_at_least "$compose_version" 2.33.1; then
    pass "Docker Compose ${compose_version} (minimum 2.33.1)"
  else
    fail "Docker Compose ${compose_version} is below required 2.33.1; upgrade it in a reviewed maintenance window"
  fi
}

check_buildx() {
  if ! docker buildx version >/dev/null 2>&1; then
    fail "Docker Buildx is not installed"
    return
  fi
  pass "$(command_version docker buildx version)"
}

check_required_tools() {
  local command_name
  for command_name in awk curl find flock grep install mktemp openssl readlink sed sha256sum stat sync tar; do
    if command -v "$command_name" >/dev/null 2>&1; then
      pass "required host tool is available: ${command_name}"
    else
      fail "required host tool is missing: ${command_name}"
    fi
  done
}

check_git() {
  if command -v git >/dev/null 2>&1; then
    pass "$(command_version git --version)"
  else
    fail "Git is not installed"
  fi
}

check_node() {
  local node_version
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js is not installed"
    return
  fi

  node_version=$(node --version 2>/dev/null | sed -E 's/^v//; s/[^0-9.].*$//')
  if [[ -z "$node_version" ]]; then
    fail "Node.js version could not be parsed"
  elif version_at_least "$node_version" 22.13.0; then
    pass "Node.js ${node_version} (minimum 22.13.0)"
  else
    fail "Node.js ${node_version} is below required 22.13.0; use an approved Node 22 package source rather than replacing it automatically"
  fi
}

check_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    fail "Nginx is not installed"
    return
  fi

  pass "$(command_version nginx -v)"
  local nginx_state
  nginx_state=$(read_service_state nginx active)
  if [[ "$nginx_state" == active ]]; then
    pass "nginx.service is active"
  else
    fail "nginx.service is not active (${nginx_state}); start it only after the reviewed production configuration passes nginx -t"
  fi
}

check_stale_guard_state() {
  if path_present "$GUARD_STATE_PATH"; then
    if [[ $EUID -ne 0 ]]; then
      fail "root privileges are required to audit the root-only server-init guard state; no host file was changed"
      return
    fi
    if ! read_guard_state; then
      fail "server-init guard state is not trusted; check-only mode did not remove anything: ${GUARD_VALIDATION_ERROR}"
      return
    fi
    if [[ "$STATE_POLICY_OWNED" == true ]] \
      && ! validate_owned_guard_if_present \
        "$POLICY_PATH" 755 "$STATE_POLICY_SHA256" "$STATE_NONCE"; then
      fail "recorded service-start guard is unknown or modified; check-only mode did not remove it: ${GUARD_VALIDATION_ERROR}"
      return
    fi
    if ! validate_owned_guard_if_present \
      "$PRESET_PATH" 644 "$STATE_PRESET_SHA256" "$STATE_NONCE"; then
      fail "recorded systemd preset guard is unknown or modified; check-only mode did not remove it: ${GUARD_VALIDATION_ERROR}"
      return
    fi
    fail "an interrupted server-init guard transaction was detected; check-only mode is read-only, and a root-confirmed --install run is required for nonce/hash-validated recovery"
    return
  fi

  if path_present "$PRESET_PATH"; then
    fail "an AI Team OS systemd preset guard exists without a trusted state record; it was not removed: ${PRESET_PATH}"
    return
  fi
  pass "no stale AI Team OS package-install guard transaction was detected"
}

run_audit() {
  check_stale_guard_state
  check_ubuntu
  check_docker
  check_compose
  check_buildx
  check_git
  check_node
  check_nginx
  check_required_tools
}

while (( $# > 0 )); do
  case "$1" in
    --install)
      INSTALL_REQUESTED=true
      shift
      ;;
    --confirm-install)
      INSTALL_CONFIRMED=true
      shift
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

if [[ "$INSTALL_CONFIRMED" == true && "$INSTALL_REQUESTED" != true ]]; then
  die "installation confirmation was supplied without --install"
fi
if [[ "$INSTALL_REQUESTED" == true && "$INSTALL_CONFIRMED" != true ]]; then
  die "--install requires --confirm-install or CONFIRM_SERVER_INIT_INSTALL=true"
fi

if [[ "$INSTALL_REQUESTED" == true ]]; then
  require_supported_ubuntu_for_install
fi

install_missing_packages

# Start a fresh post-install report so summary counts represent current state.
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
printf '%s\n' 'AI Team OS server readiness audit'
run_audit
printf 'SUMMARY pass=%d warn=%d fail=%d mode=%s\n' \
  "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT" \
  "$([[ "$INSTALL_REQUESTED" == true ]] && printf install || printf check-only)"

if (( FAIL_COUNT > 0 )); then
  exit 1
fi
