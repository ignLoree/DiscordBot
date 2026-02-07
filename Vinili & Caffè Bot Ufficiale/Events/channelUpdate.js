const { queueCategoryRenumber } = require('../Services/Community/categoryNumberingService');

module.exports = {
    name: 'channelUpdate',
    async execute(oldChannel, newChannel, client) {
        const guildId = newChannel?.guildId || oldChannel?.guildId;
        if (!guildId) return;

        // Renumber when a category is moved/renamed or when a channel changes parent.
        const parentChanged = oldChannel?.parentId !== newChannel?.parentId;
        const positionChanged = oldChannel?.rawPosition !== newChannel?.rawPosition;
        const nameChanged = oldChannel?.name !== newChannel?.name;
        if (!parentChanged && !positionChanged && !nameChanged) return;

        queueCategoryRenumber(client, guildId);
    }
};

