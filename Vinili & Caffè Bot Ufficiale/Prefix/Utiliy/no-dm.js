const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getNoDmSet, addNoDm, removeNoDm } = require('../../Utils/noDmList');

module.exports = {
  name: 'no-dm',
  aliases: ['nodm'],

  async execute(message) {
    if (!message.guild) {
      await safeMessageReply(message, {
        content: '<:vegax:1443934876440068179> Usa il comando in un server.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const set = await getNoDmSet(message.guild.id);
    if (set.has(message.author.id)) {
      await removeNoDm(message.guild.id, message.author.id);
      await safeMessageReply(message, {
        content: 'Ok! Ora **riceverai** nuovamente i DM broadcast.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await addNoDm(message.guild.id, message.author.id);
    await safeMessageReply(message, {
      content: 'Ok! **Non riceverai più** i DM broadcast. Puoi riattivarli rifacendo `+no-dm`.',
      allowedMentions: { repliedUser: false }
    });
  }
};
