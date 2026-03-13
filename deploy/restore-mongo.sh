#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV="$DIR/.env.mongo"
DUMP="${1:?Uso: $0 /percorso/cartella_dump (es. backups/mongo-20250313-120000)}"
if [[ ! -f "$ENV" ]]; then
  echo "Manca $ENV"
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV"
set +a
if ! docker ps --format '{{.Names}}' | grep -qx vc-mongodb; then
  echo "Avvia prima start-mongo.sh"
  exit 1
fi
NAME="restore-$$"
docker cp "$DUMP" "vc-mongodb:/tmp/$NAME"
docker exec vc-mongodb mongorestore \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  "/tmp/$NAME"
docker exec vc-mongodb rm -rf "/tmp/$NAME"
echo "Restore completato da $DUMP"