const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Giveaway = require("../../Schemas/Giveaway/giveawaySchema");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const GIVEAWAY_ENTER_PREFIX = "giveaway_enter:";
const GIVEAWAY_REROLL_PREFIX = "giveaway_reroll:";

function parseDuration(input) {
  const str = String(input || "").trim().toLowerCase();
  const match = str.match(/^(\d+)(m|h|d|s)$/);
  if (!match) return null;
  const value = Math.max(1, parseInt(match[1], 10));
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * (multipliers[unit] || 0);
}

function formatTimeRemaining(endAt) {
  const now = Date.now();
  const end = new Date(endAt).getTime();
  const ms = Math.max(0, end - now);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((ms % (60 * 1000)) / 1000);
  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "giorno" : "giorni"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "ora" : "ore"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minuti"}`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} ${seconds === 1 ? "secondo" : "secondi"}`);
  if (parts.length === 0) parts.push("meno di 1 minuto");
  return parts.join(" ");
}

function buildGiveawayEmbed(giveaway, options = {}) {
  const { prize, endAt, winnerCount, hostId, hostTag, participants = [], ended, winnerIds = [] } = giveaway;
  const endDate = new Date(endAt);
  const dateStr = endDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hostDisplay = hostId ? `<@${hostId}>` : (hostTag || "—");

  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle(`<a:VC_Events:1448688007438667796> ${prize}`)
    .addFields(
      {
        name: "<a:VC_Calendar:1448670320180592724> Tempo rimanente",
        value: ended ? "Terminato" : `tra ${formatTimeRemaining(endAt)}`,
        inline: true,
      },
      {
        name: "<:VC_EXP:1468714279673925883> Hosted by",
        value: hostTag || "—",
        inline: true,
      }
    )
    .setFooter({
      text: ended ? `Terminato il ${dateStr}` : `${winnerCount} vincitor${winnerCount !== 1 ? "i" : "e"} | Termina il ${dateStr}`,
    });

  if (options.imageUrl) embed.setImage(options.imageUrl);

  return embed;
}

function buildEnterButton(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_ENTER_PREFIX}${giveawayId}`)
      .setLabel("Entra")
      .setStyle(ButtonStyle.Success)
      .setEmoji("<a:VC_Events:1448688007438667796>"),
  );
}

function buildRerollButton(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_REROLL_PREFIX}${giveawayId}`)
      .setLabel("Re-Roll")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Refresh:1473359252276904203>"),
  );
}

async function createGiveaway({ guildId, channelId, hostId, hostTag, prize, durationMs, winnerCount }) {
  const endAt = new Date(Date.now() + durationMs);
  const doc = await Giveaway.create({
    guildId,
    channelId,
    messageId: null,
    prize,
    endAt,
    winnerCount: Math.max(1, Math.min(Number(winnerCount) || 1, 20)),
    hostId,
    hostTag: hostTag || "",
    participants: [],
    ended: false,
  });
  return doc;
}

async function setGiveawayMessageId(giveawayId, messageId) {
  await Giveaway.updateOne({ _id: giveawayId }, { $set: { messageId: String(messageId) } });
}

async function getGiveawayByMessageId(messageId) {
  return Giveaway.findOne({ messageId: String(messageId) }).lean();
}

async function getGiveawayById(id) {
  return Giveaway.findById(id).lean();
}

async function enterGiveaway(interaction, client) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_ENTER_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_ENTER_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Giveaway non trovato o già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo giveaway è già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (new Date(giveaway.endAt).getTime() <= Date.now()) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Il tempo per partecipare è scaduto.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const userId = String(interaction.user?.id || "");
  const wasIn = giveaway.participants && giveaway.participants.includes(userId);
  const updated = await Giveaway.findOneAndUpdate(
    { _id: giveawayId, ended: false },
    { $addToSet: { participants: userId } },
    { new: true },
  );
  if (!updated) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Giveaway non trovato o già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const count = Array.isArray(updated.participants) ? updated.participants.length : 0;
  await interaction.reply({
    content: wasIn
      ? "<a:VC_Alert:1448670089670037675> Sei già iscritto! "
      : "<a:VC_Events:1448688007438667796> Sei entrato nel giveaway!",
    flags: 1 << 6,
  }).catch(() => { });

  return true;
}

function pickWinners(participants, winnerCount) {
  const list = Array.isArray(participants) ? [...participants] : [];
  if (list.length === 0) return [];
  const count = Math.min(winnerCount, list.length);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

const GIVEAWAY_READ_PROJECTION = { participants: 1, winnerCount: 1, channelId: 1, messageId: 1, _id: 1, prize: 1, endAt: 1, hostId: 1, hostTag: 1, ended: 1, winnerIds: 1 };

async function endGiveaway(giveawayId, client) {
  const giveaway = await Giveaway.findOne({ _id: giveawayId }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway || giveaway.ended) return null;

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
  const winnerIds = pickWinners(participants, giveaway.winnerCount);

  await Giveaway.updateOne(
    { _id: giveawayId },
    { $set: { ended: true, winnerIds } },
  );

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.()) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const endedEmbed = buildGiveawayEmbed(
          { ...giveaway, ended: true, winnerIds },
        );
        const rerollRow = buildRerollButton(giveaway._id.toString());
        await msg.edit({ embeds: [endedEmbed], components: [rerollRow] }).catch(() => { });
      }
    } catch (err) {
      global.logger?.warn?.("[giveawayService] end/reroll:", err?.message || err);
    }

    if (winnerIds.length === 1) {
      await channel.send({ content: `<a:VC_Events:1448688007438667796> <@${winnerIds[0]}> ha vinto il giveaway! <a:VC_Winner:1448687700235256009>` }).catch(() => { });
    } else if (winnerIds.length > 1) {
      const mention = winnerIds.map((id) => `<@${id}>`).join(", ");
      await channel.send({ content: `<a:VC_Events:1448688007438667796>${mention} hanno vinto il giveaway! <a:VC_Winner:1448687700235256009>` }).catch(() => { });
    }
  }

  return { winnerIds, participants: participants.length };
}

