const { Events } = require('discord.js');
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.channel.id !== '1442569130573303898' &&
            message.channel.id !== '1442569136067575809' &&
            message.channel.id !== '1442569138114662490' &&
            message.channel.id !== '1442569187376763010' &&
            message.channel.id !== '1444295396619976817' &&
            message.channel.id !== '1442569260059725844' &&
            message.channel.id !== '1442569268666568897' &&
            message.channel.id !== '1442569285909217301' &&
            message.channel.id !== '1442569209849843823')
            return;
        if (message.author.bot) return;
        try {
            if (message.reference) return;
        } catch (error) {
            global.logger.error(error);
        }
    },
};
