const { EmbedBuilder } = require("discord.js");
const DEFAULT_FOOTER_TEXT = "© 2025 Vinili & Caffè. Tutti i diritti riservati.";
const DEFAULT_COLOR = "#6f4e37";

const ERROR_EMBED_COLORS = new Set([
  0xed4245, 0xe74c3c, 0xbe3851, 0xff0000,
]);
const ERROR_TITLE_SUBSTRINGS = [
  "errore", "error", "cooldown", "non hai i permessi", "accesso negato",
  "argomenti mancanti", "comando in esecuzione", "comando scaduto",
];

function hexToInt(hex) {
  if (!hex) return null;
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  return Number.isNaN(value) ? null : value;
}
function hasFooter(embed) {
  return Boolean(embed?.data?.footer || embed?.footer);
}
function getBotIconUrl(guild) {
  const botUser = guild?.client?.user;
  if (botUser && typeof botUser.displayAvatarURL === "function") {
    try {
      return botUser.displayAvatarURL({ size: 64 });
    } catch {}
  }
  return null;
}
function getGlobalBotIconUrl() {
  const botUser = global?.botClient?.user;
  if (botUser && typeof botUser.displayAvatarURL === "function") {
    try {
      return botUser.displayAvatarURL({ size: 64 });
    } catch {}
  }
  return null;
}
function getGuildIconUrl(guild) {
  if (!guild) return null;
  try {
    if (typeof guild.iconURL === "function") {
      return guild.iconURL({ size: 64 });
    }
  } catch {}
  return null;
}
function isErrorEmbedInstance(embed) {
  if (!embed) return false;
  const color = embed.data?.color ?? embed.color;
  if (color != null) {
    const n = typeof color === "number" ? color : Number(color);
    if (ERROR_EMBED_COLORS.has(n)) return true;
  }
  const title = (embed.data?.title ?? embed.title ?? "").toLowerCase();
  if (ERROR_TITLE_SUBSTRINGS.some((s) => title.includes(s))) return true;
  return false;
}

function applyDefaultFooter(embed, guild) {
  if (!embed) return embed;
  if (isErrorEmbedInstance(embed)) return embed;
  const iconURL = getBotIconUrl(guild) || getGuildIconUrl(guild);
  if (typeof embed.setFooter === "function") {
    if (!hasFooter(embed)) {
      embed.setFooter({
        text: DEFAULT_FOOTER_TEXT,
        iconURL: iconURL || undefined,
      });
    } else if (iconURL) {
      const current = embed.data?.footer || embed.footer || {};
      if (!current.icon_url && !current.iconURL) {
        embed.setFooter({ text: current.text || DEFAULT_FOOTER_TEXT, iconURL });
      }
    }
    if (!embed.data?.color && typeof embed.setColor === "function") {
      embed.setColor(DEFAULT_COLOR);
    }
    return embed;
  }
  const colorValue = hexToInt(DEFAULT_COLOR);
  const existingFooter = embed.footer || null;
  let footer = existingFooter || { text: DEFAULT_FOOTER_TEXT };
  if (iconURL && !footer.icon_url && !footer.iconURL) {
    footer = { ...footer, icon_url: iconURL };
  }
  return {
    ...embed,
    footer,
    color: embed.color || colorValue || embed.color,
  };
}
function applyDefaultFooterToEmbeds(payload, guild) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (!Array.isArray(payload.embeds)) return payload;
  return {
    ...payload,
    embeds: payload.embeds.map((embed) => applyDefaultFooter(embed, guild)),
  };
}

function isErrorEmbed(data) {
  if (!data || typeof data !== "object") return false;
  const color = data.color != null ? Number(data.color) : null;
  if (color != null && ERROR_EMBED_COLORS.has(color)) return true;
  const title = (data.title ?? "").toLowerCase();
  if (ERROR_TITLE_SUBSTRINGS.some((s) => title.includes(s))) return true;
  return false;
}

function installEmbedFooterPatch() {
  if (!EmbedBuilder || typeof EmbedBuilder !== "function") return;
  if (EmbedBuilder.prototype.__defaultFooterPatched) return;
  const originalToJSON = EmbedBuilder.prototype.toJSON;
  if (typeof originalToJSON !== "function") return;
  EmbedBuilder.prototype.toJSON = function toJSONWithDefaultFooter(...args) {
    const data = originalToJSON.apply(this, args);
    if (isErrorEmbed(data)) return data;
    const iconURL = getGlobalBotIconUrl();
    if (!data.footer) {
      data.footer = { text: DEFAULT_FOOTER_TEXT };
    }
    if (iconURL && !data.footer.icon_url) {
      data.footer.icon_url = iconURL;
    }
    if (!data.color) {
      const colorValue = hexToInt(DEFAULT_COLOR);
      if (colorValue) data.color = colorValue;
    }
    return data;
  };
  EmbedBuilder.prototype.__defaultFooterPatched = true;
}

module.exports = { applyDefaultFooterToEmbeds, installEmbedFooterPatch };