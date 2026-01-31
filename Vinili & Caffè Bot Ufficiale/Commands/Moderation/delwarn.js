const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('delwarn')
    .setDescription('Rimuove un warn (case id)')
    .addIntegerOption(o => o.setName('case').setDescription('ID del case').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo rimozione').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription('Non hai i permessi per fare questo comando.').setColor('Red')], flags: 1 << 6 });
    }
    const caseId = interaction.options.getInteger('case');
    const reason = interaction.options.getString('motivo') || 'Rimosso dal moderatore';
    const warnCase = await ModCase.findOne({
      guildId: interaction.guild.id,
      caseId,
      action: 'WARN'
    });
    if (!warnCase) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription('<:VC_Info:1460670816214585481> Non ci sono warn.').setColor('Red')], flags: 1 << 6 });
    }
    warnCase.active = false;
    await warnCase.save();
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'UNWARN',
      userId: warnCase.userId,
      modId: interaction.user.id,
      reason: `Rimosso warn #${caseId}: ${reason}`,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> È stato rimosso il warn "${warnCase.reason || 'Nessun motivo fornito'}" per ${user.username}.`);
    return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
  }
};