function pickOneExcluding(participants, excludeIds) {
  const set = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const pool = Array.isArray(participants) ? participants.filter((id) => !set.has(String(id))) : [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function rerollGiveaway(interaction, client) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_REROLL_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_REROLL_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Giveaway non trovato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (!giveaway.ended) {
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Il giveaway non è ancora terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
  const currentWinners = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
  const newWinnerId = pickOneExcluding(participants, currentWinners);
  const newWinnerIds = newWinnerId ? [newWinnerId] : null;

  if (newWinnerIds !== null) {
    await Giveaway.updateOne(
      { _id: giveawayId },
      { $set: { winnerIds: newWinnerIds } },
    );
  }

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.() && newWinnerIds !== null) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const updated = { ...giveaway, winnerIds: newWinnerIds };
        const embed = buildGiveawayEmbed(updated);
        const rerollRow = buildRerollButton(giveawayId);
        await msg.edit({ embeds: [embed], components: [rerollRow] }).catch(() => { });
      }
      await channel.send({ content: `<a:VC_Events:1448688007438667796><@${newWinnerId}> ha vinto il giveaway! <a:VC_Winner:1448687700235256009>` }).catch(() => { });
    } catch (err) {
      global.logger?.warn?.("[giveawayService] end/reroll:", err?.message || err);
    }
  }

  if (newWinnerId) {
    await interaction.reply({
      content: "<a:VC_Alert:1448670089670037675> Re-roll effettuato! Il messaggio con il nuovo vincitore è stato inviato nel canale.",
      flags: 1 << 6,
    }).catch(() => { });
  } else {
    await interaction.reply({
      content: "<a:VC_Alert:1448670089670037675> Nessun altro partecipante disponibile per il re-roll.",
      flags: 1 << 6,
    }).catch(() => { });
  }
  return true;
}

/**
 * Esegue un re-roll per giveaway identificato dal messageId. Usabile dal comando /giveaway reroll.
 * @returns {{ ok: boolean, newWinnerId?: string, error?: string }}
 */
async function rerollGiveawayByMessageId(messageId, client) {
  if (!messageId || !client) return { ok: false, error: "<a:VC_Alert:1448670089670037675> Parametri mancanti." };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: "<a:VC_Alert:1448670089670037675> Giveaway non trovato (messaggio non valido)." };
  if (!giveaway.ended) return { ok: false, error: "<a:VC_Alert:1448670089670037675> Il giveaway non è ancora terminato." };

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
  const currentWinners = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
  const newWinnerId = pickOneExcluding(participants, currentWinners);
  const newWinnerIds = newWinnerId ? [newWinnerId] : null;

  if (newWinnerIds !== null) {
    await Giveaway.updateOne(
      { _id: giveaway._id },
      { $set: { winnerIds: newWinnerIds } },
    );
  }

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.() && newWinnerIds !== null) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const updated = { ...giveaway, winnerIds: newWinnerIds };
        const embed = buildGiveawayEmbed(updated);
        const rerollRow = buildRerollButton(giveaway._id.toString());
        await msg.edit({ embeds: [embed], components: [rerollRow] }).catch(() => {});
      }
      await channel.send({ content: `<a:VC_Events:1448688007438667796><@${newWinnerId}> ha vinto il giveaway! <a:VC_Winner:1448687700235256009>` }).catch(() => {});
    } catch (err) {
      global.logger?.warn?.("[giveawayService] reroll send:", err?.message || err);
    }
  }

  if (newWinnerId) return { ok: true, newWinnerId };
  return { ok: false, error: "<a:VC_Alert:1448670089670037675> Nessun altro partecipante disponibile per il re-roll." };
}

async function runScheduledEnds(client) {
  const now = new Date();
  const list = await Giveaway.find({ ended: false, endAt: { $lte: now } }).lean();
  for (const g of list) {
    await endGiveaway(g._id.toString(), client).catch((err) =>
      global.logger?.warn?.("[Giveaway] endGiveaway failed:", g._id, err?.message),
    );
  }
}

module.exports = { GIVEAWAY_ENTER_PREFIX, GIVEAWAY_REROLL_PREFIX, formatTimeRemaining, parseDuration, buildGiveawayEmbed, buildEnterButton, buildRerollButton, createGiveaway, setGiveawayMessageId, getGiveawayByMessageId, getGiveawayById, enterGiveaway, endGiveaway, rerollGiveaway, rerollGiveawayByMessageId, runScheduledEnds };