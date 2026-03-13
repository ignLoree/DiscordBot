/**
 * PM2: avvia Lavalink e poi i bot.
 * Sul VPS: pm2 start ecosystem.config.cjs
 * Comandi: pm2 status | pm2 logs | pm2 restart all
 */
const path = require("path");
const base = path.resolve(__dirname);

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
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
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