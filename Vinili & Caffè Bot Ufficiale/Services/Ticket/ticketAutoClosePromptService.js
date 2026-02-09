const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../../Schemas/Ticket/ticketSchema');

const OPEN_FOR_MS = 24 * 60 * 60 * 1000;
const INACTIVE_FOR_MS = 2 * 60 * 60 * 1000;

let loopHandle = null;
let loopRunning = false;

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
        .setDescription('Il ticket è aperto da più di 24 ore e non ci sono messaggi recenti.\nÈ stato risolto?');

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
  if (loopHandle) return loopHandle;
  const tick = async () => {
    if (loopRunning) return;
    loopRunning = true;
    try {
      await processTickets(client);
    } catch (err) {
      global.logger.error('[TICKET AUTO CLOSE PROMPT] Loop error', err);
    } finally {
      loopRunning = false;
    }
  };
  tick();
  loopHandle = setInterval(tick, 10 * 60 * 1000);
  return loopHandle;
}

module.exports = {
  startTicketAutoClosePromptLoop
};

