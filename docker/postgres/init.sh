#!/bin/sh
# The official Postgres entrypoint runs this ONLY when PGDATA is empty.
# Never call the legacy SQL or normalization scripts on normal app startup.
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction \
  --file /opt/psicopanel/schema.sql \
  --file /opt/psicopanel/seed.sql

touch "$PGDATA/.psicopanel-initialized"
