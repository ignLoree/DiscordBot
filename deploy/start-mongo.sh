#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV="$DIR/.env.mongo"
if [[ ! -f "$ENV" ]]; then
  echo "Manca $ENV — crealo (vedi .env.mongo.example)"
  exit 1
fi
cd "$DIR"
docker compose --env-file "$ENV" -f docker-mongodb-compose.yml up -d
docker compose -f docker-mongodb-compose.yml ps