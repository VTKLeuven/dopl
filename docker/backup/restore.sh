#!/bin/bash
# Restores a Dopl backup made by backup.sh (docs/ops/deploy.md §Restore).
#   restore.sh /backups/dopl-<stamp>.dump [/backups/uploads-<stamp>.tar.gz]
# Stop web and worker first. The database is replaced entirely.
set -euo pipefail
dump="${1:?usage: restore.sh /backups/dopl-<stamp>.dump [/backups/uploads-<stamp>.tar.gz]}"
uploads="${2:-}"

echo "[restore] replacing database ${PGDATABASE} from ${dump}"
psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${PGDATABASE}\" WITH (FORCE)"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PGDATABASE}\" OWNER \"${PGUSER}\""
pg_restore --no-owner --exit-on-error -d "${PGDATABASE}" "$dump"

if [ -n "$uploads" ]; then
  echo "[restore] replacing uploads from ${uploads}"
  find /data/uploads -mindepth 1 -delete
  tar -xzf "$uploads" -C /data
  chown -R 1000:1000 /data/uploads
fi
echo "[restore] done. Start web and worker again."
