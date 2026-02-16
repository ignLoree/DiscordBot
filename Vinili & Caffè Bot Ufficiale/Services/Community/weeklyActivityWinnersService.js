const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const { ActivityUser } = require('../../Schemas/Community/communitySchemas');
const { ExpUser } = require('../../Schemas/Community/communitySchemas');
const { VOICE_EXP_PER_MINUTE } = require('./expService');
const IDs = require('../../Utils/Config/ids');

const TIME_ZONE = 'Europe/Rome';
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const INFO_CHANNEL_ID = IDs.channels.info;
const TROPHY_LABELS = [
  '<:VC_Podio1:1469659449974329598>',
  '<:VC_Podio2:1469659512863592500>',
  '<:VC_Podio3:1469659557696504024>'
];
const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const EXCLUDED_ROLE_IDS = new Set([
  IDs.roles.Staff,
  IDs.roles.PartnerManager
]);

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getWeekKey(date) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getNextWeekKey(date) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getWeekKey(next);
}

function getWeekdayRome(date) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' });
  return formatter.format(date);
}

function buildEmptyLine(kind) {
  return ` •  Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || '[#]';
  return `${medal} ${userMention} <a:VC_Arrow:1448672967721615452> **${value}** *${unit}*`;
}

async function resolveTopThreeUsers(client, guild, docs, valueGetter) {
  const out = [];
  for (const doc of docs) {
    if (out.length >= 3) break;
    const userId = String(doc.userId || '');
    if (!userId) continue;

    let user = client.users.cache.get(userId) || null;
    if (!user) {
      user = await client.users.fetch(userId).catch(() => null);
    }
    if (!user || user.bot) continue;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    const hasExcludedRole = Array.from(EXCLUDED_ROLE_IDS).some((roleId) => member.roles.cache.has(roleId));
    if (hasExcludedRole) continue;

    out.push({
      userId,
      value: valueGetter(doc)
    });
  }
  return out;
}

function getLiveWeeklyVoiceSeconds(doc, now) {
  const base = Number(doc?.voice?.weeklySeconds || 0);
  const startedAt = doc?.voice?.sessionStartedAt ? new Date(doc.voice.sessionStartedAt).getTime() : null;
  if (!startedAt) return base;

  const elapsed = Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
  return base + elapsed;
}

async function removeRoleFromAllMembers(guild, roleId) {
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;

  for (const member of role.members.values()) {
    await member.roles.remove(roleId).catch(() => { });
  }
}

async function assignRoleToUser(guild, userId, roleId) {
  if (!userId || !roleId) return false;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  await member.roles.add(roleId).catch(() => { });
  return true;
}

function pickFirstAvailable(ranking, excludedUserIds = new Set()) {
  for (const row of ranking) {
    if (!row?.userId) continue;
    if (excludedUserIds.has(row.userId)) continue;
    return row;
  }
  return null;
}

async function updateWeeklyWinnerRoles(guild, topMessages, topVoice) {
  await Promise.all([
    removeRoleFromAllMembers(guild, MESSAGE_WINNER_ROLE_ID),
    removeRoleFromAllMembers(guild, VOICE_WINNER_ROLE_ID)
  ]);

  const chosenUserIds = new Set();
  const messageWinner = pickFirstAvailable(topMessages, chosenUserIds);
  if (messageWinner) chosenUserIds.add(messageWinner.userId);

  const voiceWinner = pickFirstAvailable(topVoice, chosenUserIds);
  if (voiceWinner) chosenUserIds.add(voiceWinner.userId);

  await Promise.all([
    assignRoleToUser(guild, messageWinner?.userId, MESSAGE_WINNER_ROLE_ID),
    assignRoleToUser(guild, voiceWinner?.userId, VOICE_WINNER_ROLE_ID)
  ]);

  return { messageWinner, voiceWinner };
}

async function publishWeeklyActivityWinners(client, options = {}) {
  const channel = client.channels.cache.get(TARGET_CHANNEL_ID)
    || await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.guild) return;

  const guild = channel.guild;
  const now = new Date();
  const currentWeekKey = options.weekKey != null ? options.weekKey : getWeekKey(now);

  const [messageDocs, voiceDocs] = await Promise.all([
    ActivityUser.find({
      guildId: guild.id,
      'messages.weeklyKey': currentWeekKey,
      'messages.weekly': { $gt: 0 }
    })
      .sort({ 'messages.weekly': -1 })
      .limit(60)
      .lean(),
    ActivityUser.find({
      guildId: guild.id,
      'voice.weeklyKey': currentWeekKey,
      $or: [
        { 'voice.weeklySeconds': { $gt: 0 } },
        { 'voice.sessionStartedAt': { $ne: null } }
      ]
    })
      .sort({ 'voice.weeklySeconds': -1 })
      .limit(60)
      .lean()
  ]);

  const topMessages = await resolveTopThreeUsers(client, guild, messageDocs, (doc) => Number(doc?.messages?.weekly || 0));

  const topVoice = await resolveTopThreeUsers(client, guild, voiceDocs, (doc) => {
    const weeklySeconds = getLiveWeeklyVoiceSeconds(doc, now);
    return Math.floor((weeklySeconds / 60) * VOICE_EXP_PER_MINUTE);
  });

  const messageRows = topMessages.length
    ? topMessages.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, 'messaggi'))
    : [buildEmptyLine('messaggi')];

  const voiceRows = topVoice.length
    ? topVoice.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, 'exp'))
    : [buildEmptyLine('exp')];

  const awarded = await updateWeeklyWinnerRoles(guild, topMessages, topVoice);

  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription([
      `<:VC_Leaderboard:1469659357678669958> // I vantaggi che avete sbloccato sono in "badge" nel canale <#${INFO_CHANNEL_ID}>`,
      '',
      `<a:VC_HeartsBlue:1468686100045369404> • **Classifica testuale:**`,
      ...messageRows,
      '',
      `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
      ...voiceRows,
    ].join('\n'))
    .setThumbnail(guild.iconURL({ size: 256 }) || null);

  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId ? `<@${awarded.messageWinner.userId}>` : 'Nessun vincitore';
  const voiceWinnerMention = awarded?.voiceWinner?.userId ? `<@${awarded.voiceWinner.userId}>` : 'Nessun vincitore';

  const button = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setLabel(`Chat`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('<:VC_FrogCute:1331620415185096746>')
      .setLink(`https://discord.com/channels/1329080093599076474/1442569130573303898`),
    new ButtonBuilder()
      .setLabel(`Vocal`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('<:VC_FrogJuice:1331620486517358613>')
      .setLink(`https://discord.com/channels/1329080093599076474/1442569101225496819`)
  )

  await channel.send({
    content: `<@&1442568949605597264>
<a:VC_Winner:1448687700235256009> Ciao a tutti! Annunciamo i vincitori di questa settimana per attività <a:VC_StarPink:1330194976440848500>

<a:VC_Arrow:1448672967721615452> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__**!
<a:VC_Arrow:1448672967721615452> Con un totale di **${voiceWinnerTotal} exp**, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__**!
_ _`, embeds: [embed], components: [button] }).catch((error) => {
    global.logger.error('[WEEKLY ACTIVITY] Failed to send winners message:', error);
  });
}

