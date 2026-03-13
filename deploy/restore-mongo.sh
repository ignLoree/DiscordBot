#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV="$DIR/.env.mongo"
RAW="${1:?Uso: $0 CARTELLA_DUMP

La cartella deve essere l output di mongodump, con dentro cartelle DB e file .bson, es:
  nomedb/collection.bson
Esempi:
  $0 ./dump-atlas                    (dopo: mongodump --uri=\"mongodb+srv://...\" --out=./dump-atlas)
  $0 ./backups/mongo-20250313-120000

NON usare solo ./backups se dentro non c e un dump completo (solo log = 0 documenti).
}"
if [[ ! -e "$RAW" ]]; then
  echo "Path non esiste: $RAW"
  exit 1
fi
DUMP="$RAW"
# Se passano deploy/backups senza sottocartella mongo-*, cerca l ultima cartella mongo-* con .bson
if [[ -d "$RAW" ]] && [[ ! $(find "$RAW" -maxdepth 3 -name '*.bson' -print -quit 2>/dev/null) ]]; then
  LATEST=$(find "$RAW" -maxdepth 1 -type d -name 'mongo-*' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [[ -n "$LATEST" ]] && find "$LATEST" -name '*.bson' -print -quit | grep -q .; then
    echo "Uso sottocartella dump: $LATEST"
    DUMP="$LATEST"
  fi
fi
BSON=$(find "$DUMP" -name '*.bson' 2>/dev/null | wc -l)
if [[ "$BSON" -eq 0 ]]; then
  echo "ERRORE: in $DUMP non ci sono file .bson — non e un mongodump valido."
  echo "Fai dump da Atlas su un PC con mongodump:"
  echo "  mongodump --uri=\"mongodb+srv://USER:PASS@cluster...\" --out=./dump-atlas"
  echo "Poi sulla VPS copia la cartella dump-atlas e:"
  echo "  $0 /percorso/dump-atlas"
  exit 1
fi
echo "Trovati $BSON file .bson — avvio restore..."
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
  --drop \
  "/tmp/$NAME"
docker exec vc-mongodb rm -rf "/tmp/$NAME"
echo "Restore completato da $DUMP"