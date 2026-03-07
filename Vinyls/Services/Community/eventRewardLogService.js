const { EmbedBuilder } = require("discord.js");
const { sendDm } = require("../../Utils/noDmList");
const EVENT_REWARD_LOG_CHANNEL_ID = "1477994178230095903";

/**
 * Invia un embed nel canale log per ogni premio evento assegnato (livelli, ruoli, reward una tantum).
 * @param {import("discord.js").Client} client - Client Discord
 * @param {Object} data
 * @param {string} data.userId - ID utente
 * @param {string} [data.guildId] - ID guild (opzionale)
 * @param {string} data.label - Tipo premio (es. "Voto Discadia", "Top settimana 1", "Ruolo Supporter")
 * @param {string} [data.detail] - Dettaglio/nota
 * @param {number} [data.levels] - Livelli assegnati
 * @param {string} [data.roleId] - Ruolo assegnato (menzione nel campo)
 * @param {number} [data.week] - Settimana evento (1-4) se applicabile
 */
async function sendEventRewardLog(client, data) {
  if (!client?.channels) return;
  const channel = client.channels.cache.get(EVENT_REWARD_LOG_CHANNEL_ID) || (await client.channels.fetch(EVENT_REWARD_LOG_CHANNEL_ID).catch(() => null));
  if (!channel) return;
  const userId = String(data?.userId || "");
  const label = String(data?.label || "<a:VC_Events:1448688007438667796> Premio evento");
  const detail = data?.detail != null ? String(data.detail) : null;
  const levels = data?.levels != null && Number.isFinite(Number(data.levels)) ? Number(data.levels) : null;
  const roleId = data?.roleId ? String(data.roleId) : null;
  const week = data?.week != null && Number.isFinite(Number(data.week)) ? Number(data.week) : null;

  const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:VC_EXP:1468714279673925883> Premio evento assegnato").setDescription(`**Utente:** <@${userId}>`)
    .addFields({ name: "<:VC_Info:1460670816214585481> Tipo", value: label, inline: true });

  if (levels != null && levels > 0) {
    embed.addFields({ name: "<:VC_EXP:1468714279673925883> Livelli", value: `+${levels}`, inline: true });
  }
  if (roleId) {
    embed.addFields({ name: "<:VC_Mention:1443994358201323681> Ruolo", value: `<@&${roleId}>`, inline: true });
  }
  if (week != null) {
    embed.addFields({ name: "<a:VC_Calendar:1448670320180592724> Settimana", value: `${week}`, inline: true });
  }
  if (detail) {
    embed.addFields({ name: "<:VC_Info:1460670816214585481> Dettaglio", value: detail, inline: false });
  }
  embed.setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => { });
}

async function sendEventRewardSkippedLog(client, data) {
  if (!client?.channels) return;
  const channel = client.channels.cache.get(EVENT_REWARD_LOG_CHANNEL_ID) || (await client.channels.fetch(EVENT_REWARD_LOG_CHANNEL_ID).catch(() => null));
  if (!channel) return;

  const userId = String(data?.userId || "");
  const label = String(data?.label || "<a:VC_Events:1448688007438667796> Premio evento");

  const embed = new EmbedBuilder().setColor("#99aab5").setTitle("<:VC_page3:1463196404120813766> Premio già assegnato")
    .setDescription(`<:VC_Info:1460670816214585481> **Utente:** <@${userId}>`)
    .addFields({ name: "<:VC_Info:1460670816214585481> Tipo", value: label, inline: true })
    .addFields({ name: "<:VC_Info:1460670816214585481> Motivo", value: "Già ricevuto per questo evento", inline: true })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => { });
}

/**
 * Invia in DM all'utente un messaggio per il premio evento ricevuto.
 * Non rispetta +dm-disable (bypassNoDm: true) perché sono comunicazioni importanti sui premi.
 * @param {import("discord.js").Client} client
 * @param {string} userId
 * @param {string} guildId
 * @param {Object} data - label, detail?, levels?, roleId?, week?
 */
async function sendEventRewardDm(client, userId, guildId, data) {
  if (!client?.users || !userId || !guildId) return;
  const user = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
  if (!user?.send) return;

  const label = String(data?.label || "<a:VC_Events:1448688007438667796> Premio evento");
  const levels = data?.levels != null && Number.isFinite(Number(data.levels)) ? Number(data.levels) : null;
  const roleId = data?.roleId ? String(data.roleId) : null;
  const week = data?.week != null && Number.isFinite(Number(data.week)) ? Number(data.week) : null;

  const eventName = "<a:VC_Events:1448688007438667796> Activity EXP Event";
  const lines = [`<:VC_EXP:1468714279673925883> Per **${label}**nell '${eventName} ti è stato assegnato:`, "",];
  if (levels != null && levels > 0) {
    lines.push(`<:VC_EXP:1468714279673925883> **+${levels} livelli** al tuo contatore EXP.`, "");
  }
  if (roleId) {
    lines.push(`<:VC_Mention:1443994358201323681> Ruolo <@&${roleId}>.`, "");
  }
  if (week != null) {
    lines.push(`<a:VC_Calendar:1448670320180592724> Premio della **settimana ${week}** dell'evento.`, "");
  }
  lines.push("<a:VC_ThankYou:1330186319673950401> Grazie per aver partecipato!");

  const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("<a:VC_Events:1448688007438667796> Premio Activity EXP Event").setDescription(lines.join("\n")).setTimestamp();

  await sendDm(user, { embeds: [embed] }, { guildId, bypassNoDm: true });
}

module.exports = { sendEventRewardLog, sendEventRewardSkippedLog, sendEventRewardDm, EVENT_REWARD_LOG_CHANNEL_ID };