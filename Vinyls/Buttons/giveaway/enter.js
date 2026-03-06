const { GIVEAWAY_ENTER_PREFIX, enterGiveaway } = require("../../Services/Giveaway/giveawayService");

const name = "giveawayEnter";
const order = 50;

function match(interaction) {
  return interaction?.isButton?.() && String(interaction?.customId || "").startsWith(GIVEAWAY_ENTER_PREFIX);
}

async function execute(interaction, client) {
  return enterGiveaway(interaction, client);
}

module.exports = { name, order, match, execute };