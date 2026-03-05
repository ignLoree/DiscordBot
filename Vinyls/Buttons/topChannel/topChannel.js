const { TOP_CHANNEL_PERIOD_OPEN_PREFIX, TOP_CHANNEL_PERIOD_BACK_PREFIX, TOP_CHANNEL_PERIOD_SET_PREFIX } = require("../ids/stats");
const { buildTopChannelPayload } = require("../../Prefix/Stats/top");

const name = "topChannel";
const label = "Top Channel";
const description = "Controlli periodo e vista della classifica canali (apri/indietro/imposta).";
const order = 7;

function match(interaction) {
  const { parseTopChannelCustomId } = require("../../Utils/Interaction/buttonParsers");
  return !!parseTopChannelCustomId(interaction?.customId);
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseTopChannelCustomId, normalizeComponentsForDiscord } = require("../../Utils/Interaction/buttonParsers");
  const parsed = parseTopChannelCustomId(interaction.customId);
  if (!parsed) return false;
  if (await denyIfNotOwner(interaction, parsed.ownerId)) return true;
  try {
    await interaction.deferUpdate();
    if (parsed.prefix === TOP_CHANNEL_PERIOD_OPEN_PREFIX) {
      const payload = await buildTopChannelPayload({ guild: interaction.guild }, parsed.lookbackDays, "period", parsed.selectedView, parsed.page, parsed.ownerId || interaction.user?.id);
      await interaction.message.edit({ components: normalizeComponentsForDiscord(payload?.components) });
      return true;
    }
    if (parsed.prefix === TOP_CHANNEL_PERIOD_BACK_PREFIX) {
      const payload = await buildTopChannelPayload({ guild: interaction.guild }, parsed.lookbackDays, "main", parsed.selectedView, parsed.page, parsed.ownerId || interaction.user?.id);
      await interaction.message.edit({ components: normalizeComponentsForDiscord(payload?.components) });
      return true;
    }
    const controlsView = parsed.prefix === TOP_CHANNEL_PERIOD_SET_PREFIX ? "period" : "main";
    const payload = await buildTopChannelPayload({ guild: interaction.guild }, parsed.lookbackDays, controlsView, parsed.selectedView, parsed.page, parsed.ownerId || interaction.user?.id);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[TOP CHANNEL BUTTON] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute };
