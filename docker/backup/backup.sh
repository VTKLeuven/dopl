#!/bin/bash
# Nightly backups for Dopl (docs/ops/deploy.md §Backups):
#   /backups/dopl-<stamp>.dump      pg_dump custom format (restore with restore.sh)
#   /backups/uploads-<stamp>.tar.gz the uploads volume
# Keeps BACKUP_KEEP_DAYS days. `backup.sh now` makes one backup and exits.
set -euo pipefail

backup() {
  local stamp tmp
  stamp=$(date +%Y%m%d-%H%M%S)
  tmp="/backups/.dopl-${stamp}.dump.partial"
  echo "[backup] ${stamp}: database"
  pg_dump --format=custom --no-owner --file="$tmp"
  mv "$tmp" "/backups/dopl-${stamp}.dump"
  if [ -d /data/uploads ]; then
    echo "[backup] ${stamp}: uploads"
    tar -czf "/backups/.uploads-${stamp}.tar.gz.partial" -C /data uploads
    mv "/backups/.uploads-${stamp}.tar.gz.partial" "/backups/uploads-${stamp}.tar.gz"
  fi
  find /backups -maxdepth 1 -type f \( -name 'dopl-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime "+${BACKUP_KEEP_DAYS:-14}" -print -delete
  echo "[backup] ${stamp}: done ($(du -sh /backups | cut -f1) in /backups)"
}

if [ "${1:-}" = "now" ]; then
  backup
  exit 0
fi

echo "[backup] daily at ${BACKUP_TIME:-03:30} (${TZ:-UTC}), keeping ${BACKUP_KEEP_DAYS:-14} days"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME:-03:30}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME:-03:30}" +%s)
  sleep $((next - now))
  backup || echo "[backup] FAILED" >&2
done
