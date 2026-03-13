set -e
U="${1:?Uso: sudo $0 USERNAME PASSWORD}"
P="${2:?Uso: sudo $0 USERNAME PASSWORD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
export MONGO_INITDB_ROOT_USERNAME="$U"
export MONGO_INITDB_ROOT_PASSWORD="$P"
echo "down -v (cancella dati Mongo Docker su questa VPS)..."
docker compose -f docker-mongodb-compose.yml down -v
echo "up (root = $U)..."
docker compose -f docker-mongodb-compose.yml up -d
echo "Attendo avvio..."
sleep 10
if ! docker exec vc-mongodb mongosh -u "$U" -p "$P" --authenticationDatabase admin --quiet --eval 'db.adminCommand("ping").ok' | grep -q 1; then
  echo "FAIL ping — docker logs:"
  docker logs vc-mongodb --tail 25
  exit 1
fi
echo "OK autenticazione."
printf 'MONGO_INITDB_ROOT_USERNAME=%s\nMONGO_INITDB_ROOT_PASSWORD=%s\n' "$U" "$P" > .env.mongo
chmod 600 .env.mongo
echo ".env.mongo aggiornato (solo LF). MONGO_URL bot:"
echo "mongodb://$U:$P@127.0.0.1:27017/test?authSource=admin"
echo "Restore dump: ./restore-mongo.sh /percorso/atlas-dump"