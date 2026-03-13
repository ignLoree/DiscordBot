#!/bin/bash
set -e
F="$(cd "$(dirname "$0")" && pwd)/.env.mongo"
if [[ ! -f "$F" ]]; then
  echo "Manca $F"
  exit 1
fi
if grep -q $'\r' "$F" 2>/dev/null; then
  echo "Trovato CRLF in .env.mongo — converto (sudo dos2unix)."
  command -v dos2unix >/dev/null || { echo "Installa: sudo apt install dos2unix"; exit 1; }
  sudo dos2unix "$F"
  echo "Fatto. Ora: docker compose down -v && up -d (volume nuovo obbligatorio)."
else
  echo "Nessun CRLF in .env.mongo"
fi