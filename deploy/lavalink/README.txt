Lavalink deployment files for the official bot.

Files:
- application.yml.example -> copy to /opt/lavalink/application.yml
- lavalink.service.example -> copy to /etc/systemd/system/lavalink.service

VPS quick steps:
1. Install Java 21.
2. Download Lavalink.jar into /opt/lavalink.
3. Copy application.yml.example to /opt/lavalink/application.yml.
4. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the systemd service or shell env.
5. systemctl daemon-reload
6. systemctl enable --now lavalink

Bot env required:
- LAVALINK_HOST=127.0.0.1:2333
- LAVALINK_PASSWORD=youshallnotpass
- LAVALINK_NAME=main
- LAVALINK_SECURE=false
- SPOTIFY_CLIENT_ID=...
- SPOTIFY_CLIENT_SECRET=...
