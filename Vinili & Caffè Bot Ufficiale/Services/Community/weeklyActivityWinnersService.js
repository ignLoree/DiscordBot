const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const cron = require("node-cron");
const { ActivityUser, ActivityDaily, ExpUser, GlobalSettings, } = require("../../Schemas/Community/communitySchemas");
const { VOICE_EXP_PER_MINUTE, getGuildExpSettings } = require("./expService");
const { getEventWeekNumber, grantEventLevels, addEventWeekWinner, getTop3ExpDuringEventExcludingStaff } = require("./activityEventRewardsService");
const { giveWeekly20PointsIfEligible, getStaffEventLeaderboard, isStaffButNotHighStaff } = require("./staffEventService");
const { sendEventRewardLog, sendEventRewardDm } = require("./eventRewardLogService");
const { isEventStaffMember } = require("./expService");
const IDs = require("../../Utils/Config/ids");
const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const NEWS_CHANNEL_ID = IDs.channels.news;
const NEWS_STAFF_CHANNEL_ID = IDs.channels.staffNews;
const INFO_CHANNEL_ID = IDs.channels.info;
const TROPHY_LABELS = [
  "<:VC_Podio1:1469659449974329598>",
  "<:VC_Podio2:1469659512863592500>",
  "<:VC_Podio3:1469659557696504024>",
];
const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const EXCLUDED_ROLE_IDS = new Set(
  [
    IDs.roles.Staff,
    IDs.roles.HighStaff,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  };
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

function getNextWeekKey(date) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getWeekKey(next);
}

function getWeekdayRome(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  });
  return formatter.format(date);
}

function getDateKeysForWeekKey(weekKey) {
  const match = String(weekKey || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];

  const year = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(isoWeek) || isoWeek < 1)
    return [];

  const jan4Utc = Date.UTC(year, 0, 4, 12, 0, 0);
  const jan4 = new Date(jan4Utc);
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const mondayWeek1Utc = jan4Utc - jan4Day * 24 * 60 * 60 * 1000;
  const mondayTargetUtc =
    mondayWeek1Utc + (isoWeek - 1) * 7 * 24 * 60 * 60 * 1000;

  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(mondayTargetUtc + i * 24 * 60 * 60 * 1000);
    const parts = getTimeParts(date);
    out.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`);
  }
  return out;
}

function getEventWeekDateKeys(eventStartedAt, weekNum) {
  const start = new Date(eventStartedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(weekNum) || weekNum < 1)
    return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start + ((weekNum - 1) * 7 + i) * dayMs);
    const parts = getTimeParts(date);
    out.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`);
  }
  return out;
}

async function loadActivityRowsFromDateKeys(guild, dateKeys) {
  if (!dateKeys?.length) return [];
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const perUser = new Map();
  const cursor = ActivityDaily.find({
    guildId: guild.id,
    dateKey: { $in: dateKeys },
  })
    .select("userId textChannels voiceChannels")
    .lean()
    .cursor();
  for await (const row of cursor) {
    const userId = String(row?.userId || "");
    if (!userId) continue;
    let messageCount = 0;
    let voiceSeconds = 0;
    for (const [channelId, value] of extractMapEntries(row?.textChannels)) {
      if (!eligible.text.has(String(channelId))) continue;
      messageCount += Math.max(0, Number(value || 0));
    }
    for (const [channelId, value] of extractMapEntries(row?.voiceChannels)) {
      if (!eligible.voice.has(String(channelId))) continue;
      voiceSeconds += Math.max(0, Number(value || 0));
    }
    if (messageCount <= 0 && voiceSeconds <= 0) continue;
    const current = perUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
    current.messageCount += messageCount;
    current.voiceSeconds += voiceSeconds;
    perUser.set(userId, current);
  }
  return Array.from(perUser.values()).map((row) => ({
    userId: row.userId,
    messageCount: Math.max(0, Math.floor(row.messageCount)),
    voiceSeconds: Math.max(0, Math.floor(row.voiceSeconds)),
  }));
}

