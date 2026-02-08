const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

const SERVERARTISTS_MOVE_EMOJIS = {
  downSmall: "<:1_to_5_down:1463282374707118123>",
  upLarge: "<:5_or_more_up:1463282376879636608>",
  same: "<:same_position:1463282381916995802>",
  downLarge: "<:5_or_more_down:1463282383854764093>",
  upSmall: "<:1_to_5_up:1463282385272700951>",
  isNew: "<:new1:1463282949159129320>"
};

const SERVERARTISTS_NAV_EMOJIS = {
  first: { id: "1463196324156674289" },
  prev: { id: "1463196506143326261" },
  next: { id: "1463196456964980808" },
  last: { id: "1463196404120813766" }
};

function getMovementEmoji(currentRank, prevRank) {
  if (!prevRank) return SERVERARTISTS_MOVE_EMOJIS.isNew;
  const delta = prevRank - currentRank;
  if (delta === 0) return SERVERARTISTS_MOVE_EMOJIS.same;
  if (delta > 0) return delta >= 5 ? SERVERARTISTS_MOVE_EMOJIS.upLarge : SERVERARTISTS_MOVE_EMOJIS.upSmall;
  const down = Math.abs(delta);
  return down >= 5 ? SERVERARTISTS_MOVE_EMOJIS.downLarge : SERVERARTISTS_MOVE_EMOJIS.downSmall;
}

function buildServerArtistsLines({ artists, prevRanks, numberFormat, fallbackOffset = 0, showListeners = false }) {
  const lines = [];
  artists.forEach((artist, index) => {
    const name = artist.name || "Sconosciuto";
    const playsValue = Number(artist.playcount || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const listenersValue = Number(artist.listeners || 0);
    const listeners = formatNumber(listenersValue, numberFormat);
    const key = artist.key || name.toLowerCase();
    const currentRank = artist.rank || (fallbackOffset + index + 1);
    const prevRank = prevRanks.get(key) || null;
    const emoji = getMovementEmoji(currentRank, prevRank);
    const prefixValue = showListeners ? listeners : String(currentRank);
    const label = playsValue === 1 ? "play" : "plays";
    lines.push(`${emoji} \`${prefixValue}\` • **${name}** - _${plays} ${label}_`);
  });
  return lines;
}

function buildServerArtistsEmbed({
  displayName,
  artists,
  page,
  totalPages,
  prevRanks,
  numberFormat,
  limit,
  orderLabel,
  showListeners
}) {
  const offset = (page - 1) * limit;
  const lines = buildServerArtistsLines({
    artists,
    prevRanks,
    numberFormat,
    fallbackOffset: offset,
    showListeners
  });
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Top weekly artists in Server di ${displayName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page}/${totalPages} - Ordered by ${orderLabel}\nAvailable time periods: alltime, monthly, weekly and daily` });
}

function buildServerArtistsComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_serverartists:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERARTISTS_NAV_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_serverartists:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERARTISTS_NAV_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_serverartists:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERARTISTS_NAV_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_serverartists:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERARTISTS_NAV_EMOJIS.last)
      .setDisabled(page >= totalPages)
  );
  return [row];
}

module.exports = { buildServerArtistsEmbed, buildServerArtistsComponents };
