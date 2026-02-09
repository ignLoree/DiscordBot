const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Ticket = require('../../Schemas/Ticket/ticketSchema');

const OPEN_FOR_MS = 24 * 60 * 60 * 1000;
const INACTIVE_FOR_MS = 2 * 60 * 60 * 1000;

const TRANSCRIPTS_ROOT = path.join(process.cwd(), 'local_transcripts');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let promptLoopHandle = null;
let promptLoopRunning = false;
let cleanupHandle = null;

function buildCloseRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accetta')
      .setEmoji('<:vegacheckmark:1443666279058772028>')
      .setLabel('Accetta e chiudi')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('rifiuta')
      .setEmoji('<:vegax:1443934876440068179>')
      .setLabel('Rifiuta e mantieni aperto')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function getLatestHumanMessageTimestamp(channel, fallbackDate) {
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!recent || recent.size === 0) return fallbackDate?.getTime() || 0;
  const latestHuman = recent.find((message) => !message.author?.bot);
  return latestHuman?.createdTimestamp || fallbackDate?.getTime() || 0;
}

async function processTickets(client) {
  const now = Date.now();
  const openBefore = new Date(now - OPEN_FOR_MS);
  const tickets = await Ticket.find({
    open: true,
    createdAt: { $lte: openBefore },
    $or: [
      { autoClosePromptSentAt: { $exists: false } },
      { autoClosePromptSentAt: null }
    ]
  }).limit(100).catch(() => []);

  for (const ticket of tickets) {
    try {
      const channel = client.channels.cache.get(ticket.channelId) || await client.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) continue;

      const lastActiveAt = await getLatestHumanMessageTimestamp(channel, ticket.createdAt);
      if (!lastActiveAt || (now - lastActiveAt) < INACTIVE_FOR_MS) continue;

      const mentions = new Set([ticket.userId, ticket.claimedBy].filter(Boolean));
      const mentionText = Array.from(mentions).map((id) => `<@${id}>`).join(' ');

      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle('Richiesta di chiusura')
        .setDescription('Il ticket è aperto da più di 24 ore e non ci sono messaggi recenti.\nè stato risolto?');

      await channel.send({
        content: mentionText || null,
        embeds: [embed],
        components: [buildCloseRequestRow()]
      }).catch(() => null);

      await Ticket.updateOne(
        { _id: ticket._id, open: true },
        { $set: { autoClosePromptSentAt: new Date() } }
      ).catch(() => {});
    } catch (err) {
      global.logger.error('[TICKET AUTO CLOSE PROMPT] Failed on ticket', ticket?.channelId, err);
    }
  }
}

function startTicketAutoClosePromptLoop(client) {
  if (promptLoopHandle) return promptLoopHandle;
  const tick = async () => {
    if (promptLoopRunning) return;
    promptLoopRunning = true;
    try {
      await processTickets(client);
    } catch (err) {
      global.logger.error('[TICKET AUTO CLOSE PROMPT] Loop error', err);
    } finally {
      promptLoopRunning = false;
    }
  };
  tick();
  promptLoopHandle = setInterval(tick, 10 * 60 * 1000);
  return promptLoopHandle;
}

function walkTranscriptFiles(dir, out = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      walkTranscriptFiles(full, out);
    } else if (item.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function cleanupOldTranscripts() {
  if (!fs.existsSync(TRANSCRIPTS_ROOT)) return;
  const now = Date.now();
  const files = walkTranscriptFiles(TRANSCRIPTS_ROOT, []);
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if ((now - stat.mtimeMs) > MAX_AGE_MS) {
        fs.unlinkSync(file);
      }
    } catch {}
  }
}

function startTranscriptCleanupLoop() {
  if (cleanupHandle) return cleanupHandle;
  cleanupOldTranscripts();
  cleanupHandle = setInterval(cleanupOldTranscripts, CLEANUP_INTERVAL_MS);
  return cleanupHandle;
}

module.exports = {
  startTicketAutoClosePromptLoop,
  startTranscriptCleanupLoop
};