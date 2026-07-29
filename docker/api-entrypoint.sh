#!/bin/sh
set -e

# Private mode rebuilds the database from LOCAL_RESULTS_DIR on every start.
if [ "${APP_MODE:-}" = "private" ] && [ "${DB_PATH:-}" = "/tmp/conformance.db" ]; then
  rm -f /tmp/conformance.db /tmp/conformance.db-wal /tmp/conformance.db-shm
fi

node db/setup.js
exec node server/index.js
