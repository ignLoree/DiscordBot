const { Events } = require('discord.js');
const IDs = require('../Utils/Config/ids');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {

        const allowedChannels = [
            IDs.channels.inviteLog,
            IDs.channels.mediaExemptChannel,
            IDs.channels.levelUp,
            IDs.channels.chatGeneralA,
            IDs.channels.chatGeneralB,
            IDs.channels.staffOnboarding,
            IDs.channels.staffOnboardingExtra,
            IDs.channels.pauseRequestLog,
            IDs.channels.partnerOnboarding
        ];

        if (!allowedChannels.includes(message.channel.id)) return;
        if (message.author.bot) return;
        
        try {
            if (message.reference) return;
            const mentionId = IDs.users.owner;
            const hasMention = message.content.includes(`<@${mentionId}>`);
            const triggerWords = [
                'lore',
                'lorenzo'
            ];
            const hasExactWord = containsExactWord(message.content, triggerWords);
            if (hasMention || hasExactWord) {
                await message.react('<a:VC_PepeExcited:1331621719093284956>');
                await message.react('<a:VC_PepeToilet:1331623233874690140>');
                await message.react('<:VC_PepeBan:1331623801640718408>');
            }
        } catch (error) {
            global.logger.error(error);
        }
    },
};

function containsExactWord(content, words) {
  const text = content.toLowerCase();
  return words.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
  });
}

