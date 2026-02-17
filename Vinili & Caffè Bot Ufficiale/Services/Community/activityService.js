const {
  ActivityUser,
  ActivityDaily,
  ActivityHourly,
} = require("../../Schemas/Community/communitySchemas");
const {
  addExpWithLevel,
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
  shouldIgnoreExpForMember,
} = require("./expService");

const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_HOUR_SUFFIX = "T12";
const HOURLY_BACKFILL_BATCH = 500;
const hourlyBackfillByGuild = new Map();

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
  };
}

function getDayKey(date) {
  const { year, month, day } = getTimeParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

function getLastNDaysKeys(days) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 7)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeDays; i += 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    keys.push(getDayKey(d));
  }
  return keys;
}

function getLastNHourKeys(hours) {
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours || 24)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeHours; i += 1) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    keys.push(getHourKey(d));
  }
  return keys;
}

function chunkArray(items = [], size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sanitizeChannelsMap(raw = {}) {
  const out = {};
  for (const [channelId, value] of Object.entries(raw || {})) {
    const amount = Math.max(0, Number(value || 0));
    if (!channelId || amount <= 0) continue;
    out[String(channelId)] = amount;
  }
  return out;
}

async function ensureHourlyBackfillForGuild(guildId) {
  const safeGuildId = String(guildId || "");
  if (!safeGuildId) return false;

  if (hourlyBackfillByGuild.has(safeGuildId)) {
    return hourlyBackfillByGuild.get(safeGuildId);
  }

  const task = (async () => {
    const dailyRows = await ActivityDaily.find({ guildId: safeGuildId })
      .select("guildId dateKey userId textCount voiceSeconds textChannels voiceChannels")
      .lean()
      .catch(() => []);

    if (!dailyRows.length) return false;

    const operations = [];
    for (const row of dailyRows) {
      const dateKey = String(row?.dateKey || "");
      const userId = String(row?.userId || "");
      if (!dateKey || !userId) continue;
      const hourKey = `${dateKey}${BACKFILL_HOUR_SUFFIX}`;
      const textChannels = sanitizeChannelsMap(row?.textChannels || {});
      const voiceChannels = sanitizeChannelsMap(row?.voiceChannels || {});
      operations.push({
        updateOne: {
          filter: { guildId: safeGuildId, hourKey, userId },
          update: {
            $setOnInsert: {
              guildId: safeGuildId,
              hourKey,
              userId,
              textCount: Math.max(0, Number(row?.textCount || 0)),
              voiceSeconds: Math.max(0, Number(row?.voiceSeconds || 0)),
              textChannels,
              voiceChannels,
            },
          },
          upsert: true,
        },
      });
    }

    if (!operations.length) return false;

    const chunks = chunkArray(operations, HOURLY_BACKFILL_BATCH);
    let insertedCount = 0;
    for (const ops of chunks) {
      const result = await ActivityHourly.bulkWrite(ops, { ordered: false }).catch(
        () => null,
      );
      insertedCount += Number(result?.upsertedCount || 0);
    }
    return insertedCount > 0;
  })()
    .catch((error) => {
      global.logger?.warn?.(
        `[ACTIVITY] Hourly backfill failed for guild ${safeGuildId}:`,
        error?.message || error,
      );
      return false;
    })
    .finally(() => {
      hourlyBackfillByGuild.delete(safeGuildId);
    });

  hourlyBackfillByGuild.set(safeGuildId, task);
  return task;
}

async function bumpDailyText(guildId, userId, channelId, amount = 1) {
  const inc = Math.max(0, Number(amount || 0));
  if (!guildId || !userId || !channelId || !inc) return;
  const dateKey = getDayKey(new Date());
  await ActivityDaily.updateOne(
    { guildId, dateKey, userId },
    {
      $inc: {
        textCount: inc,
        [`textChannels.${channelId}`]: inc,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function bumpHourlyText(guildId, userId, channelId, amount = 1) {
  const inc = Math.max(0, Number(amount || 0));
  if (!guildId || !userId || !channelId || !inc) return;
  const hourKey = getHourKey(new Date());
  await ActivityHourly.updateOne(
    { guildId, hourKey, userId },
    {
      $inc: {
        textCount: inc,
        [`textChannels.${channelId}`]: inc,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function bumpDailyVoice(guildId, userId, channelId, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!guildId || !userId || !channelId || !inc) return;
  const dateKey = getDayKey(new Date());
  await ActivityDaily.updateOne(
    { guildId, dateKey, userId },
    {
      $inc: {
        voiceSeconds: inc,
        [`voiceChannels.${channelId}`]: inc,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function bumpHourlyVoice(guildId, userId, channelId, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!guildId || !userId || !channelId || !inc) return;
  const hourKey = getHourKey(new Date());
  await ActivityHourly.updateOne(
    { guildId, hourKey, userId },
    {
      $inc: {
        voiceSeconds: inc,
        [`voiceChannels.${channelId}`]: inc,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

function getWeekKey(date) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr =
    1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function ensureMessageKeys(doc, now) {
  ensureTimedCounters(doc.messages, now, {
    dailyKey: "dailyKey",
    dailyCount: "daily",
    weeklyKey: "weeklyKey",
    weeklyCount: "weekly",
  });
}

function ensureVoiceKeys(doc, now) {
  ensureTimedCounters(doc.voice, now, {
    dailyKey: "dailyKey",
    dailyCount: "dailySeconds",
    weeklyKey: "weeklyKey",
    weeklyCount: "weeklySeconds",
  });
}

function ensureTimedCounters(target, now, keys) {
  if (!target) return;
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  if (target[keys.dailyKey] !== dayKey) {
    target[keys.dailyKey] = dayKey;
    target[keys.dailyCount] = 0;
  }
  if (target[keys.weeklyKey] !== weekKey) {
    target[keys.weeklyKey] = weekKey;
    target[keys.weeklyCount] = 0;
  }
}

async function getOrCreateActivityUser(guildId, userId) {
  let doc = await ActivityUser.findOne({ guildId, userId });
  if (!doc) {
    doc = new ActivityUser({ guildId, userId });
  }
  return doc;
}

async function recordMessageActivity(message) {
  if (!message?.guild || !message.author || message.author.bot) return;
  const now = new Date();
  const doc = await getOrCreateActivityUser(
    message.guild.id,
    message.author.id,
  );
  ensureMessageKeys(doc, now);
  doc.messages.total = Number(doc.messages.total || 0) + 1;
  doc.messages.daily = Number(doc.messages.daily || 0) + 1;
  doc.messages.weekly = Number(doc.messages.weekly || 0) + 1;
  await doc.save();
  await bumpDailyText(
    message.guild.id,
    message.author.id,
    message.channelId,
    1,
  );
  await bumpHourlyText(
    message.guild.id,
    message.author.id,
    message.channelId,
    1,
  );
  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const ignored = await shouldIgnoreExpForMember({
    guildId: message.guild.id,
    member,
    channelId: message.channel?.id || message.channelId || null,
  });
  if (!ignored) {
    await addExpWithLevel(message.guild, message.author.id, MESSAGE_EXP, true);
  }
}

async function recordVoiceSessionEnd(doc, now, guild, skipExp = false) {
  const startedAt = doc.voice.sessionStartedAt;
  if (!startedAt) return 0;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),
  );
  ensureVoiceKeys(doc, now);
  doc.voice.totalSeconds = Number(doc.voice.totalSeconds || 0) + elapsedSeconds;
  doc.voice.dailySeconds = Number(doc.voice.dailySeconds || 0) + elapsedSeconds;
  doc.voice.weeklySeconds =
    Number(doc.voice.weeklySeconds || 0) + elapsedSeconds;
  doc.voice.sessionStartedAt = null;
  doc.voice.sessionChannelId = null;
  const alreadyAwardedSeconds = Math.max(
    0,
    Number(doc.voice.expAwardedSeconds || 0),
  );
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  const alreadyAwardedMinutes = Math.floor(alreadyAwardedSeconds / 60);
  const remainingMinutes = Math.max(0, totalMinutes - alreadyAwardedMinutes);
  doc.voice.expAwardedSeconds = 0;
  if (!skipExp && remainingMinutes > 0) {
    await addExpWithLevel(
      guild,
      doc.userId,
      remainingMinutes * VOICE_EXP_PER_MINUTE,
      true,
    );
  }
  return elapsedSeconds;
}

function isCountableVoiceState(state) {
  if (!state?.channelId) return false;

  if (state.selfMute && state.selfDeaf) return false;
  return true;
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
  const wasCountable = isCountableVoiceState(oldState);
  const isCountable = isCountableVoiceState(newState);

  let doc = await getOrCreateActivityUser(guildId, userId);

  if (wasInVoice && !isInVoice) {
    const oldChannel =
      oldState?.channel ||
      oldState?.guild?.channels?.cache?.get(oldState.channelId);
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({
        guildId,
        member,
        channelId: oldChannel?.id || null,
      });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      doc.voice.sessionStartedAt = null;
      doc.voice.sessionChannelId = null;
      doc.voice.expAwardedSeconds = 0;
    }
    if (oldChannel?.id) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, elapsedSeconds);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, elapsedSeconds);
    }
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId !== newState.channelId) {
    const oldChannel =
      oldState?.channel ||
      oldState?.guild?.channels?.cache?.get(oldState.channelId);
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({
        guildId,
        member,
        channelId: oldChannel?.id || null,
      });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      doc.voice.sessionStartedAt = null;
      doc.voice.sessionChannelId = null;
      doc.voice.expAwardedSeconds = 0;
    }
    if (oldChannel?.id) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, elapsedSeconds);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, elapsedSeconds);
    }
    doc.voice.sessionStartedAt = isCountable ? now : null;
    doc.voice.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.voice.expAwardedSeconds = 0;
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId === newState.channelId) {
    if (wasCountable && !isCountable) {
      const channel =
        oldState?.channel ||
        newState?.channel ||
        newState?.guild?.channels?.cache?.get(newState.channelId);
      const ignored = await shouldIgnoreExpForMember({
        guildId,
        member,
        channelId: channel?.id || null,
      });
      const elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
      if (channel?.id) {
        await bumpDailyVoice(guildId, userId, channel.id, elapsedSeconds);
        await bumpHourlyVoice(guildId, userId, channel.id, elapsedSeconds);
      }
      await doc.save();
      return;
    }

    if (!wasCountable && isCountable) {
      doc.voice.sessionStartedAt = now;
      doc.voice.sessionChannelId = String(newState?.channelId || "");
      doc.voice.expAwardedSeconds = 0;
      await doc.save();
      return;
    }
  }

  if (!wasInVoice && isInVoice) {
    doc.voice.sessionStartedAt = isCountable ? now : null;
    doc.voice.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.voice.expAwardedSeconds = 0;
    await doc.save();
    return;
  }
}

async function getUserActivityStats(guildId, userId) {
  const now = new Date();
  let doc = await getOrCreateActivityUser(guildId, userId);
  ensureMessageKeys(doc, now);
  ensureVoiceKeys(doc, now);

  let liveVoiceSeconds = 0;
  if (doc.voice.sessionStartedAt) {
    liveVoiceSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(doc.voice.sessionStartedAt).getTime()) / 1000,
      ),
    );
  }

  await doc.save();

  return {
    messages: {
      daily: Number(doc.messages.daily || 0),
      weekly: Number(doc.messages.weekly || 0),
      total: Number(doc.messages.total || 0),
    },
    voice: {
      dailySeconds: Number(doc.voice.dailySeconds || 0) + liveVoiceSeconds,
      weeklySeconds: Number(doc.voice.weeklySeconds || 0) + liveVoiceSeconds,
      totalSeconds: Number(doc.voice.totalSeconds || 0) + liveVoiceSeconds,
    },
  };
}

function safeTopRank(map, targetId) {
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const index = rows.findIndex(([id]) => String(id) === String(targetId));
  return index >= 0 ? index + 1 : null;
}

function aggregateUserRows(rows = [], dateKeys = []) {
  const dateSet = new Set(Array.isArray(dateKeys) ? dateKeys : []);
  const channelText = new Map();
  const channelVoice = new Map();
  const chartByDay = new Map();
  let text = 0;
  let voiceSeconds = 0;

  for (const row of rows) {
    const dayKey = String(row?.dateKey || "");
    if (!dateSet.has(dayKey)) continue;
    const rowText = Number(row?.textCount || 0);
    const rowVoice = Number(row?.voiceSeconds || 0);
    text += rowText;
    voiceSeconds += rowVoice;

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }

    const current = chartByDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    current.text += rowText;
    current.voiceSeconds += rowVoice;
    chartByDay.set(dayKey, current);
  }

  return {
    text,
    voiceSeconds,
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
    chartByDay,
  };
}

function pushMapValue(target, key, amount) {
  if (!key || !Number.isFinite(amount) || amount <= 0) return;
  target.set(key, (target.get(key) || 0) + amount);
}

function topNFromMap(map, n = 3) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, value]) => ({ id, value }));
}

