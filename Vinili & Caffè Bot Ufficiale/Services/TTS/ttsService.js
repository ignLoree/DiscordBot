const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const VoiceState = require("../../Schemas/Voice/voiceStateSchema");
const IDs = require("../../Utils/Config/ids");
const ttsStates = new Map();
const guildLocks = new Map();
const lastSavedChannels = new Map();
let emojiNameMap = null;
let nodeEmoji = null;
const userLangs = new Map();
try {
  emojiNameMap = require("emoji-name-map");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] emoji-name-map non disponibile:",
    error?.message || error,
  );
}
try {
  nodeEmoji = require("node-emoji");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] node-emoji non disponibile:",
    error?.message || error,
  );
}

function shouldHandleMessage(message, config, prefix) {
  if (!config?.tts?.enabled) return false;
  if (!message?.channel) return false;
  const rawContent = String(message.content ?? "");
  if (prefix && rawContent.startsWith(prefix)) return false;
  if (rawContent.startsWith("-")) return false;
  const isVoiceChannel =
    message.channel.isVoiceBased?.() && !message.channel.isThread?.();
  const isVoiceChannelThread =
    message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.();
  const extraTextIds = [IDs.channels.noMic]
    .filter(Boolean)
    .map((id) => String(id));
  const channelIdStr = String(message.channel?.id ?? "");
  const parentIdStr = message.channel?.parentId
    ? String(message.channel.parentId)
    : "";
  const isExtraText = extraTextIds.some(
    (id) => id === channelIdStr || id === parentIdStr,
  );
  return isVoiceChannel || isVoiceChannelThread || isExtraText;
}

function sanitizeText(text) {
  if (!text) return "";
  let cleaned = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/gi, "")
    .replace(/\bdiscord\.gg\/\S+/gi, "")
    .replace(
      /\b[a-z0-9-]+\s*(?:\[\s*(?:dot|punto)\s*\]|\(\s*(?:dot|punto)\s*\)|\{\s*(?:dot|punto)\s*\}|dot|punto)\s*[a-z]{2,}(?:\/\S*)?/gi,
      "",
    )
    .replace(/\b[a-z]{2,}:\/\/\S+/gi, "")
    .replace(
      /\b\S+\.(?:com|net|org|gg|it|io|co|dev|app|me|xyz|ly|to|ai|tv|uk|de|fr|es|ru|jp|br|us|ca|au)\b\S*/gi,
      "",
    )
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .trim();
  const maxEmojis = 4;
  let emojiCount = 0;
  cleaned = cleaned.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, (_, name) => {
    emojiCount += 1;
    return emojiCount <= maxEmojis ? ` emoji ${name} ` : " ";
  });
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, (m) => {
    emojiCount += 1;
    if (emojiCount > maxEmojis) return " ";
    const name = getUnicodeEmojiName(m);
    return name ? ` emoji ${name} ` : " emoji ";
  });
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}
function setUserTtsLang(userId, lang) {
  if (!userId) return;
  if (!lang) {
    userLangs.delete(userId);
    return;
  }
  userLangs.set(userId, lang);
}
function getUserTtsLang(userId) {
  return userLangs.get(userId) || null;
}
function getUnicodeEmojiName(emoji) {
  if (emojiNameMap && emojiNameMap[emoji]) {
    return emojiNameMap[emoji].replace(/_/g, " ");
  }
  if (nodeEmoji?.find) {
    const found = nodeEmoji.find(emoji);
    if (found?.key) return found.key.replace(/_/g, " ");
  }
  return null;
}

function buildGoogleTtsUrl(
  text,
  lang,
  baseHost = "https://translate.google.com",
) {
  const q = encodeURIComponent(String(text || "").slice(0, 200));
  const tl = encodeURIComponent(String(lang || "it"));
  return `${baseHost}/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`;
}

const TTS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
  Referer: "https://translate.google.com/",
};

function looksLikeMpegAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function readTtsErrorPreview(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return "";
  return buffer.subarray(0, 240).toString("utf8").replace(/\s+/g, " ").trim();
}

