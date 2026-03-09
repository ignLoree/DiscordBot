const { handleSuggestionVote } = require("../Events/interaction/suggestionHandlers");

const SUGGESTION_BUTTON_IDS = new Set(["upv", "downv", "suggestion_staff_accept", "suggestion_staff_reject"]);
const SUGGESTION_MODAL_PREFIX = "suggestion_staff_modal";

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && SUGGESTION_BUTTON_IDS.has(id)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(SUGGESTION_MODAL_PREFIX)) return true;
  return false;
}

async function execute(interaction) {
  return await handleSuggestionVote(interaction);
}

module.exports = { name: "suggestion", order: 50, match, execute };
