#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV="$DIR/.env.mongo"
if [[ ! -f "$ENV" ]]; then
  echo "Manca $ENV"
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV"
set +a
if ! docker ps --format '{{.Names}}' | grep -qx vc-mongodb; then
  echo "Container vc-mongodb non in esecuzione — avvia prima start-mongo.sh"
  exit 1
fi
STAMP=$(date +%Y%m%d-%H%M%S)
TMP="/tmp/mongo-dump-$STAMP"
OUT="$DIR/backups/mongo-$STAMP"
mkdir -p "$DIR/backups"
docker exec vc-mongodb mongodump \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  -o "$TMP"
docker cp "vc-mongodb:$TMP" "$OUT"
docker exec vc-mongodb rm -rf "$TMP"
echo "Backup: $OUT"
find "$DIR/backups" -maxdepth 1 -type d -name 'mongo-*' -mtime +14 -exec rm -rf {} + 2>/dev/null || true
echo "Eliminati backup locali piu vecchi di 14 giorni (se ce n erano)."