function toMapFromTopList(list = []) {
  const out = new Map();
  for (const row of Array.isArray(list) ? list : []) {
    const id = String(row?.id || "");
    const value = Number(row?.value || 0);
    if (!id || value <= 0) continue;
    out.set(id, (out.get(id) || 0) + value);
  }
  return out;
}

function secondsInLastNDays(startedAt, days, nowMs = Date.now()) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 1)));
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const windowStartMs = nowMs - safeDays * DAY_MS;
  const effectiveStartMs = Math.max(startMs, windowStartMs);
  if (effectiveStartMs >= nowMs) return 0;
  return Math.max(0, Math.floor((nowMs - effectiveStartMs) / 1000));
}

async function loadLiveVoiceSessions(guildId) {
  const docs = await ActivityUser.find({
    guildId,
    "voice.sessionStartedAt": { $ne: null },
  })
    .select("userId voice.sessionStartedAt voice.sessionChannelId")
    .lean()
    .catch(() => []);
  return Array.isArray(docs) ? docs : [];
}

async function getLiveVoiceOverlay(guildId, days = null) {
  const userVoice = new Map();
  const channelVoice = new Map();
  let totalVoiceSeconds = 0;
  const rows = await loadLiveVoiceSessions(guildId);
  if (!rows.length) return { userVoice, channelVoice, totalVoiceSeconds };

  const nowMs = Date.now();
  const safeDays =
    days == null ? null : Math.max(1, Math.min(31, Number(days || 1)));

  for (const row of rows) {
    const userId = String(row?.userId || "");
    const startedAt = row?.voice?.sessionStartedAt;
    const channelId = String(row?.voice?.sessionChannelId || "");
    if (!userId || !startedAt) continue;
    const addSeconds =
      safeDays == null
        ? Math.max(
            0,
            Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),
          )
        : secondsInLastNDays(startedAt, safeDays, nowMs);
    if (!addSeconds) continue;
    pushMapValue(userVoice, userId, addSeconds);
    if (channelId) pushMapValue(channelVoice, channelId, addSeconds);
    totalVoiceSeconds += addSeconds;
  }

  return { userVoice, channelVoice, totalVoiceSeconds };
}

