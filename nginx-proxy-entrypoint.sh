#!/bin/sh
set -eu

: "${HTTP_AUTH_USERNAME:?Set HTTP_AUTH_USERNAME in .env}"
: "${HTTP_AUTH_PASSWORD:?Set HTTP_AUTH_PASSWORD in .env}"

printf '%s\n' "$HTTP_AUTH_PASSWORD" |
  htpasswd -mci /etc/nginx/.htpasswd "$HTTP_AUTH_USERNAME" >/dev/null
chmod 0644 /etc/nginx/.htpasswd

exec /docker-entrypoint.sh nginx -g 'daemon off;'
