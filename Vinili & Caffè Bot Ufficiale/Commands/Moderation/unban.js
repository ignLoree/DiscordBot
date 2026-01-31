const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Rimuove un ban')
    .addStringOption(o => o.setName('id').setDescription('ID utente bannato').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.editReply({ content: 'Non hai i permessi per usare questo comando.', flags: 1 << 6 });
    }
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('motivo') || 'Ban rimosso';
    try {
      await interaction.guild.members.unban(userId, reason);
    } catch {
      return interaction.editReply({ content: 'Utente non bannato o ID non valido.', flags: 1 << 6 });
    }
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'UNBAN',
      userId,
      modId: interaction.user.id,
      reason,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`Ban rimosso per \`${userId}\`. Case #${doc.caseId}`);
    return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
  }
};
