# Lavalink — **YouTube** + stream HTTP (radio)

- Plugin **youtube-plugin** (in `application.yml`: tienilo **aggiornato**). Se in log vedi `SignatureCipherManager` / `No match found` in playback, YouTube ha cambiato script → alza la versione del plugin (ultima: [youtube-source releases](https://github.com/lavalink-devs/youtube-source/releases)).
- **Radio**: URL diretti risolti dal bot poi load su Lavalink.
- Password: `youshallnotpass` — `LAVALINK_PASSWORD` nel `.env` del bot.
- Dopo ogni cambio a `application.yml`: **riavvia Lavalink** (PM2 scarica il nuovo jar al boot).
- **Lag / scatti audio:** `bufferDurationMs` e `frameBufferDurationMs` più alti = più tolleranza a CPU/rete; VPS piccola: evita altri carichi pesanti mentre suona; nel `.env` del bot `MUSIC_LOGS=0` per non loggare ogni evento; almeno **2 vCPU** e **1 GB** riservati a Lavalink se puoi.