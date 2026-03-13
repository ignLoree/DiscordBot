# MongoDB sulla VPS (Docker)

## Perché prima diceva "env file not found"
Se lanci `docker compose -f deploy/docker-mongodb-compose.yml` **da `/opt/bot`**, Docker cercava `.env.mongo` in **`/opt/bot/`**, non in **`deploy/`** — anche se il file c’è in `deploy/`. Non è colpa del `.gitignore`.

## Avvio (sempre così)

```bash
chmod +x /opt/bot/deploy/start-mongo.sh
/opt/bot/deploy/start-mongo.sh
```

Lo script usa il path **assoluto** di `.env.mongo` e `--env-file`, così Docker non può sbagliare cartella.

Oppure a mano:

```bash
docker compose --env-file /opt/bot/deploy/.env.mongo -f /opt/bot/deploy/docker-mongodb-compose.yml up -d
```

(Sostituisci `/opt/bot` se il bot sta altrove.)

## File `.env.mongo` (due righe)

Dentro **`/opt/bot/deploy`**:

```bash
git pull
ls -la .env.mongo.example
```

Se **`cp .env.mongo.example .env.mongo`** dice *No such file* → non hai ancora l’ultimo repo sul server. **`git pull`** nella cartella del bot, poi riprova. Se ancora manca, crea il file a mano (stesso identico effetto):

```bash
printf '%s\n' 'MONGO_INITDB_ROOT_USERNAME=vinili' 'MONGO_INITDB_ROOT_PASSWORD=LA_TUA_PASSWORD' > /opt/bot/deploy/.env.mongo
chmod 600 /opt/bot/deploy/.env.mongo
```

Template (copiabile):

```
MONGO_INITDB_ROOT_USERNAME=vinili
MONGO_INITDB_ROOT_PASSWORD=password_sicura
```

## Stringa nel `.env` del bot

```
MONGO_URL=mongodb://vinili:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```

## Dump da Atlas → VPS

```bash
mongodump --uri="mongodb+srv://..." --out=./dump
mongorestore --uri="mongodb://vinili:PASS@127.0.0.1:27017/?authSource=admin" ./dump
```