const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');
const { formatDuration } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('Mostra i casi di moderazione')
    .addSubcommand(s => s
      .setName('user')
      .setDescription('Lista casi per utente')
      .addUserOption(o => o.setName('utente').setDescription('Utente').setRequired(true)))
    .addSubcommand(s => s
      .setName('case')
      .setDescription('Dettaglio di un case')
      .addIntegerOption(o => o.setName('id').setDescription('ID case').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ content: 'Non hai i permessi per usare questo comando.', flags: 1 << 6 });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'user') {
      const user = interaction.options.getUser('utente');
      const cases = await ModCase.find({
        guildId: interaction.guild.id,
        userId: user.id
      }).sort({ caseId: -1 }).limit(10);
      if (!cases.length) {
        return interaction.editReply({ content: 'Nessun case trovato.', flags: 1 << 6 });
      }
      const lines = cases.map(c => {
        const status = c.active ? '' : ' (chiuso)';
        return `#${c.caseId} - ${c.action}${status} - ${c.reason}`;
      });
      const embed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle(`Casi di ${user.tag}`)
        .setDescription(lines.join('\n'));
      return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
    }
    const id = interaction.options.getInteger('id');
    const c = await ModCase.findOne({ guildId: interaction.guild.id, caseId: id });
    if (!c) return interaction.editReply({ content: 'Case non trovato.', flags: 1 << 6 });
    const isUserId = /^\d{17,20}$/.test(String(c.userId));
    const userLabel = isUserId ? `<@${c.userId}>` : String(c.userId);
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setTitle(`Case #${c.caseId}`)
      .addFields(
        { name: 'Azione', value: c.action, inline: true },
        { name: 'Utente', value: userLabel, inline: true },
        { name: 'Moderatore', value: `<@${c.modId}>`, inline: true },
        { name: 'Motivo', value: c.reason || 'Nessun motivo fornito' }
      )
      .setTimestamp(c.createdAt);
    if (c.durationMs) {
      embed.addFields({ name: 'Durata', value: formatDuration(c.durationMs), inline: true });
    }
    if (c.context?.channelId) {
      embed.addFields({ name: 'Canale', value: `<#${c.context.channelId}>`, inline: true });
    }
    return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
  }
};
