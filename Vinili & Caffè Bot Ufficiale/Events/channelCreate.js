const { queueCategoryRenumber } = require('../Services/Community/categoryNumberingService');

module.exports = {
    name: 'channelCreate',
    async execute(channel, client) {
        if (!channel?.guildId) return;
        queueCategoryRenumber(client, channel.guildId);
    }
};

