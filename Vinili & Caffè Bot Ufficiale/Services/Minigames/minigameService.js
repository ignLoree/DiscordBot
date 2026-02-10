const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { MinigameUser, MinigameState, MinigameRotation } = require('../../Schemas/Minigames/minigameSchema');
const { addExpWithLevel } = require('../Community/expService');
const IDs = require('../../Utils/Config/ids');

const activeGames = new Map();
const pendingGames = new Map();
const loopState = new WeakSet();
const forcedRunState = new Map();
let rotationDate = null;
let rotationQueue = [];
const recentMessages = new Map();
const standbyChannels = new Set();
const lastSentAtByChannel = new Map();
const startingChannels = new Set();

const REWARD_CHANNEL_ID = IDs.channels.levelUp;
const EXP_REWARDS = [
  { exp: 100, roleId: IDs.roles.minigameReward100 },
  { exp: 500, roleId: IDs.roles.minigameReward500 },
  { exp: 1000, roleId: IDs.roles.minigameReward1000 },
  { exp: 1500, roleId: IDs.roles.minigameReward1500 },
  { exp: 2500, roleId: IDs.roles.minigameReward2500 },
  { exp: 5000, roleId: IDs.roles.minigameReward5000 },
  { exp: 10000, roleId: IDs.roles.minigameReward10000 },
  { exp: 50000, roleId: IDs.roles.minigameReward50000 },
  { exp: 100000, roleId: IDs.roles.minigameReward100000 }
];

let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedCountries = null;
let cachedCountriesAt = 0;
const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedPlayers = null;
let cachedPlayersAt = 0;
const PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedSongs = null;
let cachedSongsAt = 0;
const SONG_CACHE_TTL_MS = 15 * 60 * 1000;

function getConfig(client) {
  return client?.config?.minigames || null;
}

function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || null;
}

function getActivityWindowMs(cfg) {
  return Math.max(60 * 1000, Number(cfg?.activityWindowMs || 30 * 60 * 1000));
}

function getMinMessages(cfg) {
  return Math.max(1, Number(cfg?.minMessages || 3));
}

function getFailsafeMs(cfg) {
  return Math.max(60 * 1000, Number(cfg?.failsafeMs || 90 * 60 * 1000));
}

function recordActivity(channelId, windowMs) {
  if (!channelId) return;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(channelId) || [];
  list.push(now);
  const cutoff = now - safeWindowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  recentMessages.set(channelId, trimmed);
}

function getRecentCount(channelId, windowMs) {
  if (!channelId) return 0;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(channelId) || [];
  const cutoff = now - safeWindowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  recentMessages.set(channelId, trimmed);
  return trimmed.length;
}

function isReadyByActivity(cfg) {
  const channelId = cfg?.channelId;
  const count = getRecentCount(channelId, getActivityWindowMs(cfg));
  return count >= getMinMessages(cfg);
}

function canStartByInterval(cfg) {
  const intervalMs = Number(cfg?.intervalMs || 15 * 60 * 1000);
  const channelId = cfg?.channelId;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  return Date.now() - lastSent >= intervalMs;
}

function markSent(channelId) {
  if (!channelId) return;
  lastSentAtByChannel.set(channelId, Date.now());
  standbyChannels.delete(channelId);
}

function isFailsafeDue(cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return false;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  if (!lastSent) return false;
  return Date.now() - lastSent >= getFailsafeMs(cfg);
}

async function saveActiveGame(client, cfg, payload) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.findOneAndUpdate(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => {});
}

async function clearActiveGame(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.deleteOne({ guildId, channelId }).catch(() => {});
}

function randomBetween(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffleString(value) {
  const arr = String(value || '').split('');
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function normalizeWord(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeCountryName(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidWord(word) {
  if (!word) return false;
  if (word.length < 5 || word.length > 6) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(word);
}

async function loadWordList(cfg) {
  const now = Date.now();
  if (cachedWords && (now - cachedWordsAt) < WORD_CACHE_TTL_MS) return cachedWords;

  const apiUrl = cfg?.guessWord?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (Array.isArray(res?.data?.words)) {
        list = res.data.words;
      }
    } catch {}
  }

  if (!list.length) {
    list = Array.isArray(cfg?.guessWord?.words) ? cfg.guessWord.words : [];
  }

  const filtered = list
    .map(normalizeWord)
    .filter(isValidWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function collectCountryNames(country) {
  const names = new Set();
  const add = (value) => {
    const normalized = normalizeCountryName(value);
    if (normalized) names.add(normalized);
  };
  add(country?.name?.common);
  add(country?.name?.official);
  const nativeNames = country?.name?.nativeName || {};
  for (const key of Object.keys(nativeNames)) {
    add(nativeNames[key]?.common);
    add(nativeNames[key]?.official);
  }
  const translations = country?.translations || {};
  for (const key of Object.keys(translations)) {
    add(translations[key]?.common);
    add(translations[key]?.official);
  }
  const altSpellings = Array.isArray(country?.altSpellings) ? country.altSpellings : [];
  for (const alt of altSpellings) add(alt);
  return Array.from(names.values());
}

async function loadCountryList(cfg) {
  const now = Date.now();
  if (cachedCountries && (now - cachedCountriesAt) < COUNTRY_CACHE_TTL_MS) return cachedCountries;

  const apiUrl = cfg?.guessFlag?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      }
    } catch {}
  }

  const mapped = list
    .map((country) => {
      const names = collectCountryNames(country);
      const flagUrl = country?.flags?.png || country?.flags?.svg || country?.flags?.[0];
      const displayName = country?.name?.common || country?.name?.official || null;
      if (!names.length || !flagUrl || !displayName) return null;
      return { names, flagUrl, displayName };
    })
    .filter(Boolean);

  cachedCountries = mapped;
  cachedCountriesAt = now;
  return cachedCountries;
}

function normalizePlayerGuess(raw) {
  return normalizeCountryName(raw);
}

function normalizeSongGuess(raw) {
  return normalizeCountryName(raw);
}

function extractPlayerTokens(name) {
  const normalized = normalizePlayerGuess(name);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

async function fetchPlayerInfo(cfg, name) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase || !name) return null;
  const url = `${apiBase}${encodeURIComponent(name)}`;
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const players = res?.data?.player;
    if (!Array.isArray(players) || players.length === 0) return null;
    const player = players.find((p) => (p?.strThumb || p?.strCutout) && p?.strPlayer) || players[0];
    if (!player?.strPlayer) return null;
    if (!player.strThumb && !player.strCutout) return null;
    return {
      name: player.strPlayer,
      team: player.strTeam || 'Squadra sconosciuta',
      nationality: player.strNationality || 'Nazionalità sconosciuta',
      image: player.strThumb || player.strCutout || null
    };
  } catch {
    return null;
  }
}

