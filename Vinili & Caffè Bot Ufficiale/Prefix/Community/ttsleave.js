const { safeMessageReply } = require('../../Utils/Moderation/message');
const { leaveTtsGuild } = require('../../Services/TTS/ttsService');

module.exports = {
    name: 'leave',
    async execute(message) {
        await message.channel.sendTyping();
        const result = await leaveTtsGuild(message.guild.id);

        if (!result.ok && result.reason === "not_connected") {
            return safeMessageReply(message, "<:vegax:1443934876440068179> Il bot non è connesso a nessun canale vocale.");
        }
        return safeMessageReply(message, "<:vegacheckmark:1443666279058772028> TTS disattivato.");
    }
};


