const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildAlbumUrl, formatNumber } = require("./lastfm");

const TOPALBUMS_EMOJIS = {
  first: { id: "1463196324156674289" },
  prev: { id: "1463196506143326261" },
  next: { id: "1463196456964980808" },
  last: { id: "1463196404120813766" },
  jump: { id: "1463196369123676414" }
};

const BILLBOARD_MOVE_EMOJIS = {
  downSmall: "<:1_to_5_down:1463282374707118123>",
  upLarge: "<:5_or_more_up:1463282376879636608>",
  same: "<:same_position:1463282381916995802>",
  downLarge: "<:5_or_more_down:1463282383854764093>",
  upSmall: "<:1_to_5_up:1463282385272700951>",
  isNew: "<:new1:1463282949159129320>"
};

function formatPeriodLabel(period) {
  switch (period) {
    case "7day":
      return "weekly";
    case "1month":
      return "monthly";
    case "3month":
      return "quarterly";
    case "6month":
      return "half-year";
    case "12month":
      return "yearly";
    case "overall":
      return "overall";
    default:
      return "weekly";
  }
}

function getMovementEmoji(currentRank, prevRank) {
  if (!prevRank) return BILLBOARD_MOVE_EMOJIS.isNew;
  const delta = prevRank - currentRank;
  if (delta === 0) return BILLBOARD_MOVE_EMOJIS.same;
  if (delta > 0) return delta >= 5 ? BILLBOARD_MOVE_EMOJIS.upLarge : BILLBOARD_MOVE_EMOJIS.upSmall;
  const down = Math.abs(delta);
  return down >= 5 ? BILLBOARD_MOVE_EMOJIS.downLarge : BILLBOARD_MOVE_EMOJIS.downSmall;
}

function buildTopAlbumsLines(albums, offset) {
  return albums.map((album, index) => {
    const artist = album.artist?.name || "Sconosciuto";
    const name = album.name || "Senza titolo";
    const plays = album.playcount || 0;
    const url = buildAlbumUrl(artist, name);
    return `${offset + index + 1}. **${artist}** - [${name}](${url}) - ${plays} plays`;
  });
}

function buildBillboardLines(albums, offset, prevRanks, numberFormat) {
  return albums.map((album, index) => {
    const artist = album.artist?.name || "Sconosciuto";
    const name = album.name || "Senza titolo";
    const playsValue = Number(album.playcount || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const key = `${artist}||${name}`.toLowerCase();
    const currentRank = offset + index + 1;
    const prevRank = prevRanks?.get(key) || null;
    const emoji = getMovementEmoji(currentRank, prevRank);
    const label = playsValue === 1 ? "play" : "plays";
    return `${emoji} \`${currentRank}\` • **${artist} - ${name}**- _${plays} ${label}_`;
  });
}

function buildTopAlbumsEmbed({
  displayName,
  albums,
  page,
  totalPages,
  totalAlbums,
  period,
  limit,
  numberFormat,
  billboard,
  prevRanks,
  compareLabel
}) {
  const offset = (page - 1) * limit;
  const lines = billboard
    ? buildBillboardLines(albums, offset, prevRanks, numberFormat)
    : buildTopAlbumsLines(albums, offset);
  const periodLabel = formatPeriodLabel(period);
  const totalText = formatNumber(totalAlbums || 0, numberFormat);
  const footerLines = [
    `Page ${page}/${totalPages} - ${totalText} different albums`
  ];
  if (billboard) {
    footerLines.push(`Billboard mode enabled${compareLabel ? " - Comparing to " + compareLabel : ""}`);
  } else {
    footerLines.push("View as billboard by adding 'billboard' or 'bb'");
  }
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Top ${periodLabel} albums for ${displayName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: footerLines.join("\n") });
}

function buildTopAlbumsComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_topalbums:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPALBUMS_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topalbums:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPALBUMS_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topalbums:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPALBUMS_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_topalbums:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPALBUMS_EMOJIS.last)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_topalbums:jump:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPALBUMS_EMOJIS.jump)
  );
  return [row];
}

module.exports = { buildTopAlbumsEmbed, buildTopAlbumsComponents };