async function getEventWeekTopThreeTextAndVoice(guild, eventWeekNum) {
  if (!guild?.id || !Number.isFinite(eventWeekNum) || eventWeekNum < 1 || eventWeekNum > 4)
    return { topMessages: [], topVoice: [] };
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  if (!settings?.eventStartedAt) return { topMessages: [], topVoice: [] };
  const dateKeys = getEventWeekDateKeys(settings.eventStartedAt, eventWeekNum);
  if (!dateKeys.length) return { topMessages: [], topVoice: [] };
  const rows = await loadActivityRowsFromDateKeys(guild, dateKeys);
  const sortedMessages = [...rows]
    .filter((r) => Number(r?.messageCount || 0) > 0)
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
  const sortedVoice = [...rows]
    .filter((r) => Number(r?.voiceSeconds || 0) > 0)
    .sort((a, b) => (b.voiceSeconds || 0) - (a.voiceSeconds || 0));
  const topMessages = [];
  const topVoice = [];
  for (const row of sortedMessages) {
    if (topMessages.length >= 3) break;
    const member = await guild.members.fetch(row.userId).catch(() => null);
    if (member && !isEventStaffMember(member))
      topMessages.push({ userId: row.userId, messageCount: row.messageCount });
  }
  for (const row of sortedVoice) {
    if (topVoice.length >= 3) break;
    const member = await guild.members.fetch(row.userId).catch(() => null);
    if (member && !isEventStaffMember(member))
      topVoice.push({ userId: row.userId, voiceSeconds: row.voiceSeconds });
  }
  return { topMessages, topVoice };
}

