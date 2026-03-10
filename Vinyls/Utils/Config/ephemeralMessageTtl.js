/**
 * TTL per messaggi effimeri (risposte del bot che si auto-cancellano).
 * Usare questi valori invece di numeri magici sparsi nel codice.
 *
 * - SHORT (8s): errori contestuali, hint prefix sbagliato, "devi essere in vocale", permessi/canale/cooldown/busy
 * - NORMAL (12s): warning automazioni, feedback purge, "X è AFK" (menzione)
 * - LONG (18s): bentornato AFK, messaggi che l'utente vuole leggere con calma
 * - PING_ONLY (3s): messaggi solo per notifica (es. ping in thread candidatura)
 */

const EPHEMERAL_TTL_SHORT_MS = 8_000;
const EPHEMERAL_TTL_NORMAL_MS = 12_000;
const EPHEMERAL_TTL_LONG_MS = 18_000;
const EPHEMERAL_TTL_PING_ONLY_MS = 3_000;

function scheduleMessageDeletion(message, ttlMs) {
  if (!message || typeof message.delete !== "function") return;
  const timer = setTimeout(() => message.delete().catch(() => { }), ttlMs);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  EPHEMERAL_TTL_SHORT_MS,
  EPHEMERAL_TTL_NORMAL_MS,
  EPHEMERAL_TTL_LONG_MS,
  EPHEMERAL_TTL_PING_ONLY_MS,
  scheduleMessageDeletion,
};