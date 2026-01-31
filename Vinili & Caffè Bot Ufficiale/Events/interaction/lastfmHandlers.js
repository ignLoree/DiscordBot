const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const axios = require("axios");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { LASTFM_API_KEY, LASTFM_API_SECRET, lastFmAuthedRequest, lastFmRequest, DEFAULT_EMBED_COLOR, buildUserUrl, buildAlbumUrl } = require("../../Utils/Music/lastfm");
const { buildRecentEmbed, buildRecentComponents, buildRecentV2Components } = require("../../Utils/Music/recentView");
const { buildTopTracksEmbed, buildTopTracksComponents } = require("../../Utils/Music/topTracksView");
const { buildTopArtistsEmbed, buildTopArtistsComponents } = require("../../Utils/Music/topArtistsView");
const { buildTopAlbumsEmbed, buildTopAlbumsComponents } = require("../../Utils/Music/topAlbumsView");
const { buildTopGenresEmbed, buildTopGenresComponents } = require("../../Utils/Music/topGenresView");
const { buildServerTracksEmbed, buildServerTracksComponents } = require("../../Utils/Music/serverTracksView");
const { buildServerArtistsEmbed, buildServerArtistsComponents } = require("../../Utils/Music/serverArtistsView");
const { buildServerAlbumsEmbed, buildServerAlbumsComponents } = require("../../Utils/Music/serverAlbumsView");
const { buildYearEmbedPageOne, buildYearEmbedPageTwo, buildYearComponents } = require("../../Utils/Music/yearView");
const { buildStreaksEmbed, buildStreaksComponents } = require("../../Utils/Music/streaksView");
const LastFmCrown = require("../../Schemas/LastFm/crownSchema");
const { formatRelative } = require("../../Utils/Music/crowns");
const { buildOverviewEmbed, buildOverviewComponents, buildOverviewV2Components } = require("../../Utils/Music/overviewView");
const { buildTasteEmbed, buildTasteComponents, formatPeriodLabel } = require("../../Utils/Music/tasteView");
const { buildArtistOverviewEmbed, buildArtistTopTracksEmbed, buildArtistTopAlbumsEmbed, buildArtistOverviewButtons, buildSimpleArtistEmbed, buildArtistTracksComponents, buildArtistAlbumsComponents } = require("../../Prefix/Music/artistoverview");
const { buildConnectPayload, buildFetchingPayload, buildLoggedInPayload, buildSettingsPayload } = require("../../Utils/Music/lastfmLoginUi");
const { buildResponseModePayload } = require("../../Utils/Music/lastfmResponseModeUi");
const { buildFmModePayload } = require("../../Utils/Music/lastfmFmModeUi");
const { buildWhoKnowsGenreEmbed, getGenreLeaderboard } = require("../../Prefix/Music/whoknowsgenre");
const TOKEN_TTL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const loginPolls = new Map();

function errorEmbed(message) {
  return new EmbedBuilder().setColor("Red").setDescription(message);
}

function isUnknownInteraction(error) {
  return error?.code === 10062;
}

