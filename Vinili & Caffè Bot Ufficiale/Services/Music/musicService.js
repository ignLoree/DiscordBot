const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { Player, QueryType } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const { leaveTtsGuild } = require("../TTS/ttsService");
const { setVoiceSession, clearVoiceSession } = require("../Voice/voiceSessionService");

let playerInitPromise = null;
const lastEmptyQueueAtByGuild = new Map();
const lastPlayerStartAtByGuild = new Map();
const lastPlayerErrorAtByGuild = new Map();
const manualLeaveAtByGuild = new Map();
const inactivityTimersByGuild = new Map();
const emptyVoiceTimersByGuild = new Map();
const INACTIVITY_MS = 3 * 60 * 1000;
const EMPTY_VOICE_MS = 3 * 60 * 1000;
const DEFAULT_MUSIC_VOLUME = 25;

async function sendQueueNotice(queue, content) {
  const textChannel = queue?.metadata?.channel;
  if (!textChannel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(String(content || ""));
  await textChannel.send({ embeds: [embed] }).catch(() => { });
}

async function sendQueueEmbed(queue, embed) {
  const textChannel = queue?.metadata?.channel;
  if (!textChannel?.isTextBased?.()) return;
  await textChannel.send({ embeds: [embed] }).catch(() => { });
}

function clearInactivityTimer(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  const timer = inactivityTimersByGuild.get(key);
  if (timer) clearTimeout(timer);
  inactivityTimersByGuild.delete(key);
}

function clearEmptyVoiceTimer(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  const timer = emptyVoiceTimersByGuild.get(key);
  if (timer) clearTimeout(timer);
  emptyVoiceTimersByGuild.delete(key);
}

function queueTracksToArray(queue) {
  if (!queue?.tracks) return [];
  if (typeof queue.tracks.toArray === "function") {
    try {
      return queue.tracks.toArray();
    } catch {
      return [];
    }
  }
  if (Array.isArray(queue.tracks)) return queue.tracks;
  if (Array.isArray(queue.tracks.data)) return queue.tracks.data;
  return [];
}

function stampTrackMetadata(track, requestedBy) {
  if (!track || typeof track.setMetadata !== "function") return;
  const existing = track.metadata && typeof track.metadata === "object"
    ? track.metadata
    : {};
  track.setMetadata({
    ...existing,
    requestedAt: Date.now(),
    requestedById: String(requestedBy?.id || ""),
  });
}

function scheduleInactivityLeave(queue) {
  const guildId = String(queue?.guild?.id || "");
  if (!guildId) return;
  clearInactivityTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      if (queue.deleted) return;
      if (queue.isPlaying()) return;
      if (Number(queue?.tracks?.size || 0) > 0) return;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          [
            "No tracks have been playing for the past 3 minutes, leaving 👋",
          ].join("\n"),
        );
      await sendQueueEmbed(queue, embed);
      manualLeaveAtByGuild.set(guildId, Date.now());
      queue.delete();
    } catch (error) {
      global.logger?.error?.("[MUSIC] inactivity leave failed:", error?.message || error);
    } finally {
      inactivityTimersByGuild.delete(guildId);
    }
  }, INACTIVITY_MS);

  inactivityTimersByGuild.set(guildId, timer);
}

function scheduleEmptyVoiceLeave(queue) {
  const guildId = String(queue?.guild?.id || "");
  if (!guildId) return;
  clearEmptyVoiceTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      if (queue.deleted) return;
      const voiceChannel = queue.channel;
      if (!voiceChannel?.members?.size) return;

      const listeners = Array.from(voiceChannel.members.values()).filter(
        (m) => !m.user?.bot,
      );
      if (listeners.length > 0) return;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          [
            "No one has been listening for the past 3 minutes, leaving 👋",
          ].join("\n"),
        );
      await sendQueueEmbed(queue, embed);
      manualLeaveAtByGuild.set(guildId, Date.now());
      queue.delete();
    } catch (error) {
      global.logger?.error?.("[MUSIC] empty-voice leave failed:", error?.message || error);
    } finally {
      emptyVoiceTimersByGuild.delete(guildId);
    }
  }, EMPTY_VOICE_MS);

  emptyVoiceTimersByGuild.set(guildId, timer);
}

function cleanQuery(raw) {
  return String(raw || "")
    .trim()
    .replace(/^<|>$/g, "");
}

function parseDeezerTrackId(url) {
  const match = String(url || "").match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/i);
  return match ? String(match[1]) : null;
}

function parseAppleTrackId(url) {
  const raw = String(url || "");
  const idMatch = raw.match(/\/song\/[^/]+\/(\d+)/i);
  if (idMatch) return String(idMatch[1]);
  const iMatch = raw.match(/[?&]i=(\d+)/i);
  if (iMatch) return String(iMatch[1]);
  return null;
}

