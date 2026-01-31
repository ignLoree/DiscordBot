const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');
const { getModConfig, createModCase, logModCase, parseDuration, formatDuration, tryDmUser } = require('../../Utils/Moderation/moderation');
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Metti in timeout un utente')
    .addUserOption(o => o.setName('utente').setDescription('Utente da mutare').setRequired(true))
    .addStringOption(o => o.setName('durata').setDescription('Durata del mute. Es: 10m, 2h, 1d').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del mute').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non hai i permessi per fare questo comando.`).setColor('Red')], flags: 1 << 6 });
    }
    const user = interaction.options.getUser('utente');
    const durationRaw = interaction.options.getString('durata');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo fornito';
    const durationMs = parseDuration(durationRaw);
    if (!durationMs) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Durata non valida. Usa formato tipo 1s, 3m, 5h, 7d`).setColor('Red')], flags: 1 << 6 });
    }
    if (durationMs > MAX_TIMEOUT_MS) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Durata massimo 28d.`).setColor('Red')], flags: 1 << 6 });
    }
    const member = await fetchMemberSafe(interaction.guild, user.id);
    if (!member) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Utente non trovato.`).setColor('Red')], flags: 1 << 6 });
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non puoi mutare un utente con il tuo stesso ruolo o superiore.`).setColor('Red')], flags: 1 << 6 });
    }
    if (!member.moderatable) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`Non posso mutare questo utente.`).setColor('Red')], flags: 1 << 6 });
    }
    await member.timeout(durationMs, reason);
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'TIMEOUT',
      userId: user.id,
      modId: interaction.user.id,
      reason,
      durationMs,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    if (config.dmOnAction) {
      await tryDmUser(user, { embeds: [new EmbedBuilder().setDescription(`Sei stato warnato da **${interaction.guild.name}** per ${reason}.`).setColor('Red')] });
    }
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<a:VC_Verified:1448687631109197978> _${user.username} è stato mutato._ | ${reason}`);
    return interaction.editReply({ embeds: [embed] });
  }
};
