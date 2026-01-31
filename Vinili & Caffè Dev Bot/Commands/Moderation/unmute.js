const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Rimuove il timeout a un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da smutare').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo dell\'unmute').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non hai i permessi per fare questo comando.`).setColor('Red')], flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Timeout rimosso';
    const member = await fetchMemberSafe(interaction.guild, user.id);
    if (!member) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Utente non trovato.`).setColor('Red')], flags: 1 << 6 });
    if (!member.moderatable) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non posso smutare questo utente.`).setColor('Red')], flags: 1 << 6 });
    }
    await member.timeout(null, reason);
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'UNTIMEOUT',
      userId: user.id,
      modId: interaction.user.id,
      reason,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    if (config.dmOnAction) {
      await tryDmUser(user, { embeds: [new EmbedBuilder().setDescription(`Sei stato smutato da **${interaction.guild.name}** per ${reason}.`).setColor('Red')] });
    }
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> _${user.username} è stato smutato._ | ${reason}`);
    return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
  }
};
