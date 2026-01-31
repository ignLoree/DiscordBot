const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banna un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da bannare').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del ban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.editReply({ embeds:[new EmbedBuilder().setDescription(`Non hai i permessi per fare questo comando.`).setColor('Red')], flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo fornito';
    const member = await fetchMemberSafe(interaction.guild, user.id);
    if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ embeds:[new EmbedBuilder().setDescription(`Non puoi bannare un utente con il tuo stesso ruolo o superiore.`).setColor('Red')], flags: 1 << 6 });
    }
    if (member && !member.bannable) {
      return interaction.editReply({ embeds:[new EmbedBuilder().setDescription(`Non posso bannare questo utente.`).setColor('Red')], flags: 1 << 6 });
    }
    const config = await getModConfig(interaction.guild.id);
    if (config.dmOnAction) {
      await tryDmUser(user, { embeds:[new EmbedBuilder().setDescription(`Sei stato bannato da **${interaction.guild.name}** | ${reason}.`).setColor('Red')] });
    }
    if (member) {
      await member.ban({ reason });
    } else {
      await interaction.guild.members.ban(user.id, { reason });
    }
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'BAN',
      userId: user.id,
      modId: interaction.user.id,
      reason,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> _${user.username} è stato bannato._ | ${reason}`);
    return interaction.editReply({ embeds: [embed]});
  }
};
