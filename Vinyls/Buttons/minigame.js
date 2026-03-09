const { handleMinigameButton } = require("../Services/Minigames/minigameService");

async function execute(interaction, client) {
  return await handleMinigameButton(interaction, client);
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  return id.startsWith("minigame_") || id.startsWith("mg_");
}

module.exports = { name: "minigame", order: 80, match, execute };
