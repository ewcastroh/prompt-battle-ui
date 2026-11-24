#!/bin/sh
# Writes the runtime config.json (D-017) from API_BASE_URL before nginx starts.
# An absolute https URL, no trailing slash. Plain http only for localhost and private-network hosts
# (10/8, 172.16/12, 192.168/16, *.local) so a phone on the same Wi-Fi can reach a Compose stack.
# scripts/write-config.mjs (production deploys) stays stricter: http only for localhost.
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
    http://10.*.*.* | http://192.168.*.* | http://172.1[6-9].*.* | http://172.2[0-9].*.* | http://172.3[01].*.* | http://?*.local | http://?*.local:* | http://?*.local/*)
        # A glob also matches e.g. http://10.evil.com, so check the host really is a dotted IPv4 or *.local.
        hostport="${url#http://}"
        hostport="${hostport%%/*}"
        host="${hostport%%:*}"
        case "$host" in
            *[!A-Za-z0-9.-]* | .* | *..*)
                echo "40-config.sh: API_BASE_URL must be an https URL (http only for localhost and private-network hosts)" >&2
                exit 1
                ;;
            *.local) ;;
            *[!0-9.]* | *.)
                echo "40-config.sh: API_BASE_URL must be an https URL (http only for localhost and private-network hosts)" >&2
                exit 1
                ;;
        esac
        ;;
    *)
        echo "40-config.sh: API_BASE_URL must be an https URL (http only for localhost and private-network hosts)" >&2
        exit 1
        ;;
esac
case "$url" in
    *'"'* | *'\'*)
        echo "40-config.sh: API_BASE_URL contains an invalid character" >&2
        exit 1
        ;;
esac

printf '{"apiBaseUrl":"%s"}\n' "$url" > "${CONFIG_OUT:-/usr/share/nginx/html/config.json}"
echo "40-config.sh: config.json -> $url"
