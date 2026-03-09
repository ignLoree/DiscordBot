const { handleCandidatureApplicationInteraction } = require("../Events/interaction/candidatureApplicationHandlers");

const APPLY_PREFIXES = ["apply_helper", "apply_partnermanager", "apply_start", "apply_back", "apply_page", "apply_form", "apply_pex"];

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!id) return false;
  if (APPLY_PREFIXES.some((p) => id === p || id.startsWith(p + ":"))) return true;
  if (id.startsWith("apply_")) return true;
  return false;
}

async function execute(interaction) {
  return await handleCandidatureApplicationInteraction(interaction);
}

module.exports = { name: "candidature", order: 20, match, execute };
