const { leaveTtsGuild } = require('../Services/TTS/ttsService');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        if (client?.config2?.tts?.stayConnected) return;
        const guild = newState.guild || oldState.guild;
        if (!guild) return;
        if (oldState.id === client.user.id && oldState.channelId && !newState.channelId) {
            await leaveTtsGuild(guild.id);
            return;
        }
        const botMember = guild.members.me || guild.members.cache.get(client.user.id);
        const botChannel = botMember?.voice?.channel;
        if (!botChannel) return;
        const humans = botChannel.members.filter(m => !m.user.bot);
        if (humans.size === 0) {
            await leaveTtsGuild(guild.id);
        }
    }
};
