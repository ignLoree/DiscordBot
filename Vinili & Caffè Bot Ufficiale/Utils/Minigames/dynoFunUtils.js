const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../Moderation/reply");

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
  clamp,
  stripCodeBlock,
};
