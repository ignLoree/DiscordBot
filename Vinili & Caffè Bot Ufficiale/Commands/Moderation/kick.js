const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicka un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da kickare').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del kick').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non hai i permessi per fare questo comando.`).setColor('Red')], flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo fornito';
    const member = await fetchMemberSafe(interaction.guild, user.id);
    if (!member) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Utente non trovato.`).setColor('Red')], flags: 1 << 6 });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ embeds:[new EmbedBuilder().setDescription(`Non puoi kickare un utente con il tuo stesso ruolo o superiore.`).setColor('Red')], flags: 1 << 6 });
    }
    if (!member.kickable) {
      return interaction.editReply({ embeds:[new EmbedBuilder().setDescription(`Non posso kickare questo utente.`).setColor('Red')], flags: 1 << 6 });
    }
    const config = await getModConfig(interaction.guild.id);
    if (config.dmOnAction) {
      await tryDmUser(user, { embeds:[new EmbedBuilder().setDescription(`Sei stato kickato da **${interaction.guild.name}** | ${reason}.`).setColor('Red')] });
    }
    await member.kick(reason);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'KICK',
      userId: user.id,
      modId: interaction.user.id,
      reason,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> _${user.username} è stato kickato._ | ${reason}`);
    return interaction.editReply({ embeds: [embed] });
  }
};
