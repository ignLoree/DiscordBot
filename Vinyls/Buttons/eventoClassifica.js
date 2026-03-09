const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getGuildExpSettings } = require("../Services/Community/expService");
const { getEventWeekTopThreeTextAndVoice } = require("../Services/Community/weeklyActivityWinnersService");
const EVENTO_CLASSIFICA_PREFIX = "evento_classifica:";
const MAX_WEEKS = 4;
const TROPHY_LABELS = ["<:VC_Podio1:1469659449974329598>", "<:VC_Podio2:1469659512863592500>", "<:VC_Podio3:1469659557696504024>"];

function formatVoiceDuration(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = (s / 3600).toFixed(1);
  return `${h}h`;
}

function match(interaction) {
  const id = interaction?.customId || "";
  return interaction.isButton() && (id === EVENTO_CLASSIFICA_PREFIX || id.startsWith(`${EVENTO_CLASSIFICA_PREFIX}`));
}

async function execute(interaction, client) {
  const customId = interaction.customId || "";
  if (!customId.startsWith(EVENTO_CLASSIFICA_PREFIX)) return false;
  const weekStr = customId.slice(EVENTO_CLASSIFICA_PREFIX.length).trim();
  const week = Math.max(1, Math.min(MAX_WEEKS, Number.parseInt(weekStr || "1", 10) || 1));

  const guild = interaction.guild;
  if (!guild) return false;
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  if (!settings?.eventExpiresAt || !settings?.eventStartedAt) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Nessun evento attivo.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  try {
    const payload = await buildEventoClassificaPayload(guild, client, settings, week);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
    } else {
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => { });
      });
    }
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/eventoClassifica] execute", err);
    await interaction.reply({ content: "<:vegax:1443934876440068179> Errore durante l'aggiornamento.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
}

async function buildEventoClassificaPayload(guild, currentWeek) {
  const { topMessages, topVoice } = await getEventWeekTopThreeTextAndVoice(guild, currentWeek);

  const msgLines = topMessages.length
    ? topMessages.map((item, i) => `${TROPHY_LABELS[i] || ""}<@${item.userId}> <a:VC_Arrow:1448672967721615452> **${item.messageCount}** _messaggi_`)
    : ["<:VC_Info:1448670089670037675> - Nessun dato per la classifica testuale."];
  const voiceLines = topVoice.length
    ? topVoice.map((item, i) => `${TROPHY_LABELS[i] || ""}<@${item.userId}> <a:VC_Arrow:1448672967721615452> **${formatVoiceDuration(item.voiceSeconds)}** _in vocale_`)
    : ["<:VC_Info:1448670089670037675> - Nessun dato per la classifica vocale."];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1469659357678669958> Evento Activity EXP — Settimana ${currentWeek}`)
    .setDescription(
      [
        "<a:VC_HeartsPink:1468685897389052008> **Top 3 testuale**:",
        ...msgLines,
        "",
        "<a:VC_HeartsBlue:1468686100045369404> **Top 3 vocale**:",
        ...voiceLines,
      ].join("\n")
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: `Settimana ${currentWeek} di evento • Classifica settimanale` })
    .setTimestamp();

  const row = new ActionRowBuilder();
  for (let w = 1; w <= MAX_WEEKS; w++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${EVENTO_CLASSIFICA_PREFIX}${w}`)
        .setEmoji(`<a:VC_Calendar:1448670320180592724>`)
        .setStyle(w === currentWeek ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }

  return { embeds: [embed], components: [row] };
}

module.exports = { name: "eventoClassifica", order: 10, match, execute, EVENTO_CLASSIFICA_PREFIX, MAX_WEEKS, buildEventoClassificaPayload };