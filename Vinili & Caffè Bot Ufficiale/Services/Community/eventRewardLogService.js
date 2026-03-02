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
  const channel =
    client.channels.cache.get(EVENT_REWARD_LOG_CHANNEL_ID) ||
    (await client.channels.fetch(EVENT_REWARD_LOG_CHANNEL_ID).catch(() => null));
  if (!channel) return;

  const userId = String(data?.userId || "");
  const label = String(data?.label || "Premio evento");
  const detail = data?.detail != null ? String(data.detail) : null;
  const levels = data?.levels != null && Number.isFinite(Number(data.levels)) ? Number(data.levels) : null;
  const roleId = data?.roleId ? String(data.roleId) : null;
  const week = data?.week != null && Number.isFinite(Number(data.week)) ? Number(data.week) : null;

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_EXP:1468714279673925883> Premio evento assegnato")
    .setDescription(`**Utente:** <@${userId}>`)
    .addFields({ name: "Tipo", value: label, inline: true });

  if (levels != null && levels > 0) {
    embed.addFields({ name: "Livelli", value: `+${levels}`, inline: true });
  }
  if (roleId) {
    embed.addFields({ name: "Ruolo", value: `<@&${roleId}>`, inline: true });
  }
  if (week != null) {
    embed.addFields({ name: "Settimana", value: `${week}`, inline: true });
  }
  if (detail) {
    embed.addFields({ name: "Dettaglio", value: detail, inline: false });
  }
  embed.setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
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
  const user =
    client.users.cache.get(userId) ||
    (await client.users.fetch(userId).catch(() => null));
  if (!user?.send) return;

  const label = String(data?.label || "Premio evento");
  const levels = data?.levels != null && Number.isFinite(Number(data.levels)) ? Number(data.levels) : null;
  const roleId = data?.roleId ? String(data.roleId) : null;
  const week = data?.week != null && Number.isFinite(Number(data.week)) ? Number(data.week) : null;

  const eventName = "**Activity EXP Event**";
  const lines = [
    `<:VC_EXP:1468714279673925883> Per **${label}** nell'${eventName} ti è stato assegnato:`,
    "",
  ];
  if (levels != null && levels > 0) {
    lines.push(`📈 **+${levels} livelli** al tuo contatore EXP.`, "");
  }
  if (roleId) {
    lines.push(`🎭 Ruolo <@&${roleId}>.`, "");
  }
  if (week != null) {
    lines.push(`📅 Premio della **settimana ${week}** dell'evento.`, "");
  }
  lines.push("Grazie per aver partecipato! <a:VC_HeartsPink:1468685897389052008>");

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Premio Activity EXP Event")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await sendDm(user, { embeds: [embed] }, { guildId, bypassNoDm: true });
}

module.exports = {
  sendEventRewardLog,
  sendEventRewardDm,
  EVENT_REWARD_LOG_CHANNEL_ID,
};
