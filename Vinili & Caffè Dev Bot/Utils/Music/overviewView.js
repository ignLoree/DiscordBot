const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildUserUrl, formatNumber } = require("./lastfm");

const OVERVIEW_EMOJIS = {
  first: { id: "1463196324156674289" },
  prev: { id: "1463196506143326261" },
  next: { id: "1463196456964980808" },
  last: { id: "1463196404120813766" },
  jump: { id: "1463196369123676414" }
};
const DASH = "\u2014";


function formatMinutes(totalMs) {
  const minutes = Math.max(0, Math.round(totalMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}m` : `${hours}h`;
}

function formatDayTimestamp(date) {
  const timestamp = Math.floor(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    6,
    0,
    0
  ) / 1000);
  return `<t:${timestamp}:D>`;
}
function buildDayBlock(day, numberFormat) {
  const dateLabel = formatDayTimestamp(day.date);
  const playsLabel = day.plays === 1 ? "play" : "plays";
  const minutesLabel = formatMinutes(day.durationMs);
  const header = `**${dateLabel}** ${DASH} **${minutesLabel}** ${DASH} **${formatNumber(day.plays, numberFormat)} ${playsLabel}**`;
  const tags = day.tags.length ? `*${day.tags.join(" - ")}*` : "";
  const lines = [header];
  if (tags) lines.push(tags);
  if (day.topArtist) {
    const label = day.topArtist.plays === 1 ? "play" : "plays";
    lines.push(`${day.topArtist.artist} ${DASH} _${formatNumber(day.topArtist.plays, numberFormat)} ${label}_`);
  }
  if (day.topAlbum) {
    const label = day.topAlbum.plays === 1 ? "play" : "plays";
    lines.push(`${day.topAlbum.artist} ${DASH} ${day.topAlbum.album} ${DASH} _${formatNumber(day.topAlbum.plays, numberFormat)} ${label}_`);
  }
  if (day.topTrack) {
    const label = day.topTrack.plays === 1 ? "play" : "plays";
    lines.push(`${day.topTrack.artist} ${DASH} ${day.topTrack.title} ${DASH} _${formatNumber(day.topTrack.plays, numberFormat)} ${label}_`);
  }
  return lines.join("\n");
}

function formatAvg(avg) {
  return Number(avg || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function buildOverviewEmbed({ displayName, profileUrl, days, page, totalPages, totalPlays, uniqueTracks, avgPlays, numberFormat }) {
  const blocks = days.map(day => buildDayBlock(day, numberFormat));
  const footerStats = `${formatNumber(uniqueTracks, numberFormat)} unique tracks - ${formatNumber(totalPlays, numberFormat)} total plays - ${formatAvg(avgPlays)} avg`;
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Daily overview for [${displayName}](${profileUrl || buildUserUrl(displayName)})`)
    .setDescription(blocks.join("\n\n"))
    .setFooter({ text: `${page}/${totalPages} - Top genres, artist, album and track\n${footerStats}` });
}

function buildOverviewComponents({ page, totalPages, messageId }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const disablePrev = safePage <= 1;
  const disableNext = safePage >= safeTotal;
  const disableJump = safeTotal <= 1;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_overview:first:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(OVERVIEW_EMOJIS.first)
      .setDisabled(disablePrev),
    new ButtonBuilder()
      .setCustomId(`lfm_overview:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(OVERVIEW_EMOJIS.prev)
      .setDisabled(disablePrev),
    new ButtonBuilder()
      .setCustomId(`lfm_overview:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(OVERVIEW_EMOJIS.next)
      .setDisabled(disableNext),
    new ButtonBuilder()
      .setCustomId(`lfm_overview:last:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(OVERVIEW_EMOJIS.last)
      .setDisabled(disableNext),
    new ButtonBuilder()
      .setCustomId(`lfm_overview:jump:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(OVERVIEW_EMOJIS.jump)
      .setDisabled(disableJump)
  );
  return [row];
}


function buildOverviewV2Components({
  displayName,
  profileUrl,
  days,
  page,
  totalPages,
  totalPlays,
  uniqueTracks,
  avgPlays,
  numberFormat,
  messageId
}) {
  const accent = parseInt(DEFAULT_EMBED_COLOR.replace("#", ""), 16);
  const container = {
    type: 17,
    accent_color: accent,
    components: []
  };
  const blocks = days.map(day => buildDayBlock(day, numberFormat));
  const footerStats = `${formatNumber(uniqueTracks, numberFormat)} unique tracks - ${formatNumber(totalPlays, numberFormat)} total plays - ${formatAvg(avgPlays)} avg`;
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const disablePrev = safePage <= 1;
  const disableNext = safePage >= safeTotal;
  const disableJump = safeTotal <= 1;
  container.components.push({
    type: 10,
    content: `**Daily overview for [${displayName}](${profileUrl || buildUserUrl(displayName)})**`
  });
  container.components.push({ type: 14, divider: true, spacing: 1 });
  blocks.forEach((block, index) => {
    container.components.push({
      type: 10,
      content: block
    });
    if (index < blocks.length - 1) {
      container.components.push({ type: 14, divider: true, spacing: 1 });
    }
  });
  container.components.push({ type: 14, divider: true, spacing: 1 });
  container.components.push({
    type: 10,
    content: `-# ${page}/${totalPages} - Top genres, artist, album and track\n-# ${footerStats}`
  });
  container.components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        custom_id: `lfm_overview:first:${messageId}`,
        emoji: OVERVIEW_EMOJIS.first,
        disabled: disablePrev
      },
      {
        type: 2,
        style: 2,
        custom_id: `lfm_overview:prev:${messageId}`,
        emoji: OVERVIEW_EMOJIS.prev,
        disabled: disablePrev
      },
      {
        type: 2,
        style: 2,
        custom_id: `lfm_overview:next:${messageId}`,
        emoji: OVERVIEW_EMOJIS.next,
        disabled: disableNext
      },
      {
        type: 2,
        style: 2,
        custom_id: `lfm_overview:last:${messageId}`,
        emoji: OVERVIEW_EMOJIS.last,
        disabled: disableNext
      },
      {
        type: 2,
        style: 2,
        custom_id: `lfm_overview:jump:${messageId}`,
        emoji: OVERVIEW_EMOJIS.jump,
        disabled: disableJump
      }
    ]
  });
  return [container];
}

module.exports = { buildOverviewEmbed, buildOverviewComponents, buildOverviewV2Components };















