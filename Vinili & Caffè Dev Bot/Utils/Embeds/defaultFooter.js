const { EmbedBuilder } = require("discord.js");
const DEFAULT_FOOTER_TEXT = "© 2025 Vinili & Caffè. Tutti i diritti riservati.";
const DEFAULT_COLOR = "#6f4e37";

function hexToInt(hex) {
  if (!hex) return null;
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  return Number.isNaN(value) ? null : value;
}
function hasFooter(embed) {
  return Boolean(embed?.data?.footer || embed?.footer);
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
function applyDefaultFooter(embed, guild) {
  if (!embed) return embed;
  const iconURL = getGuildIconUrl(guild);
  if (typeof embed.setFooter === "function") {
    if (!hasFooter(embed)) {
      embed.setFooter({ text: DEFAULT_FOOTER_TEXT, iconURL: iconURL || undefined });
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
    color: embed.color || colorValue || embed.color
  };
}
function applyDefaultFooterToEmbeds(payload, guild) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (!Array.isArray(payload.embeds)) return payload;
  return {
    ...payload,
    embeds: payload.embeds.map(embed => applyDefaultFooter(embed, guild))
  };
}

function installEmbedFooterPatch() {
  if (EmbedBuilder.prototype.__defaultFooterPatched) return;
  const originalToJSON = EmbedBuilder.prototype.toJSON;
  EmbedBuilder.prototype.toJSON = function toJSONWithDefaultFooter(...args) {
    const data = originalToJSON.apply(this, args);
    if (!data.footer) {
      data.footer = { text: DEFAULT_FOOTER_TEXT };
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
