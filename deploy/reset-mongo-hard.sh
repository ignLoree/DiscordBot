#!/bin/bash
# ZERO compose: solo docker run + -e espliciti (niente variabili vuote da .env)
set -e
U="${1:?Uso: sudo $0 USER PASS}"
P="${2:?Uso: sudo $0 USER PASS}"
DIR="$(cd "$(dirname "$0")" && pwd)"
VOL=vc_mongodb_data
echo "Stop e rimuovo container + volume $VOL..."
docker rm -f vc-mongodb 2>/dev/null || true
docker volume rm "$VOL" 2>/dev/null || true
echo "Avvio Mongo con user=$U ..."
docker run -d --name vc-mongodb --restart unless-stopped \
  -e MONGO_INITDB_ROOT_USERNAME="$U" \
  -e MONGO_INITDB_ROOT_PASSWORD="$P" \
  -p 127.0.0.1:27017:27017 \
  -v "$VOL":/data/db \
  mongo:7 mongod --bind_ip_all
echo "Init Mongo (15s)..."
sleep 15
R=$(docker exec vc-mongodb mongosh -u "$U" -p "$P" --authenticationDatabase admin --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null || echo "0")
if [[ "$R" != *"1"* ]]; then
  echo "AUTH FAIL — env nel container:"
  docker inspect vc-mongodb --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MONGO
  echo "--- ultimi log ---"
  docker logs vc-mongodb --tail 40
  exit 1
fi
echo "OK."
printf 'MONGO_INITDB_ROOT_USERNAME=%s\nMONGO_INITDB_ROOT_PASSWORD=%s\n' "$U" "$P" > "$DIR/.env.mongo"
chmod 600 "$DIR/.env.mongo"
echo ""
echo "NON lanciare start-mongo.sh dopo questo (compose creerebbe altro stack)."
echo "Avvio dopo reboot: gia con --restart unless-stopped. Oppure: docker start vc-mongodb"
echo ""
echo "MONGO_URL: mongodb://$U:$P@127.0.0.1:27017/test?authSource=admin"