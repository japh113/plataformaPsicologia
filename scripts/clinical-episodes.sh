#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-test}"
if [[ "$mode" == cleanup && "$#" == 2 ]]; then
  export EPISODE_TEST_RUN_ID="$2"
elif [[ ( "$mode" == test || "$mode" == demo || "$mode" == identity-demo || "$mode" == contact-demo || "$mode" == contact-review ) && "$#" -le 1 ]]; then
  export EPISODE_TEST_RUN_ID
  EPISODE_TEST_RUN_ID="$(cat /proc/sys/kernel/random/uuid)"
else
  echo "Usage: bash scripts/clinical-episodes.sh [test|demo|identity-demo|contact-demo|contact-review|cleanup RUN_UUID]" >&2
  exit 1
fi
[[ "$EPISODE_TEST_RUN_ID" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]]
project="psicopanel-episodes-$EPISODE_TEST_RUN_ID"
compose=(docker compose -p "$project" -f compose.episodes-test.yaml)
if [[ "$mode" == contact-review ]]; then compose+=(-f compose.contact-review.yaml); fi
cleanup() {
  # Refuse an unrelated project BEFORE stopping containers or deleting images.
  python3 scripts/episode_images.py validate-state "$project" || return
  "${compose[@]}" --profile demo down --remove-orphans || return
  python3 scripts/episode_images.py cleanup "$project"
}
if [[ "$mode" == cleanup ]]; then
  cleanup
  exit
fi
python3 -B scripts/test_episode_images.py
# Refuse a reused destination BEFORE creating resources or writing to PostgreSQL.
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]]
[[ -z "$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]
python3 scripts/episode_images.py preflight "$project"
cleanup_on_exit() {
  local result=$?
  trap - EXIT
  if ! cleanup; then result=1; fi
  exit "$result"
}
trap cleanup_on_exit EXIT
"${compose[@]}" build backend frontend
python3 scripts/episode_images.py verify "$project"
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
  python3 scripts/episode_images.py verify "$project"
else
  if [[ "$mode" == identity-demo || "$mode" == contact-demo || "$mode" == contact-review ]]; then
    "${compose[@]}" run --rm -e NODE_ENV=development backend node scripts/create-identity-demo.js
  else
    "${compose[@]}" run --rm -e NODE_ENV=development backend node scripts/create-episode-demo.js
  fi
  "${compose[@]}" --profile demo up -d api
  api_address="$("${compose[@]}" port api 5000)"
  export IDENTITY_DEMO_MODE=false
  if [[ "$mode" == identity-demo || "$mode" == contact-demo || "$mode" == contact-review ]]; then export IDENTITY_DEMO_MODE=true; fi
  export EPISODE_DEMO_API_URL="http://$api_address/api"
  if [[ "$mode" == contact-review ]]; then export EPISODE_DEMO_API_URL="http://api:5000/api"; fi
  "${compose[@]}" --profile demo up -d frontend
  python3 scripts/episode_images.py verify "$project"
  if [[ "$mode" == contact-review ]]; then
    echo "Review UI: private frontend.localhost:5173 via guarded browser harness"
  else
    echo "Demo UI: http://$("${compose[@]}" port frontend 5173)"
  fi
  echo "API: $EPISODE_DEMO_API_URL"
  echo "Accounts: a@episodes.invalid, b@episodes.invalid, p@episodes.invalid, q@episodes.invalid"
  if [[ "$mode" == identity-demo || "$mode" == contact-demo || "$mode" == contact-review ]]; then echo "Identity demo accounts: r@episodes.invalid, admin@identity.invalid, support@identity.invalid"; fi
  echo "Password (all demo accounts): Episode-Demo-Only-284!"
  echo "Cleanup ONLY this new project: bash scripts/clinical-episodes.sh cleanup $EPISODE_TEST_RUN_ID"
  trap - EXIT
fi
