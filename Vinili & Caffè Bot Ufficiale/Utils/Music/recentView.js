const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildTrackUrl, buildUserUrl } = require("./lastfm");
const { getTrackDate } = require("./lastfmStats");

function formatTime(track, allowNowPlaying) {
  if (allowNowPlaying && track?.["@attr"]?.nowplaying) return "adesso";
  const date = getTrackDate(track);
  if (!date) return "adesso";
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatRecentLines(tracks, allowNowPlaying) {
  const separator = "\n----------------------------------------\n";
  return tracks.map((track) => {
    const artist = track.artist?.["#text"] || track.artist?.name || "Sconosciuto";
    const name = track.name || "Senza titolo";
    const album = track.album?.["#text"] || "Senza album";
    const timeText = formatTime(track, allowNowPlaying);
    const url = buildTrackUrl(artist, name);
    const prefix = allowNowPlaying && track?.["@attr"]?.nowplaying ? "<a:now_scrobbling:1462847421246734599> " : "";
    return `${prefix}**[${name}](${url})** by ${artist}\n\`${timeText}\` - *${album}*`;
  }).join(separator);
}

function buildRecentEmbed({
  displayName,
  avatarUrl,
  coverUrl,
  tracks,
  page,
  totalPages,
  totalScrobbles,
  username,
  filterText,
  allowNowPlaying = true
}) {
  const footerLines = [`${page}/${totalPages} - ${username} has ${totalScrobbles} scrobbles`];
  if (filterText) footerLines.push(filterText);
  const profileUrl = buildUserUrl(username);
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Recent tracks for [${displayName}](${profileUrl})`)
    .setDescription(formatRecentLines(tracks, allowNowPlaying))
    .setFooter({ text: footerLines.join("\n") });
  if (coverUrl) {
    embed.setThumbnail(coverUrl);
  }
  return embed;
}

function buildRecentComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) return [];
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_recent:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1462914743416131816" })
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_recent:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1443673039156936837" })
      .setDisabled(nextDisabled)
  );
  return [row];
}

function buildRecentV2Components({
  displayName,
  tracks,
  page,
  totalPages,
  totalScrobbles,
  username,
  filterText,
  messageId,
  allowNowPlaying = true
}) {
  const accent = parseInt(DEFAULT_EMBED_COLOR.replace("#", ""), 16);
  const profileUrl = buildUserUrl(username);
  const container = {
    type: 17,
    accent_color: accent,
    components: []
  };
  container.components.push({
    type: 10,
    content: `**Recent tracks for [${displayName}](${profileUrl})**`
  });
  container.components.push({ type: 14, divider: true, spacing: 1 });
  tracks.forEach((track, index) => {
    const artist = track.artist?.["#text"] || track.artist?.name || "Sconosciuto";
    const name = track.name || "Senza titolo";
    const album = track.album?.["#text"] || "Senza album";
    const timeText = formatTime(track, allowNowPlaying);
    const url = buildTrackUrl(artist, name);
    const prefix = allowNowPlaying && track?.["@attr"]?.nowplaying ? "<a:now_scrobbling:1462847421246734599> " : "";
    container.components.push({
      type: 10,
      content: `${prefix}**[${name}](${url})** by ${artist}`
    });
    container.components.push({
      type: 10,
      content: `\`${timeText}\` - *${album}*`
    });
    if (index < tracks.length - 1) {
      container.components.push({ type: 14, divider: true, spacing: 1 });
    }
  });
  const footerLines = [`${page}/${totalPages} - ${username} has ${totalScrobbles} scrobbles`];
  if (filterText) footerLines.push(filterText);
  container.components.push({ type: 14, divider: true, spacing: 1 });
  container.components.push({
    type: 10,
    content: footerLines.join("\n")
  });
  if (totalPages > 1) {
    container.components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: `lfm_recent:prev:${messageId}`,
          emoji: { id: "1462914743416131816" },
          disabled: page <= 1
        },
        {
          type: 2,
          style: 2,
          custom_id: `lfm_recent:next:${messageId}`,
          emoji: { id: "1443673039156936837" },
          disabled: page >= totalPages
        }
      ]
    });
  }
  return [container];
}

function getRecentCoverUrl(tracks) {
  if (!Array.isArray(tracks)) return null;
  for (const track of tracks) {
    const images = track?.image || [];
    const url = images
      .map(img => img?.["#text"])
      .filter(Boolean)
      .slice(-1)[0] || null;
    if (url) return url;
  }
  return null;
}

module.exports = { buildRecentEmbed, buildRecentComponents, buildRecentV2Components, getRecentCoverUrl };