async function deezerToSearchQuery(url) {
  const trackId = parseDeezerTrackId(url);
  if (!trackId) return null;
  const response = await axios
    .get(`https://api.deezer.com/track/${encodeURIComponent(trackId)}`, {
      timeout: 12000,
    })
    .catch(() => null);
  const track = response?.data;
  if (!track?.title) return null;
  const artist = String(track?.artist?.name || "").trim();
  return [track.title, artist].filter(Boolean).join(" ");
}

async function appleMusicToSearchQuery(url) {
  const trackId = parseAppleTrackId(url);
  if (!trackId) return null;
  const response = await axios
    .get("https://itunes.apple.com/lookup", {
      params: { id: trackId, entity: "song" },
      timeout: 12000,
    })
    .catch(() => null);
  const song = Array.isArray(response?.data?.results)
    ? response.data.results.find((item) => item?.kind === "song")
    : null;
  if (!song?.trackName) return null;
  return [song.trackName, song.artistName].filter(Boolean).join(" ");
}

async function resolveSearchInput(input) {
  const query = cleanQuery(input);
  if (!query) return { query: "", engine: QueryType.AUTO_SEARCH, translated: false };

  if (/deezer\.com\/(?:[a-z]{2}\/)?track\/\d+/i.test(query)) {
    const mapped = await deezerToSearchQuery(query);
    if (mapped) {
      return { query: mapped, engine: QueryType.AUTO_SEARCH, translated: true };
    }
  }

  if (/music\.apple\.com\//i.test(query)) {
    const mapped = await appleMusicToSearchQuery(query);
    if (mapped) {
      return { query: mapped, engine: QueryType.AUTO_SEARCH, translated: true };
    }
  }

  return {
    query,
    engine: /^https?:\/\//i.test(query) ? QueryType.AUTO : QueryType.AUTO_SEARCH,
    translated: false,
  };
}

