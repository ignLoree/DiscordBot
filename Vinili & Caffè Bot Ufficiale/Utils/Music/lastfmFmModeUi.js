const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("./lastfm");

function normalizeMode(value) {
  return value === "compact" ? "compact" : "default";
}

function buildFmModePayload(currentMode) {
  const normalized = normalizeMode(currentMode);
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      "Configura lo stile del comando .fm.\n\n" +
      `Modalita' attuale: **${normalized}**`
    );
  const select = new StringSelectMenuBuilder()
    .setCustomId("lfm_fmmode_select")
    .setPlaceholder("Select fm mode")
    .addOptions(
      { label: "Default", value: "default", description: "Stile classico", default: normalized === "default" },
      { label: "Compact", value: "compact", description: "Versione compatta", default: normalized === "compact" }
    );
  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row] };
}

module.exports = { buildFmModePayload };
