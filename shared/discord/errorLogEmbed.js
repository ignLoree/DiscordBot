const { EmbedBuilder } = require("discord.js");
const EMBED_FIELD_VALUE_MAX = 1024;
const EMBED_FIELD_NAME_MAX = 256;
const ERROR_TEXT_MAX = EMBED_FIELD_VALUE_MAX - 10;

function getFullErrorText(error) {
  const raw = error?.stack || error?.message || String(error);
  return typeof raw === "string" ? raw : String(raw);
}

function truncateFieldValue(value, max = EMBED_FIELD_VALUE_MAX) {
  const str = typeof value === "string" ? value : String(value ?? "");
  if (str.length <= max) return str;
  return `${str.slice(0, max - 3)}...`;
}

function buildErrorLogEmbed({ contextLabel, contextValue, userTag, error, title = "<a:VC_Alert:1448670089670037675> Log errori", serverName = null, }) {
  const fullError = getFullErrorText(error);
  const errorInBlock = fullError.length > ERROR_TEXT_MAX ? `${fullError.slice(0, ERROR_TEXT_MAX)}...` : fullError;
  const safeContext = truncateFieldValue(contextValue || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeUserTag = truncateFieldValue(userTag || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeLabel = truncateFieldValue(contextLabel || "Contesto", EMBED_FIELD_NAME_MAX - 30);
  const safeTitle = truncateFieldValue(title || "<a:VC_Alert:1448670089670037675> Log errori", EMBED_FIELD_NAME_MAX);
  const safeServer = truncateFieldValue(serverName || "—", EMBED_FIELD_VALUE_MAX - 6);

  return new EmbedBuilder().setColor("#6f4e37").setTitle(safeTitle).addFields({ name: `<:VC_Poll:1448695754972729436> ${safeLabel}`, value: `\`\`\`${safeContext}\`\`\`` }, { name: "<a:VC_Channel:1448670215444631706> Server", value: `\`\`\`${safeServer}\`\`\`` }, { name: "<:member_role_icon:1330530086792728618> Utente", value: `\`\`\`${safeUserTag}\`\`\`` }, { name: "<a:VC_Alert:1448670089670037675> Errore", value: `\`\`\`${errorInBlock}\`\`\`` }).setTimestamp();
}

module.exports = { buildErrorLogEmbed, getFullErrorText, truncateFieldValue };