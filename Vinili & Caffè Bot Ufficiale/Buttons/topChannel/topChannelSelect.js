const { TOP_CHANNEL_VIEW_SELECT_PREFIX } = require("../ids/stats");
const { buildTopChannelPayload, normalizeTopView } = require("../../Prefix/Stats/top");

const name = "topChannelSelect";
const label = "Top Channel Select";
const description = "Select menu per cambiare vista della classifica canali (overview, ecc.).";
const order = 4;

function match(interaction) {
  return interaction?.isStringSelectMenu?.() && (interaction.customId === TOP_CHANNEL_VIEW_SELECT_PREFIX || String(interaction.customId || "").startsWith(TOP_CHANNEL_VIEW_SELECT_PREFIX + ":"));
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseTopChannelViewSelectCustomId, normalizeComponentsForDiscord, disableComponentsForLoading } = require("../../Utils/Interaction/buttonParsers");
  const parsedSelect = parseTopChannelViewSelectCustomId(interaction.customId);
  if (!parsedSelect) return false;
  if (await denyIfNotOwner(interaction, parsedSelect.ownerId)) return true;
  try {
    await interaction.deferUpdate();
    await interaction.message.edit({ components: disableComponentsForLoading(interaction.message?.components) }).catch(() => { });
    const selectedValue = normalizeTopView(interaction.values?.[0] || "overview");
    const payload = await buildTopChannelPayload({ guild: interaction.guild }, parsedSelect.lookbackDays, "main", selectedValue, 1, parsedSelect.ownerId || interaction.user?.id);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[TOP CHANNEL SELECT] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute };
