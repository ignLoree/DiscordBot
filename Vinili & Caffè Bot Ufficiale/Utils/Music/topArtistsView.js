const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

const TOPARTISTS_EMOJIS = {
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
      return "overall";
    default:
      return "weekly";
  }
}

function buildTopArtistsLines(artists, offset, numberFormat) {
  return artists.map((artist, index) => {
    const name = artist?.name || "Sconosciuto";
    const playsValue = Number(artist?.playcount || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const label = playsValue === 1 ? "play" : "plays";
    return `${offset + index + 1}. **${name}** - ${plays} ${label}`;
  });
}

function buildTopArtistsEmbed({
  displayName,
  artists,
  page,
  totalPages,
  totalArtists,
  period,
  limit,
  numberFormat
}) {
  const offset = (page - 1) * limit;
  const lines = buildTopArtistsLines(artists, offset, numberFormat);
  const periodLabel = formatPeriodLabel(period);
  const totalText = formatNumber(totalArtists || 0, numberFormat);
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Top ${periodLabel} artists for ${displayName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page}/${totalPages} - ${totalText} different artists` });
}

function buildTopArtistsComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_topartists:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPARTISTS_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topartists:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPARTISTS_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_topartists:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPARTISTS_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_topartists:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPARTISTS_EMOJIS.last)
      .setDisabled(page >= totalPages)
  );
  return [row];
}

module.exports = { buildTopArtistsEmbed, buildTopArtistsComponents };
