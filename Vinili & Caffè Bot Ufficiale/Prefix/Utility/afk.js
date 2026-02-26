const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { EmbedBuilder } = require("discord.js");
const AFK = require("../../Schemas/Afk/afkSchema");

module.exports = {
  name: "afk",
  allowEmptyArgs: true,
  async execute(message, args) {
    await message.channel.sendTyping();
    const afkMessage = args.join(" ");
    const userId = message.author.id;
    const guildId = message.guild?.id;

    if (!args || !args.length)
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Perfavore scrivi un messaggio per impostare il tuo stato AFK.",
      );
    if (!guildId) return;

    if (afkMessage.includes("@everyone") || afkMessage.includes("@here"))
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non puoi usare @everyone o @here nel messaggio.",
      );

    try {
      const member = await message.guild.members
        .fetch(userId)
        .catch(() => null);
      if (!member)
        return safeMessageReply(
          message,
          "<:vegax:1443934876440068179> Errore: non posso trovare il tuo profilo.",
        );
      const originalName = member.nickname || message.author.username;
      await AFK.findOneAndUpdate(
        { guildId, userId },
        {
          guildId,
          userId,
          message: afkMessage,
          timestamp: Date.now(),
          originalName,
        },
        { upsert: true },
      );
      if (!originalName.startsWith("[AFK]")) {
        await member.setNickname(`[AFK] ${originalName}`).catch(() => {});
      }
      safeMessageReply(
        message,
        `<@${userId}> Ho impostato il tuo stato AFK: __**${afkMessage}**__`,
      );
    } catch (error) {
      global.logger.error(error);
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
            )
            .setColor("Red"),
        ],
      });
    }
  },
};