# MongoDB sulla VPS (Docker)

## Se vedi `lstat .../backups: no such file`

La cartella **non è su git**. Creala una volta:

```bash
mkdir -p /opt/bot/deploy/backups
```

Da ora **`start-mongo.sh`** crea anche `backups/` da solo.

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

## Windows — dump Atlas senza romperti (Docker + root)

Dalla root del repo, **PowerShell** (Connection string completa da Atlas, tra virgolette):

```powershell
cd "C:\percorso\DiscordBot-1"
.\scripts\mongodump-atlas-docker.ps1 -Uri "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/"
```

Esce tutto in **`deploy/atlas-dump/`** (gitignored). Poi zip o scp di **`atlas-dump`** sulla VPS e:

```bash
/opt/bot/deploy/restore-mongo.sh /percorso/atlas-dump
```

---

## Dump da Atlas → VPS (stessi dati di prima)

**Sul PC** (o sulla VPS se hai `mongodump` + rete verso Atlas):

```bash
mongodump --uri="mongodb+srv://USER:PASS@purplemoon.xxx.mongodb.net/" --out=./dump-atlas
```

La cartella `dump-atlas` deve contenere **sottocartelle con file `.bson`** (es. `dump-atlas/nomedb/*.bson`). Se pesa pochi KB e non ci sono `.bson`, il dump non e andato bene.

Copia **tutta** `dump-atlas` sulla VPS (scp/rsync), poi:

```bash
/opt/bot/deploy/restore-mongo.sh /percorso/dump-atlas
```

**Mai** passare solo `backups/` se dentro non c e un dump Atlas: spesso c e solo `cron.log` → **0 documenti**.

(Se `mongodump` non c’è: pacchetto **mongodb-database-tools**, oppure  
`docker run --rm -v "$PWD:/out" mongo:7 mongodump --uri="mongodb+srv://..." -o /out/dump-atlas`)

### Perche prima vedevi "0 documenti"

- Argomento sbagliato (cartella senza `.bson`).
- Oppure dump fatto su DB vuoto / URI senza auth.

---

## Perché a volte "env file not found"

`env_file` nel compose è relativo alla **cwd** da cui lanci compose, non alla cartella del yml. Qui si usa **`--env-file`** + path assoluto / script in `deploy/`.

---

## Stringa nel `.env` del bot

```
MONGO_URL=mongodb://vinili:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```