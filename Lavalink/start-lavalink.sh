#!/usr/bin/env bash
# Per VPS/Linux: avvia Lavalink con Java. Usato da PM2.
cd "$(dirname "$0")"
JAVA_EXE=""
for candidate in java "$(which java 2>/dev/null)"; do
  if command -v "$candidate" &>/dev/null; then
    JAVA_EXE="$candidate"
    break
  fi
done
if [ -z "$JAVA_EXE" ]; then
  for p in /usr/bin/java /usr/lib/jvm/*/bin/java; do
    [ -x "$p" ] && JAVA_EXE="$p" && break
  done
fi
if [ -z "$JAVA_EXE" ] || [ ! -x "$JAVA_EXE" ]; then
  echo "Java non trovato. Installa openjdk-17-jre (apt install openjdk-17-jre)"
  exit 1
fi
exec "$JAVA_EXE" -jar Lavalink.jar