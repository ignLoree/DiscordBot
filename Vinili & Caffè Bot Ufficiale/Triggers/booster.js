const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {

        const allowedChannels = [
            '1442569130573303898',
            '1442569136067575809',
            '1442569138114662490',
            '1442569187376763010',
            '1444295396619976817',
            '1442569260059725844',
            '1442569268666568897',
            '1442569285909217301',
            '1442569209849843823'
        ];

        if (!allowedChannels.includes(message.channel.id)) return;
        if (message.author.bot) return;
        
        try {
            if (message.reference) return;
            const mentionId = '295500038401163264';
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