const { EmbedBuilder } = require('discord.js');
const { resolveTarget } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');

module.exports = {
  name: 'purge',
  
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user } = await resolveTarget(message, args, 1);
    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const deleted = await message.channel.bulkDelete(toDelete, true).catch(() => null);
    const config = await getModConfig(message.guild.id);

    const deleteLater = (msg) => setTimeout(() => msg.delete().catch(() => { }), 5000);
    const replyTemp = async (payload) => {
      const msg = await message.channel.send({ ...payload, allowedMentions: { repliedUser: false } });
      deleteLater(msg);
      return msg;
    };
    setTimeout(() => message.delete().catch(() => { }), 5000);

    const amount = Number(args?.[0]);
    if (!amount || amount < 1 || amount > 100) {
      await replyTemp({ content: '<:vegax:1443934876440068179> Quantità non valida (1-100).' });
      return;
    }

    if (amount == 1) {
      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('<:vegax:1443934876440068179> Wrong Use!')
        .setDescription('If you want to purge one message, please do it manually.');
      await replyTemp({ embeds: [embed] });
      return;
    }

    let toDelete = user
      ? fetched.filter(m => m.author.id === user.id).first(amount)
      : fetched.first(amount);

    if (!toDelete || (Array.isArray(toDelete) && toDelete.length === 0)) {
      await replyTemp({ content: '<:vegax:1443934876440068179> Nessun messaggio da eliminare.' });
      return;
    }

    if (!Array.isArray(toDelete)) toDelete = [toDelete];

    if (!deleted) {
      await replyTemp({ content: '<:vegax:1443934876440068179> Impossibile eliminare i messaggi (forse troppo vecchi).' });
      return;
    }

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'PURGE',
      userId: user ? user.id : `CHANNEL:${message.channel.id}`,
      modId: message.author.id,
      reason: user
        ? `Purge ${deleted.size} messaggi di ${user.tag}`
        : `Purge ${deleted.size} messaggi in #${message.channel.name}`,
      context: { channelId: message.channel.id }
    });
    await logModCase({ client, guild: message.guild, modCase: doc, config });
    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(
        `<a:VC_Channel:1448670215444631706> Canale: <#${message.channel.id}>\n` +
        `<a:VC_Staff:1448670376736456787> Staffer: <@${message.author.id}>\n` +
        `<:VC_Chat:1448694742237053061> Messaggi Recuperati: ${fetched.size}\n` +
        `<:VC_Stats:1448695844923510884> Richiesta di eliminazione: ${amount}\n` +
        `<:VC_Search:1460657088899584265> Messaggi Identificati: ${toDelete.length}\n` +
        `<:VC_Trash:1460645075242451025> Messaggi Cancellati: ${deleted.size}`
      );
    await replyTemp({ embeds: [embed] });
    return;
  }
};
