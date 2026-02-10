const { ActivityUser } = require('../../Schemas/Community/communitySchemas');
const { addExpWithLevel, MESSAGE_EXP, VOICE_EXP_PER_MINUTE, shouldIgnoreExpForMember } = require('./expService');
const IDs = require('../../Utils/Config/ids');

const TIME_ZONE = 'Europe/Rome';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday
  };
}

function getDayKey(date) {
  const { year, month, day } = getTimeParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

function ensureMessageKeys(doc, now) {
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  if (doc.messages.dailyKey !== dayKey) {
    doc.messages.dailyKey = dayKey;
    doc.messages.daily = 0;
  }
  if (doc.messages.weeklyKey !== weekKey) {
    doc.messages.weeklyKey = weekKey;
    doc.messages.weekly = 0;
  }
}

function ensureVoiceKeys(doc, now) {
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  if (doc.voice.dailyKey !== dayKey) {
    doc.voice.dailyKey = dayKey;
    doc.voice.dailySeconds = 0;
  }
  if (doc.voice.weeklyKey !== weekKey) {
    doc.voice.weeklyKey = weekKey;
    doc.voice.weeklySeconds = 0;
  }
}

async function recordMessageActivity(message) {
  if (!message?.guild || !message.author || message.author.bot) return;
  const roleId = IDs.roles.verifiedUser;
  const role = message.guild.roles.cache.get(roleId);
  if (!role) return;
  const permissions = message.channel?.permissionsFor?.(role);
  if (!permissions) return;
  if (!permissions.has(['ViewChannel', 'SendMessages'])) return;
  const now = new Date();
  let doc = await ActivityUser.findOne({ guildId: message.guild.id, userId: message.author.id });
  if (!doc) {
    doc = new ActivityUser({ guildId: message.guild.id, userId: message.author.id });
  }
  ensureMessageKeys(doc, now);
  doc.messages.total = Number(doc.messages.total || 0) + 1;
  doc.messages.daily = Number(doc.messages.daily || 0) + 1;
  doc.messages.weekly = Number(doc.messages.weekly || 0) + 1;
  await doc.save();
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  const ignored = await shouldIgnoreExpForMember({
    guildId: message.guild.id,
    member,
    channelId: message.channel?.id || message.channelId || null
  });
  if (!ignored) {
    await addExpWithLevel(message.guild, message.author.id, MESSAGE_EXP, true);
  }
}

async function recordVoiceSessionEnd(doc, now, guild, skipExp = false) {
  const startedAt = doc.voice.sessionStartedAt;
  if (!startedAt) return;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  ensureVoiceKeys(doc, now);
  doc.voice.totalSeconds = Number(doc.voice.totalSeconds || 0) + elapsedSeconds;
  doc.voice.dailySeconds = Number(doc.voice.dailySeconds || 0) + elapsedSeconds;
  doc.voice.weeklySeconds = Number(doc.voice.weeklySeconds || 0) + elapsedSeconds;
  doc.voice.sessionStartedAt = null;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (!skipExp && minutes > 0) {
    await addExpWithLevel(guild, doc.userId, minutes * VOICE_EXP_PER_MINUTE, true);
  }
}

function canRoleUseVoiceChannel(channel, role) {
  if (!channel || !role) return false;
  const permissions = channel.permissionsFor(role);
  if (!permissions) return false;
  return permissions.has(['ViewChannel', 'Connect', 'Speak']);
}

async function handleVoiceActivity(oldState, newState) {
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const guildId = newState?.guild?.id || oldState?.guild?.id;
  const userId = member.id;
  if (!guildId || !userId) return;

  const now = new Date();
  const wasInVoice = Boolean(oldState?.channelId);
  const isInVoice = Boolean(newState?.channelId);
  const roleId = IDs.roles.verifiedUser;
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return;

  let doc = await ActivityUser.findOne({ guildId, userId });
  if (!doc) {
    doc = new ActivityUser({ guildId, userId });
  }

  if (wasInVoice && !isInVoice) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    if (!canRoleUseVoiceChannel(oldChannel, role)) {
      doc.voice.sessionStartedAt = null;
      await doc.save();
      return;
    }
    const ignored = await shouldIgnoreExpForMember({
      guildId,
      member,
      channelId: oldChannel?.id || null
    });
    await recordVoiceSessionEnd(doc, now, member.guild, ignored);
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId !== newState.channelId) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    if (canRoleUseVoiceChannel(oldChannel, role)) {
      const ignored = await shouldIgnoreExpForMember({
        guildId,
        member,
        channelId: oldChannel?.id || null
      });
      await recordVoiceSessionEnd(doc, now, member.guild, ignored);
    } else {
      doc.voice.sessionStartedAt = null;
    }
    const newChannel = newState?.channel || newState?.guild?.channels?.cache?.get(newState.channelId);
    if (canRoleUseVoiceChannel(newChannel, role)) {
      doc.voice.sessionStartedAt = now;
    }
    await doc.save();
    return;
  }

  if (!wasInVoice && isInVoice) {
    const newChannel = newState?.channel || newState?.guild?.channels?.cache?.get(newState.channelId);
    if (!canRoleUseVoiceChannel(newChannel, role)) return;
    doc.voice.sessionStartedAt = now;
    await doc.save();
  }
}

async function getUserActivityStats(guildId, userId) {
  const now = new Date();
  let doc = await ActivityUser.findOne({ guildId, userId });
  if (!doc) {
    doc = new ActivityUser({ guildId, userId });
  }
  ensureMessageKeys(doc, now);
  ensureVoiceKeys(doc, now);

  let liveVoiceSeconds = 0;
  if (doc.voice.sessionStartedAt) {
    liveVoiceSeconds = Math.max(0, Math.floor((now.getTime() - new Date(doc.voice.sessionStartedAt).getTime()) / 1000));
  }

  await doc.save();

  return {
    messages: {
      daily: Number(doc.messages.daily || 0),
      weekly: Number(doc.messages.weekly || 0),
      total: Number(doc.messages.total || 0)
    },
    voice: {
      dailySeconds: Number(doc.voice.dailySeconds || 0) + liveVoiceSeconds,
      weeklySeconds: Number(doc.voice.weeklySeconds || 0) + liveVoiceSeconds,
      totalSeconds: Number(doc.voice.totalSeconds || 0) + liveVoiceSeconds
    }
  };
}

module.exports = {
  recordMessageActivity,
  handleVoiceActivity,
  getUserActivityStats
};



