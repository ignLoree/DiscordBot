const MessageStat = require("../../Schemas/Stats/messageStatSchema");
const VoiceStat = require("../../Schemas/Stats/voiceStatSchema");
const VoiceSession = require("../../Schemas/Stats/voiceSessionSchema");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dayKeyFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildRecentDayKeys(days) {
  const today = new Date();
  const list = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    list.push(dayKeyFromDate(d));
  }
  return list;
}

async function recordMessage(message) {
  if (!message?.guild || !message?.author || message.author.bot) return;
  const dateKey = dayKeyFromDate(message.createdAt || new Date());
  await MessageStat.updateOne(
    {
      guildId: message.guild.id,
      date: dateKey,
      channelId: message.channel.id,
      userId: message.author.id
    },
    {
      $inc: { count: 1 },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}

async function applyVoiceDuration({ guildId, channelId, userId, startedAt, endedAt }) {
  if (!guildId || !channelId || !userId || !startedAt || !endedAt) return;
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (!(start < end)) return;
  let cursor = new Date(start);
  while (cursor < end) {
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const segmentEnd = end < nextMidnight ? end : nextMidnight;
    const seconds = Math.max(0, (segmentEnd - cursor) / 1000);
    if (seconds >= 1) {
      const dateKey = dayKeyFromDate(cursor);
      await VoiceStat.updateOne(
        { guildId, date: dateKey, channelId, userId },
        { $inc: { seconds }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    }
    cursor = segmentEnd;
  }
}

async function closeVoiceSession(guildId, userId, fallbackChannelId) {
  const session = await VoiceSession.findOne({ guildId, userId });
  if (!session) return;
  await VoiceSession.deleteOne({ _id: session._id });
  const channelId = session.channelId || fallbackChannelId;
  await applyVoiceDuration({
    guildId,
    channelId,
    userId,
    startedAt: session.startedAt,
    endedAt: new Date()
  });
}

async function startVoiceSession(guildId, userId, channelId) {
  if (!guildId || !userId || !channelId) return;
  await VoiceSession.updateOne(
    { guildId, userId },
    { $set: { channelId, startedAt: new Date() } },
    { upsert: true }
  );
}

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const guildId = (newState?.guild || oldState?.guild)?.id;
  if (!guildId) return;
  const userId = member.id;
  const oldChannelId = oldState?.channelId || null;
  const newChannelId = newState?.channelId || null;

  if (oldChannelId === newChannelId) return;

  if (oldChannelId && !newChannelId) {
    await closeVoiceSession(guildId, userId, oldChannelId);
    return;
  }

  if (!oldChannelId && newChannelId) {
    await startVoiceSession(guildId, userId, newChannelId);
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    await closeVoiceSession(guildId, userId, oldChannelId);
    await startVoiceSession(guildId, userId, newChannelId);
  }
}

async function aggregateTotalsByDate(model, match, valueField) {
  const rows = await model.aggregate([
    { $match: match },
    { $group: { _id: "$date", total: { $sum: `$${valueField}` } } }
  ]);
  const out = new Map();
  for (const row of rows) {
    out.set(row._id, row.total || 0);
  }
  return out;
}

async function aggregateTopByField(model, match, groupField, valueField) {
  const rows = await model.aggregate([
    { $match: match },
    { $group: { _id: `$${groupField}`, total: { $sum: `$${valueField}` } } },
    { $sort: { total: -1 } },
    { $limit: 1 }
  ]);
  if (!rows.length) return null;
  return { id: rows[0]._id, total: rows[0].total || 0 };
}

async function getContributorsCount(match) {
  const [msgUsers, voiceUsers] = await Promise.all([
    MessageStat.distinct("userId", match),
    VoiceStat.distinct("userId", match)
  ]);
  const set = new Set([...(msgUsers || []), ...(voiceUsers || [])]);
  return set.size;
}

async function buildServerStats(guild, days = 14) {
  const dayKeys = buildRecentDayKeys(days);
  const baseMatch = { guildId: guild.id, date: { $in: dayKeys } };

  const [messageByDate, voiceByDate] = await Promise.all([
    aggregateTotalsByDate(MessageStat, baseMatch, "count"),
    aggregateTotalsByDate(VoiceStat, baseMatch, "seconds")
  ]);

  const messageSeries = dayKeys.map((key) => messageByDate.get(key) || 0);
  const voiceSeries = dayKeys.map((key) => voiceByDate.get(key) || 0);

  const last1 = dayKeys.slice(-1);
  const last7 = dayKeys.slice(-7);
  const last14 = dayKeys;

  const sumRange = (series, keys) => {
    let total = 0;
    for (const key of keys) {
      const index = dayKeys.indexOf(key);
      if (index >= 0) total += series[index] || 0;
    }
    return total;
  };

  const [contributors1, contributors7, contributors14] = await Promise.all([
    getContributorsCount({ guildId: guild.id, date: { $in: last1 } }),
    getContributorsCount({ guildId: guild.id, date: { $in: last7 } }),
    getContributorsCount({ guildId: guild.id, date: { $in: last14 } })
  ]);

  const [topMsgUser, topVoiceUser, topMsgChannel, topVoiceChannel] = await Promise.all([
    aggregateTopByField(MessageStat, baseMatch, "userId", "count"),
    aggregateTopByField(VoiceStat, baseMatch, "userId", "seconds"),
    aggregateTopByField(MessageStat, baseMatch, "channelId", "count"),
    aggregateTopByField(VoiceStat, baseMatch, "channelId", "seconds")
  ]);

  return {
    dayKeys,
    messageSeries,
    voiceSeries,
    totals: {
      messages: {
        d1: sumRange(messageSeries, last1),
        d7: sumRange(messageSeries, last7),
        d14: sumRange(messageSeries, last14)
      },
      voiceSeconds: {
        d1: sumRange(voiceSeries, last1),
        d7: sumRange(voiceSeries, last7),
        d14: sumRange(voiceSeries, last14)
      }
    },
    contributors: {
      d1: contributors1,
      d7: contributors7,
      d14: contributors14
    },
    top: {
      messageUser: topMsgUser,
      voiceUser: topVoiceUser,
      messageChannel: topMsgChannel,
      voiceChannel: topVoiceChannel
    }
  };
}

module.exports = {
  recordMessage,
  handleVoiceStateUpdate,
  buildServerStats,
  buildRecentDayKeys,
  dayKeyFromDate
};
