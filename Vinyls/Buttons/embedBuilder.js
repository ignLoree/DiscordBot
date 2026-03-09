const { handleEmbedBuilderInteraction } = require("../Events/interaction/embedBuilderHandlers");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return id.startsWith("eb:") || id.startsWith("ebm:");
}

async function execute(interaction, client) {
  return await handleEmbedBuilderInteraction(interaction, client);
}

module.exports = { name: "embedBuilder", order: 40, match, execute };