async function getPlayer(client) {
  if (client.musicPlayer) return client.musicPlayer;

  if (!playerInitPromise) {
    playerInitPromise = (async () => {
      const player = new Player(client, {
        skipFFmpeg: false,
      });
      await player.extractors.loadMulti(DefaultExtractors);

      player.events.on("error", (queue, error) => {
        global.logger?.error?.(
          "[MUSIC] queue error:",
          queue?.guild?.id || "unknown",
          error?.message || error,
        );
      });
      player.events.on("playerError", (queue, error, track) => {
        const guildId = String(queue?.guild?.id || "");
        if (guildId) lastPlayerErrorAtByGuild.set(guildId, Date.now());
        global.logger?.error?.(
          "[MUSIC] player error:",
          queue?.guild?.id || "unknown",
          track?.title || "unknown",
          error?.message || error,
        );
      });
      player.events.on("playerStart", (queue) => {
        const guildId = String(queue?.guild?.id || "");
        if (guildId) lastPlayerStartAtByGuild.set(guildId, Date.now());
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("audioTrackAdd", (queue) => {
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("audioTracksAdd", (queue) => {
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("emptyQueue", async (queue) => {
        const guildId = String(queue?.guild?.id || "");
        const now = Date.now();
        const lastStartAt = guildId ? Number(lastPlayerStartAtByGuild.get(guildId) || 0) : 0;
        const lastPlayerErrorAt = guildId ? Number(lastPlayerErrorAtByGuild.get(guildId) || 0) : 0;
        if ((lastStartAt && now - lastStartAt < 15_000) || (lastPlayerErrorAt && now - lastPlayerErrorAt < 15_000)) {
          global.logger?.warn?.("[MUSIC] emptyQueue ignored shortly after start/error:", guildId);
          return;
        }
        if (guildId) lastEmptyQueueAtByGuild.set(guildId, Date.now());
        await sendQueueNotice(queue, "There are no more tracks");
        scheduleInactivityLeave(queue);
      });
      player.events.on("emptyChannel", (queue) => {
        scheduleEmptyVoiceLeave(queue);
      });
      player.events.on("channelPopulate", (queue) => {
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("disconnect", async (queue) => {
        const guildId = String(queue?.guild?.id || "");
        clearInactivityTimer(guildId);
        clearEmptyVoiceTimer(guildId);
        clearVoiceSession(guildId);
        const now = Date.now();
        const manualLeaveAt = guildId ? Number(manualLeaveAtByGuild.get(guildId) || 0) : 0;
        if (manualLeaveAt && now - manualLeaveAt < 15_000) return;
        const lastEmptyAt = guildId ? Number(lastEmptyQueueAtByGuild.get(guildId) || 0) : 0;
        if (lastEmptyAt && now - lastEmptyAt < 8000) return;
        await sendQueueNotice(queue, "I have been kicked from the voice channel ☹️");
      });

      client.musicPlayer = player;
      return player;
    })().finally(() => {
      playerInitPromise = null;
    });
  }

  return playerInitPromise;
}

async function playRequest({
  client,
  guild,
  channel,
  voiceChannel,
  requestedBy,
  input,
}) {
  const player = await getPlayer(client);
  const resolved = await resolveSearchInput(input);

  if (!resolved.query) {
    return { ok: false, reason: "empty_query" };
  }

  const searchResult = await player.search(resolved.query, {
    requestedBy,
    searchEngine: resolved.engine,
  });

  if (!searchResult || !Array.isArray(searchResult.tracks) || !searchResult.tracks.length) {
    return { ok: false, reason: "not_found" };
  }

  const queue = player.nodes.create(guild, {
    metadata: { channel },
    leaveOnEmpty: false,
    leaveOnEmptyCooldown: 0,
    leaveOnEnd: false,
    leaveOnEndCooldown: 0,
    selfDeaf: true,
    volume: DEFAULT_MUSIC_VOLUME,
    connectionTimeout: 20_000,
  });
  queue.metadata = { ...(queue.metadata || {}), channel };
  queue.node.setVolume(DEFAULT_MUSIC_VOLUME);

  await leaveTtsGuild(guild?.id, client).catch(() => null);
  setVoiceSession(guild?.id, {
    mode: "music",
    channelId: voiceChannel?.id,
  });

  if (!queue.connection) {
    await queue.connect(voiceChannel);
  }

  clearInactivityTimer(guild?.id);

  const wasPlaying = queue.isPlaying();
  if (!wasPlaying) {
    if (searchResult.playlist) {
      const [firstTrack, ...restTracks] = searchResult.tracks;
      if (!firstTrack) return { ok: false, reason: "empty_queue" };
      stampTrackMetadata(firstTrack, requestedBy);
      for (const track of restTracks) {
        stampTrackMetadata(track, requestedBy);
      }
      if (restTracks.length) queue.addTrack(restTracks);
      await queue.node.play(firstTrack);
      return {
        ok: true,
        mode: "started",
        track: firstTrack,
        playlist: searchResult.playlist || null,
        translated: resolved.translated,
      };
    }
    const firstTrack = searchResult.tracks[0];
    if (!firstTrack) return { ok: false, reason: "empty_queue" };
    stampTrackMetadata(firstTrack, requestedBy);
    await queue.node.play(firstTrack);
    return {
      ok: true,
      mode: "started",
      track: firstTrack,
      playlist: searchResult.playlist || null,
      translated: resolved.translated,
    };
  }

  if (searchResult.playlist) {
    for (const track of searchResult.tracks) {
      stampTrackMetadata(track, requestedBy);
    }
    queue.addTrack(searchResult.tracks);
  } else {
    const single = searchResult.tracks[0];
    stampTrackMetadata(single, requestedBy);
    queue.addTrack(single);
  }

  return {
    ok: true,
    mode: "queued",
    track: searchResult.tracks[0],
    playlist: searchResult.playlist || null,
    translated: resolved.translated,
    queue,
    queueTrackCount: Number(queue?.tracks?.size || 0),
    queueTotalCount:
      Number(queue?.tracks?.size || 0) + (queue?.currentTrack ? 1 : 0),
    queuePosition:
      Number(
        typeof queue?.node?.getTrackPosition === "function"
          ? queue.node.getTrackPosition(searchResult.tracks[0])
          : -1,
      ) + 1,
    etaMs: (() => {
      const list = queueTracksToArray(queue);
      const pos =
        Number(
          typeof queue?.node?.getTrackPosition === "function"
            ? queue.node.getTrackPosition(searchResult.tracks[0])
            : -1,
        ) || 0;
      const currentTs = queue?.node?.getTimestamp?.();
      const currentRemaining =
        queue?.currentTrack
          ? Math.max(
            0,
            Number(currentTs?.total?.value || queue.currentTrack.durationMS || 0) -
            Number(currentTs?.current?.value || 0),
          )
          : 0;
      let wait = currentRemaining;
      for (let i = 0; i < pos; i += 1) {
        const item = list[i];
        wait += Math.max(0, Number(item?.durationMS || 0));
      }
      return wait;
    })(),
  };
}

async function searchPlayable({
  client,
  input,
  requestedBy,
}) {
  const player = await getPlayer(client);
  const resolved = await resolveSearchInput(input);
  if (!resolved.query) return { ok: false, reason: "empty_query" };
  const searchResult = await player.search(resolved.query, {
    requestedBy,
    searchEngine: resolved.engine,
  });
  if (!searchResult || !Array.isArray(searchResult.tracks) || !searchResult.tracks.length) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, player, resolved, searchResult };
}

async function touchMusicOutputChannel(client, guildId, channel) {
  const safeGuildId = String(guildId || "");
  if (!client?.musicPlayer || !safeGuildId || !channel) return false;
  const queue = client.musicPlayer.nodes.get(safeGuildId);
  if (!queue) return false;
  queue.metadata = { ...(queue.metadata || {}), channel };
  return true;
}

module.exports = {
  getPlayer,
  searchPlayable,
  touchMusicOutputChannel,
  playRequest,
};
