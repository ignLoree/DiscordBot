#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
chmod +x start-mongo.sh backup-mongo.sh restore-mongo.sh 2>/dev/null || true
if [[ -f .env.mongo ]]; then
  chmod 600 .env.mongo
  echo "chmod 600 .env.mongo ok"
else
  echo "Crea .env.mongo prima (vedi MONGODB-VPS.md)"
  exit 1
fi
./start-mongo.sh
mkdir -p backups
echo ""
echo "Prossimi passi manuali:"
echo "1) Nel .env del bot: MONGO_URL=mongodb://USER:PASS@127.0.0.1:27017/NOMEDB?authSource=admin"
echo "2) pm2 restart all"
echo "3) (opzionale) Dump da Atlas → vedi MONGODB-VPS.md"
echo "4) Cron backup (dom 03:15):"
echo "   (crontab -l 2>/dev/null; echo '15 3 * * 0 $DIR/backup-mongo.sh >> $DIR/backups/cron.log 2>&1') | crontab -"