function aggregateFromRows(rows = [], dateKeys = []) {
  const dateSet = new Set(Array.isArray(dateKeys) ? dateKeys : []);
  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();
  const contributors = new Set();
  const chartByDay = new Map();

  for (const row of rows) {
    if (!dateSet.has(String(row?.dateKey || ""))) continue;

    const userId = String(row?.userId || "");
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);

    if (textCount > 0 || voiceSeconds > 0) contributors.add(userId);
    pushMapValue(userText, userId, textCount);
    pushMapValue(userVoice, userId, voiceSeconds);

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }

    const dayKey = String(row?.dateKey || "");
    const current = chartByDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    current.text += textCount;
    current.voiceSeconds += voiceSeconds;
    chartByDay.set(dayKey, current);
  }

  return {
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    },
    contributors: contributors.size,
    topUsersText: topNFromMap(userText, 3),
    topUsersVoice: topNFromMap(userVoice, 3),
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
    chartByDay,
  };
}

function aggregateFromHourlyRows(rows = [], hourKeys = [], topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();
  const contributors = new Set();

  for (const row of rows) {
    if (!hourSet.has(String(row?.hourKey || ""))) continue;

    const userId = String(row?.userId || "");
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);

    if (textCount > 0 || voiceSeconds > 0) contributors.add(userId);
    pushMapValue(userText, userId, textCount);
    pushMapValue(userVoice, userId, voiceSeconds);

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return {
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    },
    contributors: contributors.size,
    topUsersText: topNFromMap(userText, safeTopLimit),
    topUsersVoice: topNFromMap(userVoice, safeTopLimit),
    topChannelsText: topNFromMap(channelText, safeTopLimit),
    topChannelsVoice: topNFromMap(channelVoice, safeTopLimit),
    contributorIds: contributors,
  };
}