function buildEmptyLine(kind) {
  return ` - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || "[#]";
  return `${medal} ${userMention} <a:VC_Arrow:1448672967721615452> **${value}** *${unit}*`;
}

function extractMapEntries(raw) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

async function resolveMemberRole(guild) {
  if (!guild) return null;
  if (REQUIRED_MEMBER_ROLE_ID) {
    const role =
      guild.roles.cache.get(REQUIRED_MEMBER_ROLE_ID) ||
      (await guild.roles.fetch(REQUIRED_MEMBER_ROLE_ID).catch(() => null));
    if (role) return role;
  }
  return guild.roles.everyone || null;
}

async function getEligibleChannelSets(guild) {
  const role = await resolveMemberRole(guild);
  if (!role) return { text: new Set(), voice: new Set() };

  const text = new Set();
  const voice = new Set();
  for (const channel of guild.channels.cache.values()) {
    const perms = channel?.permissionsFor?.(role);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("SendMessages")) text.add(String(channel.id));
    if (perms.has("Connect") && perms.has("Speak")) voice.add(String(channel.id));
  }
  return { text, voice };
}

async function loadWeeklyRowsFromDaily(guild, weekKey) {
  const dateKeys = getDateKeysForWeekKey(weekKey);
  if (!dateKeys.length) return [];

  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];

  const perUser = new Map();
  const cursor = ActivityDaily.find({
    guildId: guild.id,
    dateKey: { $in: dateKeys },
  })
    .select("userId textChannels voiceChannels")
    .lean()
    .cursor();

  for await (const row of cursor) {
    const userId = String(row?.userId || "");
    if (!userId) continue;

    let messageCount = 0;
    let voiceSeconds = 0;

    for (const [channelId, value] of extractMapEntries(row?.textChannels)) {
      if (!eligible.text.has(String(channelId))) continue;
      messageCount += Math.max(0, Number(value || 0));
    }
    for (const [channelId, value] of extractMapEntries(row?.voiceChannels)) {
      if (!eligible.voice.has(String(channelId))) continue;
      voiceSeconds += Math.max(0, Number(value || 0));
    }

    if (messageCount <= 0 && voiceSeconds <= 0) continue;
    const current = perUser.get(userId) || {
      userId,
      messageCount: 0,
      voiceSeconds: 0,
    };
    current.messageCount += messageCount;
    current.voiceSeconds += voiceSeconds;
    perUser.set(userId, current);
  }

  return Array.from(perUser.values()).map((row) => ({
    userId: row.userId,
    messageCount: Math.max(0, Math.floor(row.messageCount)),
    voiceExp: Math.max(
      0,
      Math.floor((Math.max(0, row.voiceSeconds) / 60) * VOICE_EXP_PER_MINUTE),
    ),
  }));
}

async function resolveTopThreeUsers(client, guild, docs, valueGetter) {
  const out = [];
  for (const doc of docs) {
    if (out.length >= 3) break;
    const userId = String(doc.userId || "");
    if (!userId) continue;

    let user = client.users.cache.get(userId) || null;
    if (!user) user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) continue;

    const member =
      guild.members.cache.get(userId) ||
      (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID))
      continue;

    const hasExcludedRole = Array.from(EXCLUDED_ROLE_IDS).some((roleId) =>
      member.roles.cache.has(roleId),
    );
    if (hasExcludedRole) continue;

    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    out.push({ userId, value });
  }
  return out;
}

async function removeRoleFromAllMembers(guild, roleId) {
  if (!roleId) return;
  await guild.members.fetch().catch(() => null);
  const role =
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return;

  for (const member of role.members.values()) {
    await member.roles.remove(roleId).catch(() => {});
  }
}

async function assignRoleToUser(guild, userId, roleId) {
  if (!userId || !roleId) return false;
  const member =
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null));
  if (!member) return false;
  await member.roles.add(roleId).catch(() => {});
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
  await removeRoleFromAllMembers(guild, MESSAGE_WINNER_ROLE_ID);
  await removeRoleFromAllMembers(guild, VOICE_WINNER_ROLE_ID);

  const chosenUserIds = new Set();
  const messageWinner = pickFirstAvailable(topMessages, chosenUserIds);
  if (messageWinner) chosenUserIds.add(messageWinner.userId);

  const voiceWinner = pickFirstAvailable(topVoice, chosenUserIds);
  if (voiceWinner) chosenUserIds.add(voiceWinner.userId);

  await Promise.all([
    assignRoleToUser(guild, messageWinner?.userId, MESSAGE_WINNER_ROLE_ID),
    assignRoleToUser(guild, voiceWinner?.userId, VOICE_WINNER_ROLE_ID),
  ]);

  return { messageWinner, voiceWinner };
}

function formatVoiceDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function sendEventWeekAnnouncementToNews(client, guild, eventWeek, topMessages, topVoice) {
  const newsChannel =
    client.channels.cache.get(NEWS_CHANNEL_ID) ||
    (await client.channels.fetch(NEWS_CHANNEL_ID).catch(() => null));
  if (!newsChannel?.guild) return;
  const msgLines = topMessages.length
    ? topMessages.map((item, i) => {
        const medal = TROPHY_LABELS[i] || "";
        return `${medal} <@${item.userId}> — **${item.messageCount}** messaggi`;
      })
    : [" - Nessun dato per la classifica testuale."];
  const voiceLines = topVoice.length
    ? topVoice.map((item, i) => {
        const medal = TROPHY_LABELS[i] || "";
        return `${medal} <@${item.userId}> — **${formatVoiceDuration(item.voiceSeconds)}**`;
      })
    : [" - Nessun dato per la classifica vocale."];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1469659357678669958> Evento Activity EXP — Settimana ${eventWeek}`)
    .setDescription(
      [
        "<a:VC_HeartsPink:1468685897389052008> **Top 3 testuale** (settimana evento):",
        ...msgLines,
        "",
        "<a:VC_HeartsBlue:1468686100045369404> **Top 3 vocale** (settimana evento):",
        ...voiceLines,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: `Settimana ${eventWeek} dell'evento • Premi assegnati ai vincitori` })
    .setTimestamp();
  await newsChannel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.error?.("[WEEKLY ACTIVITY] Event week announcement to news failed:", err);
  });
}

const EVENT_END_ANNOUNCEMENT_MESSAGE = [
  "<:VC_Calendar:1448670320180592724> **L'evento Activity EXP è terminato.**",
  "",
  "> <a:VC_HeartsPink:1468685897389052008> Grazie a tutti per aver partecipato! Di seguito la **top 3 per EXP totale** guadagnata durante l'evento.",
  "",
].join("\n");

