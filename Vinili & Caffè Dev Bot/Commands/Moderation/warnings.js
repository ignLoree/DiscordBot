const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Mostra i warn di un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da controllare').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ content: 'Non hai i permessi per usare questo comando.', flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    if (!user) return interaction.editReply({ content: 'Utente non valido.', flags: 1 << 6 });
    const warns = await ModCase.find({
      guildId: interaction.guild.id,
      userId: user.id,
      action: 'WARN'
    }).sort({ caseId: -1 }).limit(10);
    if (!warns.length) {
      return interaction.editReply({ content: 'Nessun warn trovato.', flags: 1 << 6 });
    }
    const lines = warns.map(w => `#${w.caseId} - ${w.reason} (${w.createdAt.toISOString().slice(0, 10)})`);
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setTitle(`Warn di ${user.tag}`)
      .setDescription(lines.join('\n'));
    return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
  }
};
