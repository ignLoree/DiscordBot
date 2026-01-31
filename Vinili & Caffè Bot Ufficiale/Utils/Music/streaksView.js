const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildArtistUrl, buildAlbumUrl, buildTrackUrl } = require("./lastfm");

const STREAKS_NAV_EMOJIS = {
  prev: { id: "1462914743416131816" },
  next: { id: "1443673039156936837" }
};

function formatDateRange(start, end) {
  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.floor(end.getTime() / 1000);
  return `<t:${startTs}:D> <t:${startTs}:t> til <t:${endTs}:t>`;
}
function playsLabel(count) {
  return count === 1 ? "play" : "plays";
}

function buildStreaksEmbed({ entries }) {
  const lines = entries.map((entry, index) => {
    const dateLabel = formatDateRange(new Date(entry.startedAt), new Date(entry.lastPlayedAt));
    return [
      `${index + 1}. ${dateLabel}`,
      `\`Artist:\` **[${entry.artistName}](${buildArtistUrl(entry.artistName)})** - ${entry.artistPlays} ${playsLabel(entry.artistPlays)}`,
      `\`Album:\` **[${entry.albumName}](${buildAlbumUrl(entry.artistName, entry.albumName)})** - ${entry.albumPlays} ${playsLabel(entry.albumPlays)}`,
      `\`Track:\` **[${entry.trackName}](${buildTrackUrl(entry.artistName, entry.trackName)})** - ${entry.trackPlays} ${playsLabel(entry.trackPlays)}`
    ].join("\n");
  });

  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(lines.join("\n\n"));
}

function buildStreaksComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lfm_strs:prev:${messageId}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(STREAKS_NAV_EMOJIS.prev)
        .setDisabled(prevDisabled),
      new ButtonBuilder()
        .setCustomId(`lfm_strs:next:${messageId}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(STREAKS_NAV_EMOJIS.next)
        .setDisabled(nextDisabled)
    )
  ];
}

module.exports = { buildStreaksEmbed, buildStreaksComponents };