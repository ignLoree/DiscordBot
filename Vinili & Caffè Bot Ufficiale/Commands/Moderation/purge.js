const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipDeploy: false,
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Elimina un numero di messaggi')
    .addIntegerOption(o => o.setName('quantità').setDescription('Numero di messaggi').setRequired(true))
    .addUserOption(o => o.setName('utente').setDescription('Filtra per utente').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 1 << 6 });
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.editReply({ embeds: [ new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.')], flags: 1 << 6 });
    }
    const amount = interaction.options.getInteger('quantità');
    const targetUser = interaction.options.getUser('utente');
    if (!amount || amount < 2 || amount > 1000) {
      return interaction.editReply({ embeds: [ new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Quantità non valida. (Massimo 1000 messaggi)')], flags: 1 << 6 });
    }
    if (amount === 1) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('<:vegax:1443934876440068179> Wronge Use!')
        .setDescription('If you want to purge one message, please do it manually.');
      return interaction.editReply({ embeds: [embed], flags: 1 << 6 });
    }
    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = targetUser
      ? fetched.filter(m => m.author.id === targetUser.id).first(amount)
      : fetched.first(amount);
    if (!toDelete || (Array.isArray(toDelete) && toDelete.length === 0)) {
      return interaction.editReply({ embeds: [ new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Nessun messaggio da cancellare')] });
    }
    if (!Array.isArray(toDelete)) toDelete = [toDelete];
    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    if (!deleted) {
      return interaction.editReply({ embeds: [ new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Impossibile eliminare i messaggi. (Troppo vecchi)')] });
    }
    const config = await getModConfig(interaction.guild.id);
    const { doc } = await createModCase({
      guildId: interaction.guild.id,
      action: 'PURGE',
      userId: targetUser ? targetUser.id : `CANALE:${interaction.channel.id}`,
      modId: interaction.user.id,
      reason: targetUser
        ? `Cancellati ${deleted.size} messaggi di ${targetUser.tag}`
        : `Cancellati ${deleted.size} messaggi in #${interaction.channel.name}`,
      context: { channelId: interaction.channel.id }
    });
    await logModCase({ client, guild: interaction.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(
        `<a:VC_Channel:1448670215444631706> Canale: <#${interaction.channel.id}>\n` +
        `<a:VC_Staff:1448670376736456787> Staffer: <@${interaction.user.id}>\n` +
        `<:VC_Chat:1448694742237053061> Messaggi Recuperati: ${fetched.size}\n` +
        `<:VC_Stats:1448695844923510884> Richiesta di eliminazione: ${amount}\n` +
        `<:VC_Search:1460657088899584265> Messaggi Identificati: ${toDelete.length}\n` +
        `<:VC_Trash:1460645075242451025> Messaggi Cancellati: ${deleted.size}`
      );
    const reply = await interaction.editReply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }
};