function safeFilename(value) {
  return String(value || "preview")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function formatSecondsToTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}:${String(remMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildAlbumTracksEmbed({ artist, album, tracks, displayName, totalTracks, totalDuration, totalPlays, page, totalPages }) {
  const list = Array.isArray(tracks) ? tracks : [];
  const lines = list.map((track, index) => {
    const name = track?.name || "Sconosciuto";
    const plays = Number(track?.userplaycount || track?.playcount || 0);
    const playsLabel = plays === 1 ? "play" : "plays";
    const duration = formatSecondsToTime(Number(track?.duration || 0));
    const parts = [];
    if (plays > 0) parts.push(plays + " " + playsLabel);
    if (duration) parts.push(duration);
    const meta = parts.length ? " - " + parts.join(" - ") : "";
    return (index + 1) + ". " + name + meta;
  });
  const pageLine = "Page " + (page || 1) + "/" + (totalPages || 1) + " - " + (totalTracks || list.length) + " total tracks - " + (totalDuration || "0:00");
  const playsLine = "Album source: Last.fm | " + displayName + " has " + totalPlays + " total scrobbles on this album";
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle("Track playcounts for " + album + " by " + artist)
    .setDescription(lines.join("\n"))
    .setFooter({ text: pageLine + "\n" + playsLine });
}

function buildAlbumTracksComponents({ page, totalPages, messageId }) {
  if (totalPages <= 1) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("lfm_album_back:" + messageId)
        .setLabel("Album")
        .setEmoji("\u{1F4BF}")
        .setStyle(ButtonStyle.Secondary)
    )];
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lfm_albumtracks:first:" + messageId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1463196324156674289" })
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("lfm_albumtracks:prev:" + messageId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1463196506143326261" })
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("lfm_albumtracks:next:" + messageId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1463196456964980808" })
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId("lfm_albumtracks:last:" + messageId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1463196404120813766" })
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId("lfm_album_back:" + messageId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\u{1F4BF}")
  );
  return [row];
}

async function safeDeferUpdate(interaction) {
  try {
    await interaction.deferUpdate();
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
  return true;
}

async function safeEditMessage(message, payload) {
  try {
    await message.edit(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
  return true;
}
async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
  return true;
}
async function replyInvalidPage(interaction) {
  await safeReply(interaction, {
    embeds: [errorEmbed("<:vegax:1443934876440068179> Numero pagina non valido.")],
    flags: 1 << 6
  });
  return true;
}
async function replyOwnerOnly(interaction, message) {
  await safeReply(interaction, { embeds: [errorEmbed(message)], flags: 1 << 6 });
  return true;
}
function buildJumpModal(customId) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle("Jump to page");
  const input = new TextInputBuilder()
    .setCustomId("page")
    .setLabel("Page number")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}
function resolvePage(action, page, totalPages, { allowFirstLast = true, allowPrevNext = true } = {}) {
  let nextPage = page || 1;
  if (allowFirstLast && action === "first") nextPage = 1;
  if (allowPrevNext && action === "prev") nextPage = Math.max(1, nextPage - 1);
  if (allowPrevNext && action === "next") nextPage = Math.min(totalPages, nextPage + 1);
  if (allowFirstLast && action === "last") nextPage = totalPages;
  return nextPage;
}
async function parseJumpPage(interaction) {
  const value = interaction.fields?.getTextInputValue("page");
  const page = Number(value);
  if (!Number.isFinite(page)) {
    await replyInvalidPage(interaction);
    return null;
  }
  return page;
}

async function injectNowPlayingIfMissing(list, username, limit) {
  if (!Array.isArray(list) || list.some(track => track?.["@attr"]?.nowplaying)) return list;
  try {
    const data = await lastFmRequest("user.getrecenttracks", {
      user: username,
      limit: 1,
      page: 1
    });
    const tracks = data?.recenttracks?.track || [];
    const candidate = Array.isArray(tracks) ? tracks[0] : tracks;
    if (!candidate?.["@attr"]?.nowplaying) return list;
    const candidateKey = `${candidate.artist?.["#text"] || candidate.artist?.name || ""}||${candidate.name || ""}`.toLowerCase();
    const exists = list.some(item => {
      const itemKey = `${item.artist?.["#text"] || item.artist?.name || ""}||${item.name || ""}`.toLowerCase();
      return itemKey === candidateKey;
    });
    if (exists) return list;
    const updated = [candidate, ...list];
    return updated.slice(0, Math.max(1, limit));
  } catch {
    return list;
  }
}
async function updateTopArtistsMessage({ message, state, page }) {
  const data = await lastFmRequest("user.gettopartists", {
    user: state.lastFmUsername,
    period: state.period,
    limit: state.limit,
    page
  });
  const artists = data?.topartists?.artist || [];
  if (!artists.length) throw new Error("No artists");
  const attr = data?.topartists?.["@attr"] || {};
  const totalPages = Number(attr.totalPages || 1);
  const totalArtists = Number(attr.total || 0);
  const nextPage = Math.min(totalPages, Math.max(1, page));
  state.page = nextPage;
  state.totalPages = totalPages;
  state.totalArtists = totalArtists;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildTopArtistsEmbed({
    displayName: state.displayName,
    artists,
    page: nextPage,
    totalPages,
    totalArtists,
    period: state.period,
    limit: state.limit,
    numberFormat: state.numberFormat
  });
  const components = buildTopArtistsComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}

async function updateTopGenresMessage({ message, state, page }) {
  const totalGenres = state.genres?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalGenres / state.limit));
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.limit;
  const slice = state.genres.slice(start, start + state.limit);
  state.page = nextPage;
  state.totalPages = totalPages;
  state.totalGenres = totalGenres;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildTopGenresEmbed({
    displayName: state.displayName,
    genres: slice,
    page: nextPage,
    totalPages,
    totalGenres,
    period: state.period,
    limit: state.limit,
    numberFormat: state.numberFormat
  });
  const components = buildTopGenresComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}

async function updateTopTracksMessage({ message, state, page }) {
  const data = await lastFmRequest("user.gettoptracks", {
    user: state.lastFmUsername,
    period: state.period,
    limit: state.limit,
    page
  });
  const tracks = data?.toptracks?.track || [];
  if (!tracks.length) throw new Error("No tracks");
  const attr = data?.toptracks?.["@attr"] || {};
  const totalPages = Number(attr.totalPages || 1);
  const totalTracks = Number(attr.total || 0);
  const nextPage = Math.min(totalPages, Math.max(1, page));
  state.page = nextPage;
  state.totalPages = totalPages;
  state.totalTracks = totalTracks;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildTopTracksEmbed({
    displayName: state.displayName,
    tracks,
    page: nextPage,
    totalPages,
    totalTracks,
    period: state.period,
    limit: state.limit,
    numberFormat: state.numberFormat,
    billboard: state.billboard,
    prevRanks: state.prevRanks,
    compareLabel: state.compareLabel
  });
  const components = buildTopTracksComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}
async function updateServerArtistsMessage({ message, state, page }) {
  const totalPages = state.totalPages || 1;
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.limit;
  const pageArtists = state.artists.slice(start, start + state.limit);
  state.page = nextPage;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildServerArtistsEmbed({
    displayName: state.displayName,
    artists: pageArtists,
    page: nextPage,
    totalPages,
    prevRanks: state.prevRanks,
    numberFormat: state.numberFormat,
    limit: state.limit,
    orderLabel: state.orderLabel || "listeners",
    showListeners: state.showListeners === true
  });
  const components = buildServerArtistsComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}async function updateServerTracksMessage({ message, state, page }) {
  const totalPages = state.totalPages || 1;
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.limit;
  const pageTracks = state.tracks.slice(start, start + state.limit);
  state.page = nextPage;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildServerTracksEmbed({
    displayName: state.displayName,
    tracks: pageTracks,
    page: nextPage,
    totalPages,
    totalTracks: state.totalTracks,
    limit: state.limit,
    prevRanks: state.prevRanks,
    numberFormat: state.numberFormat,
    artistFilter: state.artistFilter,
    orderLabel: state.orderLabel || "plays",
    showArtist: state.showArtist !== false,
    showListeners: state.showListeners === true
  });
  const components = buildServerTracksComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}

async function updateServerAlbumsMessage({ message, state, page }) {
  const totalPages = state.totalPages || 1;
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.limit;
  const pageAlbums = state.albums.slice(start, start + state.limit);
  state.page = nextPage;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildServerAlbumsEmbed({
    displayName: state.displayName,
    albums: pageAlbums,
    page: nextPage,
    totalPages,
    prevRanks: state.prevRanks,
    numberFormat: state.numberFormat,
    limit: state.limit,
    artistFilter: state.artistFilter,
    orderLabel: state.orderLabel || "plays",
    showArtist: state.showArtist !== false,
    showListeners: state.showListeners === true
  });
  const components = buildServerAlbumsComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}
async function updateTasteMessage({ message, state, page, category }) {
  const rows = state.rows[category] || [];
  const totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.perPage;
  const slice = rows.slice(start, start + state.perPage);
  const matchInfo = state.match[category] || { count: 0, total: 0 };
  const percent = matchInfo.total ? ((matchInfo.count / matchInfo.total) * 100).toFixed(1) : "0";
  const matchLine = `${matchInfo.count} (${percent}%) out of top ${matchInfo.total} ${formatPeriodLabel(state.period)}`;

  const titleMap = {
    artists: `Top artist comparison - ${state.baseName} vs ${state.compareName}`,
    genres: `Top genre comparison - ${state.baseName} vs ${state.compareName}`,
    countries: `Top country comparison - ${state.baseName} vs ${state.compareName}`
  };

  const embed = buildTasteEmbed({
    title: titleMap[category] || titleMap.artists,
    rows: slice,
    userA: state.baseName,
    userB: state.compareName,
    matchLine,
    page: nextPage,
    totalPages,
    period: state.period,
    category,
    numberFormat: state.numberFormat,
    mode: state.mode
  });

  const components = buildTasteComponents({
    messageId: message.id,
    page: nextPage,
    totalPages,
    category
  });

  state.page = nextPage;
  state.totalPages = totalPages;
  state.category = category;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  await safeEditMessage(message, { embeds: [embed], components });
}async function updateOverviewMessage({ message, state, page }) {
  const totalPages = state.totalPages || 1;
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.perPage;
  const days = state.dayList.slice(start, start + state.perPage);
  const profileUrl = buildUserUrl(state.lastFmUsername);
  state.page = nextPage;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  if (state.v2 && typeof buildOverviewV2Components === "function" && MessageFlags?.IsComponentsV2) {
    const components = buildOverviewV2Components({
      displayName: state.displayName,
      profileUrl,
      days,
      page: nextPage,
      totalPages,
      totalPlays: state.totalPlays,
      uniqueTracks: state.uniqueTracksCount,
      avgPlays: state.avgPlays,
      numberFormat: state.numberFormat,
      messageId: message.id
    });
    await safeEditMessage(message, { flags: MessageFlags.IsComponentsV2, components });
    return;
  }
  const embed = buildOverviewEmbed({
    displayName: state.displayName,
    profileUrl,
    days,
    page: nextPage,
    totalPages,
    totalPlays: state.totalPlays,
    uniqueTracks: state.uniqueTracksCount,
    avgPlays: state.avgPlays,
    numberFormat: state.numberFormat
  });
  const components = buildOverviewComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}

async function updateStreaksMessage({ message, state, page }) {
  const totalPages = state.totalPages || 1;
  const nextPage = Math.min(totalPages, Math.max(1, page));
  const start = (nextPage - 1) * state.limit;
  const pageEntries = state.entries.slice(start, start + state.limit);
  state.page = nextPage;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildStreaksEmbed({ entries: pageEntries });
  const components = buildStreaksComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}
async function handleLastFmInteraction(interaction) {
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    if (typeof customId !== "string") return false;
    if (interaction.customId.startsWith("lfm_toptracks_jump:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.topTracksStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      const page = await parseJumpPage(interaction);
      if (page === null) return true;

      await safeDeferUpdate(interaction);
      try {
        await updateTopTracksMessage({ message: interaction.message, state, page });
      } catch (error) {
        global.logger.error(error);
      }
      return true;
    }
    if (interaction.customId.startsWith("lfm_topalbums_jump:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.topAlbumsStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      const page = await parseJumpPage(interaction);
      if (page === null) return true;
      await safeDeferUpdate(interaction);
      try {
        await updateTopAlbumsMessage({ message: interaction.message, state, page });
      } catch (error) {
        global.logger.error(error);
      }
      return true;
    }
    if (interaction.customId.startsWith("lfm_overview_jump:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.overviewStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      const page = await parseJumpPage(interaction);
      if (page === null) return true;
      await safeDeferUpdate(interaction);
      try {
        await updateOverviewMessage({ message: interaction.message, state, page });
      } catch (error) {
        global.logger.error(error);
      }
      return true;
    }
    return false;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (typeof customId !== "string") return false;
    if (!customId.startsWith("lfm_")) return false;

    if (interaction.customId.startsWith("lfm_track_preview:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.trackPreviewStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Preview non piu' disponibile.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeEditMessage(interaction.message, { components: [] });
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Preview scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare il preview.");
      }
      if (!state.previewUrl) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Preview non disponibile per questo brano.")],
          flags: 1 << 6
        });
        return true;
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      const row = new ActionRowBuilder();
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("lfm_track_preview:" + messageId)
          .setLabel("Preview")
          .setEmoji({ id: "1462941162393309431" })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      if (state.spotifyUrl) {
        row.addComponents(
          new ButtonBuilder()
            .setLabel("Open on Spotify")
            .setEmoji({ id: "1462941253803970571" })
            .setStyle(ButtonStyle.Link)
            .setURL(state.spotifyUrl)
        );
      }
      await safeEditMessage(interaction.message, { components: [row] });
      try {
        const response = await axios.get(state.previewUrl, { responseType: "arraybuffer" });
        const buffer = Buffer.from(response.data);
        const filenameBase = (state.artistName || "track") + " - " + (state.trackName || "preview");
        const attachment = new AttachmentBuilder(buffer, {
          name: (safeFilename(filenameBase) || "preview") + ".mp3"
        });
        await interaction.channel?.send({ files: [attachment] });
        stateMap.delete(messageId);
      } catch (error) {
        global.logger.error(error);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Errore durante il download del preview.")],
          flags: 1 << 6
        });
      }
      return true;
    }

    if (interaction.customId.startsWith("lfm_album_tracks:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.albumStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      let tracks = Array.isArray(state.tracks) ? state.tracks : [];
      if (!tracks.length) {
        try {
          const data = await lastFmRequest("album.getinfo", {
            artist: state.artist,
            album: state.album,
            username: state.lastFmUsername
          });
          const list = data?.album?.tracks?.track || [];
          tracks = Array.isArray(list) ? list : [list];
          state.tracks = tracks;
          stateMap.set(messageId, state);
        } catch {}
      }
      if (!tracks.length) {
        await safeReply(interaction, {
          embeds: [new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setDescription("Sorry, but neither Last.fm or Spotify know the tracks for " + state.album + " by " + state.artist + ".")
          ],
          flags: 1 << 6
        });
        return true;
      }
      const totalDurationSeconds = tracks.reduce((sum, track) => sum + Number(track?.duration || 0), 0);
      const totalDuration = formatSecondsToTime(totalDurationSeconds) || "0:00";
      const limit = state.limit || 12;
      const totalTracks = tracks.length;
      const totalPages = Math.max(1, Math.ceil(totalTracks / limit));
      const page = Math.min(totalPages, Math.max(1, state.page || 1));
      const start = (page - 1) * limit;
      const pageTracks = tracks.slice(start, start + limit);
      state.limit = limit;
      state.page = page;
      state.totalPages = totalPages;
      state.totalTracks = totalTracks;
      state.totalDuration = totalDuration;
      const embed = buildAlbumTracksEmbed({
        artist: state.artist,
        album: state.album,
        tracks: pageTracks,
        displayName: state.displayName,
        totalTracks,
        totalDuration,
        totalPlays: Number(state.albumUserPlays || 0),
        page,
        totalPages
      });
      const components = buildAlbumTracksComponents({ page, totalPages, messageId });
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });
      return true;
    }

    if (interaction.customId.startsWith("lfm_album_back:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.albumStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      const mainEmbed = state.mainEmbed ? EmbedBuilder.from(state.mainEmbed) : null;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("lfm_album_tracks:" + messageId)
          .setLabel("Album tracks")
          .setEmoji("\u{1F3B5}")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("lfm_album_cover:" + messageId)
          .setLabel("Cover")
          .setEmoji("\u{1F5BC}")
          .setStyle(ButtonStyle.Secondary)
      );
      if (mainEmbed) {
        await safeEditMessage(interaction.message, { embeds: [mainEmbed], components: [row] });
      }
      return true;
    }

    if (interaction.customId.startsWith("lfm_album_cover:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.albumStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      let coverUrl = state.coverUrl;
      if (!coverUrl) {
        const albumUrl = buildAlbumUrl(state.artist, state.album);
        const embed = new EmbedBuilder()
          .setColor(DEFAULT_EMBED_COLOR)
          .setDescription(`Sorry, no album cover found for this album:\n${state.artist} - ${state.album}\n[View on last.fm](${albumUrl})`);
        return true;
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateTopAlbumsMessage({ message: interaction.message, state, page });
      return true;
    }

        if (interaction.customId.startsWith("lfm_topartists:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.topArtistsStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateTopArtistsMessage({ message: interaction.message, state, page });
      return true;
    }
    if (interaction.customId.startsWith("lfm_topgenres:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.topGenresStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateTopGenresMessage({ message: interaction.message, state, page });
      return true;
    }    if (interaction.customId.startsWith("lfm_taste:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.tasteStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages, { allowFirstLast: false, allowPrevNext: true });
      await safeDeferUpdate(interaction);
      await updateTasteMessage({ message: interaction.message, state, page, category: state.category || "artists" });
      return true;
    }

    if (interaction.customId.startsWith("lfm_taste_cat:")) {
      const parts = interaction.customId.split(":");
      const category = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.tasteStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      await safeDeferUpdate(interaction);
      await updateTasteMessage({ message: interaction.message, state, page: 1, category });
      return true;
    }
if (interaction.customId.startsWith("lfm_toptracks:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.topTracksStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      if (action === "jump") {
        await interaction.showModal(buildJumpModal("lfm_toptracks_jump:" + messageId));
        return true;
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateTopTracksMessage({ message: interaction.message, state, page });
      return true;
    }

        if (interaction.customId.startsWith("lfm_serverartists:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.serverArtistsStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateServerArtistsMessage({ message: interaction.message, state, page });
      return true;
    }
if (interaction.customId.startsWith("lfm_serveralbums:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.serverAlbumsStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateServerAlbumsMessage({ message: interaction.message, state, page });
      return true;
    }

    if (interaction.customId.startsWith("lfm_servertracks:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.serverTracksStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages);
      await safeDeferUpdate(interaction);
      await updateServerTracksMessage({ message: interaction.message, state, page });
      return true;
    }

    if (interaction.customId.startsWith("lfm_strs:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.streaksStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) return true;
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages, { allowFirstLast: false });
      await safeDeferUpdate(interaction);
      await updateStreaksMessage({ message: interaction.message, state, page });
      return true;
    }

    if (interaction.customId.startsWith("lfm_year:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.yearStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const totalPages = state.totalPages || 2;
      const page = resolvePage(action, state.page || 1, totalPages, { allowFirstLast: false });
      state.page = page;
      const embed = page === 1
        ? buildYearEmbedPageOne({
            displayName: state.displayName,
            year: state.year,
            prevYear: state.prevYear,
            genres: state.genres,
            genrePrevRanks: state.genrePrevRanks,
            artists: state.artists,
            artistPrevRanks: state.artistPrevRanks,
            rises: state.rises,
            drops: state.drops,
            numberFormat: state.numberFormat,
            page,
            totalPages
          })
        : buildYearEmbedPageTwo({
            displayName: state.displayName,
            year: state.year,
            albums: state.albums,
            albumPrevRanks: state.albumPrevRanks,
            tracks: state.tracks,
            trackPrevRanks: state.trackPrevRanks,
            countries: state.countries,
            countryPrevRanks: state.countryPrevRanks,
            analysis: state.analysis,
            numberFormat: state.numberFormat,
            page,
            totalPages
          });
      const components = buildYearComponents({ page, totalPages, messageId });
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_overview:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.artistStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      try {
        const embed = await buildArtistOverviewEmbed({
          artistName: state.artistName,
          lastFmUsername: state.lastFmUsername,
          displayName: state.displayName
        });
        const row = buildArtistOverviewButtons(messageId);
        await safeEditMessage(interaction.message, { embeds: [embed], components: [row] });
      } catch (error) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Errore durante il recupero dell'overview artista.")],
          flags: 1 << 6
        });
      }
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_back:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.artistStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      if (state.mainEmbed) {
        const embed = EmbedBuilder.from(state.mainEmbed);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`lfm_artist_overview:${messageId}`)
            .setLabel("Overview")
            .setEmoji("\uD83D\uDCCA")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1462941253803970571" })
            .setURL(`https://open.spotify.com/search/${encodeURIComponent(state.artistName)}`),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1466061111781752872" })
            .setURL(`https://music.apple.com/search?term=${encodeURIComponent(state.artistName)}`)
        );
        if (state.instagramUrl) {
          row.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setEmoji({ id: "1466061195613044820" })
              .setURL(state.instagramUrl)
          );
        }
        if (state.twitterUrl) {
          row.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setEmoji({ id: "1466201838343819274" })
              .setURL(state.twitterUrl)
          );
        }
        await safeEditMessage(interaction.message, { embeds: [embed], components: [row] });
      } else {
        const embed = await buildSimpleArtistEmbed({
          artistName: state.artistName,
          lastFmUsername: state.lastFmUsername,
          displayName: state.displayName
        });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`lfm_artist_overview:${messageId}`)
            .setLabel("Overview")
            .setEmoji("\uD83D\uDCCA")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1462941253803970571" })
            .setURL(`https://open.spotify.com/search/${encodeURIComponent(state.artistName)}`),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1466061111781752872" })
            .setURL(`https://music.apple.com/search?term=${encodeURIComponent(state.artistName)}`)
        );
        if (state.instagramUrl) {
          row.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setEmoji({ id: "1466061195613044820" })
              .setURL(state.instagramUrl)
          );
        }
        if (state.twitterUrl) {
          row.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setEmoji({ id: "1466201838343819274" })
              .setURL(state.twitterUrl)
          );
        }
        await safeEditMessage(interaction.message, { embeds: [embed], components: [row] });
      }
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_toptracks:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.artistStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;

      if (typeof state.totalPlays !== "number") {
        try {
          const info = await lastFmRequest("artist.getinfo", {
            artist: state.artistName,
            username: state.lastFmUsername,
            autocorrect: 1
          });
          state.totalPlays = Number(info?.artist?.stats?.userplaycount || 0);
        } catch {
          state.totalPlays = 0;
        }
      }

      const result = await buildArtistTopTracksEmbed({
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: 1,
        perPage: 10,
        totalPlays: state.totalPlays
      });
      const components = buildArtistTracksComponents(messageId, result.page, result.totalPages);
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });

      if (!interaction.client.artistTracksStates) interaction.client.artistTracksStates = new Map();
      interaction.client.artistTracksStates.set(messageId, {
        userId: state.userId,
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: result.page,
        perPage: 10,
        totalPages: result.totalPages,
        totalPlays: state.totalPlays || 0,
        overviewMessageId: messageId,
        expiresAt: state.expiresAt || Date.now() + 10 * 60 * 1000
      });
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_topalbums:")) {
      const messageId = interaction.customId.split(":")[1];
      const stateMap = interaction.client.artistStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;

      if (typeof state.totalPlays !== "number") {
        try {
          const info = await lastFmRequest("artist.getinfo", {
            artist: state.artistName,
            username: state.lastFmUsername,
            autocorrect: 1
          });
          state.totalPlays = Number(info?.artist?.stats?.userplaycount || 0);
        } catch {
          state.totalPlays = 0;
        }
      }

      const result = await buildArtistTopAlbumsEmbed({
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: 1,
        perPage: 10,
        totalPlays: state.totalPlays
      });
      const components = buildArtistAlbumsComponents(messageId, result.page, result.totalPages);
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });

      if (!interaction.client.artistAlbumsStates) interaction.client.artistAlbumsStates = new Map();
      interaction.client.artistAlbumsStates.set(messageId, {
        userId: state.userId,
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: result.page,
        perPage: 10,
        totalPages: result.totalPages,
        totalPlays: state.totalPlays || 0,
        overviewMessageId: messageId,
        expiresAt: state.expiresAt || Date.now() + 10 * 60 * 1000
      });
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_albums:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.artistAlbumsStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      const nextPage = resolvePage(action, state.page || 1, state.totalPages || 1, { allowFirstLast: true });
      const result = await buildArtistTopAlbumsEmbed({
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: nextPage,
        perPage: state.perPage || 10,
        totalPlays: state.totalPlays || 0
      });
      state.page = result.page;
      state.totalPages = result.totalPages;
      const components = buildArtistAlbumsComponents(messageId, result.page, result.totalPages);
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });
      return true;
    }

    if (interaction.customId.startsWith("lfm_artist_tracks:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.artistTracksStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) {
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina non e' piu' valida.")],
          flags: 1 << 6
        });
        return true;
      }
      const state = stateMap.get(messageId);
      if (state.expiresAt && Date.now() > state.expiresAt) {
        stateMap.delete(messageId);
        await safeReply(interaction, {
          embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
          flags: 1 << 6
        });
        return true;
      }
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo pulsante.");
      }
      const deferred = await safeDeferUpdate(interaction);
      if (!deferred) return true;
      const nextPage = resolvePage(action, state.page || 1, state.totalPages || 1, { allowFirstLast: true });
      const result = await buildArtistTopTracksEmbed({
        artistName: state.artistName,
        lastFmUsername: state.lastFmUsername,
        displayName: state.displayName,
        page: nextPage,
        perPage: state.perPage || 10,
        totalPlays: state.totalPlays || 0
      });
      state.page = result.page;
      state.totalPages = result.totalPages;
      const components = buildArtistTracksComponents(messageId, result.page, result.totalPages);
      await safeEditMessage(interaction.message, { embeds: [result.embed], components });
      return true;
    }

    if (interaction.customId.startsWith("lfm_overview:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.overviewStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      if (action === "jump") {
        await interaction.showModal(buildJumpModal("lfm_overview_jump:" + messageId));
        return true;
      }
      const totalPages = state.totalPages || 1;
      const page = resolvePage(action, state.page || 1, totalPages, { allowFirstLast: false });
      await safeDeferUpdate(interaction);
      await updateOverviewMessage({ message: interaction.message, state, page });
      return true;
    }

    if (interaction.customId.startsWith("lfm_recent:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const stateMap = interaction.client.recentStates;
      if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
      const state = stateMap.get(messageId);
      if (interaction.user.id !== state.userId) {
        return await replyOwnerOnly(interaction, "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questi bottoni.");
      }
      const page = resolvePage(action, state.page || 1, state.totalPages || 1, { allowFirstLast: false });
      state.page = page;
      let tracks = [];
      if (state.filter && state.filteredTracks) {
        const start = (page - 1) * state.limit;
        tracks = state.filteredTracks.slice(start, start + state.limit);
      } else {
        const data = await lastFmRequest("user.getrecenttracks", {
          user: state.lastFmUsername,
          limit: state.limit,
          page
        });
        tracks = Array.isArray(data?.recenttracks?.track) ? data.recenttracks.track : [data?.recenttracks?.track].filter(Boolean);
      }
      if (state.v2 && typeof buildRecentV2Components === "function" && MessageFlags?.IsComponentsV2) {
        const filterText = state.filter ? "Filtering cached plays to artist " + state.filter : null;
        const components = buildRecentV2Components({
          displayName: state.displayName,
          avatarUrl: state.avatarUrl,
          tracks,
          page: state.page,
          totalPages: state.totalPages,
          totalScrobbles: state.totalScrobbles,
          username: state.lastFmUsername,
          filterText,
          messageId,
          allowNowPlaying: state.page === 1
        });
        await safeEditMessage(interaction.message, { flags: MessageFlags.IsComponentsV2, components });
      } else {
        const filterText = state.filter ? "Filtering cached plays to artist " + state.filter : null;
        const embed = buildRecentEmbed({
          displayName: state.displayName,
          avatarUrl: state.avatarUrl,
          tracks,
          page: state.page,
          totalPages: state.totalPages,
          totalScrobbles: state.totalScrobbles,
          username: state.lastFmUsername,
          filterText,
          allowNowPlaying: state.page === 1
        });
        const components = buildRecentComponents({
          page: state.page,
          totalPages: state.totalPages,
          messageId
        });
        await safeEditMessage(interaction.message, { embeds: [result.embed], components });
      }
      return true;
    }

  }

  if (interaction.isStringSelectMenu()) {
    if (typeof interaction.customId !== "string") return false;
    return handleLastFmSelectMenu(interaction);
  }

  if (interaction.isButton && interaction.isButton()) {
    const customId = interaction.customId;
    if (customId === "lfm_fmmode_button") {
      const user = await LastFmUser.findOne({ discordId: interaction.user.id });
      if (!user) {
        await safeReply(interaction, { content: "<:vegax:1443934876440068179> Devi prima collegare Last.fm.", flags: 1 << 6 });
        return true;
      }
      const payload = buildFmModePayload(user.fmMode);
      await safeReply(interaction, { ...payload, flags: 1 << 6 });
      return true;
    }
    if (customId === "lfm_responsemode_button") {
      const user = await LastFmUser.findOne({ discordId: interaction.user.id });
      if (!user) {
        await safeReply(interaction, { content: "<:vegax:1443934876440068179> Devi prima collegare Last.fm.", flags: 1 << 6 });
        return true;
      }
      const payload = buildResponseModePayload(user.responseMode);
      await safeReply(interaction, { ...payload, flags: 1 << 6 });
      return true;
    }
  }

  return false;
}

