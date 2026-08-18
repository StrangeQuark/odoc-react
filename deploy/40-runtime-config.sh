#!/bin/sh
set -eu

api_base_path="${ODOC_API_BASE_PATH:-/api/v1}"
release="${ODOC_RELEASE:-unknown}"

case "$api_base_path" in
  /api/*) ;;
  *) echo "ODOC_API_BASE_PATH must begin with /api/" >&2; exit 1 ;;
esac

case "$release" in
  *[!A-Za-z0-9._-]*) echo "ODOC_RELEASE may only contain letters, digits, '.', '_' and '-'." >&2; exit 1 ;;
esac

printf '{\n  "apiBasePath": "%s",\n  "release": "%s"\n}\n' "$api_base_path" "$release" \
  > /tmp/odoc-runtime-config.json
