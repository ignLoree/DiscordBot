const { handleResocontoActionInteraction } = require("../Events/interaction/resocontoHandlers");

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && (id.startsWith("resoconto_apply:") || id.startsWith("resoconto_reject:"))) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith("resoconto_reason:")) return true;
  return false;
}

async function execute(interaction) {
  return await handleResocontoActionInteraction(interaction);
}

module.exports = { name: "resoconto", order: 70, match, execute };