const { queueIdsCatalogSync } = require('../Utils/Config/idsAutoSync');

module.exports = {
  name: 'roleCreate',
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;
    queueIdsCatalogSync(client, guildId, 'roleCreate');
  }
};