async function fetchPlayerFromRandomLetter(cfg) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase) return null;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const letter = letters[randomBetween(0, letters.length - 1)];
    const url = `${apiBase}${encodeURIComponent(letter)}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const players = res?.data?.player;
      if (!Array.isArray(players) || players.length === 0) continue;
      const withImage = players.filter((p) => p?.strThumb || p?.strCutout);
      const pool = withImage.length ? withImage : players;
      const player = pool[randomBetween(0, pool.length - 1)];
      if (!player?.strPlayer) continue;
      if (!player.strThumb && !player.strCutout) continue;
      return {
        name: player.strPlayer,
        team: player.strTeam || 'Squadra sconosciuta',
        nationality: player.strNationality || 'Nazionalità sconosciuta',
        image: player.strThumb || player.strCutout || null
      };
    } catch {}
  }
  return null;
}

async function loadPlayerList(cfg) {
  const now = Date.now();
  if (cachedPlayers && (now - cachedPlayersAt) < PLAYER_CACHE_TTL_MS) return cachedPlayers;
  const list = Array.isArray(cfg?.guessPlayer?.names) ? cfg.guessPlayer.names : [];
  const filtered = list.map((name) => String(name || '').trim()).filter(Boolean);
  cachedPlayers = filtered;
  cachedPlayersAt = now;
  return cachedPlayers;
}

async function fetchFamousPlayer(cfg) {
  const customNames = Array.isArray(cfg?.guessPlayer?.famousNames)
    ? cfg.guessPlayer.famousNames
    : [];
  const defaultNames = [
    'Kylian Mbappe',
    'Erling Haaland',
    'Jude Bellingham',
    'Vinicius Junior',
    'Robert Lewandowski',
    'Mohamed Salah',
    'Kevin De Bruyne',
    'Harry Kane',
    'Bukayo Saka',
    'Phil Foden',
    'Rodri',
    'Lautaro Martinez',
    'Victor Osimhen',
    'Nicolas Barella',
    'Pedri',
    'Antoine Griezmann',
    'Bruno Fernandes',
    'Son Heung-min',
    'Florian Wirtz',
    'Jamal Musiala'
  ];

  const names = (customNames.length ? customNames : defaultNames)
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (!names.length) return null;

  const maxAttempts = Math.min(10, names.length);
  const used = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const candidate = names[randomBetween(0, names.length - 1)];
      if (!used.has(candidate)) {
        pick = candidate;
        used.add(candidate);
        break;
      }
    }
    if (!pick) break;
    const info = await fetchPlayerInfo(cfg, pick);
    if (info?.name && info?.image) return info;
  }
  return null;
}

async function fetchRandomSong(cfg) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms = Array.isArray(cfg?.guessSong?.popularTerms) && cfg.guessSong.popularTerms.length
    ? cfg.guessSong.popularTerms
    : [
      'the weeknd', 'dua lipa', 'ed sheeran', 'drake', 'ariana grande',
      'post malone', 'taylor swift', 'billie eilish', 'maneskin', 'elodie',
      'sfera ebbasta', 'thasup', 'bad bunny', 'eminem', 'coldplay'
    ];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter((item) => item?.trackName && item?.artistName && item?.previewUrl);
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100
        ? song.artworkUrl100.replace('100x100bb', '600x600bb')
        : null;
      const genre = song.primaryGenreName || 'Genere sconosciuto';
      const artistCountry = await fetchArtistCountry(cfg, song.artistName);
      return {
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || 'Album sconosciuto',
        artwork,
        genre,
        artistCountry: artistCountry || 'Nazionalità sconosciuta',
        previewUrl: song.previewUrl || null
      };
    } catch {}
  }
  return null;
}

async function fetchAudioAttachment(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadPopularSongList(cfg) {
  const now = Date.now();
  if (cachedSongs && (now - cachedSongsAt) < SONG_CACHE_TTL_MS) return cachedSongs;
  const all = [];

  const deezerChartUrl = cfg?.guessSong?.deezerChartUrl || 'https://api.deezer.com/chart/0/tracks?limit=100';
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data) ? chartRes.data.data : [];
    for (const track of tracks) {
      if (!track?.title || !track?.artist?.name) continue;
      all.push({
        source: 'deezer',
        id: String(track.id || ''),
        title: track.title,
        artist: track.artist.name,
        album: track?.album?.title || 'Album sconosciuto',
        artwork: track?.album?.cover_xl || track?.album?.cover_big || track?.album?.cover_medium || null,
        genre: 'Popolare',
        previewUrl: track.preview || null
      });
    }
  } catch {}

  const feeds = Array.isArray(cfg?.guessSong?.popularFeeds) ? cfg.guessSong.popularFeeds : [];
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry) ? res.data.feed.entry : [];
      for (const entry of entries) {
        const id = entry?.id?.attributes?.['im:id'] || entry?.id?.attributes?.im_id;
        const title = entry?.['im:name']?.label || entry?.title?.label;
        const artist = entry?.['im:artist']?.label || entry?.['im:artist']?.name;
        const images = Array.isArray(entry?.['im:image']) ? entry['im:image'] : [];
        const artwork = images.length ? images[images.length - 1].label : null;
        if (!id || !title || !artist) continue;
        all.push({ source: 'itunes_feed', id: String(id), title, artist, artwork });
      }
    } catch {}
  }
  cachedSongs = all;
  cachedSongsAt = now;
  return cachedSongs;
}

async function fetchPopularSong(cfg) {
  const list = await loadPopularSongList(cfg);
  if (!list.length) return null;
  const onlyWithPreview = list.filter((item) => item?.previewUrl);
  const pool = onlyWithPreview.length ? onlyWithPreview : list;
  const pick = pool[randomBetween(0, pool.length - 1)];
  if (!pick?.id) return null;

  if (pick.source === 'deezer') {
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: pick.title,
      artist: pick.artist,
      album: pick.album || 'Album sconosciuto',
      artwork: pick.artwork || null,
      genre: pick.genre || 'Genere sconosciuto',
      artistCountry: artistCountry || 'Nazionalità sconosciuta',
      previewUrl: pick.previewUrl || null
    };
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(pick.id)}`;
  try {
    const res = await axios.get(lookupUrl, { timeout: 15000 });
    const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null;
    if (!item?.trackName || !item?.artistName) return null;
    const genre = item?.primaryGenreName || 'Genere sconosciuto';
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: item?.trackName || pick.title,
      artist: item?.artistName || pick.artist,
      album: item?.collectionName || 'Album sconosciuto',
      artwork: item?.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : pick.artwork,
      genre,
      artistCountry: artistCountry || 'Nazionalità sconosciuta',
      previewUrl: item?.previewUrl || null
    };
  } catch {
    return null;
  }
}

function normalizeArtistLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft)\.?[^)]*\)/g, ' ')
    .replace(/\b(feat|ft)\.?[\s\S]*$/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildArtistSearchTerms(artistName) {
  const raw = String(artistName || '').trim();
  const normalized = normalizeArtistLabel(raw);
  const terms = new Set();
  if (raw) terms.add(raw);
  if (normalized && normalized !== raw.toLowerCase()) terms.add(normalized);
  return Array.from(terms).filter(Boolean);
}

function pickBestArtistCandidate(candidates, artistName) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const target = normalizeArtistLabel(artistName);
  const scored = candidates
    .map((artist) => {
      const artistLabel = normalizeArtistLabel(artist?.name);
      const hasCountry = Boolean(artist?.country || artist?.area?.name);
      const mbScore = Number(artist?.score || 0);
      let nameScore = 0;
      if (artistLabel && target) {
        if (artistLabel === target) nameScore = 120;
        else if (artistLabel.includes(target) || target.includes(artistLabel)) nameScore = 60;
      }
      const countryBonus = hasCountry ? 30 : 0;
      return { artist, score: mbScore + nameScore + countryBonus };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg, artistName) {
  if (!artistName) return null;
  const apiBase = cfg?.guessSong?.artistApiUrl || 'https://musicbrainz.org/ws/2/artist/?query=artist:';
  const terms = buildArtistSearchTerms(artistName);
  const urls = [];

  for (const term of terms) {
    urls.push(`${apiBase}${encodeURIComponent(term)}&fmt=json&limit=8`);
  }
  urls.push(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=8`);
  urls.push(`https://musicbrainz.org/ws/2/artist/?query=artist:%22${encodeURIComponent(artistName)}%22&fmt=json&limit=8`);

  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'ViniliCaffeBot/1.0 (discord bot)'
        }
      });
      const candidates = Array.isArray(res?.data?.artists) ? res.data.artists : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch {}
  }
  return null;
}

function isWithinAllowedWindow(now, start, end) {
  const startMinutes = (start?.hour ?? 9) * 60 + (start?.minute ?? 0);
  const endMinutes = (end?.hour ?? 23) * 60 + (end?.minute ?? 45);
  const parts = getRomeParts(now);
  const current = parts.hour * 60 + parts.minute;
  return current >= startMinutes && current <= endMinutes;
}

function getRomeParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

