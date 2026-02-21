const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getNoDmSet, removeNoDm } = require("../../Utils/noDmList");

module.exports = {
  name: "dm-enable",
  aliases: ["dmenable"],
  allowEmptyArgs: true,
  async execute(message) {
    if (!message.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa il comando in un server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const set = await getNoDmSet(guildId);

    if (!set.has(userId)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "I DM automatici sono già attivi. Usa `+dm-disable` se vuoi bloccarli.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await removeNoDm(guildId, userId);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription("Perfetto! Ora riceverai di nuovo i DM automatici."),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
