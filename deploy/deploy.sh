#!/bin/bash
# Deploy the gumy-widget showcase (widget.gumy.ai) to the beelink server.
# Usage: bash deploy/deploy.sh
#
# Serves ./site as a static nginx:alpine container (widget-gumy-ai). Caddy
# routes widget.gumy.ai -> widget-gumy-ai:80 by network alias (no host ports).
# TLS terminates on the Yandex.Cloud edge via the *.gumy.ai wildcard.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy and fill it first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

SSH_KEY="${SSH_KEY:-~/.ssh/id_ed25519}"

echo "=== Deploying ${PROJECT_NAME} to ${SERVER_HOST} ==="

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" -o ConnectTimeout=8 \
  "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${SERVER_PATH}"

# Sync the static site + compose config only.
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.playwright-mcp' \
  --exclude '*.png' \
  --exclude '*.jpg' \
  -e "ssh -p ${SERVER_PORT} -i ${SSH_KEY}" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"

ssh -p "${SERVER_PORT}" -i "${SSH_KEY}" "${SERVER_USER}@${SERVER_HOST}" \
  "cd ${SERVER_PATH} && docker compose --env-file .env -f deploy/docker-compose.yml --project-directory . up -d --force-recreate"

echo "=== Done! ${PROJECT_NAME} deployed → https://widget.gumy.ai ==="
