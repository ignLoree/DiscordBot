const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

const TOPGENRES_EMOJIS = {
  first: { id: "1463196324156674289" },
  prev: { id: "1463196506143326261" },
  next: { id: "1463196456964980808" },
  last: { id: "1463196404120813766" }
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
      return "alltime";
    default:
      return "weekly";
  }
}

function buildTopGenresLines(genres, offset, numberFormat) {
  return genres.map((genre, index) => {
    const name = genre?.name || "Unknown";
    const playsValue = Number(genre?.plays || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const label = playsValue === 1 ? "play" : "plays";
    return `${offset + index + 1}. **${name}** - ${plays} ${label}`;
  });
}

function buildTopGenresEmbed({
  displayName,
  genres,
  page,
  totalPages,
  totalGenres,
  period,
  limit,
  numberFormat
}) {
  const offset = (page - 1) * limit;
  const lines = buildTopGenresLines(genres, offset, numberFormat);
  const periodLabel = formatPeriodLabel(period);
  const totalText = formatNumber(totalGenres || 0, numberFormat);
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Top ${periodLabel} artist genres for ${displayName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Genre source: Spotify\nPage ${page}/${totalPages} - ${totalText} total genres` });
}

function buildTopGenresComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_topgenres:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPGENRES_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topgenres:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPGENRES_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topgenres:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPGENRES_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_topgenres:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPGENRES_EMOJIS.last)
      .setDisabled(page >= totalPages)
  );
  return [row];
}

module.exports = { buildTopGenresEmbed, buildTopGenresComponents };
