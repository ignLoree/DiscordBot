const { EmbedBuilder } = require("discord.js");

const EMBED_FIELD_VALUE_MAX = 1024;
const EMBED_FIELD_NAME_MAX = 256;
const ERROR_TEXT_MAX = EMBED_FIELD_VALUE_MAX - 10;

function getFullErrorText(error) {
  const raw = error?.stack || error?.message || String(error);
  return typeof raw === "string" ? raw : String(raw);
}

function truncateFieldValue(str, max = EMBED_FIELD_VALUE_MAX) {
  const s = typeof str === "string" ? str : String(str ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

function buildErrorLogEmbed({
  contextLabel,
  contextValue,
  userTag,
  error,
  title = "Log errori",
  serverName = null,
}) {
  const fullError = getFullErrorText(error);
  const errorInBlock =
    fullError.length > ERROR_TEXT_MAX
      ? `${fullError.slice(0, ERROR_TEXT_MAX)}...`
      : fullError;
  const safeContext = truncateFieldValue(contextValue || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeUserTag = truncateFieldValue(userTag || "—", EMBED_FIELD_VALUE_MAX - 6);
  const safeLabel = truncateFieldValue(contextLabel ?? "", EMBED_FIELD_NAME_MAX - 30);
  const safeTitle = truncateFieldValue(title ?? "Log errori", EMBED_FIELD_NAME_MAX);
  const safeServer = truncateFieldValue(serverName || "—", EMBED_FIELD_VALUE_MAX - 6);

  const fields = [
    {
      name: `<:dot:1443660294596329582> ${safeLabel}`,
      value: `\`\`\`${safeContext}\`\`\``,
    },
    {
      name: "<:dot:1443660294596329582> Server",
      value: `\`\`\`${safeServer}\`\`\``,
    },
    {
      name: "<:dot:1443660294596329582> Utente",
      value: `\`\`\`${safeUserTag}\`\`\``,
    },
    {
      name: "<:dot:1443660294596329582> Errore",
      value: `\`\`\`${errorInBlock}\`\`\``,
    },
  ];
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(safeTitle)
    .addFields(fields)
    .setTimestamp();
}

module.exports = { buildErrorLogEmbed, getFullErrorText, truncateFieldValue };