async function trySendEventEndAnnouncementToNews(client) {
  const mainGuildId = IDs.guilds?.main;
  if (!mainGuildId || !NEWS_CHANNEL_ID) return;
  const guild =
    client.guilds.cache.get(mainGuildId) ||
    (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return;
  const doc = await GlobalSettings.findOne({ guildId: mainGuildId }).lean().catch(() => null);
  if (!doc?.expEventMultiplierExpiresAt) return;
  const expiresAt = new Date(doc.expEventMultiplierExpiresAt).getTime();
  if (expiresAt > Date.now()) return;
  const sentFor = doc.expEventEndAnnouncementSentForExpiresAt
    ? new Date(doc.expEventEndAnnouncementSentForExpiresAt).getTime()
    : null;
  if (sentFor !== null && sentFor === expiresAt) return;
  const top3 = await getTop3ExpDuringEventExcludingStaff(guild);
  const lines = top3.length
    ? top3.map((item, i) => {
        const medal = TROPHY_LABELS[i] || "";
        return `${medal} <@${item.userId}> — **${item.expDuringEvent.toLocaleString("it-IT")}** EXP`;
      })
    : [" - Nessun dato."];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Leaderboard:1469659357678669958> Top 3 EXP totale — Evento Activity EXP")
    .setDescription(["**Classifica per EXP guadagnata durante l'evento:**", "", ...lines].join("\n"))
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: "Evento terminato • Grazie per la partecipazione!" })
    .setTimestamp();
  const newsChannel =
    client.channels.cache.get(NEWS_CHANNEL_ID) ||
    (await client.channels.fetch(NEWS_CHANNEL_ID).catch(() => null));
  if (!newsChannel?.guild) return;
  await newsChannel.send({
    content: `${EVENT_END_ANNOUNCEMENT_MESSAGE}\n\n<a:VC_Ping:1448670620412809298>︲<@&1442569012063109151>`,
    embeds: [embed],
    allowedMentions: { parse: ["everyone"] },
  }).catch((err) => {
    global.logger?.error?.("[WEEKLY ACTIVITY] Event end announcement to news failed:", err);
    return;
  });
  await GlobalSettings.findOneAndUpdate(
    { guildId: mainGuildId },
    { $set: { expEventEndAnnouncementSentForExpiresAt: doc.expEventMultiplierExpiresAt } },
  ).catch(() => null);

  if (doc.staffEventExpiresAt && new Date(doc.staffEventExpiresAt).getTime() <= Date.now()) {
    const leaderboard = await getStaffEventLeaderboard(mainGuildId);
    await guild.members.fetch().catch(() => null);
    const staffIds = new Set();
    for (const [, member] of guild.members.cache) {
      if (isStaffButNotHighStaff(member)) staffIds.add(member.id);
    }
    const filtered = leaderboard.filter((r) => staffIds.has(r.userId));
    const first = filtered[0];
    const last = filtered.length > 1 ? filtered[filtered.length - 1] : null;
    const staffEndLines = [];
    if (first) staffEndLines.push(`<:VC_Podio1:1469659449974329598> **Miglior punteggio:** <@${first.userId}> — **${first.points}** punti`);
    if (last && last.userId !== first?.userId) staffEndLines.push(`**Peggior punteggio:** <@${last.userId}> — **${last.points}** punti`);
    const staffEndContent = [
      "## <a:VC_Announce:1448687280381235443> **EVENTO STAFF — Terminato**",
      "",
      "<:VC_Attention:1443933073438675016> Risultati evento staff:",
      ...(staffEndLines.length ? staffEndLines : [" - Nessun dato."]),
      "",
      `<:VC_Mention:1443994358201323681>︲<@&${IDs.roles.Staff}>`,
    ].join("\n");
    const newsStaffChannel =
      NEWS_STAFF_CHANNEL_ID &&
      (client.channels.cache.get(NEWS_STAFF_CHANNEL_ID) ||
        (await client.channels.fetch(NEWS_STAFF_CHANNEL_ID).catch(() => null)));
    if (newsStaffChannel?.guild) {
      await newsStaffChannel.send({
        content: staffEndContent,
        allowedMentions: { parse: ["roles"] },
      }).catch((err) => {
        global.logger?.error?.("[WEEKLY ACTIVITY] Staff event end announcement to newsstaff failed:", err);
      });
    }
  }
}