async function fetchTtsAudio(url, provider = "TTS") {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: TTS_HEADERS,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  const data = Buffer.isBuffer(res?.data)
    ? res.data
    : Buffer.from(res?.data || []);
  if (data.length === 0) {
    return null;
  }
  const contentType = String(
    res?.headers?.["content-type"] || "",
  ).toLowerCase();
  const isTextLike =
    contentType.includes("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml");
  const isAudio = contentType.includes("audio/") || looksLikeMpegAudio(data);
  if (!isAudio || isTextLike) {
    const preview = readTtsErrorPreview(data);
    throw new Error(
      `${provider}: risposta non audio${preview ? ` (${preview.slice(0, 160)})` : ""}`,
    );
  }
  return data;
}

const LANG_TO_VOICERSS = {
  it: "it-it",
  en: "en-gb",
  es: "es-es",
  fr: "fr-fr",
  de: "de-de",
  pt: "pt-pt",
  ru: "ru-ru",
  pl: "pl-pl",
  nl: "nl-nl",
  tr: "tr-tr",
  ja: "ja-jp",
  zh: "zh-cn",
};

async function createTtsStream(text, lang) {
  const textStr = String(text || "")
    .slice(0, 300)
    .trim();
  if (!textStr) throw new Error("TTS: testo vuoto");
  const rawLang = String(lang || "it").trim();
  const langLocale = rawLang.replace("_", "-");
  const langBase = langLocale.split("-")[0].toLowerCase();
  const googleLangCandidates = Array.from(
    new Set([langLocale, langBase].filter(Boolean)),
  );
  const gttsLangCandidates = Array.from(
    new Set([langBase, langLocale.toLowerCase()].filter(Boolean)),
  );
  let lastErr = null;

  for (const gttsLang of gttsLangCandidates) {
    try {
      const gtts = require("node-gtts")(gttsLang);
      const chunks = [];
      await new Promise((resolve, reject) => {
        const s = gtts.stream(textStr);
        s.on("data", (ch) => chunks.push(ch));
        s.on("end", resolve);
        s.on("error", reject);
      });
      if (chunks.length > 0) {
        return Readable.from(Buffer.concat(chunks));
      }
    } catch (err) {
      lastErr = err;
    }
  }

  const hosts = [
    "https://translate.google.com.vn",
    "https://translate.google.com",
  ];
  for (const baseHost of hosts) {
    for (const googleLang of googleLangCandidates) {
      try {
        const url = buildGoogleTtsUrl(textStr, googleLang, baseHost);
        const data = await fetchTtsAudio(
          url,
          `GoogleTTS:${baseHost}:${googleLang}`,
        );
        if (data) return Readable.from(Buffer.from(data));
      } catch (err) {
        lastErr = err;
      }
    }
  }

  try {
    const googleTTS = require("google-tts-api");
    for (const host of [
      "https://translate.google.com.vn",
      "https://translate.google.com",
    ]) {
      for (const googleLang of googleLangCandidates) {
        try {
          const url = googleTTS.getAudioUrl(textStr, {
            lang: googleLang,
            slow: false,
            host,
          });
          if (url) {
            const data = await fetchTtsAudio(
              url,
              `google-tts-api:${host}:${googleLang}`,
            );
            if (data) return Readable.from(Buffer.from(data));
          }
        } catch (err) {
          lastErr = err;
        }
      }
    }
  } catch (err) {
    lastErr = err;
  }

  const voicerssKey =
    typeof process !== "undefined" &&
    process.env &&
    process.env.TTS_VOICERSS_KEY;
  if (voicerssKey && textStr.length <= 1000) {
    try {
      const hl = LANG_TO_VOICERSS[langBase] || "it-it";
      const url = `https://api.voicerss.org/?key=${encodeURIComponent(voicerssKey)}&hl=${hl}&src=${encodeURIComponent(textStr)}&c=MP3`;
      const data = await fetchTtsAudio(url, "VoiceRSS");
      if (data) return Readable.from(Buffer.from(data));
    } catch (err) {
      lastErr = err;
    }
  }
  throw (
    lastErr || new Error("TTS: nessuna sorgente disponibile (Google/VoiceRSS).")
  );
}