function aggregateUserHourlyRows(rows = [], hourKeys = []) {
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const channelText = new Map();
  const channelVoice = new Map();
  let text = 0;
  let voiceSeconds = 0;

  for (const row of rows) {
    if (!hourSet.has(String(row?.hourKey || ""))) continue;
    const rowText = Number(row?.textCount || 0);
    const rowVoice = Number(row?.voiceSeconds || 0);
    text += rowText;
    voiceSeconds += rowVoice;

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return {
    text,
    voiceSeconds,
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
  };
}

function buildChartByDayFromHourlyRows(rows = [], hourKeys = []) {
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const byDay = new Map();

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    const dayKey = hourKey.split("T")[0] || "";
    if (!dayKey) continue;
    const current = byDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    current.text += Number(row?.textCount || 0);
    current.voiceSeconds += Number(row?.voiceSeconds || 0);
    byDay.set(dayKey, current);
  }

  return byDay;
}

async function getServerActivityStats(guildId, days = 7) {
  const dateKeys = getLastNDaysKeys(days);
  const rows = await ActivityDaily.find({
    guildId,
    dateKey: { $in: dateKeys },
  })
    .lean()
    .catch(() => []);

  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();

  for (const row of rows) {
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);
    pushMapValue(userText, String(row.userId || ""), textCount);
    pushMapValue(userVoice, String(row.userId || ""), voiceSeconds);

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }
  const liveOverlay = await getLiveVoiceOverlay(guildId, days);
  for (const [userId, value] of liveOverlay.userVoice.entries()) {
    pushMapValue(userVoice, userId, value);
  }
  for (const [channelId, value] of liveOverlay.channelVoice.entries()) {
    pushMapValue(channelVoice, channelId, value);
  }

  if (rows.length === 0) {
    const users = await ActivityUser.find({ guildId })
      .select(
        "userId messages.weekly messages.total voice.weeklySeconds voice.totalSeconds",
      )
      .lean()
      .catch(() => []);

    const retroUserText = new Map();
    const retroUserVoice = new Map();
    let retroTextTotal = 0;
    let retroVoiceTotal = 0;
    const useWeekly = Number(days || 7) <= 7;

    for (const row of users) {
      const textValue =
        Number(useWeekly ? row?.messages?.weekly : row?.messages?.total) || 0;
      const voiceValue =
        Number(
          useWeekly ? row?.voice?.weeklySeconds : row?.voice?.totalSeconds,
        ) || 0;
      pushMapValue(retroUserText, String(row?.userId || ""), textValue);
      pushMapValue(retroUserVoice, String(row?.userId || ""), voiceValue);
      retroTextTotal += textValue;
      retroVoiceTotal += voiceValue;
    }
    for (const [userId, value] of liveOverlay.userVoice.entries()) {
      pushMapValue(retroUserVoice, userId, value);
    }
    retroVoiceTotal += Number(liveOverlay.totalVoiceSeconds || 0);

    return {
      days: Math.max(1, Math.min(31, Number(days || 7))),
      totals: {
        text: retroTextTotal,
        voiceSeconds: retroVoiceTotal,
      },
      topUsersText: topNFromMap(retroUserText, 3),
      topUsersVoice: topNFromMap(retroUserVoice, 3),
      topChannelsText: [],
      topChannelsVoice: [],
      approximate: true,
    };
  }

  return {
    days: Math.max(1, Math.min(31, Number(days || 7))),
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    },
    topUsersText: topNFromMap(userText, 3),
    topUsersVoice: topNFromMap(userVoice, 3),
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
    approximate: false,
  };
}

