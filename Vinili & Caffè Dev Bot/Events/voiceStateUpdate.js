const { leaveTtsGuild } = require('../Services/TTS/ttsService');
const { handleVoiceStateUpdate } = require('../Services/Stats/statsService');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            await handleVoiceStateUpdate(oldState, newState);
        } catch (error) {
            if (client?.logs?.error) {
                client.logs.error('[STATS VOICE ERROR]', error);
            } else {
                console.error('[STATS VOICE ERROR]', error);
            }
        }
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
