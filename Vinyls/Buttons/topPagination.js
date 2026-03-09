const { handleTopPaginationModal } = require("../Events/interaction/topPaginationHandlers");

const TOP_PAGE_MODAL_PREFIX = "top_page_modal";

function match(interaction) {
  if (!interaction?.isModalSubmit?.()) return false;
  const id = String(interaction.customId || "");
  return id === TOP_PAGE_MODAL_PREFIX || id.startsWith(TOP_PAGE_MODAL_PREFIX + ":");
}

async function execute(interaction) {
  return await handleTopPaginationModal(interaction);
}

module.exports = { name: "topPagination", order: 30, match, execute };
