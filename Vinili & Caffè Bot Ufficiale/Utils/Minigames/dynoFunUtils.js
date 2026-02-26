const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../Moderation/reply");

const TRANSLATE_CACHE = new Map();

function buildEmbed(color, description, title = null) {
  const embed = new EmbedBuilder().setColor(color).setDescription(description);
  if (title) embed.setTitle(title);
  return embed;
}

async function replyError(message, text) {
  return safeMessageReply(message, {
    embeds: [buildEmbed("Red", `<:vegax:1443934876440068179> ${text}`)],
    allowedMentions: { repliedUser: false },
  });
}

async function replyInfo(message, text, title = null) {
  return safeMessageReply(message, {
    embeds: [buildEmbed("#6f4e37", text, title)],
    allowedMentions: { repliedUser: false },
  });
}

async function fetchJson(url, options = {}) {
  const response = await axios.get(url, {
    timeout: 15000,
    responseType: "json",
    ...options,
  });
  return response.data;
}

async function fetchText(url, options = {}) {
  const response = await axios.get(url, {
    timeout: 15000,
    responseType: "text",
    ...options,
  });
  return String(response.data || "");
}

async function translateToItalian(text, options = {}) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const maxLength = Number(options?.maxLength || 1400);
  const source = raw.slice(0, Math.max(1, maxLength));
  const cacheKey = source.toLowerCase();
  const cached = TRANSLATE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at <= 12 * 60 * 60 * 1000) {
    return cached.value;
  }

  try {
    const response = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        timeout: 7000,
        responseType: "json",
        params: {
          client: "gtx",
          sl: "auto",
          tl: "it",
          dt: "t",
          q: source,
        },
      },
    );

    const chunks = Array.isArray(response?.data?.[0]) ? response.data[0] : [];
    const translated = chunks
      .map((chunk) => String(chunk?.[0] || ""))
      .join("")
      .trim();

    const value = translated || source;
    TRANSLATE_CACHE.set(cacheKey, { value, at: Date.now() });
    if (TRANSLATE_CACHE.size > 600) {
      const keys = Array.from(TRANSLATE_CACHE.keys()).slice(0, 200);
      for (const key of keys) TRANSLATE_CACHE.delete(key);
    }
    return value;
  } catch {
    return source;
  }
}

function clamp(text, max = 1900) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 3))}...`;
}

function stripCodeBlock(value) {
  return String(value || "").replace(/```/g, "``\\`");
}

module.exports = {
  replyError,
  replyInfo,
  fetchJson,
  fetchText,
  translateToItalian,
  clamp,
  stripCodeBlock,
};