async function getServerOverviewStats(guildId, lookbackDays = 14, topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;
  await ensureHourlyBackfillForGuild(guildId);
  const lookbackKey = `d${safeLookback}`;
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(
    new Set([
      ...hourKeys1,
      ...hourKeys7,
      ...hourKeys14,
      ...hourKeys21,
      ...hourKeys30,
      ...hourKeysLookback,
    ]),
  );
  const dayKeysLookback = getLastNDaysKeys(safeLookback);

  const hourlyRows = await ActivityHourly.find({
    guildId,
    hourKey: { $in: allHourKeys },
  })
    .lean()
    .catch(() => []);

  const agg1 = aggregateFromHourlyRows(hourlyRows, hourKeys1, safeTopLimit);
  const agg7 = aggregateFromHourlyRows(hourlyRows, hourKeys7, safeTopLimit);
  const agg14 = aggregateFromHourlyRows(hourlyRows, hourKeys14, safeTopLimit);
  const agg21 = aggregateFromHourlyRows(hourlyRows, hourKeys21, safeTopLimit);
  const agg30 = aggregateFromHourlyRows(hourlyRows, hourKeys30, safeTopLimit);
  const aggLookback = aggregateFromHourlyRows(
    hourlyRows,
    hourKeysLookback,
    safeTopLimit,
  );
  const chartByDay = buildChartByDayFromHourlyRows(
    hourlyRows,
    hourKeysLookback,
  );

  const chartPoints = dayKeysLookback
    .slice()
    .reverse()
    .map((dayKey) => {
      const point = chartByDay.get(dayKey) || {
        text: 0,
        voiceSeconds: 0,
      };
      return {
        dayKey,
        text: Number(point.text || 0),
        voiceSeconds: Number(point.voiceSeconds || 0),
      };
    });

  const liveOverlayLookback = await getLiveVoiceOverlay(guildId, safeLookback);
  if (liveOverlayLookback.totalVoiceSeconds > 0) {
    const liveSessions = await loadLiveVoiceSessions(guildId);
    const nowMs = Date.now();
    const byUserLookback = toMapFromTopList(aggLookback.topUsersVoice);
    const byChannelLookback = toMapFromTopList(aggLookback.topChannelsVoice);
    const contributorSets = {
      d1: new Set(agg1?.contributorIds || []),
      d7: new Set(agg7?.contributorIds || []),
      d14: new Set(agg14?.contributorIds || []),
      d21: new Set(agg21?.contributorIds || []),
      d30: new Set(agg30?.contributorIds || []),
    };
    const windowsAgg = {
      d1: agg1,
      d7: agg7,
      d14: agg14,
      d21: agg21,
      d30: agg30,
    };

    for (const row of liveSessions) {
      const userId = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      const channelId = String(row?.voice?.sessionChannelId || "");
      if (!userId || !startedAt) continue;

      for (const days of [1, 7, 14, 21, 30]) {
        const key = `d${days}`;
        const addSeconds = secondsInLastNDays(startedAt, days, nowMs);
        if (!addSeconds) continue;
        windowsAgg[key].totals.voiceSeconds += addSeconds;
        contributorSets[key].add(userId);
      }

      const addLookback =
        Number(liveOverlayLookback.userVoice.get(userId) || 0) || 0;
      if (addLookback > 0) {
        byUserLookback.set(userId, (byUserLookback.get(userId) || 0) + addLookback);
        if (channelId) {
          byChannelLookback.set(
            channelId,
            (byChannelLookback.get(channelId) || 0) + addLookback,
          );
        }
        const lastPoint = chartPoints[chartPoints.length - 1];
        if (lastPoint) lastPoint.voiceSeconds += addLookback;
      }
    }

    agg1.contributors = contributorSets.d1.size;
    agg7.contributors = contributorSets.d7.size;
    agg14.contributors = contributorSets.d14.size;
    agg21.contributors = contributorSets.d21.size;
    agg30.contributors = contributorSets.d30.size;
    aggLookback.topUsersVoice = topNFromMap(byUserLookback, safeTopLimit);
    aggLookback.topChannelsVoice = topNFromMap(byChannelLookback, safeTopLimit);
  }

  const hasTrackedRows = hourlyRows.length > 0;
  if (!hasTrackedRows) {
    const users = await ActivityUser.find({ guildId })
      .select(
        "userId messages.weekly messages.total voice.weeklySeconds voice.totalSeconds",
      )
      .lean()
      .catch(() => []);
    const userText = new Map();
    const userVoice = new Map();
    let totalText7 = 0;
    let totalVoice7 = 0;
    let totalText14 = 0;
    let totalVoice14 = 0;
    let totalText21 = 0;
    let totalVoice21 = 0;
    let totalText30 = 0;
    let totalVoice30 = 0;

    for (const row of users) {
      const id = String(row?.userId || "");
      const textWeekly = Number(row?.messages?.weekly || 0);
      const textTotal = Number(row?.messages?.total || 0);
      const voiceWeekly = Number(row?.voice?.weeklySeconds || 0);
      const voiceTotal = Number(row?.voice?.totalSeconds || 0);
      totalText7 += textWeekly;
      totalVoice7 += voiceWeekly;
      totalText14 += textTotal;
      totalVoice14 += voiceTotal;
      totalText21 += textTotal;
      totalVoice21 += voiceTotal;
      totalText30 += textTotal;
      totalVoice30 += voiceTotal;
      pushMapValue(userText, id, textTotal);
      pushMapValue(userVoice, id, voiceTotal);
    }

    const fallbackWindows = {
      d1: { text: 0, voiceSeconds: 0, contributors: 0 },
      d7: { text: totalText7, voiceSeconds: totalVoice7, contributors: 0 },
      d14: { text: totalText14, voiceSeconds: totalVoice14, contributors: 0 },
      d21: { text: totalText21, voiceSeconds: totalVoice21, contributors: 0 },
      d30: { text: totalText30, voiceSeconds: totalVoice30, contributors: 0 },
    };

    return {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallbackWindows,
      topUsersText: topNFromMap(userText, safeTopLimit),
      topUsersVoice: topNFromMap(userVoice, safeTopLimit),
      topChannelsText: [],
      topChannelsVoice: [],
      chart: chartPoints,
    };
  }

  return {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.totals.text,
        voiceSeconds: agg1.totals.voiceSeconds,
        contributors: agg1.contributors,
      },
      d7: {
        text: agg7.totals.text,
        voiceSeconds: agg7.totals.voiceSeconds,
        contributors: agg7.contributors,
      },
      d14: {
        text: agg14.totals.text,
        voiceSeconds: agg14.totals.voiceSeconds,
        contributors: agg14.contributors,
      },
      d21: {
        text: agg21.totals.text,
        voiceSeconds: agg21.totals.voiceSeconds,
        contributors: agg21.contributors,
      },
      d30: {
        text: agg30.totals.text,
        voiceSeconds: agg30.totals.voiceSeconds,
        contributors: agg30.contributors,
      },
    },
    topUsersText: aggLookback.topUsersText,
    topUsersVoice: aggLookback.topUsersVoice,
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart: chartPoints,
  };
}

