const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildTrackUrl, formatNumber } = require("./lastfm");

const TOPTRACKS_EMOJIS = {
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

function buildTopTracksLines(tracks, offset) {
  return tracks.map((track, index) => {
    const artist = track.artist?.name || "Sconosciuto";
    const name = track.name || "Senza titolo";
    const plays = track.playcount || 0;
    const url = buildTrackUrl(artist, name);
    return `${offset + index + 1}. **${artist}** - [${name}](${url}) - ${plays} plays`;
  });
}

function buildBillboardLines(tracks, offset, prevRanks, numberFormat) {
  return tracks.map((track, index) => {
    const artist = track.artist?.name || "Sconosciuto";
    const name = track.name || "Senza titolo";
    const playsValue = Number(track.playcount || 0);
    const plays = formatNumber(playsValue, numberFormat);
    const key = `${artist}||${name}`.toLowerCase();
    const currentRank = offset + index + 1;
    const prevRank = prevRanks?.get(key) || null;
    const emoji = getMovementEmoji(currentRank, prevRank);
    const label = playsValue === 1 ? "play" : "plays";
    return `${emoji} \`${currentRank}\` · **${artist} - ${name}**- _${plays} ${label}_`;
  });
}

function buildTopTracksEmbed({
  displayName,
  tracks,
  page,
  totalPages,
  totalTracks,
  period,
  limit,
  numberFormat,
  billboard,
  prevRanks,
  compareLabel
}) {
  const offset = (page - 1) * limit;
  const lines = billboard
    ? buildBillboardLines(tracks, offset, prevRanks, numberFormat)
    : buildTopTracksLines(tracks, offset);
  const periodLabel = formatPeriodLabel(period);
  const totalText = formatNumber(totalTracks || 0, numberFormat);
  const footerLines = [
    `Page ${page}/${totalPages} - ${totalText} different tracks`
  ];
  if (billboard) {
    footerLines.push(`Billboard mode enabled${compareLabel ? " - Comparing to " + compareLabel : ""}`);
  } else {
    footerLines.push("View as billboard by adding 'billboard' or 'bb'");
  }
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Top ${periodLabel} tracks for ${displayName}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: footerLines.join("\n") });
}

function buildTopTracksComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_toptracks:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPTRACKS_EMOJIS.first)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_toptracks:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPTRACKS_EMOJIS.prev)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_toptracks:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPTRACKS_EMOJIS.next)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_toptracks:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPTRACKS_EMOJIS.last)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lfm_toptracks:jump:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(TOPTRACKS_EMOJIS.jump)
  );
  return [row];
}

module.exports = { buildTopTracksEmbed, buildTopTracksComponents };
