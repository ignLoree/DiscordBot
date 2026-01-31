const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("./lastfm");

function buildResponseModePayload(currentMode) {
  const normalized = currentMode === "image" ? "image" : "embed";
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      "Configuring your default **WhoKnows** and **Top list** mode\n\n" +
      "You can also override this when using a command:\n" +
      "• `image` / `img`\n" +
      "• `embed`"
    );
  const select = new StringSelectMenuBuilder()
    .setCustomId("lfm_responsemode_select")
    .setPlaceholder("Select response mode")
    .addOptions(
      {
        label: "Embed",
        value: "embed",
        default: normalized === "embed"
      },
      {
        label: "Image",
        value: "image",
        default: normalized === "image"
      }
    );
  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row] };
}

module.exports = { buildResponseModePayload };
