const { Events } = require('discord.js');
const IDs = require('../Utils/Config/ids');
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    const allowedChannels = [
      IDs.channels.inviteLog,
      IDs.channels.chatGeneralA,
      IDs.channels.mediaExemptChannel,
      IDs.channels.levelUp,
      IDs.channels.staffOnboarding,
      IDs.channels.staffOnboardingExtra,
      IDs.channels.pauseRequestLog,
      IDs.channels.partnerOnboarding
    ];
    if (!allowedChannels.includes(message.channel.id)) return;
    if (message.author.bot) return;
    const notteWords = ["notte", "buonanotte", "gn", "notte a tutti", "notte bro", "buonanotte a tutti", "buonanotte bro"];
    if (isExactMessage(message.content, notteWords)) {
      try {
        const hour = new Date().getHours();
        if (!(hour >= 19 || hour < 6)) return;
        const botMsg = await message.reply({
          content: `Buonanotte <@${message.author.id}> <:pepe_wave:1329488693739782274>`
        });
        await message.react('<:gn:1447585730267185274>');
        await message.react('<a:sappytired:1447585729529253900>');
        await message.react('<a:sleep:1447585727071256678>');
        setTimeout(() => botMsg.delete().catch(() => { }), 5000);
      } catch (error) {
        global.logger.error(error);
      }
    }
    const giornoWords = ["giorno", "buongiorno", "bg", "gm", "buongiornissimo", "buongiorno a tutti", "buongiorno bro", "giorno a tutti", "giorno bro"];
    if (isExactMessage(message.content, giornoWords)) {
      try {
        const hour = new Date().getHours();
        if (hour < 6 || hour >= 15) return;
        const botMsg = await message.reply({
          content: `Buongiorno <@${message.author.id}> <:pepe_wave:1329488693739782274>`
        });
        await message.react('<:PepeWideAwake:1329487698179784726>');
        await message.react('<:pepecoffee:1329515322444877886>');
        await message.react('<:pepemorning:1447586412890296391>');
        setTimeout(() => botMsg.delete().catch(() => { }), 5000);
      } catch (error) {
        global.logger.error(error);
      }
    }
    const welcomeWords = [
      "welcome", "wlc", "welcome all", "wlc all",
      "benvenuto", "benvenuta",
      "benvenuti", "benvenute", "benvenuti a tutti"
    ];
    if (isExactMessage(message.content, welcomeWords)) {
      try {
        await message.react('<a:VC_StarBlue:1330194918043418674>');
        await message.react('<a:VC_StarPink:1330194976440848500>');
        await message.react('<a:VC_StarPurple:1330195026688344156>');
      } catch (error) {
        global.logger.error(error);
      }
    }
  },
};
function isExactMessage(content, words) {
  const text = content.trim().toLowerCase();
  return words.includes(text);
}


