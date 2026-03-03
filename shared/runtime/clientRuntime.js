const { Collection } = require("discord.js");

function initializeCommandCollections(client, { includeSnipes = false } = {}) {
  client.commands = new Collection();
  client.pcommands = new Collection();
  client.aliases = new Collection();
  client.buttons = new Collection();
  if (includeSnipes) client.snipes = new Map();
}

module.exports = { initializeCommandCollections };