async function getUserOverviewStats(guildId, userId, lookbackDays = 14) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;
  await ensureHourlyBackfillForGuild(guildId);
  const lookbackKey = `d${safeLookback}`;
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(
    new Set([
      ...hourKeys1,
      ...hourKeys7,
      ...hourKeys14,
      ...hourKeys21,
      ...hourKeys30,
      ...hourKeysLookback,
    ]),
  );
  const dayKeysLookback = getLastNDaysKeys(safeLookback);

  const userRows = await ActivityHourly.find({
    guildId,
    userId,
    hourKey: { $in: allHourKeys },
  })
    .lean()
    .catch(() => []);

  const agg1 = aggregateUserHourlyRows(userRows, hourKeys1);
  const agg7 = aggregateUserHourlyRows(userRows, hourKeys7);
  const agg14 = aggregateUserHourlyRows(userRows, hourKeys14);
  const agg21 = aggregateUserHourlyRows(userRows, hourKeys21);
  const agg30 = aggregateUserHourlyRows(userRows, hourKeys30);
  const aggLookback = aggregateUserHourlyRows(userRows, hourKeysLookback);
  const userChartByDay = buildChartByDayFromHourlyRows(
    userRows,
    hourKeysLookback,
  );

  const chart = dayKeysLookback
    .slice()
    .reverse()
    .map((dayKey) => {
      const point = userChartByDay.get(dayKey) || {
        text: 0,
        voiceSeconds: 0,
      };
      return {
        dayKey,
        text: Number(point.text || 0),
        voiceSeconds: Number(point.voiceSeconds || 0),
      };
    });

  const liveDoc = await ActivityUser.findOne({
    guildId,
    userId,
    "voice.sessionStartedAt": { $ne: null },
  })
    .select("voice.sessionStartedAt voice.sessionChannelId")
    .lean()
    .catch(() => null);

  if (liveDoc?.voice?.sessionStartedAt) {
    const nowMs = Date.now();
    const startedAt = liveDoc.voice.sessionStartedAt;
    const channelId = String(liveDoc?.voice?.sessionChannelId || "");
    const add1 = secondsInLastNDays(startedAt, 1, nowMs);
    const add7 = secondsInLastNDays(startedAt, 7, nowMs);
    const add14 = secondsInLastNDays(startedAt, 14, nowMs);
    const add21 = secondsInLastNDays(startedAt, 21, nowMs);
    const add30 = secondsInLastNDays(startedAt, 30, nowMs);
    const addLookback = secondsInLastNDays(startedAt, safeLookback, nowMs);
    agg1.voiceSeconds += add1;
    agg7.voiceSeconds += add7;
    agg14.voiceSeconds += add14;
    agg21.voiceSeconds += add21;
    agg30.voiceSeconds += add30;
    if (addLookback > 0) {
      if (channelId) {
        const byChannel = toMapFromTopList(aggLookback.topChannelsVoice);
        byChannel.set(channelId, (byChannel.get(channelId) || 0) + addLookback);
        aggLookback.topChannelsVoice = topNFromMap(byChannel, 3);
      }
      const lastPoint = chart[chart.length - 1];
      if (lastPoint) lastPoint.voiceSeconds += addLookback;
    }
  }

  const guildRows14 = await ActivityHourly.find({
    guildId,
    hourKey: { $in: hourKeysLookback },
  })
    .select("userId textCount voiceSeconds hourKey")
    .lean()
    .catch(() => []);

  const rankTextMap = new Map();
  const rankVoiceMap = new Map();
  for (const row of guildRows14) {
    const id = String(row?.userId || "");
    pushMapValue(rankTextMap, id, Number(row?.textCount || 0));
    pushMapValue(rankVoiceMap, id, Number(row?.voiceSeconds || 0));
  }

  const liveGuildSessions = await loadLiveVoiceSessions(guildId);
  if (liveGuildSessions.length) {
    const nowMs = Date.now();
    for (const row of liveGuildSessions) {
      const id = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      if (!id || !startedAt) continue;
      const add = secondsInLastNDays(startedAt, safeLookback, nowMs);
      if (!add) continue;
      pushMapValue(rankVoiceMap, id, add);
    }
  }

  let rankText = safeTopRank(rankTextMap, userId);
  let rankVoice = safeTopRank(rankVoiceMap, userId);

  if (!userRows.length) {
    const doc = await ActivityUser.findOne({ guildId, userId })
      .lean()
      .catch(() => null);
    const fallback = {
      d1: {
        text: Number(doc?.messages?.daily || 0),
        voiceSeconds: Number(doc?.voice?.dailySeconds || 0),
      },
      d7: {
        text: Number(doc?.messages?.weekly || 0),
        voiceSeconds: Number(doc?.voice?.weeklySeconds || 0),
      },
      d14: {
        text: Number(doc?.messages?.total || 0),
        voiceSeconds: Number(doc?.voice?.totalSeconds || 0),
      },
      d21: {
        text: Number(doc?.messages?.total || 0),
        voiceSeconds: Number(doc?.voice?.totalSeconds || 0),
      },
      d30: {
        text: Number(doc?.messages?.total || 0),
        voiceSeconds: Number(doc?.voice?.totalSeconds || 0),
      },
    };
    if (!rankText && Number(fallback?.[lookbackKey]?.text || 0) > 0)
      rankText = 1;
    if (!rankVoice && Number(fallback?.[lookbackKey]?.voiceSeconds || 0) > 0)
      rankVoice = 1;
    return {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallback,
      ranks: { text: rankText, voice: rankVoice },
      topChannelsText: [],
      topChannelsVoice: [],
      chart,
    };
  }

  return {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.text,
        voiceSeconds: agg1.voiceSeconds,
      },
      d7: { text: agg7.text, voiceSeconds: agg7.voiceSeconds },
      d14: { text: agg14.text, voiceSeconds: agg14.voiceSeconds },
      d21: { text: agg21.text, voiceSeconds: agg21.voiceSeconds },
      d30: { text: agg30.text, voiceSeconds: agg30.voiceSeconds },
    },
    ranks: { text: rankText, voice: rankVoice },
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart,
  };
}

