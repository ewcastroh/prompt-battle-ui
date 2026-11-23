#!/bin/sh
# Writes the runtime config.json (D-017) from API_BASE_URL before nginx starts.
# Same rules as scripts/write-config.mjs: an absolute https URL (http only for localhost), no trailing slash.
set -eu

url="${API_BASE_URL:-}"
if [ -z "$url" ]; then
    echo "40-config.sh: API_BASE_URL is not set" >&2
    exit 1
fi
url="$(printf '%s' "$url" | sed 's:/*$::')"
case "$url" in
    https://?*) ;;
    http://localhost | http://localhost:* | http://localhost/* | http://127.0.0.1 | http://127.0.0.1:* | http://127.0.0.1/*) ;;
    *)
        echo "40-config.sh: API_BASE_URL must be an https URL (http only for localhost)" >&2
        exit 1
        ;;
esac
case "$url" in
    *'"'* | *'\'*)
        echo "40-config.sh: API_BASE_URL contains an invalid character" >&2
        exit 1
        ;;
esac

printf '{"apiBaseUrl":"%s"}\n' "$url" > /usr/share/nginx/html/config.json
echo "40-config.sh: config.json -> $url"
