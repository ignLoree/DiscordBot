"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getEventWeekDateKeys, loadActivityRowsFromDateKeys } = require("./weeklyActivityWinnersService");
const { getGuildExpSettings, getEventWeekNumber, getTop10ExpDuringEvent } = require("./activityEventRewardsService");
const { isEventStaffMember } = require("./expService");

const EVENTO_CLASSIFICA_PREFIX = "evento_classifica_week_";
const MAX_WEEKS = 4;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatVoiceHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function resolveUserTag(client, userId) {
  if (!client || !userId) return `\`${userId}\``;
  const u = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
  return u ? `<@${userId}>` : `\`${userId}\``;
}

/** Costruisce embed + componenti per +evento classifica, settimana weekNum (1-4). Dati in tempo reale. */
async function buildEventoClassificaPayload(guild, client, settings, weekNum) {
  const week = Math.max(1, Math.min(MAX_WEEKS, Number(weekNum) || 1));
  const eventStart = settings?.eventStartedAt ? new Date(settings.eventStartedAt) : null;
  const dateKeys = eventStart ? getEventWeekDateKeys(eventStart, week) : [];
  const rows = dateKeys.length
    ? await loadActivityRowsFromDateKeys(guild, dateKeys)
    : [];

  const sortedMessages = [...rows]
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
    .slice(0, 25);
  const sortedVoice = [...rows]
    .sort((a, b) => (b.voiceSeconds || 0) - (a.voiceSeconds || 0))
    .slice(0, 25);
  const top10Messages = await filterNonStaffTop(guild, sortedMessages, 10);
  const top10Voice = await filterNonStaffTop(guild, sortedVoice, 10);
  const expCandidates = await getTop10ExpDuringEvent(guild.id, 25);
  const top10Exp = await filterNonStaffTop(guild, expCandidates, 10);

  const linesMessages = [];
  for (let i = 0; i < top10Messages.length; i++) {
    const tag = await resolveUserTag(client, top10Messages[i].userId);
    linesMessages.push(`${i + 1}. ${tag} — **${top10Messages[i].messageCount}** messaggi`);
  }
  if (linesMessages.length === 0) linesMessages.push("*Nessun dato*");

  const linesVoice = [];
  for (let i = 0; i < top10Voice.length; i++) {
    const tag = await resolveUserTag(client, top10Voice[i].userId);
    linesVoice.push(`${i + 1}. ${tag} — **${formatVoiceHours(top10Voice[i].voiceSeconds)}**`);
  }
  if (linesVoice.length === 0) linesVoice.push("*Nessun dato*");

  const linesExp = [];
  for (let i = 0; i < top10Exp.length; i++) {
    const tag = await resolveUserTag(client, top10Exp[i].userId);
    linesExp.push(`${i + 1}. ${tag} — **${top10Exp[i].expDuringEvent.toLocaleString("it-IT")}** EXP`);
  }
  if (linesExp.length === 0) linesExp.push("*Nessun dato*");

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1469659357678669958> Classifica evento — Settimana ${week}`)
    .setDescription(
      [
        "**Top 10 messaggi** (settimana)",
        linesMessages.join("\n"),
        "",
        "**Top 10 ore in vocale** (settimana)",
        linesVoice.join("\n"),
        "",
        "**Top 10 EXP totale** (da inizio evento)",
        linesExp.join("\n"),
      ].join("\n"),
    )
    .setFooter({ text: "Aggiornata in tempo reale • Cambia settimana con i pulsanti" })
    .setTimestamp();

  const row = new ActionRowBuilder();
  for (let w = 1; w <= MAX_WEEKS; w++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${EVENTO_CLASSIFICA_PREFIX}${w}`)
        .setLabel(`Sett. ${w}`)
        .setStyle(w === week ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  return { embeds: [embed], components: [row] };
}

module.exports = {
  EVENTO_CLASSIFICA_PREFIX,
  MAX_WEEKS,
  buildEventoClassificaPayload,
};
