const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "membercount",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    const guild = message.guild;
    if (!guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Solo in server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const totalMembers = guild.memberCount;

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .addFields({
        name: `**<:member_role_icon:1330530086792728618> Members**`,
        value: `${totalMembers}`,
      })
      .setTimestamp();

    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};