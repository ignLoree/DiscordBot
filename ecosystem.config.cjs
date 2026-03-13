const fs = require("fs");
const path = require("path");
const base = path.resolve(__dirname);
const envPath = path.join(base, ".env");
try {
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) process.env[key] = val;
    }
  }
} catch (_) {}

const spotifyId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
const spotifySecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();

module.exports = {
  apps: [
    {
      name: "lavalink",
      cwd: path.join(base, "Lavalink"),
      script: path.join(base, "Lavalink", "Lavalink.jar"),
      interpreter: "java",
      interpreter_args: "-jar",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        SPOTIFY_CLIENT_ID: spotifyId,
        SPOTIFY_CLIENT_SECRET: spotifySecret,
      },
    },
    {
      name: "bots",
      cwd: base,
      script: "wait-for-lavalink.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
    },
  ],
};