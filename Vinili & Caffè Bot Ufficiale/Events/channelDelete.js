const { queueCategoryRenumber } = require('../Services/Community/categoryNumberingService');

module.exports = {
    name: 'channelDelete',
    async execute(channel, client) {
        if (!channel?.guildId) return;
        queueCategoryRenumber(client, channel.guildId);
    }
};

