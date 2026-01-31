const { spawnArtIfPossible } = require('../Services/Art/artSpawnService');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    try {
      const config = client?.config2?.artRift;
      if (!config?.enabled) return;
      if (!message?.guild || message.author?.bot || message.system || message.webhookId) return;
      if (String(message.channelId) !== String(config.channelId)) return;

      if (!client._artRiftCounts) client._artRiftCounts = new Map();
      const current = client._artRiftCounts.get(message.channelId) || 0;
      const next = current + 1;
      if (next < (config.spawnEveryMessages || 25)) {
        client._artRiftCounts.set(message.channelId, next);
        return;
      }

      client._artRiftCounts.set(message.channelId, 0);
      await spawnArtIfPossible(message.channel, client, { reason: 'auto' });
    } catch (err) {
      if (client?.logs?.error) {
        client.logs.error('[ART SPAWN]', err);
      } else {
        global.logger.error('[ART SPAWN]', err);
      }
    }
  }
};
