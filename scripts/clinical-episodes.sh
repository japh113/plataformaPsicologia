#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-test}"
[[ "$mode" == test || "$mode" == demo ]] || { echo "Usage: bash scripts/clinical-episodes.sh [test|demo]" >&2; exit 1; }
export EPISODE_TEST_RUN_ID
EPISODE_TEST_RUN_ID="$(cat /proc/sys/kernel/random/uuid)"
project="psicopanel-episodes-$EPISODE_TEST_RUN_ID"
compose=(docker compose -p "$project" -f compose.episodes-test.yaml)
# Refuse a reused destination BEFORE creating any resources or writing to PostgreSQL.
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]]
[[ -z "$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]
cleanup() { "${compose[@]}" --profile demo down --remove-orphans; }
trap cleanup EXIT
"${compose[@]}" build backend frontend
"${compose[@]}" up -d --wait db
db_id="$("${compose[@]}" ps -q db)"
[[ "$(docker inspect --format '{{range $path, $options := .HostConfig.Tmpfs}}{{if eq $path "/var/lib/postgresql/data"}}tmpfs{{end}}{{end}}' "$db_id")" == tmpfs ]]
[[ "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$db_id")" == 0 ]]
network_id="$(docker network ls -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.network=database")"
[[ "$(docker network inspect --format '{{.Internal}}' "$network_id")" == true ]]
echo "Verified fresh isolated project: $project (tmpfs, private DB, no DB ports)"
if [[ "$mode" == test ]]; then
  "${compose[@]}" run --rm backend npm run test:episodes
  "${compose[@]}" run --rm backend npm test
  # Existing suites opt into 003 before starting HTTP; all destinations are new.
  "${compose[@]}" run --rm backend npm run test:integration
  "${compose[@]}" --profile demo run --rm --no-deps frontend sh -c 'npm run lint && npm run build'
else
  "${compose[@]}" run --rm -e NODE_ENV=development backend node scripts/create-episode-demo.js
  "${compose[@]}" --profile demo up -d api
  api_address="$("${compose[@]}" port api 5000)"
  export EPISODE_DEMO_API_URL="http://$api_address/api"
  "${compose[@]}" --profile demo up -d frontend
  echo "Demo UI: http://$("${compose[@]}" port frontend 5173)"
  echo "API: $EPISODE_DEMO_API_URL"
  echo "Accounts: a@episodes.invalid, b@episodes.invalid, p@episodes.invalid, q@episodes.invalid"
  echo "Password (all demo accounts): Episode-Demo-Only-284!"
  echo "Cleanup ONLY this new project: docker compose -p $project -f compose.episodes-test.yaml --profile demo down"
  trap - EXIT
fi
