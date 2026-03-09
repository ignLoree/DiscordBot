const { handlePauseButton } = require("../Events/interaction/pauseHandlers");

const PREFIXES = ["pause_accept:", "pause_reject:", "pause_cancel:", "pause_list:"];

function match(interaction) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return PREFIXES.some((p) => id.startsWith(p));
}

async function execute(interaction) {
  return await handlePauseButton(interaction);
}

module.exports = { name: "pause", order: 60, match, execute };