async function createTtsBuffer(text, lang) {
  const stream = await createTtsStream(text, lang);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getState(voiceChannel) {
  const key = voiceChannel.id;
  let state = ttsStates.get(key);
  if (!state) {
    const player = createAudioPlayer();
    state = {
      player,
      queue: [],
      connection: null,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      playing: false,
      currentTtsFile: null,
    };
    player.on(AudioPlayerStatus.Idle, () => {
      if (state.currentTtsFile) {
        try {
          fs.unlinkSync(state.currentTtsFile);
        } catch (_) {}
        state.currentTtsFile = null;
      }
      state.playing = false;
      playNext(state);
    });
    player.on("error", (err) => {
      global.logger.error("[TTS PLAYER ERROR]", err);
      state.playing = false;
      playNext(state);
    });
    ttsStates.set(key, state);
  }
  return state;
}
function getLockedChannelId(guildId) {
  if (guildId == null) return null;
  return guildLocks.get(String(guildId)) || null;
}
function setLockedChannel(guildId, channelId) {
  if (guildId != null && channelId != null)
    guildLocks.set(String(guildId), String(channelId));
}
function clearLockedChannel(guildId, channelId) {
  if (guildId == null) return;
  const locked = guildLocks.get(String(guildId));
  if (locked && String(locked) === String(channelId)) {
    guildLocks.delete(String(guildId));
  }
}
async function ensureConnection(state, voiceChannel) {
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return null;
  }
  if (state.connection?.joinConfig?.channelId === voiceChannel.id) {
    return state.connection;
  }
  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {}
  }
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  state.connection = connection;
  state.guildId = voiceChannel.guild.id;
  state.channelId = voiceChannel.id;
  connection.subscribe(state.player);
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
  await saveVoiceState(voiceChannel.guild.id, voiceChannel.id);
  return connection;
}
async function playNext(state) {
  if (state.queue.length === 0) {
    state.playing = false;
    return;
  }
  const item = state.queue.shift();
  state.playing = true;
  const tmpPath = path.resolve(
    os.tmpdir(),
    `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  state.currentTtsFile = tmpPath;
  try {
    const connection = await ensureConnection(state, item.voiceChannel);
    if (!connection) {
      state.playing = false;
      if (state.currentTtsFile)
        try {
          fs.unlinkSync(state.currentTtsFile);
        } catch (_) {}
      state.currentTtsFile = null;
      playNext(state);
      return;
    }
    const buffer = await createTtsBuffer(item.text, item.lang);
    if (!buffer || buffer.length === 0) throw new Error("TTS buffer vuoto");
    fs.writeFileSync(tmpPath, buffer);
    const resource = createAudioResource(tmpPath);
    state.player.play(resource);
  } catch (err) {
    global.logger.error("[TTS PLAY ERROR]", err?.message || err);
    if (state.currentTtsFile)
      try {
        fs.unlinkSync(state.currentTtsFile);
      } catch (_) {}
    state.currentTtsFile = null;
    state.playing = false;
    playNext(state);
  }
}
function enqueue(state, item) {
  state.queue.push(item);
  if (!state.playing) {
    playNext(state);
  }
}
async function handleTtsMessage(message, client, prefix) {
  const config = client?.config;
  if (!shouldHandleMessage(message, config, prefix)) return;
  if (!message.member && message.guild?.members?.fetch) {
    try {
      message.member =
        (await message.guild.members
          .fetch(message.author?.id)
          .catch(() => null)) || message.member;
    } catch (_) {}
  }
  let voiceChannel = null;
  if (message.channel.isVoiceBased?.() && !message.channel.isThread?.()) {
    voiceChannel = message.channel;
  } else if (
    message.channel.isThread?.() &&
    message.channel.parent?.isVoiceBased?.()
  ) {
    voiceChannel = message.channel.parent;
  } else {
    voiceChannel = message.member?.voice?.channel;
  }
  if (!voiceChannel) {
    const warn = await message.reply(
      "<:vegax:1443934876440068179> Devi essere in un canale vocale per usare il TTS.",
    );
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }
  if (!voiceChannel.joinable) return;
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return;
  }
  const autojoin = config?.tts?.autojoin !== false;
  if (!autojoin && !lockedChannelId) {
    return;
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch(
    () => null,
  );
  if (!connection) return;
  const maxChars = config?.tts?.maxChars || 200;
  const includeUsername = config?.tts?.includeUsername !== false;
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  const baseText = sanitizeText(
    typeof rawMessageText === "string"
      ? rawMessageText
      : String(rawMessageText),
  );
  if (!baseText || !baseText.trim()) return;
  const name =
    message.member?.displayName ||
    message.member?.user?.username ||
    message.author?.username ||
    "Utente";
  const text = includeUsername ? `${name}: ${baseText}` : baseText;
  const clipped = text.slice(0, maxChars);
  enqueue(state, { voiceChannel, text: clipped, lang });
}
async function joinTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel);
  if (!connection) return { ok: false, reason: "locked" };
  return { ok: true };
}
function findLockedChannelIdByGuild(guildId) {
  if (guildId == null) return null;
  const gid = String(guildId);
  for (const [channelId, state] of ttsStates.entries()) {
    if (state?.guildId && String(state.guildId) === gid && state.connection) {
      return channelId;
    }
  }
  return null;
}

async function leaveTtsGuild(guildId, client) {
  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) {
    lockedChannelId = findLockedChannelIdByGuild(guildId);
    if (lockedChannelId) setLockedChannel(guildId, lockedChannelId);
  }
  if (!lockedChannelId && client) {
    const guild =
      client.guilds?.cache?.get(guildId) ||
      (await client.guilds?.fetch(guildId).catch(() => null));
    if (guild) {
      const me =
        guild.members?.me ??
        (await guild.members?.fetch(client.user?.id).catch(() => null));
      const channelId = me?.voice?.channelId;
      if (channelId) {
        try {
          const channel =
            client.channels?.cache?.get(channelId) ||
            (await client.channels?.fetch(channelId).catch(() => null));
          if (channel?.isVoiceBased?.()) {
            const conn = joinVoiceChannel({
              channelId: channel.id,
              guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: false,
            });
            conn.destroy();
          }
        } catch (_) {}
      }
    }
    await clearVoiceState(guildId);
    return { ok: true };
  }
  if (!lockedChannelId) return { ok: false, reason: "not_connected" };
  const state = ttsStates.get(lockedChannelId);
  if (state) {
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      try {
        fs.unlinkSync(state.currentTtsFile);
      } catch (_) {}
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch {}
    if (state.connection) {
      try {
        state.connection.destroy();
      } catch {}
      state.connection = null;
    }
    clearLockedChannel(guildId, lockedChannelId);
    ttsStates.delete(lockedChannelId);
  } else {
    clearLockedChannel(guildId, lockedChannelId);
  }
  await clearVoiceState(guildId);
  return { ok: true };
}

async function saveVoiceState(guildId, channelId) {
  if (!guildId || !channelId) return;
  if (lastSavedChannels.get(guildId) === channelId) return;
  lastSavedChannels.set(guildId, channelId);
  try {
    await VoiceState.findOneAndUpdate(
      { guildId },
      { $set: { guildId, channelId, updatedAt: new Date() } },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save voice state", error);
  }
}

async function clearVoiceState(guildId) {
  if (!guildId) return;
  lastSavedChannels.delete(guildId);
  try {
    await VoiceState.deleteOne({ guildId });
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to clear voice state", error);
  }
}

async function restoreTtsConnections(client) {
  try {
    const states = await VoiceState.find({});
    for (const entry of states) {
      const channel = await client.channels
        .fetch(entry.channelId)
        .catch(() => null);
      if (!channel || !channel.isVoiceBased?.()) continue;
      await joinTtsChannel(channel);
    }
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to restore voice connections", error);
  }
}

module.exports = {
  handleTtsMessage,
  joinTtsChannel,
  leaveTtsGuild,
  setUserTtsLang,
  getUserTtsLang,
  restoreTtsConnections,
};
