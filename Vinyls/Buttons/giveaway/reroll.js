const { GIVEAWAY_REROLL_PREFIX, rerollGiveaway } = require("../../Services/Giveaway/giveawayService");

const name = "giveawayReroll";
const order = 51;

function match(interaction) {
  return interaction?.isButton?.() && String(interaction?.customId || "").startsWith(GIVEAWAY_REROLL_PREFIX);
}

async function execute(interaction, client) {
  return rerollGiveaway(interaction, client);
}

module.exports = { name, order, match, execute };