async function syncLiveVoiceSessionsFromGateway(client) {
  if (!client?.guilds?.cache) return;
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    const guildId = String(guild?.id || "");
    if (!guildId) continue;

    const activeUserIds = new Set();
    for (const state of guild.voiceStates?.cache?.values?.() || []) {
      const member = state?.member;
      if (!member || member.user?.bot) continue;
      if (!isCountableVoiceState(state)) continue;
      const userId = String(member.id || "");
      if (!userId) continue;
      activeUserIds.add(userId);

      await ActivityUser.updateOne(
        { guildId, userId, "voice.sessionStartedAt": { $eq: null } },
        {
          $set: {
            "voice.sessionStartedAt": now,
            "voice.sessionChannelId": String(state.channelId || ""),
            "voice.expAwardedSeconds": 0,
          },
          $setOnInsert: { guildId, userId },
        },
        { upsert: true },
      ).catch(() => {});

      await ActivityUser.updateOne(
        { guildId, userId, "voice.sessionStartedAt": { $ne: null } },
        {
          $set: {
            "voice.sessionChannelId": String(state.channelId || ""),
          },
        },
      ).catch(() => {});
    }

    const openSessions = await ActivityUser.find({
      guildId,
      "voice.sessionStartedAt": { $ne: null },
    })
      .select("userId")
      .lean()
      .catch(() => []);

    for (const row of openSessions) {
      const userId = String(row?.userId || "");
      if (!userId || activeUserIds.has(userId)) continue;
      await ActivityUser.updateOne(
        { guildId, userId },
        {
          $set: {
            "voice.sessionStartedAt": null,
            "voice.sessionChannelId": null,
            "voice.expAwardedSeconds": 0,
          },
        },
      ).catch(() => {});
    }
  }
}

