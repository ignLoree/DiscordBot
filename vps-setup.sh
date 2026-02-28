#!/bin/bash
# Script unico: esegui sulla VPS dopo aver caricato la cartella del bot.
# Uso: chmod +x vps-setup.sh && ./vps-setup.sh

set -e
echo "=== Setup VPS Vinili & Caffè Bot ==="

# Node 20 se non presente
if ! command -v node &> /dev/null; then
  echo "Installo Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# PM2 globale
if ! command -v pm2 &> /dev/null; then
  echo "Installo PM2..."
  sudo npm install -g pm2
fi
echo "PM2: $(pm2 -v)"

# Dipendenze del progetto (dalla cartella dove sei)
echo "Installo dipendenze npm..."
npm install

echo ""
echo "=== Fine setup. ==="
echo ""
echo "Ora fai:"
echo "  1. Copia il file .env (quello del PC) nella stessa cartella dove sei adesso (es. /opt/bot)."
echo "  2. Se usi MongoDB sulla VPS (locale), nel .env metti:"
echo "     MONGO_URL=mongodb://127.0.0.1:27017/vinili"
echo "  3. Avvia entrambi i bot con il loader (da questa stessa cartella):"
echo "     pm2 start loader.js --name vinili-bot --node-args=\"--disable-warning=ExperimentalWarning\""
echo "     pm2 save"
echo "     pm2 startup   (poi esegui il comando che ti stampa)"
echo ""
echo "Comandi utili: pm2 status | pm2 logs vinili-bot | pm2 restart vinili-bot"
