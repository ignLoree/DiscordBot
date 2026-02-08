const { safeReply, safeEditReply } = require('../../Utils/Moderation/reply');
const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Modera il nome dell\'utente')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Questo comando puÃ² essere usato solo in un server.')
        ],
        flags: 1 << 6
      });
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});

    try {
      const targetUser = interaction.targetUser;
      const member = await fetchMemberSafe(interaction.guild, targetUser?.id);
      if (!member) {
        return safeEditReply(interaction, { content: 'Utente non trovato.', flags: 1 << 6 });
      }

      const tagline = Math.floor(Math.random() * 1000) + 1;
      await member.setNickname(`Moderated Nickname ${tagline}`);

      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`<:discordstaff:1443651872258003005> Nickname di ${targetUser.username} cambiato in Moderated Nickname ${tagline}`);

      return safeEditReply(interaction, { embeds: [embed], flags: 1 << 6 });
    } catch (error) {
      global.logger.error(error);
      return safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription("<:vegax:1443934876440068179> Non sono riuscito a modificare il nickname dell'utente.")
        ],
        flags: 1 << 6
      });
    }
  }
};