function getRomeDateKey(date) {
  const parts = getRomeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getDateKey(now) {
  const { year, month, day } = getRomeParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shouldForceRun(now, hour, minute) {
  const rome = getRomeParts(now);
  if (rome.hour !== hour || rome.minute !== minute) return false;
  const key = `${getDateKey(now)}_${hour}:${minute}`;
  if (forcedRunState.get(key)) return false;
  forcedRunState.set(key, true);
  return true;
}

function buildGuessNumberEmbed(min, max, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina il numero .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp}exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarlo!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
}

function buildGuessWordEmbed(scrambled, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina la parola .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
}

function buildGuessFlagEmbed(flagUrl, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina la bandiera .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'))
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina il calciatore .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina il calciatore più famoso per ottenere **${rewardExp} exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarlo!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  return embed;
}

function buildGuessSongEmbed(rewardExp, durationMs, artworkUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina la canzone .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina la canzone per ottenere **${rewardExp} exp**˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildFindBotEmbed(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Trova il bot .ᐟ ✧')
    .setDescription([
      '<a:VC_Beer:1448687940560490547> Trova il messaggio del bot tra i canali del server, premi il bottone e vinci la ricompensa!',
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per trovarlo!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'))
}

function buildFindBotButtonEmbed(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Sei vicino al bot .ᐟ ✧')
    .setDescription([
      '<a:VC_Beer:1448687940560490547> Hai trovato il messaggio nascosto: clicca il bottone per vincere subito la ricompensa!',
      `> <a:VC_Time:1468641957038526696> Tempo rimasto: **${minutes} minuti**`,
      `> <:VC_Dot:1443932948599668746> Solo il primo che clicca vince.`
    ].join('\n'));
}

function buildMinuteHintEmbed(channelId) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<a:VC_Heart:1448672728822448141>⁺Indizio')
    .setDescription(`⟢ <a:VC_Arrow:1448672967721615452> <#${channelId}>`);
}

function buildFlagHintEmbed(name) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<a:VC_Heart:1448672728822448141>⁺Indizio')
    .setDescription(`⟢ <a:VC_Arrow:1448672967721615452> ${name}`);
}

function buildHintEmbed(isHigher) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(isHigher ? '📈 <a:VC_Arrow:1448672967721615452> Più alto!' : '📉 <a:VC_Arrow:1448672967721615452> Più basso!');
}

function buildWinEmbed(winnerId, rewardExp, totalExp) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<a:VC_Events:1448688007438667796> Un utente ha vinto !')
    .setDescription([
      `<a:VC_Winner:1448687700235256009> Complimenti <@${winnerId}>, hai vinto e guadagnato **${rewardExp}exp**.ᐟ ✧`,
      '',
      '📊 **Le tue statistiche:**',
      `<a:VC_Arrow:1448672967721615452> Ora hai un totale di **${totalExp}exp**`,
    ].join('\n'))
    .setFooter({ text: '⇢ digita il comando "+mstats" per vedere i tuoi progressi' });
}

function getHighestEligibleReward(totalExp) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of EXP_REWARDS) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

function getNextReward(totalExp) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member, reward, totalExp) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    '<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>',
    '',
    `<a:VC_Events:1448688007438667796> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** punti ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    '',
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** punti per la prossima ricompensa!`
      : '<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!',
  ].join('\n');

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: member.displayName || member.user?.username || 'Utente', iconURL: member.displayAvatarURL() })
    .setDescription(description)
    .setFooter({ text: 'Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche con il comando `+mstats`' });
}

async function handleExpReward(client, member, totalExp) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => {});

  const rewardChannel = getChannelSafe(client, REWARD_CHANNEL_ID) || await member.guild.channels.fetch(REWARD_CHANNEL_ID).catch(() => null);
  if (!rewardChannel) return;
  await rewardChannel.send({ content: `${member}`, embeds: [buildRewardEmbed(member, reward, totalExp)] }).catch(() => {});
}

function buildTimeoutNumberEmbed(number) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! Il numero era **${number}**.`);
}

function buildTimeoutWordEmbed(word) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! La parola era **${word}**.`);
}

function buildTimeoutFlagEmbed(name) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! La bandiera era **${name}**.`);
}

function buildTimeoutPlayerEmbed(name) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! Il calciatore era **${name}**.`);
}

