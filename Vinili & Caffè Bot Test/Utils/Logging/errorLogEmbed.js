const { EmbedBuilder } = require("discord.js");

const EMBED_FIELD_VALUE_MAX = 1024;
const ERROR_TEXT_MAX = EMBED_FIELD_VALUE_MAX - 10;

function getFullErrorText(error) {
  const raw = error?.stack || error?.message || String(error);
  return typeof raw === "string" ? raw : String(raw);
}

function buildErrorLogEmbed({
  contextLabel,
  contextValue,
  userTag,
  error,
  title = "Log errori",
}) {
  const fullError = getFullErrorText(error);
  const errorInBlock =
    fullError.length > ERROR_TEXT_MAX
      ? `${fullError.slice(0, ERROR_TEXT_MAX)}...`
      : fullError;

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(title)
    .addFields(
      {
        name: `<:dot:1443660294596329582> ${contextLabel}`,
        value: `\`\`\`${contextValue || "—"}\`\`\``,
      },
      {
        name: "<:dot:1443660294596329582> Utente",
        value: `\`\`\`${userTag || "—"}\`\`\``,
      },
      {
        name: "<:dot:1443660294596329582> Errore",
        value: `\`\`\`${errorInBlock}\`\`\``,
      },
    )
    .setTimestamp();
}

module.exports = { buildErrorLogEmbed, getFullErrorText };
