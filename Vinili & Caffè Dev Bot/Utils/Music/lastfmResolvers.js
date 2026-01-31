const { lastFmRequest } = require("./lastfm");

async function resolveRecentTrack(lastFmUsername, { nowPlayingOnly = false } = {}) {
  const data = await lastFmRequest("user.getrecenttracks", {
    user: lastFmUsername,
    limit: 1
  }, { cacheTtlMs: 0 });
  const track = data?.recenttracks?.track?.[0] || null;
  if (nowPlayingOnly && !track?.["@attr"]?.nowplaying) return null;
  return track;
}

function buildArtistCandidates(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];
  const candidates = [];
  const addUnique = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };
  addUnique(text);

  const featureSeparators = [" feat. ", " ft. ", " featuring ", " x "];
  let featureSplit = [text];
  for (const sep of featureSeparators) {
    featureSplit = featureSplit.flatMap(item => item.split(sep));
  }
  featureSplit.forEach(addUnique);

  const secondarySeparators = [",", " & ", " and "];
  let secondarySplit = [text];
  for (const sep of secondarySeparators) {
    secondarySplit = secondarySplit.flatMap(item => item.split(sep));
  }
  secondarySplit.forEach(addUnique);

  return candidates;
}

async function resolveArtistCandidate(lastFmUsername, candidate) {
  if (!candidate) return null;
  try {
    const data = await lastFmRequest("artist.getinfo", {
      artist: candidate,
      username: lastFmUsername,
      autocorrect: 1
    }, { cacheTtlMs: 0 });
    const name = data?.artist?.name;
    return name || candidate;
  } catch {
    return null;
  }
}

async function resolveArtistName(lastFmUsername, artistName) {
  if (artistName) {
    const resolved = await resolveArtistCandidate(lastFmUsername, artistName);
    if (resolved) return resolved;
    try {
      const search = await lastFmRequest("artist.search", { artist: artistName, limit: 1 }, { cacheTtlMs: 0 });
      const match = search?.results?.artistmatches?.artist;
      const first = Array.isArray(match) ? match[0] : match;
      if (first?.name) return first.name;
    } catch {
      return artistName;
    }
    return artistName;
  }
  const recent = await resolveRecentTrack(lastFmUsername, { nowPlayingOnly: true });
  const rawArtist = recent?.artist?.["#text"] || null;
  if (!rawArtist) return null;
  const candidates = buildArtistCandidates(rawArtist);
  for (const candidate of candidates) {
    const resolved = await resolveArtistCandidate(lastFmUsername, candidate);
    if (resolved) return resolved;
  }
  return null;
}
async function resolveAlbumArtist(lastFmUsername, albumName, artistName) {
  if (albumName && artistName) {
    try {
      const info = await lastFmRequest("album.getinfo", {
        artist: artistName,
        album: albumName,
        autocorrect: 1
      }, { cacheTtlMs: 0 });
      const resolvedAlbum = info?.album?.name || albumName;
      const resolvedArtist = info?.album?.artist || artistName;
      return { album: resolvedAlbum, artist: resolvedArtist };
    } catch {
      return { album: albumName, artist: artistName };
    }
  }
  if (albumName && !artistName) {
    const search = await lastFmRequest("album.search", { album: albumName, limit: 1 });
    const match = search?.results?.albummatches?.album;
    const first = Array.isArray(match) ? match[0] : match;
    if (first?.artist && first?.name) {
      return { album: first.name, artist: first.artist };
    }
  }
  const recent = await resolveRecentTrack(lastFmUsername);
  if (!recent) return null;
  const album = recent.album?.["#text"];
  const artist = recent.artist?.["#text"];
  if (!album || !artist) return null;
  return { album, artist };
}
async function resolveTrackArtist(lastFmUsername, trackName, artistName) {
  if (trackName && artistName) {
    try {
      const info = await lastFmRequest("track.getinfo", {
        artist: artistName,
        track: trackName,
        autocorrect: 1
      }, { cacheTtlMs: 0 });
      const resolvedTrack = info?.track?.name || trackName;
      const resolvedArtist = info?.track?.artist?.name || artistName;
      return { track: resolvedTrack, artist: resolvedArtist };
    } catch {
      return { track: trackName, artist: artistName };
    }
  }
  if (trackName && !artistName) {
    const search = await lastFmRequest("track.search", { track: trackName, limit: 1 });
    const match = search?.results?.trackmatches?.track;
    const first = Array.isArray(match) ? match[0] : match;
    if (first?.artist && first?.name) {
      return { track: first.name, artist: first.artist };
    }
  }
  const recent = await resolveRecentTrack(lastFmUsername);
  if (!recent) return null;
  const track = recent.name;
  const artist = recent.artist?.["#text"];
  if (!track || !artist) return null;
  return { track, artist };
}

module.exports = { resolveRecentTrack, resolveArtistName, resolveAlbumArtist, resolveTrackArtist };
