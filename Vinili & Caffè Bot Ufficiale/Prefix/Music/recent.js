const { EmbedBuilder, MessageFlags } = require("discord.js");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { buildRecentEmbed, buildRecentComponents, buildRecentV2Components } = require("../../Utils/Music/recentView");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const RECENT_STATE_TTL_MS = 30 * 60 * 1000;

function dedupeNowPlaying(list) {
  if (!Array.isArray(list) || list.length < 2) return list;
  const first = list[0];
  if (!first?.["@attr"]?.nowplaying) return list;
  const key = `${first.artist?.["#text"] || first.artist?.name || ""}||${first.name || ""}`.toLowerCase();
  return [first, ...list.slice(1).filter(item => {
    const itemKey = `${item.artist?.["#text"] || item.artist?.name || ""}||${item.name || ""}`.toLowerCase();
    return itemKey !== key;
  })];
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

module.exports = {
  skipPrefix: false,
  name: "recent",
  aliases: ["recents", "recenttracks", "r"],
  async execute(message, args) {
            await message.channel.sendTyping();
    const userArgs = Array.isArray(args) ? [...args] : [];
    let userOverride = null;
    if (userArgs.length && userArgs[0].toLowerCase().startsWith("lfm:")) {
      userOverride = userArgs.shift().slice(4);
    } else if (userArgs.length) {
      const candidate = userArgs[0];
      const found = await resolveRecentUserOverride(candidate);
      if (found) {
        userOverride = found.lastFmUsername;
        userArgs.shift();
      }
    }
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, userArgs);
    const pagination = extractPagination(filteredArgs, { defaultLimit: 6, maxLimit: 80 });
    const cappedPage = Math.min(pagination.page, 80);
    const artistFilter = pagination.args.join(" ").trim();
    const user = await getLastFmUserForMessageOrUsername(message, target, userOverride || lastfm);
    if (!user) return;
    try {
      let list = [];
      let totalPages = 1;
      let totalScrobbles = 0;
      let filteredTracks = null;
      if (artistFilter) {
        const data = await lastFmRequest("user.getrecenttracks", {
          user: user.lastFmUsername,
          limit: 200
        });
        const tracks = data?.recenttracks?.track || [];
        const allList = Array.isArray(tracks) ? tracks : [tracks];
        const attr = data?.recenttracks?.["@attr"] || {};
        totalScrobbles = Number(attr.total || 0);
        filteredTracks = allList.filter(t => (t.artist?.["#text"] || t.artist?.name || "").toLowerCase() === artistFilter.toLowerCase());
        if (!filteredTracks.length) {
          return message.channel.send({
            content: "<:vegax:1443934876440068179> No recent tracks found for this artist.",
          });
        }
        totalPages = Math.max(1, Math.ceil(filteredTracks.length / pagination.limit));
        totalPages = Math.min(totalPages, 80);
        const start = (cappedPage - 1) * pagination.limit;
        list = filteredTracks.slice(start, start + pagination.limit);
      } else {
        const data = await lastFmRequest("user.getrecenttracks", {
          user: user.lastFmUsername,
          limit: pagination.limit,
          page: cappedPage
        });
        const tracks = data?.recenttracks?.track || [];
        list = Array.isArray(tracks) ? tracks : [tracks];
        const attr = data?.recenttracks?.["@attr"] || {};
        totalPages = Number(attr.totalPages || 1);
        totalPages = Math.min(totalPages, 80);
        totalScrobbles = Number(attr.total || 0);
      }
      if (!list.length) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessuna traccia recente trovata.")
          ]
        });
      }
      const member = message.guild?.members.cache.get(target.id);
      const displayName = member?.displayName || target.username;
      const filterText = artistFilter ? `Filtering cached plays to artist ${artistFilter}` : null;
      if (cappedPage > 1) {
        list = list.filter(track => !track?.["@attr"]?.nowplaying);
      }
      if (!artistFilter && cappedPage === 1) {
        list = await injectNowPlayingIfMissing(list, user.lastFmUsername, pagination.limit);
      }
      list = dedupeNowPlaying(list);
      const useV2 = typeof buildRecentV2Components === "function" && MessageFlags?.IsComponentsV2;
      let sent;
      if (useV2) {
        const components = buildRecentV2Components({
          displayName,
          avatarUrl: target.displayAvatarURL(),
          tracks: list,
          page: cappedPage,
          totalPages,
          totalScrobbles,
          username: user.lastFmUsername,
          filterText,
          messageId: "pending",
          allowNowPlaying: cappedPage === 1
        });
        sent = await message.channel.send({ flags: MessageFlags.IsComponentsV2, components });
      } else {
        const embed = buildRecentEmbed({
          displayName,
          avatarUrl: target.displayAvatarURL(),
          tracks: list,
          page: cappedPage,
          totalPages,
          totalScrobbles,
          username: user.lastFmUsername,
          filterText,
          allowNowPlaying: cappedPage === 1
        });
        sent = await message.channel.send({ embeds: [embed], components: [] });
      }
      if (totalPages > 1) {
        if (!message.client.recentStates) message.client.recentStates = new Map();
        message.client.recentStates.set(sent.id, {
          userId: message.author.id,
          lastFmUsername: user.lastFmUsername,
          page: cappedPage,
          limit: pagination.limit,
          totalPages,
          totalScrobbles,
          displayName,
          avatarUrl: target.displayAvatarURL(),
          filter: artistFilter || null,
          filteredTracks: filteredTracks || null,
          v2: useV2,
          ttlMs: RECENT_STATE_TTL_MS,
          updatedAt: Date.now(),
          expiresAt: Date.now() + RECENT_STATE_TTL_MS
        });
        const state = message.client.recentStates.get(sent.id);
        if (useV2) {
          const newComponents = buildRecentV2Components({
            displayName: state.displayName,
            avatarUrl: state.avatarUrl,
            tracks: list,
            page: state.page,
            totalPages: state.totalPages,
            totalScrobbles: state.totalScrobbles,
            username: state.lastFmUsername,
            filterText,
            messageId: sent.id,
            allowNowPlaying: state.page === 1
          });
          await sent.edit({ flags: MessageFlags.IsComponentsV2, components: newComponents });
        } else {
          const newComponents = buildRecentComponents({
            page: state.page,
            totalPages: state.totalPages,
            messageId: sent.id
          });
          await sent.edit({ components: newComponents });
        }
      }
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dei recenti.")
        ]
      });
    }
  }
};




