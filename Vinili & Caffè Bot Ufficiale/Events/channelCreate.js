const { queueCategoryRenumber } = require('../Services/Community/communityOpsService');
const { queueIdsCatalogSync } = require('../Utils/Config/idsAutoSync');

module.exports = {
    name: 'channelCreate',
    async execute(channel, client) {
        if (!channel?.guildId) return;
        queueCategoryRenumber(client, channel.guildId);
        queueIdsCatalogSync(client, channel.guildId, 'channelCreate');
    }
};