async function publishWeeklyActivityWinners(client, options = {}) {
  const channel =
    client.channels.cache.get(TARGET_CHANNEL_ID) ||
    (await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null));
  if (!channel || !channel.guild) return;

  const guild = channel.guild;
  const now = new Date();
  const currentWeekKey =
    options.weekKey != null ? options.weekKey : getWeekKey(now);

  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  const eventWeek = settings ? getEventWeekNumber(settings) : 0;
  let eventTopMessages = [];
  let eventTopVoice = [];
  if (eventWeek >= 1 && eventWeek <= 4) {
    const eventTop = await getEventWeekTopThreeTextAndVoice(guild, eventWeek);
    eventTopMessages = eventTop.topMessages || [];
    eventTopVoice = eventTop.topVoice || [];
  }

  const weeklyRows = await loadWeeklyRowsFromDaily(guild, currentWeekKey);

  const messageDocs = weeklyRows
    .filter((row) => Number(row?.messageCount || 0) > 0)
    .sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0))
    .slice(0, 200);
  const voiceDocs = weeklyRows
    .filter((row) => Number(row?.voiceExp || 0) > 0)
    .sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0))
    .slice(0, 200);

  const topMessages = await resolveTopThreeUsers(
    client,
    guild,
    messageDocs,
    (doc) => Number(doc?.messageCount || 0),
  );

  const topVoice = await resolveTopThreeUsers(
    client,
    guild,
    voiceDocs,
    (doc) => Number(doc?.voiceExp || 0),
  );

  const useEventTop = eventWeek >= 1 && eventWeek <= 4;
  const displayTopMessages = useEventTop
    ? eventTopMessages.map((item) => ({ userId: item.userId, value: Number(item.messageCount || 0) }))
    : topMessages;
  const displayTopVoice = useEventTop
    ? eventTopVoice.map((item) => ({
        userId: item.userId,
        value: Math.floor((Math.max(0, Number(item.voiceSeconds || 0)) / 60) * VOICE_EXP_PER_MINUTE),
      }))
    : topVoice;

  const messageRows = displayTopMessages.length
    ? displayTopMessages.map((item, index) =>
        formatRankLine(index, `<@${item.userId}>`, item.value, "messaggi"),
      )
    : [buildEmptyLine("messaggi")];

  const voiceRows = displayTopVoice.length
    ? displayTopVoice.map((item, index) =>
        formatRankLine(index, `<@${item.userId}>`, item.value, "exp"),
      )
    : [buildEmptyLine("exp vocale")];

  const awarded = await updateWeeklyWinnerRoles(guild, displayTopMessages, displayTopVoice);
  const topSixUserIds = new Set();
  for (const item of eventTopMessages) {
    if (item?.userId) topSixUserIds.add(item.userId);
  }
  for (const item of eventTopVoice) {
    if (item?.userId) topSixUserIds.add(item.userId);
  }
  if (eventWeek >= 1 && eventWeek <= 4 && topSixUserIds.size > 0) {
    const VIP_ID = IDs.roles.VIP;
    const me = guild.members.me;
    for (const userId of topSixUserIds) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && isEventStaffMember(member)) continue;
        if (eventWeek === 1) {
          await grantEventLevels(
            guild.id,
            userId,
            10,
            "Evento settimanale: top 3 testuale/vocale",
            member,
            client,
          );
        } else if (eventWeek === 2) {
          await addEventWeekWinner(guild.id, userId, 2);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 2 — colore gradiente",
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 2,
          }).catch(() => {});
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 2 — colore gradiente a scelta",
            week: 2,
          }).catch(() => {});
        } else if (eventWeek === 3) {
          await addEventWeekWinner(guild.id, userId, 3);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 3 — ruolo custom e vocale privata",
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 3,
          }).catch(() => {});
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 3 — ruolo custom e vocale privata permanente",
            week: 3,
          }).catch(() => {});
        } else if (eventWeek === 4 && VIP_ID && me?.permissions?.has("ManageRoles")) {
          await assignRoleToUser(guild, userId, VIP_ID);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 4 — ruolo VIP permanente",
            roleId: VIP_ID,
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 4,
          }).catch(() => {});
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 4 — ruolo VIP permanente",
            roleId: VIP_ID,
            week: 4,
          }).catch(() => {});
        }
      } catch (err) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Event reward for user", userId, err);
      }
    }
  }
  if (eventWeek >= 1 && eventWeek <= 4 && NEWS_CHANNEL_ID) {
    await sendEventWeekAnnouncementToNews(client, guild, eventWeek, eventTopMessages, eventTopVoice);
  }
  if (eventWeek >= 1 && eventWeek <= 4 && settings) {
    await giveWeekly20PointsIfEligible(guild, eventWeek, settings).catch((err) => {
      global.logger?.error?.("[WEEKLY ACTIVITY] Staff event weekly 20 pts failed:", err);
    });
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        `<:VC_Leaderboard:1469659357678669958> // I vantaggi che avete sbloccato sono in "badge" nel canale <#${INFO_CHANNEL_ID}>`,
        "",
        `<a:VC_HeartsBlue:1468686100045369404> • **Classifica testuale:**`,
        ...messageRows,
        "",
        `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
        ...voiceRows,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null);

  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId
    ? `<@${awarded.messageWinner.userId}>`
    : "Nessun vincitore";
  const voiceWinnerMention = awarded?.voiceWinner?.userId
    ? `<@${awarded.voiceWinner.userId}>`
    : "Nessun vincitore";

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Chat")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogCute:1331620415185096746>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"),
    new ButtonBuilder()
      .setLabel("Vocal")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogJuice:1331620486517358613>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),
  );

  await channel
    .send({
      content: `<@&${IDs.roles.Member}>
<a:VC_Winner:1448687700235256009> Ciao a tutti! Annunciamo i vincitori di questa settimana per attività.

<a:VC_Arrow:1448672967721615452> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__**.
<a:VC_Arrow:1448672967721615452> Con un totale di **${voiceWinnerTotal} exp**, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__**.
_ _`,
      embeds: [embed],
      components: [button],
    })
    .catch((error) => {
      global.logger.error(
        "[WEEKLY ACTIVITY] Failed to send winners message:",
        error,
      );
    });
}

async function resetWeeklyActivityCounters(client, options = {}) {
  const channel =
    client.channels.cache.get(TARGET_CHANNEL_ID) ||
    (await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null));
  const guildId = channel?.guild?.id;
  if (!guildId) return;

  const now = new Date();
  const nextWeekKey =
    options.nextWeekKey != null ? options.nextWeekKey : getNextWeekKey(now);

  await Promise.all([
    ActivityUser.updateMany(
      { guildId },
      {
        $set: {
          "messages.weekly": 0,
          "messages.weeklyKey": nextWeekKey,
          "voice.weeklySeconds": 0,
          "voice.weeklyKey": nextWeekKey,
        },
      },
    ),
    ExpUser.updateMany(
      { guildId },
      {
        $set: {
          weeklyExp: 0,
          weeklyKey: nextWeekKey,
        },
      },
    ),
  ]);
}

function startWeeklyActivityWinnersLoop(client) {
  cron.schedule(
    "0 21 * * 0",
    async () => {
      try {
        await publishWeeklyActivityWinners(client);
        await resetWeeklyActivityCounters(client);
      } catch (error) {
        global.logger.error(
          "[WEEKLY ACTIVITY] Scheduled execution failed:",
          error,
        );
      }
    },
    { timezone: TIME_ZONE },
  );
  cron.schedule(
    "0 21 * * *",
    async () => {
      try {
        await trySendEventEndAnnouncementToNews(client);
      } catch (error) {
        global.logger.error(
          "[WEEKLY ACTIVITY] Event end announcement failed:",
          error,
        );
      }
    },
    { timezone: TIME_ZONE },
  );

  const runRecoveryIfNeeded = async () => {
    const now = new Date();
    const weekday = getWeekdayRome(now);
    if (weekday !== "Mon" && weekday !== "Tue") return;
    const channel =
      client.channels.cache.get(TARGET_CHANNEL_ID) ||
      (await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null));
    const guildId = channel?.guild?.id;
    if (!guildId) return;
    const currentWeekKey = getWeekKey(now);
    const alreadyReset = await ActivityUser.exists({
      guildId,
      "messages.weeklyKey": currentWeekKey,
    }).catch(() => false);
    if (alreadyReset) return;
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const previousWeekKey = getWeekKey(yesterday);
    if (previousWeekKey === currentWeekKey) return;
    try {
      global.logger.info(
        "[WEEKLY ACTIVITY] Recovery: running missed weekly winners (bot was likely offline Sunday 21:00).",
      );
      await publishWeeklyActivityWinners(client, { weekKey: previousWeekKey });
      await resetWeeklyActivityCounters(client, {
        nextWeekKey: currentWeekKey,
      });
    } catch (error) {
      global.logger.error("[WEEKLY ACTIVITY] Recovery run failed:", error);
    }
  };

  runRecoveryIfNeeded();
}

module.exports = {
  startWeeklyActivityWinnersLoop,
  publishWeeklyActivityWinners,
  resetWeeklyActivityCounters,
  getEventWeekDateKeys,
  loadActivityRowsFromDateKeys,
};