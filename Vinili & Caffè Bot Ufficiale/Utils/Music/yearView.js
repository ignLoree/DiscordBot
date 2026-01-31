const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("./lastfm");

const YEAR_NAV_EMOJIS = {
  prev: { id: "1462914743416131816" },
  next: { id: "1443673039156936837" }
};

const YEAR_MOVE_EMOJIS = {
  downSmall: "<:1_to_5_down:1463282374707118123>",
  upLarge: "<:5_or_more_up:1463282376879636608>",
  same: "<:same_position:1463282381916995802>",
  downLarge: "<:5_or_more_down:1463282383854764093>",
  upSmall: "<:1_to_5_up:1463282385272700951>",
  isNew: "<:new1:1463282949159129320>"
};

const INLINE_BREAK = { name: "\u200b", value: "\u200b", inline: true };

function getMovementEmoji(currentRank, prevRank) {
  if (!prevRank) return YEAR_MOVE_EMOJIS.isNew;
  const delta = prevRank - currentRank;
  if (delta === 0) return YEAR_MOVE_EMOJIS.same;
  if (delta > 0) return delta >= 5 ? YEAR_MOVE_EMOJIS.upLarge : YEAR_MOVE_EMOJIS.upSmall;
  const down = Math.abs(delta);
  return down >= 5 ? YEAR_MOVE_EMOJIS.downLarge : YEAR_MOVE_EMOJIS.downSmall;
}

function buildRankLines({
  items,
  prevRanks,
  formatter,
  numberFormat
}) {
  if (!items.length) return ["Nessun dato."];
  return items.map((item, index) => {
    const rank = index + 1;
    const key = item.key;
    const prevRank = prevRanks?.get(key) || null;
    const emoji = getMovementEmoji(rank, prevRank);
    const label = formatter(item, numberFormat);
    return `${emoji} ${rank}. ${label}`;
  });
}

function buildRisesDrops(items, direction) {
  if (!items.length) return ["Nessun dato."];
  const emoji = direction === "up" ? YEAR_MOVE_EMOJIS.upSmall : YEAR_MOVE_EMOJIS.downSmall;
  return items.map(item => `${emoji} ${item.name} (From #${item.from} to #${item.to})`);
}

function buildYearEmbedPageOne({
  displayName,
  year,
  prevYear,
  genres,
  genrePrevRanks,
  artists,
  artistPrevRanks,
  rises,
  drops,
  numberFormat,
  page,
  totalPages
}) {
  const genreLines = buildRankLines({
    items: genres,
    prevRanks: genrePrevRanks,
    numberFormat,
    formatter: (item) => `**${item.name}**`
  });
  const artistLines = buildRankLines({
    items: artists,
    prevRanks: artistPrevRanks,
    numberFormat,
    formatter: (item) => `**${item.name}**`
  });
  const risesLines = buildRisesDrops(rises, "up");
  const dropsLines = buildRisesDrops(drops, "down");

  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`${displayName}'s ${year} in Review - ${page}/${totalPages}`)
    .setDescription(`Your top genres, artists, albums and tracks for ${year} compared to ${prevYear}.`)
    .addFields(
      { name: "Genres", value: genreLines.join("\n"), inline: true },
      { name: "Artists", value: artistLines.join("\n"), inline: true },
      INLINE_BREAK,
      { name: "Rises", value: risesLines.join("\n"), inline: true },
      { name: "Drops", value: dropsLines.join("\n"), inline: true },
      INLINE_BREAK
    );
}

function buildYearEmbedPageTwo({
  displayName,
  year,
  albums,
  albumPrevRanks,
  tracks,
  trackPrevRanks,
  countries,
  countryPrevRanks,
  analysis,
  numberFormat,
  page,
  totalPages
}) {
  const albumLines = buildRankLines({
    items: albums,
    prevRanks: albumPrevRanks,
    numberFormat,
    formatter: (item) => `**${item.artist} - ${item.name}**`
  });
  const trackLines = buildRankLines({
    items: tracks,
    prevRanks: trackPrevRanks,
    numberFormat,
    formatter: (item) => `**${item.artist} - ${item.name}**`
  });
  const countryLines = buildRankLines({
    items: countries,
    prevRanks: countryPrevRanks,
    numberFormat,
    formatter: (item) => `**${item.name}**`
  });

  const analysisLines = analysis?.length
    ? analysis
    : ["Danceability: N/A", "Energy: N/A", "Speechiness: N/A", "Acousticness: N/A", "Instrumentalness: N/A", "Musical positiveness: N/A"];

  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`${displayName}'s ${year} in Review - ${page}/${totalPages}`)
    .addFields(
      { name: "Albums", value: albumLines.join("\n"), inline: true },
      { name: "Tracks", value: trackLines.join("\n"), inline: true },
      INLINE_BREAK,
      { name: "Countries", value: countryLines.join("\n"), inline: true },
      { name: "Top track analysis", value: analysisLines.join("\n"), inline: true },
      INLINE_BREAK
    );
}

function buildYearComponents({ page, totalPages, messageId }) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_year:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(YEAR_NAV_EMOJIS.prev)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_year:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(YEAR_NAV_EMOJIS.next)
      .setDisabled(nextDisabled)
  );
  return [row];
}

module.exports = { buildYearEmbedPageOne, buildYearEmbedPageTwo, buildYearComponents };
