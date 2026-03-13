# MongoDB sulla VPS (Docker)

## Una tantum sulla VPS (fa quasi tutto)

```bash
cd /opt/bot/deploy
git pull
chmod +x setup-vps-mongo.sh start-mongo.sh backup-mongo.sh restore-mongo.sh
./setup-vps-mongo.sh
```

Poi nel **`.env` del bot** (stesso user/password di `.env.mongo`):

```
MONGO_URL=mongodb://USER:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```

Poi: **`pm2 restart all`** (o il processo del bot).

---

## File `.env.mongo` (due righe)

Se non c’è:

```bash
printf '%s\n' 'MONGO_INITDB_ROOT_USERNAME=vinili' 'MONGO_INITDB_ROOT_PASSWORD=LA_TUA_PASSWORD' > /opt/bot/deploy/.env.mongo
chmod 600 /opt/bot/deploy/.env.mongo
```

---

## Script

| Script | Cosa fa |
|--------|--------|
| `start-mongo.sh` | Avvia Mongo (Docker) |
| `backup-mongo.sh` | Dump in `deploy/backups/mongo-YYYYMMDD-HHMMSS` (cancella backup > 14 gg) |
| `restore-mongo.sh /percorso/cartella_dump` | Restore da una cartella di backup |
| `setup-vps-mongo.sh` | chmod sicuri, avvio Mongo, crea `backups/`, istruzioni + cron |

### Cron backup settimanale (domenica 03:15)

```bash
(crontab -l 2>/dev/null | grep -v backup-mongo.sh; echo '15 3 * * 0 /opt/bot/deploy/backup-mongo.sh >> /opt/bot/deploy/backups/cron.log 2>&1') | crontab -
```

---

## Dump da Atlas → VPS (stessi dati di prima)

```bash
mongodump --uri="mongodb+srv://USER:PASS@cluster.../..." --out=./dump-atlas
/opt/bot/deploy/restore-mongo.sh ./dump-atlas
```

(Se `mongodump` non c’è sul host: installa `mongodb-database-tools` o usa temporaneamente `docker run --rm -v "$PWD:/d" mongo:7 mongodump ...`.)

---

## Perché a volte "env file not found"

`env_file` nel compose è relativo alla **cwd** da cui lanci compose, non alla cartella del yml. Qui si usa **`--env-file`** + path assoluto / script in `deploy/`.

---

## Stringa nel `.env` del bot

```
MONGO_URL=mongodb://vinili:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```