# Lavalink — **YouTube** + stream HTTP (radio)

- Plugin **youtube-plugin** (in `application.yml`: tienilo **aggiornato**). Se in log vedi `SignatureCipherManager` / `No match found` in playback, YouTube ha cambiato script → alza la versione del plugin (ultima: [youtube-source releases](https://github.com/lavalink-devs/youtube-source/releases)).
- **Radio**: URL diretti risolti dal bot poi load su Lavalink.
- Password: `youshallnotpass` — `LAVALINK_PASSWORD` nel `.env` del bot.
- Dopo ogni cambio a `application.yml`: **riavvia Lavalink** (PM2 scarica il nuovo jar al boot).