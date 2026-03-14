const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { ActivityDaily, ActivityUser, ExpUser } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, getLevelInfo, getCurrentWeekKey, } = require("../../Services/Community/expService");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const TOP_LIMIT = 10;
const LEADERBOARD_CHANNEL_ID = IDs.channels.commands;
const TIME_ZONE = "Europe/Rome";
const LEADERBOARD_CACHE_TTL_MS = 30 * 1000;
const leaderboardCache = new Map();

function getInvokedCommand(message) {
  const content = String(message?.content || "").trim();
  if (!content.startsWith("+")) return "";
  const tokens = content.slice(1).split(/\s+/).filter(Boolean);
  return (tokens[0] ?? "").toLowerCase();
}

function rankLabel(index) {
  if (index === 0) return "<:VC_Podio1:1469659449974329598>";
  if (index === 1) return "<:VC_Podio2:1469659512863592500>";
  if (index === 2) return "<:VC_Podio3:1469659557696504024>";
  return `${index + 1}°`;
}

function escapeInlineMarkdown(value) {
  return String(value || "")
    .replace(/([\\`*_~|>])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUserLabel(member, userId) {
  if (member) {
    const username = escapeInlineMarkdown(member.user?.username || member.user?.tag || member.displayName || "utente",);
    return `${member} (${username})`;
  }
  return `<@${userId}>`;
}

async function fetchMembers(guild, userIds) {
  const unique = Array.from(new Set(userIds));
  const out = new Map();
  if (!guild || unique.length === 0) return out;
  const missingIds = [];
  for (const id of unique) {
    const cached = guild.members.cache.get(id);
    if (cached) out.set(id, cached);
    else missingIds.push(id);
  }
  const fetchedMembers = await Promise.all(missingIds.map((id) => getGuildMemberCached(guild, id)));
  for (let index = 0; index < missingIds.length; index += 1) {
    const member = fetchedMembers[index];
    if (member) out.set(missingIds[index], member);
  }
  return out;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getRomeDayParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour || 0),
    weekday: weekdayMap[String(map.weekday || "Sun")] ?? 0,
  };
}

function getRomeDayKey(date) {
  const { year, month, day } = getRomeDayParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getWeekKeyRome(date = new Date()) {
  const { year, month, day } = getRomeDayParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getNextWeekKeyRome(date = new Date()) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getWeekKeyRome(next);
}

function getActiveWeeklyKeyRome(date = new Date()) {
  const parts = getRomeDayParts(date);
  if (parts.weekday === 0 && parts.hour >= 21) {
    return getNextWeekKeyRome(date);
  }
  return getWeekKeyRome(date);
}

async function resolveMemberRole(guild) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await guild.roles?.fetch(configuredId).catch(() => null));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

function extractChannelEntries(raw) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

async function getEligibleChannelIdSet(guild) {
  const role = await resolveMemberRole(guild);
  if (!role) return new Set();
  const excludedChannelIds = new Set(
    [IDs.channels?.ticket, IDs.channels?.ticketLogs]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const set = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(String(channel?.id || ""))) continue;
    if (isChannelInTicketCategory(channel)) continue;
    const perms = channel?.permissionsFor?.(role);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("SendMessages") || perms.has("Connect")) {
      set.add(String(channel.id));
    }
  }
  return set;
}

async function computeLeaderboardRows(guild, mode = "alltime", maxCandidates = TOP_LIMIT * 5) {
  if (!guild?.id) return [];
  const activeWeeklyKey = mode === "weekly" ? getActiveWeeklyKeyRome(new Date()) : "";
  const key = `${guild.id}:${mode}:${activeWeeklyKey}:n${maxCandidates}`;
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  if (mode === "weekly") {
    const docs = await ActivityUser.find(
      {
        guildId: guild.id,
        $or: [
          { "messages.weeklyKey": activeWeeklyKey },
          { "voice.weeklyKey": activeWeeklyKey },
        ],
      },
      { userId: 1, messages: 1, voice: 1 },
    ).limit(5000).lean().catch(() => []);

    const rows = docs
      .map((doc) => {
        const textCount = Math.max(0, Number(doc?.messages?.weekly || 0));
        const voiceSeconds = Math.max(0, Number(doc?.voice?.weeklySeconds || 0));
        const baseExpFromText = textCount * MESSAGE_EXP;
        const baseExpFromVoice = Math.floor((voiceSeconds * VOICE_EXP_PER_MINUTE) / 60);
        const exp = Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice));
        return {
          userId: String(doc?.userId || ""),
          exp,
          level: getLevelInfo(exp).level,
        };
      })
      .filter((entry) => entry.userId && entry.exp > 0)
      .sort((a, b) => b.exp - a.exp)
      .slice(0, Math.max(TOP_LIMIT * 5, maxCandidates));

    leaderboardCache.set(key, {
      rows,
      expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
    });
    return rows;
  }

  const eligibleChannels = await getEligibleChannelIdSet(guild);
  if (!eligibleChannels.size) return [];

  const filter = { guildId: guild.id };
  const perUser = new Map();
  const cursor = ActivityDaily.find(filter).select("userId textChannels voiceChannels").lean().cursor();

  for await (const row of cursor) {
    const userId = String(row?.userId || "");
    if (!userId) continue;

    let textCount = 0;
    let voiceSeconds = 0;

    for (const [channelId, value] of extractChannelEntries(row?.textChannels)) {
      if (!eligibleChannels.has(String(channelId))) continue;
      textCount += Math.max(0, Number(value || 0));
    }
    for (const [channelId, value] of extractChannelEntries(row?.voiceChannels)) {
      if (!eligibleChannels.has(String(channelId))) continue;
      voiceSeconds += Math.max(0, Number(value || 0));
    }

    if (textCount <= 0 && voiceSeconds <= 0) continue;
    const current = perUser.get(userId) || { userId, textCount: 0, voiceSeconds: 0 };
    current.textCount += textCount;
    current.voiceSeconds += voiceSeconds;
    perUser.set(userId, current);
  }

  const rows = Array.from(perUser.values()).map((entry) => { const baseExpFromText = entry.textCount * MESSAGE_EXP; const baseExpFromVoice = Math.floor((entry.voiceSeconds * VOICE_EXP_PER_MINUTE) / 60,); const exp = Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice)); return { userId: entry.userId, exp, level: getLevelInfo(exp).level, }; }).filter((entry) => entry.exp > 0).sort((a, b) => b.exp - a.exp).slice(0, Math.max(TOP_LIMIT * 5, maxCandidates)); if (mode === "alltime" && rows.length > 0) {
    const userIds = rows.map((r) => r.userId);
    const expUsers = await ExpUser.find({ guildId: guild.id, userId: { $in: userIds }, }).select("userId totalExp level").lean();
    const expByUser = new Map(expUsers.map((d) => [String(d.userId), { totalExp: Number(d.totalExp || 0), level: Number(d.level || 0) }]),);
    for (const row of rows) {
      const eu = expByUser.get(row.userId);
      if (eu != null) {
        row.level = eu.level > 0 ? eu.level : getLevelInfo(eu.totalExp).level;
      }
    }
  }

  leaderboardCache.set(key, {
    rows,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return rows;
}

async function computeExpUserLeaderboardRows(guild, mode, maxCandidates) {
  if (!guild?.id) return [];
  const weekKey = getCurrentWeekKey();
  const key = `${guild.id}:expuser:${mode}:${weekKey}:n${maxCandidates}`;
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const cap = Math.max(TOP_LIMIT * 5, maxCandidates);
  let rows = [];
  if (mode === "weekly") {
    const docs = await ExpUser.find({
      guildId: guild.id,
      weeklyKey: weekKey,
      weeklyExp: { $gt: 0 },
    })
      .select("userId weeklyExp level totalExp")
      .sort({ weeklyExp: -1 })
      .limit(cap)
      .lean()
      .catch(() => []);
    rows = docs.map((d) => ({
      userId: String(d.userId || ""),
      exp: Math.max(0, Math.floor(Number(d.weeklyExp || 0))),
      level: Number(d.level || 0) || getLevelInfo(Math.max(0, Number(d.totalExp || 0))).level,
    }));
  } else {
    const docs = await ExpUser.find({ guildId: guild.id, totalExp: { $gt: 0 } })
      .select("userId totalExp level")
      .sort({ totalExp: -1 })
      .limit(cap)
      .lean()
      .catch(() => []);
    rows = docs.map((d) => ({
      userId: String(d.userId || ""),
      exp: Math.max(0, Math.floor(Number(d.totalExp || 0))),
      level: Number(d.level || 0) || getLevelInfo(Math.max(0, Number(d.totalExp || 0))).level,
    }));
  }
  leaderboardCache.set(key, {
    rows,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return rows;
}

async function buildWeeklyEmbed(message, excludeStaffFromShort = false, useExpUserBoard = false) {
  const maxCand = excludeStaffFromShort ? TOP_LIMIT * 40 : TOP_LIMIT * 5;
  const candidateRows = useExpUserBoard
    ? await computeExpUserLeaderboardRows(message.guild, "weekly", maxCand)
    : await computeLeaderboardRows(message.guild, "weekly", maxCand);
  const staffId = IDs.roles?.Staff;
  const members = await fetchMembers(message.guild, candidateRows.map((r) => r.userId),);
  let rows = candidateRows.filter((row) => members.has(row.userId));
  if (excludeStaffFromShort && staffId) {
    rows = rows.filter((row) => !members.get(row.userId)?.roles?.cache?.has(staffId));
  }
  rows = rows.slice(0, TOP_LIMIT);
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.exp || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1468262952934314131> __${exp}__ EXP <:VC_EXP:1468714279673925883>`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile per questa settimana.");
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: message.guild.name,
      iconURL: message.guild.iconURL({ size: 128 }),
    })
    .setTitle("Classifica settimanale [Weekly]")
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(
      [
        useExpUserBoard
          ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più exp guadagnati in settimana [Weekly]"
          : null,
        excludeStaffFromShort ? "" : null,
      ]
        .filter((line) => line != null && line !== "")
        .join("\n") +
        "\n\n" +
        lines.join("\n"),
    );
}

async function buildAllTimeEmbed(message, excludeStaffFromShort = false, useExpUserBoard = false) {
  const maxCand = excludeStaffFromShort ? TOP_LIMIT * 40 : TOP_LIMIT * 5;
  const candidateRows = useExpUserBoard
    ? await computeExpUserLeaderboardRows(message.guild, "alltime", maxCand)
    : await computeLeaderboardRows(message.guild, "alltime", maxCand);
  const staffId = IDs.roles?.Staff;
  const members = await fetchMembers(message.guild, candidateRows.map((r) => r.userId),);
  let rows = candidateRows.filter((row) => members.has(row.userId));
  if (excludeStaffFromShort && staffId) {
    rows = rows.filter((row) => !members.get(row.userId)?.roles?.cache?.has(staffId));
  }
  rows = rows.slice(0, TOP_LIMIT);
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.exp || 0);
    const level = Number(row.level || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1468262952934314131> Exp: <:VC_EXP:1468714279673925883> __${exp}__ <a:VC_Arrow:1448672967721615452> Livello: ${level}`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile.");
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: message.guild.name,
      iconURL: message.guild.iconURL({ size: 128 }),
    })
    .setTitle("Classifica generale [AllTime]")
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(
      [
        useExpUserBoard
          ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più exp guadagnati [AllTime]"
          : null,
        excludeStaffFromShort ? "" : null,
      ]
        .filter((line) => line != null && line !== "")
        .join("\n") +
        "\n\n" +
        lines.join("\n"),
    );
}

module.exports = {
  name: "classifica",
  aliases: ["c", "cs", "classificasettimanale"],
  allowEmptyArgs: true,
  subcommands: ["alltime", "weekly"],
  subcommandAliases: {
    cs: "weekly",
    classificasettimanale: "weekly",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const invoked = getInvokedCommand(message);
    const shortInvoked = invoked === "c" || invoked === "cs";
    const excludeStaffFromShort = shortInvoked;
    const useExpUserBoard = shortInvoked;
    const rawMode = String(args[0] || "").toLowerCase();
    const normalizedMode = ["weekly", "settimanale", "week", "w"].includes(rawMode,) ? "weekly" : ["alltime", "all", "totale", "general", "generale", "a"].includes(rawMode,) ? "alltime" : null;
    const mode = normalizedMode || (invoked === "cs" || invoked === "classificasettimanale" ? "weekly" : "alltime");
    const isWeekly = mode === "weekly";

    if (rawMode && !normalizedMode) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Usa: `+classifica alltime` oppure `+classifica weekly`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const embed = isWeekly
      ? await buildWeeklyEmbed(message, excludeStaffFromShort, useExpUserBoard)
      : await buildAllTimeEmbed(message, excludeStaffFromShort, useExpUserBoard);

    const shouldRedirect = message.channel.id !== LEADERBOARD_CHANNEL_ID;
    if (!shouldRedirect) {
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const leaderboardChannel = message.guild.channels.cache.get(LEADERBOARD_CHANNEL_ID) || (await getGuildChannelCached(message.guild, LEADERBOARD_CHANNEL_ID));

    if (!leaderboardChannel || !leaderboardChannel.isTextBased()) {
      await safeMessageReply(message, {
        content: `Non riesco a trovare il canale <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sent = await leaderboardChannel.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      await safeMessageReply(message, {
        content: `Non sono riuscito a inviare la classifica in <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const label = isWeekly ? "Vai alla classifica settimanale" : "Vai alla classifica generale";
    const redirectEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(`Per evitare di intasare la chat, la classifica ${isWeekly ? "settimanale" : "generale"}` +
      ` è stata generata nel canale <#${LEADERBOARD_CHANNEL_ID}>.\n` +
      `[Clicca qui per vederla](${sent.url}) o utilizza il bottone sottostante.`);

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(sent.url),);

    await safeMessageReply(message, {
      embeds: [redirectEmbed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  },
};