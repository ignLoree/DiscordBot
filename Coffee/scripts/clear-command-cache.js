/**
 * Cancella la cache del deploy degli slash command del bot Coffee (test).
 * Dopo averla eseguita, al prossimo avvio del bot i comandi su Discord verranno risincronizzati:
 * se non ci sono file in Coffee/Commands, Discord riceverà lista vuota e rimuoverà i comandi fantasma.
 *
 * Uso: node scripts/clear-command-cache.js
 */
const path = require("path");
const { clearCommandDeployCache } = require("../../shared/runtime/commandDeployCache");

const BOT_KEY = "test";
const appRoot = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(appRoot, ".env"), quiet: true });
require("dotenv").config({ path: path.join(appRoot, "..", ".env"), quiet: true });

const removed = clearCommandDeployCache(BOT_KEY);
if (removed) {
  console.log("[OK] Cache deploy comandi (test) cancellata. Riavvia il bot Coffee per risincronizzare gli slash command su Discord.");
} else {
  console.log("[INFO] Nessuna cache trovata per il bot test. Riavvia comunque il bot: se non ci sono comandi in Coffee/Commands, Discord riceverà lista vuota.");
}
