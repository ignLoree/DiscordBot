const { EmbedBuilder } = require('discord.js');
const { resolveTarget, extractUserId } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');

const DISCORD_BULK_DELETE_MAX = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function normalizeArgToken(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isMentionToken(raw) {
  return /^<@!?(\d+)>$/.test(String(raw || '').trim());
}

function pickAmountToken(args) {
  if (!Array.isArray(args) || !args.length) {
    return { token: null, invalidToken: null };
  }

  let token = null;
  let invalidToken = null;

  for (const rawArg of args) {
    const raw = String(rawArg || '').trim();
    const normalized = normalizeArgToken(raw);
    if (!normalized) continue;
    if (isMentionToken(raw)) continue;
    if (/^\d{17,20}$/.test(normalized)) continue;
    if (normalized === 'all') {
      token = 'all';
      continue;
    }
    if (/^\d+$/.test(normalized)) {
      token = normalized;
      continue;
    }
    if (invalidToken === null) {
      invalidToken = normalized;
    }
  }

  return { token, invalidToken };
}

module.exports = {
  name: 'purge',

  async execute(message, args, client) {
    await message.channel.sendTyping();

    const userArgIndex = Array.isArray(args)
      ? args.findIndex((arg) => Boolean(extractUserId(String(arg || ''), message)))
      : -1;
    const { user } = await resolveTarget(message, args, userArgIndex >= 0 ? userArgIndex : 0);
    const config = await getModConfig(message.guild.id);

    const deleteLater = (msg) => setTimeout(() => msg.delete().catch(() => {}), 5000);
    const replyTemp = async (payload) => {
      const msg = await message.channel.send({ ...payload, allowedMentions: { repliedUser: false } });
      deleteLater(msg);
      return msg;
    };

    await message.delete().catch(() => {});

    const { token: amountToken, invalidToken } = pickAmountToken(args);
    const requestedRaw = normalizeArgToken(amountToken);
    const requestedAmount = Number(requestedRaw);
    const hasNumericAmount = Number.isFinite(requestedAmount) && requestedAmount > 0;

    if ((requestedRaw && requestedRaw !== 'all' && !hasNumericAmount) || (!requestedRaw && invalidToken)) {
      await replyTemp({ content: '<:vegax:1443934876440068179> Quantità non valida. Usa un numero positivo oppure `all`.' });
      return;
    }

    const targetCount = hasNumericAmount ? requestedAmount : Number.POSITIVE_INFINITY;

    let scanned = 0;
    let cursor = null;
    let rounds = 0;
    const candidates = [];

    while (candidates.length < targetCount) {
      const batch = await message.channel.messages.fetch({
        limit: DISCORD_BULK_DELETE_MAX,
        ...(cursor ? { before: cursor } : {})
      }).catch(() => null);

      if (!batch?.size) break;

      rounds += 1;
      scanned += batch.size;
      cursor = batch.last()?.id || null;

      const filtered = batch.filter((m) => {
        if (m.id === message.id) return false;
        if (m.pinned) return false;
        if (user && m.author?.id !== user.id) return false;
        return true;
      });

      for (const msg of filtered.values()) {
        candidates.push(msg);
        if (candidates.length >= targetCount) break;
      }

      if (!cursor) break;
      if (rounds % 8 === 0) {
        await message.channel.sendTyping().catch(() => {});
      }
    }

    if (!candidates.length) {
      await replyTemp({ content: '<:vegax:1443934876440068179> Nessun messaggio da eliminare.' });
      return;
    }

    const now = Date.now();
    const recent = [];
    const old = [];

    for (const msg of candidates) {
      if (now - msg.createdTimestamp < BULK_DELETE_MAX_AGE_MS) {
        recent.push(msg);
      } else {
        old.push(msg);
      }
    }

    let deletedCount = 0;

    const recentChunks = chunkArray(recent, DISCORD_BULK_DELETE_MAX);
    for (const chunk of recentChunks) {
      const deleted = await message.channel.bulkDelete(chunk, true).catch(() => null);
      if (deleted?.size) deletedCount += deleted.size;
      await sleep(250);
    }

    for (const msg of old) {
      const ok = await msg.delete().then(() => true).catch(() => false);
      if (ok) deletedCount += 1;
      await sleep(400);
    }

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'PURGE',
      userId: user ? user.id : `CHANNEL:${message.channel.id}`,
      modId: message.author.id,
      reason: user
        ? `Purge ${deletedCount} messaggi di ${user.tag}`
        : `Purge ${deletedCount} messaggi in #${message.channel.name}`,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    const summary = new EmbedBuilder()
      .setColor(client.config?.embedModLight || '#6f4e37')
      .setDescription(
        `<a:VC_Channel:1448670215444631706> Canale: <#${message.channel.id}>\n` +
        `<a:VC_Staff:1448670376736456787> Staffer: <@${message.author.id}>\n` +
        `<:VC_Chat:1448694742237053061> Messaggi scansionati: ${scanned}\n` +
        `<:VC_Stats:1448695844923510884> Richiesta: ${Number.isFinite(targetCount) ? targetCount : 'ALL'}\n` +
        `<:VC_Search:1460657088899584265> Messaggi identificati: ${candidates.length}\n` +
        `<:VC_Trash:1460645075242451025> Messaggi cancellati: ${deletedCount}\n` +
        `<:dot:1443660294596329582> Bulk (<14 giorni): ${recent.length}\n` +
        `<:dot:1443660294596329582> Singoli (>=14 giorni): ${old.length}`
      );

    await replyTemp({ embeds: [summary] });
  }
};
