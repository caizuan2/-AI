#!/usr/bin/env bash
set -euo pipefail

app_dir=${1:-}
installer_source=${2:-/var/www/ai-knowledge-shared/admin-ingest/releases/current}

if [[ -z "$app_dir" || "$app_dir" != /* || "$app_dir" == "/" ]]; then
  echo "ADMIN_INSTALLER_APP_DIR_INVALID=${app_dir:-missing}" >&2
  exit 1
fi

if [[ "$installer_source" != /* || "$installer_source" == "/" ]]; then
  echo "ADMIN_INSTALLER_SOURCE_INVALID=$installer_source" >&2
  exit 1
fi

public_dir="$app_dir/public"
installer_link="$public_dir/admin-installers"
installer_apk="$installer_source/admin-ingest.apk"

test -d "$public_dir"
test -s "$installer_apk"

if [[ ( -e "$installer_link" || -L "$installer_link" ) && ! -L "$installer_link" ]]; then
  echo "ADMIN_INSTALLER_LINK_CONFLICT=$installer_link" >&2
  exit 1
fi

ln -sfn "$installer_source" "$installer_link"

resolved_source=$(readlink -f "$installer_source")
resolved_link=$(readlink -f "$installer_link")

if [[ -z "$resolved_source" || "$resolved_link" != "$resolved_source" ]]; then
  echo "ADMIN_INSTALLER_LINK_MISMATCH=$installer_link" >&2
  exit 1
fi

test -s "$installer_link/admin-ingest.apk"
echo "ADMIN_INSTALLER_LINK_READY=$installer_link"
