#!/usr/bin/env bash

# Strict dotenv loader for root deployment scripts. Values are treated as
# literal text: no command substitution, variable expansion, escape decoding,
# or shell evaluation is performed.
ai_team_os_load_env() {
  local env_file=$1
  local profile=${2:-production}
  local raw_line line key value line_number=0
  declare -A seen_keys=()

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    ((line_number += 1))
    line=${raw_line%$'\r'}

    if [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      printf 'Invalid dotenv syntax at %s:%d\n' "$env_file" "$line_number" >&2
      return 1
    fi

    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    case "$profile:$key" in
      production:NODE_ENV|production:HOSTNAME|production:PORT|production:TEAM_OS_ENVIRONMENT|production:NEXT_PUBLIC_APP_URL|production:APP_URL|production:DATABASE_CA_CERT|production:DATABASE_URL|production:DIRECT_URL|production:BACKUP_DATABASE_URL|production:POSTGRES_DB|production:POSTGRES_USER|production:POSTGRES_PASSWORD|production:ENABLE_BUNDLED_POSTGRES|production:REDIS_URL|production:REDIS_PASSWORD|production:ENABLE_BUNDLED_REDIS|production:AI_PROVIDER|production:OPENAI_API_KEY|production:OPENAI_BASE_URL|production:OPENAI_MODEL|production:OPENAI_EMBEDDING_MODEL|production:DEEPSEEK_API_KEY|production:DEEPSEEK_BASE_URL|production:DEEPSEEK_MODEL|production:QWEN_API_KEY|production:QWEN_BASE_URL|production:QWEN_MODEL|production:SESSION_SECRET|production:ENCRYPTION_KEY|production:TEAM_OS_INTEGRATION_ENCRYPTION_KEY|production:LICENSE_SECRET|production:ADMIN_TOKEN|production:CRON_SECRET|production:NETLIFY_BLOBS_SITE_ID|production:NETLIFY_BLOBS_TOKEN|production:TEAM_OS_IMAGE|production:TEAM_OS_BIND_ADDRESS|production:TEAM_OS_PORT|production:WEB_RELEASE_SHA|production:DEPLOY_SOURCE_MODE|production:DEPLOY_REPOSITORY_URL|production:DEPLOY_RELEASE_REF|production:DEPLOY_SOURCE_ARCHIVE|production:DEPLOY_RELEASE_SHA|production:DEPLOY_SOURCE_ARCHIVE_SHA256|production:DEPLOY_BASE_DIR|production:DEPLOY_STATE_DIR|production:DEPLOY_BACKUP_DIR|production:BACKUP_RETENTION_DAYS|production:TEAM_OS_HEALTH_URL|production:TEAM_OS_READINESS_URL|production:TEAM_OS_VERSION_TARGET|production:DEPLOY_LOCK_FILE|production:BACKUP_LOCK_FILE|production:PG_BACKUP_IMAGE|production:BACKUP_ENCRYPTION_CERT|release:RELEASE_ID|release:RELEASE_PATH|release:SOURCE_REF|release:SOURCE_SHA|release:ORCHESTRATOR_SCHEMA|release:ORCHESTRATOR_SHA256|release:RUNTIME_IMAGE|release:RUNTIME_IMAGE_ID|release:MIGRATION_IMAGE|release:MIGRATION_IMAGE_ID)
        ;;
      *)
        printf 'Unsupported environment key for %s profile at %s:%d: %s\n' "$profile" "$env_file" "$line_number" "$key" >&2
        return 1
        ;;
    esac

    if [[ ${seen_keys[$key]+present} ]]; then
      printf 'Duplicate environment key at %s:%d: %s\n' "$env_file" "$line_number" "$key" >&2
      return 1
    fi
    seen_keys["$key"]=1

    if [[ "$value" == \"* ]]; then
      if (( ${#value} < 2 )) || [[ "${value: -1}" != '"' ]]; then
        printf 'Unterminated double-quoted value at %s:%d\n' "$env_file" "$line_number" >&2
        return 1
      fi
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'* ]]; then
      if (( ${#value} < 2 )) || [[ "${value: -1}" != "'" ]]; then
        printf 'Unterminated single-quoted value at %s:%d\n' "$env_file" "$line_number" >&2
        return 1
      fi
      value=${value:1:${#value}-2}
    elif [[ "$value" =~ ^[[:space:]] || "$value" =~ [[:space:]]$ ]]; then
      printf 'Unquoted values cannot have leading or trailing whitespace at %s:%d\n' "$env_file" "$line_number" >&2
      return 1
    fi

    export "$key=$value"
  done <"$env_file"
}
