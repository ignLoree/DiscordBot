const { queueCategoryRenumber } = require('../Services/Community/communityOpsService');

module.exports = {
    name: 'channelCreate',
    async execute(channel, client) {
        if (!channel?.guildId) return;
        queueCategoryRenumber(client, channel.guildId);
    }
};