async function runLiveVoiceExpTick(client) {
  if (!client?.guilds?.cache) return;
  const nowMs = Date.now();
  const rows = await ActivityUser.find({
    "voice.sessionStartedAt": { $ne: null },
  })
    .select("guildId userId voice.sessionStartedAt voice.sessionChannelId voice.expAwardedSeconds")
    .lean()
    .catch(() => []);

  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const userId = String(row?.userId || "");
    const startedAt = row?.voice?.sessionStartedAt;
    const channelId = String(row?.voice?.sessionChannelId || "");
    if (!guildId || !userId || !startedAt || !channelId) continue;

    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;

    const member =
      guild.members?.cache?.get(userId) ||
      (await guild.members?.fetch(userId).catch(() => null));
    if (!member || member.user?.bot) continue;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),
    );
    const alreadyAwardedSeconds = Math.max(
      0,
      Number(row?.voice?.expAwardedSeconds || 0),
    );
    const grantableMinutes = Math.floor(
      Math.max(0, elapsedSeconds - alreadyAwardedSeconds) / 60,
    );
    if (grantableMinutes <= 0) continue;

    const grantableSeconds = grantableMinutes * 60;
    const ignored = await shouldIgnoreExpForMember({
      guildId,
      member,
      channelId,
    });

    if (!ignored) {
      await addExpWithLevel(
        guild,
        userId,
        grantableMinutes * VOICE_EXP_PER_MINUTE,
        true,
      ).catch(() => {});
    }

    await ActivityUser.updateOne(
      {
        guildId,
        userId,
        "voice.sessionStartedAt": row?.voice?.sessionStartedAt || null,
      },
      {
        $inc: { "voice.expAwardedSeconds": grantableSeconds },
      },
    ).catch(() => {});
  }
}

function startLiveVoiceExpLoop(client, intervalMs = 15000) {
  const safeInterval = Math.max(5000, Number(intervalMs || 15000));
  if (client?._liveVoiceExpInterval) return client._liveVoiceExpInterval;
  const runner = () =>
    runLiveVoiceExpTick(client).catch((error) => {
      global.logger?.warn?.(
        "[LIVE VOICE EXP] Tick failed:",
        error?.message || error,
      );
    });
  runner();
  client._liveVoiceExpInterval = setInterval(runner, safeInterval);
  return client._liveVoiceExpInterval;
}

module.exports = {
  recordMessageActivity,
  handleVoiceActivity,
  getUserActivityStats,
  getServerActivityStats,
  getServerOverviewStats,
  getUserOverviewStats,
  getLiveVoiceOverlay,
  syncLiveVoiceSessionsFromGateway,
  runLiveVoiceExpTick,
  startLiveVoiceExpLoop,
};