function buildTimeoutSongEmbed(title, artist) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! Era **${title}** — ${artist}.`);
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription('<a:VC_Timer:1462779065625739344> Tempo scaduto! Nessuno ha trovato il bot.');
}

function getAvailableGameTypes(cfg) {
  const types = [];
  if (cfg?.guessNumber) types.push('guessNumber');
  if (cfg?.guessWord) types.push('guessWord');
  if (cfg?.guessFlag) types.push('guessFlag');
  if (cfg?.guessPlayer) types.push('guessPlayer');
  if (cfg?.guessSong) types.push('guessSong');
  if (cfg?.findBot) types.push('findBot');
  return types;
}

async function loadRotationState(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  const dateKey = getRomeDateKey(new Date());
  const doc = await MinigameRotation.findOne({ guildId, channelId }).lean().catch(() => null);
  if (doc && doc.dateKey === dateKey && Array.isArray(doc.queue)) {
    rotationDate = dateKey;
    rotationQueue = doc.queue.slice();
    return;
  }
  rotationDate = dateKey;
  rotationQueue = [];
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => {});
}

async function saveRotationState(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  const dateKey = rotationDate || getRomeDateKey(new Date());
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: rotationQueue } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => {});
}

async function getNextGameType(client, cfg) {
  const available = getAvailableGameTypes(cfg);
  if (available.length === 0) return null;
  const today = getRomeDateKey(new Date());
  if (rotationDate !== today || rotationQueue.length === 0) {
    rotationDate = today;
    rotationQueue = available.slice();
    for (let i = rotationQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotationQueue[i], rotationQueue[j]] = [rotationQueue[j], rotationQueue[i]];
    }
  }
  const next = rotationQueue.shift() || available[0];
  await saveRotationState(client, cfg);
  return next;
}

async function scheduleMinuteHint(client, hintChannelId, durationMs, channelId) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!mainChannel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await mainChannel.send({ embeds: [buildMinuteHintEmbed(hintChannelId)] }).catch(() => {});
  }, delay);
}

async function scheduleFlagHint(client, channelId, durationMs, name) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000) return null;
  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await channel.send({ embeds: [buildFlagHintEmbed(name)] }).catch(() => {});
  }, delay);
}

async function startGuessNumberGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  const max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  const rewardExp = Number(cfg?.guessNumber?.rewardExp || 100);
  const durationMs = Math.max(60000, Number(cfg?.guessNumber?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const gameMessage = await channel.send({ embeds: [buildGuessNumberEmbed(min, max, rewardExp, durationMs)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    await channel.send({ embeds: [buildTimeoutNumberEmbed(game.target)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  activeGames.set(channelId, {
    type: 'guessNumber',
    target,
    min,
    max,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    gameMessageId: gameMessage?.id || null
  });

  await saveActiveGame(client, cfg, {
    type: 'guessNumber',
    target: String(target),
    min,
    max,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null
  });

  markSent(channelId);

  return true;
}

async function startGuessWordGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const words = await loadWordList(cfg);
  if (!words.length) return false;

  const rewardExp = Number(cfg?.guessWord?.rewardExp || 150);
  const durationMs = Math.max(60000, Number(cfg?.guessWord?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const target = String(words[randomBetween(0, words.length - 1)] || '').toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const scrambled = shuffleString(target);
  const gameMessage = await channel.send({ embeds: [buildGuessWordEmbed(scrambled, rewardExp, durationMs)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    await channel.send({ embeds: [buildTimeoutWordEmbed(game.target)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  activeGames.set(channelId, {
    type: 'guessWord',
    target,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    gameMessageId: gameMessage?.id || null
  });

  await saveActiveGame(client, cfg, {
    type: 'guessWord',
    target,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null
  });

  markSent(channelId);

  return true;
}

async function startGuessFlagGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const countries = await loadCountryList(cfg);
  if (!countries.length) return false;

  const rewardExp = Number(cfg?.guessFlag?.rewardExp || 150);
  const durationMs = Math.max(60000, Number(cfg?.guessFlag?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const target = countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const gameMessage = await channel.send({ embeds: [buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleFlagHint(client, channelId, durationMs, target.displayName);

  activeGames.set(channelId, {
    type: 'guessFlag',
    answers: target.names,
    displayName: target.displayName,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null
  });

  await saveActiveGame(client, cfg, {
    type: 'guessFlag',
    target: JSON.stringify({ names: target.names, displayName: target.displayName, flagUrl: target.flagUrl }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null
  });

  markSent(channelId);

  return true;
}

async function startGuessPlayerGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = Number(cfg?.guessPlayer?.rewardExp || 100);
  const durationMs = Math.max(60000, Number(cfg?.guessPlayer?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const onlyFamous = cfg?.guessPlayer?.onlyFamous !== false;
  let info = await fetchFamousPlayer(cfg);
  if (!info) {
    const names = await loadPlayerList(cfg);
    if (names.length) {
      const randomName = names[randomBetween(0, names.length - 1)];
      info = await fetchPlayerInfo(cfg, randomName);
    }
  }
  if (!info && !onlyFamous) {
    info = await fetchPlayerFromRandomLetter(cfg);
  }
  if (!info) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const gameMessage = await channel.send({ embeds: [buildGuessPlayerEmbed(rewardExp, durationMs, info.image)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleFlagHint(client, channelId, durationMs, `${info.team} • ${info.nationality}`);

  activeGames.set(channelId, {
    type: 'guessPlayer',
    answers: extractPlayerTokens(info.name),
    fullAnswer: normalizePlayerGuess(info.name),
    displayName: info.name,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null
  });

  await saveActiveGame(client, cfg, {
    type: 'guessPlayer',
    target: JSON.stringify({ name: info.name, team: info.team, nationality: info.nationality, image: info.image }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null
  });

  markSent(channelId);
  return true;
}

async function startGuessSongGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = Number(cfg?.guessSong?.rewardExp || 100);
  const durationMs = Math.max(60000, Number(cfg?.guessSong?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const onlyFamous = cfg?.guessSong?.onlyFamous !== false;
  let info = await fetchPopularSong(cfg);
  if (!info && !onlyFamous) {
    info = await fetchRandomSong(cfg);
  }
  if (!info?.title || !info?.artist) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const previewCustomId = `minigame_song_preview:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(previewCustomId)
      .setLabel('Ascolta anteprima')
      .setEmoji(`<:VC_Preview:1462941162393309431>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!info.previewUrl)
  );
  const gameMessage = await channel.send({
    embeds: [buildGuessSongEmbed(rewardExp, durationMs, info.artwork)],
    components: [row]
  }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleFlagHint(client, channelId, durationMs, `${info.artistCountry} • ${info.genre}`);

  activeGames.set(channelId, {
    type: 'guessSong',
    title: info.title,
    artist: info.artist,
    previewUrl: info.previewUrl || null,
    previewCustomId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null
  });

  await saveActiveGame(client, cfg, {
    type: 'guessSong',
    target: JSON.stringify({ title: info.title, artist: info.artist, album: info.album, artwork: info.artwork, genre: info.genre, artistCountry: info.artistCountry, previewUrl: info.previewUrl }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
    customId: previewCustomId
  });

  markSent(channelId);
  return true;
}

async function pickRandomFindBotChannel(guild, requiredRoleId) {
  if (!guild) return null;
  const role = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : null;
  const me = guild.members.me || guild.members.cache.get(guild.client.user.id);

  const channels = guild.channels.cache.filter((channel) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (!channel.viewable) return false;
    if (!channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    if (role && !channel.permissionsFor(role)?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });

  const list = Array.from(channels.values());
  if (list.length === 0) return null;
  return list[randomBetween(0, list.length - 1)];
}

async function startFindBotGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = Math.max(60000, Number(cfg?.findBot?.durationMs || 300000));
  const rewardExp = Number(cfg?.findBot?.rewardExp || 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;

  const mainChannel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!mainChannel?.guild) return false;

  const targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId);
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await mainChannel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const mainMessage = await mainChannel.send({ embeds: [buildFindBotEmbed(durationMs)] }).catch(() => null);

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji(`<a:VC_Heart:1448672728822448141>`)
      .setLabel('Clicca qui per vincere!')
      .setStyle(ButtonStyle.Primary)
  );
  const gameMessage = await targetChannel.send({ embeds: [buildFindBotButtonEmbed(durationMs)], components: [row] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game || game.customId !== customId) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    if (game.channelId && game.messageId) {
      const ch = mainChannel.guild.channels.cache.get(game.channelId) || await mainChannel.guild.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(game.messageId).catch(() => null);
        if (msg) {
          await msg.delete().catch(() => {});
        }
        await mainChannel.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => {});
      }
    }
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId);

  activeGames.set(channelId, {
    type: 'findBot',
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId
  });

  await saveActiveGame(client, cfg, {
    type: 'findBot',
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId
  });

  markSent(channelId);

  return true;
}

async function hasRecentActivity(channel, windowMs, minMessages) {
  const window = Math.max(60 * 1000, Number(windowMs || 15 * 60 * 1000));
  const threshold = Math.max(1, Number(minMessages || 5));
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return false;
  const now = Date.now();
  let count = 0;
  for (const msg of messages.values()) {
    if (msg.author?.bot) continue;
    if ((now - msg.createdTimestamp) <= window) {
      count += 1;
      if (count >= threshold) return true;
    }
  }
  return false;
}

async function maybeStartRandomGame(client, force = false) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (startingChannels.has(cfg.channelId)) return;
  startingChannels.add(cfg.channelId);
  try {
  if (activeGames.has(cfg.channelId)) {
    const game = activeGames.get(cfg.channelId);
    if (game?.endsAt && Date.now() >= game.endsAt) {
      if (game.timeout) clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await clearActiveGame(client, cfg);
    } else {
      return;
    }
  }

  const now = new Date();
  if (!force) {
    const windowStart = cfg?.timeWindow?.start;
    const windowEnd = cfg?.timeWindow?.end;
    if (!isWithinAllowedWindow(now, windowStart, windowEnd)) return;
    if (!canStartByInterval(cfg)) return;
    const readyByActivity = isReadyByActivity(cfg);
    const failsafeDue = isFailsafeDue(cfg);
    if (!readyByActivity && !failsafeDue) {
      standbyChannels.add(cfg.channelId);
      return;
    }
  }

  const channel = getChannelSafe(client, cfg.channelId) || await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return;

  const available = getAvailableGameTypes(cfg);
  if (!available.length) return;
  const tried = new Set();
  let pending = pendingGames.get(cfg.channelId);

  while (tried.size < available.length) {
    const gameType = pending?.type || await getNextGameType(client, cfg);
    if (!gameType) return;
    if (tried.has(gameType)) {
      pending = null;
      continue;
    }
    tried.add(gameType);

    let started = false;
    if (gameType === 'guessWord') started = await startGuessWordGame(client, cfg);
    else if (gameType === 'guessFlag') started = await startGuessFlagGame(client, cfg);
    else if (gameType === 'guessPlayer') started = await startGuessPlayerGame(client, cfg);
    else if (gameType === 'guessSong') started = await startGuessSongGame(client, cfg);
    else if (gameType === 'findBot') started = await startFindBotGame(client, cfg);
    else started = await startGuessNumberGame(client, cfg);

    if (started) {
      pendingGames.delete(cfg.channelId);
      return;
    }
    pendingGames.delete(cfg.channelId);
    pending = null;
  }
  } finally {
    startingChannels.delete(cfg.channelId);
  }
}

function startMinigameLoop(client) {
  if (loopState.has(client)) return;
  loopState.add(client);

  const runForcedCheck = async () => {
    const cfg = getConfig(client);
    if (!cfg?.enabled) return;
    const now = new Date();
    const shouldForce = shouldForceRun(now, 9, 0) || shouldForceRun(now, 23, 45);
    if (!shouldForce) return;
    const type = await getNextGameType(client, cfg);
    if (!type) return;
    pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    await maybeStartRandomGame(client, true);
  };

  const tick = async () => {
    const cfg = getConfig(client);
    if (!cfg?.enabled) return;
    if (!pendingGames.has(cfg.channelId)) {
      const type = await getNextGameType(client, cfg);
      if (!type) return;
      pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    }
    await maybeStartRandomGame(client, false);
  };

  const cfg = getConfig(client);
  const intervalMs = Math.max(60 * 1000, Number(cfg?.intervalMs || 15 * 60 * 1000));
  tick();
  runForcedCheck();
  setInterval(tick, intervalMs);
  setInterval(runForcedCheck, 60 * 1000);
}

async function forceStartMinigame(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (activeGames.has(cfg.channelId)) return;
  const type = await getNextGameType(client, cfg);
  if (!type) return;
  pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
  await maybeStartRandomGame(client, true);
}

async function awardWinAndReply(message, rewardExp) {
  let nextTotal = Number(rewardExp || 0);
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: message.guild.id, userId: message.author.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  try {
    await addExpWithLevel(message.guild, message.author.id, Number(rewardExp || 0), false);
  } catch {}
  await message.reply({ embeds: [buildWinEmbed(message.author.id, rewardExp, nextTotal)] }).catch(() => {});
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member) {
    await handleExpReward(message.client, member, nextTotal);
  }
  await clearActiveGame(message.client, getConfig(message.client));
}

async function handleMinigameMessage(message, client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  if (message.channelId !== cfg.channelId) return false;
  recordActivity(cfg.channelId, getActivityWindowMs(cfg));
  if (standbyChannels.has(cfg.channelId)) {
    if (canStartByInterval(cfg) && isReadyByActivity(cfg)) {
      const type = await getNextGameType(client, cfg);
      if (type) pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
      standbyChannels.delete(cfg.channelId);
      await maybeStartRandomGame(client, false);
    }
  }

  const game = activeGames.get(cfg.channelId);
  if (!game) return false;

  const content = String(message.content || '').trim();

  if (game.type === 'guessNumber') {
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      activeGames.delete(cfg.channelId);
      await message.react('<a:VC_Events:1448688007438667796>').catch(() => {});
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }

    await message.reply({ embeds: [buildHintEmbed(guess < game.target)] }).catch(() => {});
    return true;
  }

  if (game.type === 'guessWord') {
    if (/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(content) && !/^\d+$/.test(content)) {
      await message.react('<:vegax:1443934876440068179>').catch(() => {});
    } else {
      return false;
    }
    const guess = content.toLowerCase();
    if (guess.length < 5 || guess.length > 6) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  if (game.type === 'guessFlag') {
    const guess = normalizeCountryName(content);
    if (!guess) return false;
    if (game.answers?.includes(guess)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  if (game.type === 'guessPlayer') {
    const guess = normalizePlayerGuess(content);
    if (!guess) return false;
    const tokens = game.answers || [];
    if (guess === game.fullAnswer || tokens.includes(guess) || (game.fullAnswer && game.fullAnswer.includes(guess) && guess.length >= 3)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  if (game.type === 'guessSong') {
    const guess = normalizeSongGuess(content);
    if (!guess) return false;
    const target = normalizeSongGuess(game.title);
    if (guess === target || (target.includes(guess) && guess.length >= 3)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  return false;
}

async function handleMinigameButton(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  const game = activeGames.get(cfg.channelId);
  if (interaction.customId.startsWith('minigame_song_preview:')) {
    if (!game || game.type !== 'guessSong' || interaction.customId !== game.previewCustomId) {
      await interaction.reply({ content: 'Anteprima non disponibile.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
    if (!game.previewUrl) {
      await interaction.editReply({ content: 'Anteprima non disponibile.' }).catch(() => {});
      return true;
    }
    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction.editReply({ content: `Non riesco ad allegare il file, ascoltala qui:\n${game.previewUrl}` }).catch(() => {});
      return true;
    }
    await interaction.editReply({ files: [new AttachmentBuilder(audio, { name: 'anteprima.m4a' })] }).catch(() => {});
    return true;
  }
  if (!game || game.type !== 'findBot') return false;
  if (interaction.customId !== game.customId) return false;

  clearTimeout(game.timeout);
  if (game.hintTimeout) clearTimeout(game.hintTimeout);
  activeGames.delete(cfg.channelId);

  const rewardExp = game.rewardExp;
  let nextTotal = Number(rewardExp || 0);
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  try {
    await addExpWithLevel(interaction.guild, interaction.user.id, Number(rewardExp || 0), false);
  } catch {}

  const winEmbed = buildWinEmbed(interaction.user.id, rewardExp, nextTotal);
  const mainChannel = getChannelSafe(interaction.client, cfg.channelId)
    || await interaction.client.channels.fetch(cfg.channelId).catch(() => null);
  if (mainChannel) {
    await mainChannel.send({ embeds: [winEmbed] }).catch(() => {});
  }
  await interaction.reply({ content: 'Hai vinto!', flags: 1 << 6 }).catch(() => {});
  const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (member) {
    await handleExpReward(interaction.client, member, nextTotal);
  }
  await clearActiveGame(interaction.client, cfg);

  try {
    const channel = interaction.channel;
    const message = await channel.messages.fetch(game.messageId).catch(() => null);
    if (message) {
      await message.delete().catch(() => {});
    }
  } catch {}

  return true;
}

async function restoreActiveGames(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  const channel = getChannelSafe(client, cfg.channelId) || await client.channels.fetch(cfg.channelId).catch(() => null);
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  await loadRotationState(client, cfg);
  const state = await MinigameState.findOne({ guildId, channelId: cfg.channelId }).lean().catch(() => null);
  if (!state) return;
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (state.type === 'guessNumber') {
      await channel.send({ embeds: [buildTimeoutNumberEmbed(Number(state.target))] }).catch(() => {});
    } else if (state.type === 'guessWord') {
      await channel.send({ embeds: [buildTimeoutWordEmbed(String(state.target))] }).catch(() => {});
    } else if (state.type === 'guessFlag') {
      let name = 'la bandiera';
      try {
        const parsed = JSON.parse(state.target || '{}');
        name = parsed?.displayName || name;
      } catch {}
      await channel.send({ embeds: [buildTimeoutFlagEmbed(name)] }).catch(() => {});
    } else if (state.type === 'guessPlayer') {
      let name = 'il calciatore';
      try {
        const parsed = JSON.parse(state.target || '{}');
        name = parsed?.name || name;
      } catch {}
      await channel.send({ embeds: [buildTimeoutPlayerEmbed(name)] }).catch(() => {});
    } else if (state.type === 'guessSong') {
      let title = 'la canzone';
      let artist = '';
      try {
        const parsed = JSON.parse(state.target || '{}');
        title = parsed?.title || title;
        artist = parsed?.artist || '';
      } catch {}
      await channel.send({ embeds: [buildTimeoutSongEmbed(title, artist)] }).catch(() => {});
    } else if (state.type === 'findBot') {
      await channel.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => {});
      const targetChannel = channel.guild.channels.cache.get(state.targetChannelId) || await channel.guild.channels.fetch(state.targetChannelId).catch(() => null);
      if (targetChannel && state.gameMessageId && state.customId) {
        const msg = await targetChannel.messages.fetch(state.gameMessageId).catch(() => null);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(state.customId).setLabel('trova il bot').setStyle(ButtonStyle.Primary).setDisabled(true)
          );
          await msg.edit({ components: [row] }).catch(() => {});
        }
      }
    }
    await MinigameState.deleteOne({ guildId, channelId: cfg.channelId }).catch(() => {});
    return;
  }
  const remainingMs = endsAt - now;
  if (state.type === 'guessNumber') {
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel.send({ embeds: [buildTimeoutNumberEmbed(game.target)] }).catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: 'guessNumber',
      target: Number(state.target),
      min: Number(state.min),
      max: Number(state.max),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null
    });
    return;
  }
  if (state.type === 'guessWord') {
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel.send({ embeds: [buildTimeoutWordEmbed(game.target)] }).catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: 'guessWord',
      target: String(state.target || '').toLowerCase(),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null
    });
    return;
  }
  if (state.type === 'guessFlag') {
    let parsed = null;
    try {
      parsed = JSON.parse(state.target || '{}');
    } catch {
      parsed = null;
    }
    const answers = Array.isArray(parsed?.names) ? parsed.names : [];
    const displayName = parsed?.displayName || 'la bandiera';
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel.send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] }).catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleFlagHint(client, cfg.channelId, remainingMs, displayName);
    activeGames.set(cfg.channelId, {
      type: 'guessFlag',
      answers,
      displayName,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null
    });
    return;
  }
  if (state.type === 'guessPlayer') {
    let parsed = null;
    try {
      parsed = JSON.parse(state.target || '{}');
    } catch {
      parsed = null;
    }
    const name = parsed?.name || 'il calciatore';
    const team = parsed?.team || 'Squadra sconosciuta';
    const nationality = parsed?.nationality || 'Nazionalità sconosciuta';
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel.send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] }).catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleFlagHint(client, cfg.channelId, remainingMs, `${team} • ${nationality}`);
    activeGames.set(cfg.channelId, {
      type: 'guessPlayer',
      answers: extractPlayerTokens(name),
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null
    });
    return;
  }
  if (state.type === 'guessSong') {
    let parsed = null;
    try {
      parsed = JSON.parse(state.target || '{}');
    } catch {
      parsed = null;
    }
    const title = parsed?.title || 'la canzone';
    const artist = parsed?.artist || '';
    const album = parsed?.album || 'Album sconosciuto';
    const artistCountry = parsed?.artistCountry || 'Nazionalità sconosciuta';
    const genre = parsed?.genre || 'Genere sconosciuto';
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel.send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] }).catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleFlagHint(client, cfg.channelId, remainingMs, `${artistCountry} • ${genre}`);
    activeGames.set(cfg.channelId, {
      type: 'guessSong',
      title,
      artist,
      previewUrl: parsed?.previewUrl || null,
      previewCustomId: state.customId || null,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null
    });
    return;
  }
  if (state.type === 'findBot') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(state.customId)
        .setLabel('trova il bot')
        .setStyle(ButtonStyle.Primary)
    );
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game || game.customId !== state.customId) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      if (game.channelId && game.messageId) {
        const ch = channel.guild.channels.cache.get(game.channelId) || await channel.guild.channels.fetch(game.channelId).catch(() => null);
        if (ch) {
          const msg = await ch.messages.fetch(game.messageId).catch(() => null);
          if (msg) {
            const disabledRow = new ActionRowBuilder().addComponents(
              ButtonBuilder.from(row.components[0]).setDisabled(true)
            );
            await msg.edit({ components: [disabledRow] }).catch(() => {});
          }
          await channel.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => {});
        }
      }
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId);
    activeGames.set(cfg.channelId, {
      type: 'findBot',
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId
    });
  }
}

module.exports = { startMinigameLoop, forceStartMinigame, restoreActiveGames, handleMinigameMessage, handleMinigameButton };

