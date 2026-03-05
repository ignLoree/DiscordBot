const { buildTopChannelPayload, resolveRequestedPage, buildTopPageJumpModal } = require("../../Prefix/Stats/top");

const name = "topChannelPage";
const label = "Top Channel Page";
const description = "Paginazione classifica canali e modal salto pagina.";
const order = 8;

function match(interaction) {
  const { parseTopChannelPageCustomId } = require("../../Utils/Interaction/buttonParsers");
  return !!parseTopChannelPageCustomId(interaction?.customId);
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseTopChannelPageCustomId, normalizeComponentsForDiscord } = require("../../Utils/Interaction/buttonParsers");
  const parsed = parseTopChannelPageCustomId(interaction.customId);
  if (!parsed) return false;
  if (await denyIfNotOwner(interaction, parsed.ownerId)) return true;
  try {
    if (parsed.action === "open_modal") {
      const modal = buildTopPageJumpModal(parsed.ownerId || interaction.user?.id, parsed.lookbackDays, parsed.selectedView, parsed.page, parsed.totalPages, parsed.controlsView);
      await interaction.showModal(modal);
      return true;
    }
    await interaction.deferUpdate();
    const requestedPage = resolveRequestedPage(parsed.action, parsed.page, parsed.totalPages);
    const payload = await buildTopChannelPayload({ guild: interaction.guild }, parsed.lookbackDays, parsed.controlsView, parsed.selectedView, requestedPage, parsed.ownerId || interaction.user?.id);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[TOP CHANNEL PAGE BUTTON] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute };
