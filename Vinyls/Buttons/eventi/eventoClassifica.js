const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EVENTO_CLASSIFICA_PREFIX } = require("../ids/stats");
const { getEventWeekDateKeys, loadActivityRowsFromDateKeys } = require("../../Services/Community/weeklyActivityWinnersService");
const { getEventWeekNumber, getTop10ExpDuringEvent } = require("../../Services/Community/activityEventRewardsService");
const { isEventStaffMember, getGuildExpSettings } = require("../../Services/Community/expService");
const { ActivityUser } = require("../../Schemas/Community/communitySchemas");

const name = "eventoClassifica";
const label = "Evento Classifica";
const description = "Pulsanti settimana per la classifica evento EXP.";
const order = 9;

const MAX_WEEKS = 4;
const TIME_ZONE = "Europe/Rome";

function formatVoiceHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
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
    hour: Number(map.hour),
  };
}

function getWeekdayRome(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  });
  return formatter.format(date);
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

function getActiveWeeklyKey(date = new Date()) {
  const weekday = getWeekdayRome(date);
  const { hour } = getTimeParts(date);
  if (weekday === "Sun" && hour >= 21) {
    return getNextWeekKey(date);
  }
  return getWeekKey(date);
}

async function resolveUserTag(client, userId) {
  if (!client || !userId) return `\`${userId}\``;
  const u = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
  return u ? `<@${userId}>` : `\`${userId}\``;
}

async function filterNonStaffTop(guild, list, limit = 10) {
  if (!guild || !Array.isArray(list)) return [];
  const cap = Math.max(0, Math.min(100, Number(limit) || 10));
  const out = [];
  for (const item of list) {
    if (out.length >= cap) break;
    const userId = String(item?.userId ?? item?.user ?? "");
    if (!userId) continue;
    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (isEventStaffMember(member)) continue;
    out.push({ ...item, userId });
  }
  return out;
}

