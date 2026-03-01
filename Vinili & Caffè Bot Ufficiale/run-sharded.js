/**
 * Avvio del bot con sharding (opzionale).
 * Usa quando il bot è in molti server (es. 1000+ guild) per distribuire carico e memoria.
 *
 * --- AVVIO SHARDATO ---
 * Con loader.js (root progetto): ENABLE_SHARDING=1 node loader.js
 *   → il loader avvia automaticamente run-sharded.js per il bot Ufficiale.
 * Senza loader: ENABLE_SHARDING=1 node run-sharded.js (da cartella Bot Ufficiale)
 * Oppure: in .env metti ENABLE_SHARDING=1 poi npm run start:sharded
 *
 * --- AVVIO NORMALE ---
 * node run-sharded.js (senza env) = esegue index.js in un unico processo (come prima).
 */
const path = require("path");
const APP_ROOT = __dirname;

require("dotenv").config({ path: path.join(APP_ROOT, ".env"), quiet: true });
require("dotenv").config({ path: path.join(APP_ROOT, "..", ".env"), quiet: true });

const enableSharding = process.env.ENABLE_SHARDING === "1" || process.env.SHARDING === "1";

if (!enableSharding) {
  require("./index.js");
  return;
}

const { ShardingManager } = require("discord.js");
const workerPath = path.join(APP_ROOT, "index.js");
const token =
  process.env.DISCORD_TOKEN ||
  process.env.DISCORD_TOKEN_OFFICIAL ||
  (function () {
    try {
      return require("./config.json").token;
    } catch {
      return null;
    }
  })();

if (!token) {
  console.error("[SHARD] Missing token. Set DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL.");
  process.exit(1);
}

const manager = new ShardingManager(workerPath, {
  totalShards: "auto",
  token,
});

manager.on("shardCreate", (shard) => {
  if (global.logger?.info) {
    global.logger.info(`[SHARD] Shard ${shard.id} spawned`);
  } else {
    console.log(`[SHARD] Shard ${shard.id} spawned`);
  }
});

manager.spawn().catch((err) => {
  console.error("[SHARD] Failed to spawn shards:", err);
  process.exit(1);
});
