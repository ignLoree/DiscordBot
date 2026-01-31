const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Assegna un warn a un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da warnare').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del warn').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non hai i permessi per fare questo comando.`).setColor('Red')], flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo fornito';
    if (!user) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Utente non trovato.`).setColor('Red')], flags: 1 << 6 });
    if (user.id === interaction.user.id) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non puoi warnare te stesso.`).setColor('Red')], flags: 1 << 6 });
    }
    const member = await fetchMemberSafe(interaction.guild, user.id);
    if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non puoi warnare un utente con il tuo stesso ruolo o superiore.`).setColor('Red')] });
    }
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'WARN',
      userId: user.id,
      modId: interaction.user.id,
      reason,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    if (config.dmOnAction) {
      await tryDmUser(user, { embeds:[new EmbedBuilder().setDescription(`Sei stato warnato da **${interaction.guild.name}** per ${reason}.`).setColor('Red')] });
    }
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> _${user.username} è stato warnato._ || ${reason}`);
    return interaction.editReply({ embeds: [embed] });
  }
};
