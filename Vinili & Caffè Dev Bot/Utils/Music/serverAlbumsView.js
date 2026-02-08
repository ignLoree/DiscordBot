const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

const SERVERALBUMS_MOVE_EMOJIS = {
  downSmall: "<:1_to_5_down:1463282374707118123>",
  upLarge: "<:5_or_more_up:1463282376879636608>",
  same: "<:same_position:1463282381916995802>",
  downLarge: "<:5_or_more_down:1463282383854764093>",
  upSmall: "<:1_to_5_up:1463282385272700951>",
  isNew: "<:new1:1463282949159129320>"
};

const SERVERALBUMS_NAV_EMOJIS = {
  first: { id: "1463196324156674289" },
  prev: { id: "1463196506143326261" },
  next: { id: "1463196456964980808" },
  last: { id: "1463196404120813766" }
};

function getMovementEmoji(currentRank, prevRank) {
  if (!prevRank) return SERVERALBUMS_MOVE_EMOJIS.isNew;
  const delta = prevRank - currentRank;
  if (delta === 0) return SERVERALBUMS_MOVE_EMOJIS.same;
  if (delta > 0) {
    return delta >= 5 ? SERVERALBUMS_MOVE_EMOJIS.upLarge : SERVERALBUMS_MOVE_EMOJIS.upSmall;
  }
  const down = Math.abs(delta);
  return down >= 5 ? SERVERALBUMS_MOVE_EMOJIS.downLarge : SERVERALBUMS_MOVE_EMOJIS.downSmall;
}

function buildServerAlbumsLines({
  albums,
  prevRanks,
  numberFormat,
  fallbackOffset = 0,
  showArtist = true,
  showListeners = false
}) {
  const lines = [];
  albums.forEach((album, index) => {
    const artist = album.artist?.name || album.artist || "Sconosciuto";
    const name = album.name || "Senza titolo";
    const playsValue = Number(album.playcount || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const listenersValue = Number(album.listeners || 0);
    const listeners = formatNumber(listenersValue, numberFormat);
    const key = album.key || `${artist}||${name}`.toLowerCase();
    const currentRank = album.rank || (fallbackOffset + index + 1);
    const prevRank = prevRanks.get(key) || null;
    const emoji = getMovementEmoji(currentRank, prevRank);
    const prefixValue = showListeners ? listeners : String(currentRank);
    const label = playsValue === 1 ? "play" : "plays";
    const title = showArtist ? `${artist} - ${name}` : name;
    const separator = showArtist ? " • " : " • ";
    lines.push(`${emoji} \`${prefixValue}\`${separator}**${title}**- _${plays} ${label}_`);
  });
  return lines;
}

function buildServerAlbumsEmbed({
  displayName,
  albums,
  page,
  totalPages,
  prevRanks,
  numberFormat,
  limit,
  artistFilter,
  orderLabel,
  showArtist,
  showListeners
}) {
  const offset = (page - 1) * limit;
  const lines = buildServerAlbumsLines({
    albums,
    prevRanks,
    numberFormat,
    fallbackOffset: offset,
    showArtist,
    showListeners
  });
  const baseTitle = artistFilter
    ? `Top weekly '${artistFilter}' albums in Server di ${displayName}`
    : `Top weekly albums in Server di ${displayName}`;
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(baseTitle)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page}/${totalPages} - Ordered by ${orderLabel}\nView specific track listeners with '.whoknowsalbum'`});
}

function buildServerAlbumsComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_serveralbums:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERALBUMS_NAV_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_serveralbums:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERALBUMS_NAV_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_serveralbums:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERALBUMS_NAV_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_serveralbums:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(SERVERALBUMS_NAV_EMOJIS.last)
      .setDisabled(page >= totalPages)
  );
  return [row];
}

module.exports = { buildServerAlbumsEmbed, buildServerAlbumsComponents };