async function resetWeeklyActivityCounters(client, options = {}) {
  const channel = client.channels.cache.get(TARGET_CHANNEL_ID)
    || await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
  const guildId = channel?.guild?.id;
  if (!guildId) return;

  const now = new Date();
  const nextWeekKey = options.nextWeekKey != null ? options.nextWeekKey : getNextWeekKey(now);

  await Promise.all([
    ActivityUser.updateMany(
      { guildId },
      {
        $set: {
          'messages.weekly': 0,
          'messages.weeklyKey': nextWeekKey,
          'voice.weeklySeconds': 0,
          'voice.weeklyKey': nextWeekKey
        }
      }
    ),
    ExpUser.updateMany(
      { guildId },
      {
        $set: {
          weeklyExp: 0,
          weeklyKey: nextWeekKey
        }
      }
    )
  ]);
}

function startWeeklyActivityWinnersLoop(client) {
  cron.schedule('0 21 * * 0', async () => {
    try {
      await publishWeeklyActivityWinners(client);
      await resetWeeklyActivityCounters(client);
    } catch (error) {
      global.logger.error('[WEEKLY ACTIVITY] Scheduled execution failed:', error);
    }
  }, { timezone: TIME_ZONE });

  const runRecoveryIfNeeded = async () => {
    const now = new Date();
    const weekday = getWeekdayRome(now);
    if (weekday !== 'Mon' && weekday !== 'Tue') return;
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID) || await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    const guildId = channel?.guild?.id;
    if (!guildId) return;
    const currentWeekKey = getWeekKey(now);
    const alreadyReset = await ActivityUser.exists({ guildId, 'messages.weeklyKey': currentWeekKey }).catch(() => false);
    if (alreadyReset) return;
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const previousWeekKey = getWeekKey(yesterday);
    if (previousWeekKey === currentWeekKey) return;
    try {
      global.logger.info('[WEEKLY ACTIVITY] Recovery: running missed weekly winners (bot was likely offline Sunday 21:00).');
      await publishWeeklyActivityWinners(client, { weekKey: previousWeekKey });
      await resetWeeklyActivityCounters(client, { nextWeekKey: currentWeekKey });
    } catch (error) {
      global.logger.error('[WEEKLY ACTIVITY] Recovery run failed:', error);
    }
  };

  runRecoveryIfNeeded();
}

module.exports = {
  startWeeklyActivityWinnersLoop,
  publishWeeklyActivityWinners,
  resetWeeklyActivityCounters
};