function buildWeekButtonsRow(settings, selectedWeek) {
  const currentEventWeek = settings ? getEventWeekNumber(settings) : 0;
  const hasWeekButtons = currentEventWeek >= 2;
  if (!hasWeekButtons) return null;

  const row = new ActionRowBuilder();
  const maxUnlocked = Math.min(currentEventWeek, MAX_WEEKS);
  const week = Math.max(1, Math.min(MAX_WEEKS, Number(selectedWeek) || 1));

  for (let w = 1; w <= maxUnlocked; w++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${EVENTO_CLASSIFICA_PREFIX}${w}`)
        .setEmoji(`<a:VC_Calendar:1448670320180592724>`)
        .setLabel(`${w}`)
        .setStyle(w === week ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}

async function buildEventoClassificaPayload(guild, client, settings, weekNum) {
  const week = Math.max(1, Math.min(MAX_WEEKS, Number(weekNum) || 1));
  const currentEventWeek = settings ? getEventWeekNumber(settings) : 0;
  let rows = [];
  if (week === currentEventWeek && currentEventWeek >= 1) {
    const activeWeeklyKey = getActiveWeeklyKey(new Date());
    const weeklyRows = await ActivityUser.find(
      {
        guildId: guild.id,
        $or: [
          { "messages.weeklyKey": activeWeeklyKey },
          { "voice.weeklyKey": activeWeeklyKey },
        ],
      },
      { userId: 1, messages: 1, voice: 1 },
    ).lean().catch(() => []);
    rows = weeklyRows.map((row) => ({
      userId: String(row?.userId || ""),
      messageCount: Math.max(0, Number(row?.messages?.weekly || 0)),
      voiceSeconds: Math.max(0, Number(row?.voice?.weeklySeconds || 0)),
    }));
  } else {
    const eventStart = settings?.eventStartedAt ? new Date(settings.eventStartedAt) : null;
    const dateKeys = eventStart ? getEventWeekDateKeys(eventStart, week) : [];
    rows = dateKeys.length ? await loadActivityRowsFromDateKeys(guild, dateKeys) : [];
  }

  const sortedMessages = [...rows].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 25);
  const sortedVoice = [...rows].sort((a, b) => (b.voiceSeconds || 0) - (a.voiceSeconds || 0)).slice(0, 25);
  const top10Messages = await filterNonStaffTop(guild, sortedMessages, 10);
  const top10Voice = await filterNonStaffTop(guild, sortedVoice, 10);
  const expCandidates = await getTop10ExpDuringEvent(guild.id, 25);
  const top10Exp = await filterNonStaffTop(guild, expCandidates, 10);

  const linesMessages = [];
  for (let i = 0; i < top10Messages.length; i++) {
    const tag = await resolveUserTag(client, top10Messages[i].userId);
    linesMessages.push(`${i + 1}. ${tag} <a:VC_Arrow:1448672967721615452> **${top10Messages[i].messageCount}** messaggi`);
  }
  if (linesMessages.length === 0) linesMessages.push("<:vegax:1443934876440068179> *Nessun dato*");

  const linesVoice = [];
  for (let i = 0; i < top10Voice.length; i++) {
    const tag = await resolveUserTag(client, top10Voice[i].userId);
    linesVoice.push(`${i + 1}. ${tag} <a:VC_Arrow:1448672967721615452> **${formatVoiceHours(top10Voice[i].voiceSeconds)}**`);
  }
  if (linesVoice.length === 0) linesVoice.push("<:vegax:1443934876440068179> *Nessun dato*");

  const linesExp = [];
  for (let i = 0; i < top10Exp.length; i++) {
    const tag = await resolveUserTag(client, top10Exp[i].userId);
    linesExp.push(`${i + 1}. ${tag} <a:VC_Arrow:1448672967721615452> **${top10Exp[i].expDuringEvent.toLocaleString("it-IT")}** EXP`);
  }
  if (linesExp.length === 0) linesExp.push("<:vegax:1443934876440068179> *Nessun dato*");

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1469659357678669958> Classifica evento — <a:VC_Calendar:1448670320180592724> Settimana ${week}`)
    .setDescription(
      [
        "<:VC_Chat:1448694742237053061> **Top 10 messaggi**",
        linesMessages.join("\n"),
        "",
        "<:voice:1467639623735054509> **Top 10 ore in vocale**",
        linesVoice.join("\n"),
        "",
        "<:VC_EXP:1468714279673925883>**Top 10 EXP totale**",
        linesExp.join("\n"),
      ].join("\n"),
    )
    .setFooter({ text: "Aggiornata in tempo reale • Cambia settimana con i pulsanti" })
    .setTimestamp();

  const hasWeekButtons = currentEventWeek >= 2;
  if (!hasWeekButtons) embed.setFooter({ text: "Aggiornata in tempo reale" });

  const components = [];
  const row = buildWeekButtonsRow(settings, week);
  if (row) components.push(row);

  return { embeds: [embed], components };
}

function match(interaction) {
  return String(interaction?.customId || "").startsWith(EVENTO_CLASSIFICA_PREFIX);
}

async function execute(interaction) {
  const weekNum = Number(interaction.customId.replace(EVENTO_CLASSIFICA_PREFIX, "")) || 1;
  try {
    await interaction.deferUpdate();
    const guildId = interaction.guild?.id;
    const settings = guildId ? await getGuildExpSettings(guildId) : null;
    if (!settings?.eventExpiresAt || !interaction.guild) {
      await interaction.message.edit({ content: "<:vegax:1443934876440068179> Evento non attivo.", embeds: [], components: [] }).catch(() => null);
      return true;
    }
    const payload = await buildEventoClassificaPayload(interaction.guild, interaction.client, settings, weekNum);
    await interaction.message.edit(payload).catch(() => null);
  } catch (error) {
    global.logger?.error?.("[EVENTO CLASSIFICA BUTTON] Failed:", error);
    const { sendControlErrorFallback } = require("../../Utils/Interaction/buttonParsers");
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute, buildEventoClassificaPayload, buildWeekButtonsRow, EVENTO_CLASSIFICA_PREFIX, MAX_WEEKS };