# MongoDB sulla VPS (Docker)

## Perché 127.0.0.1
La porta **27017** è pubblicata solo su **localhost**: dalla rete Internet nessuno si collega; solo processi sulla stessa VPS (bot, `mongosh`) usano Mongo.

## Avvio (sulla VPS)

1. Installa Docker + Compose se mancano.
2. Nella cartella `deploy`:
   - `cp .env.mongo.example .env.mongo`
   - modifica **user** e **password** in `.env.mongo`
3. `docker compose -f docker-mongodb-compose.yml up -d`
4. Verifica: `docker compose -f docker-mongodb-compose.yml ps`

## Stringa nel `.env` del bot (root)

```
MONGO_URL=mongodb://vinili:LA_TUA_PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```

Sostituisci `vinili`, password e `nomedb` (es. stesso nome che usavi su Atlas). `authSource=admin` serve perché l’utente root è sul DB `admin`.

## Da Atlas → VPS (dump / restore)

Sulla macchina dove hai i tool (o sulla VPS con `mongodump`/`mongorestore` installati):

```bash
mongodump --uri="mongodb+srv://..." --out=./dump
mongorestore --uri="mongodb://vinili:PASS@127.0.0.1:27017/?authSource=admin" ./dump
```

Poi nel bot aggiorni solo `MONGO_URL` e riavvii PM2.

## Backup periodico (consigliato)

Cron sulla VPS, es. ogni notte:

```bash
docker exec vc-mongodb mongodump --username vinili --password 'PASS' --authenticationDatabase admin --out=/tmp/dump
docker cp vc-mongodb:/tmp/dump ./backup-mongo-$(date +%F)
```

O volume + snapshot VPS.

## Tornare ad Atlas
Ripristini `MONGO_URL` vecchio e riavvii il bot; il container Mongo puoi fermarlo con `docker compose ... down` (i dati restano nel volume finché non fai `down -v`).