async function handleLastFmSelectMenu(interaction) {
  const customId = interaction.customId;
  if (typeof customId !== "string") return false;
  if (customId.startsWith("lfm_privacy_select:")) {
    const userId = customId.split(":")[1];
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo menu.",
        flags: 1 << 6
      });
      return true;
    }
    const value = interaction.values?.[0] || "server";
    const privacyGlobal = value === "global";
    const user = await LastFmUser.findOne({ discordId: interaction.user.id });
    if (user) {
      user.privacyGlobal = privacyGlobal;
      await user.save();
    }
    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setTitle("Your new privacy level")
      .setDescription("Your privacy level has been set to " + (privacyGlobal ? "Global" : "Server") + ".");
    await interaction.reply({ embeds: [embed], flags: 1 << 6 });
    return true;
  }
  if (customId.startsWith("lfm_wkgenre_select:")) {
    const messageId = customId.split(":")[1];
    const stateMap = interaction.client.whoknowsGenreStates;
    if (!messageId || !stateMap || !stateMap.has(messageId)) return true;
    const state = stateMap.get(messageId);
    if (state.expiresAt && Date.now() > state.expiresAt) {
      stateMap.delete(messageId);
      await interaction.reply({
        embeds: [errorEmbed("<:vegax:1443934876440068179> Questa pagina e' scaduta.")],
        flags: 1 << 6
      });
      return true;
    }
    if (interaction.user.id !== state.userId) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Solo chi ha lanciato il comando può usare questo menu.",
        flags: 1 << 6
      });
      return true;
    }
    const genre = interaction.values?.[0];
    if (!genre || genre === "none") {
      await interaction.reply({
        embeds: [errorEmbed("<:vegax:1443934876440068179> Seleziona un genere valido.")],
        flags: 1 << 6
      });
      return true;
    }

    await safeDeferUpdate(interaction);
    try {
      const stats = await getGenreLeaderboard({
        guild: interaction.guild,
        genre,
        requesterId: state.userId,
        limit: 15
      });
      const requesterName = interaction.member?.displayName || interaction.user.username;
      const embed = buildWhoKnowsGenreEmbed({
        genre,
        guild: interaction.guild,
        requesterId: state.userId,
        requesterName,
        image: state.image,
        stats,
        results: stats.results
      });
      const options = (state.genres || []).slice(0, 25).map(item => ({
        label: titleCase(item),
        value: item,
        default: item === genre
      }));
      const select = new StringSelectMenuBuilder()
        .setCustomId(`lfm_wkgenre_select:${messageId}`)
        .setPlaceholder("Select genre to view WhoKnows")
        .addOptions(options.length ? options : [{ label: "No genres available", value: "none", default: true }])
        .setDisabled(options.length === 0);
      const row = new ActionRowBuilder().addComponents(select);
      state.expiresAt = Date.now() + 10 * 60 * 1000;
      await safeEditMessage(interaction.message, { embeds: [embed], components: [row] });
    } catch (error) {
      global.logger.error(error);
      await safeReply(interaction, {
        embeds: [errorEmbed("<:vegax:1443934876440068179> Errore durante il recupero dei dati.")],
        flags: 1 << 6
      });
    }
    return true;
  }
  if (interaction.customId === "lfm_responsemode_select") {
    const user = await LastFmUser.findOne({ discordId: interaction.user.id });
    if (!user) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Devi prima collegare Last.fm.", flags: 1 << 6 });
      return true;
    }
    const value = interaction.values?.[0] || "embed";
    user.responseMode = value;
    await user.save();
    const label = value === "image" ? "Image" : "Embed";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(DEFAULT_EMBED_COLOR)
          .setDescription(`Your default \`WhoKnows\` and Top list mode has been set to **${label}** .`)
      ],
      flags: 1 << 6
    });
    return true;
  }
  if (interaction.customId === "lfm_fmmode_select") {
    const user = await LastFmUser.findOne({ discordId: interaction.user.id });
    if (!user) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Devi prima collegare Last.fm.", flags: 1 << 6 });
      return true;
    }
    const value = interaction.values?.[0] || "default";
    user.fmMode = value;
    await user.save();
    await interaction.reply({ content: "<:vegacheckmark:1443666279058772028> .fm mode impostata su " + value + ".", flags: 1 << 6 });
    return true;
  }
  return false;
}

async function updateTopAlbumsMessage({ message, state, page }) {
  const data = await lastFmRequest("user.gettopalbums", {
    user: state.lastFmUsername,
    period: state.period,
    limit: state.limit,
    page
  });
  const albums = data?.topalbums?.album || [];
  if (!albums.length) throw new Error("No albums");
  const attr = data?.topalbums?.["@attr"] || {};
  const totalPages = Number(attr.totalPages || 1);
  const totalAlbums = Number(attr.total || 0);
  const nextPage = Math.min(totalPages, Math.max(1, page));
  state.page = nextPage;
  state.totalPages = totalPages;
  state.totalAlbums = totalAlbums;
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  const embed = buildTopAlbumsEmbed({
    displayName: state.displayName,
    albums,
    page: nextPage,
    totalPages,
    totalAlbums,
    period: state.period,
    limit: state.limit,
    numberFormat: state.numberFormat,
    billboard: state.billboard,
    prevRanks: state.prevRanks,
    compareLabel: state.compareLabel
  });
  const components = buildTopAlbumsComponents({
    page: nextPage,
    totalPages,
    messageId: message.id
  });
  await safeEditMessage(message, { embeds: [embed], components });
}

module.exports = { handleLastFmInteraction };






















