const { handleCustomRoleInteraction } = require("../Events/interaction/customRoleHandlers");

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (id.startsWith("customrole_") || id.startsWith("grant_") || id.startsWith("role_grant_")) return true;
  return false;
}

async function execute(interaction) {
  return await handleCustomRoleInteraction(interaction);
}

module.exports = { name: "customRole", order: 65, match, execute };