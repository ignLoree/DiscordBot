const { AttachmentBuilder, ChannelType } = require('discord.js');

function cleanName(value, fallback) {
  const text = String(value || '').replace(/\r?\n/g, ' ').trim();
  return text || fallback;
}

function line(name, id) {
  return `${name} -> ${id}`;
}

function byName(a, b) {
  return cleanName(a?.name, '').localeCompare(cleanName(b?.name, ''), 'it');
}

module.exports = {
  name: 'idlist',
  aliases: ['idslist', 'idsdump'],
  description: 'Esporta ID di categorie, canali, ruoli, emoji e bot del server.',

  async execute(message) {
    if (!message?.guild) return;
    await message.channel.sendTyping().catch(() => {});

    const guild = message.guild;
    await guild.members.fetch().catch(() => {});

    const categories = guild.channels.cache
      .filter((ch) => ch.type === ChannelType.GuildCategory)
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    const channels = guild.channels.cache
      .filter((ch) => ch.type !== ChannelType.GuildCategory)
      .sort((a, b) => byName(a, b));

    const roles = guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position);

    const emojis = guild.emojis.cache.sort((a, b) => byName(a, b));

    const bots = guild.members.cache
      .filter((m) => m.user?.bot)
      .sort((a, b) => byName(a.user, b.user));

    const out = [];
    out.push(`# ID LIST - ${cleanName(guild.name, 'Server')}`);
    out.push(`# Generated at: ${new Date().toISOString()}`);
    out.push('');

    out.push('[CATEGORIE]');
    if (categories.size === 0) out.push('Nessuna categoria.');
    for (const category of categories.values()) {
      out.push(line(cleanName(category.name, 'categoria_senza_nome'), category.id));
    }
    out.push('');

    out.push('[CANALI]');
    if (channels.size === 0) out.push('Nessun canale.');
    for (const channel of channels.values()) {
      out.push(line(cleanName(channel.name, 'canale_senza_nome'), channel.id));
    }
    out.push('');

    out.push('[RUOLI]');
    if (roles.size === 0) out.push('Nessun ruolo.');
    for (const role of roles.values()) {
      out.push(line(cleanName(role.name, 'ruolo_senza_nome'), role.id));
    }
    out.push('');

    out.push('[EMOJI]');
    if (emojis.size === 0) out.push('Nessuna emoji.');
    for (const emoji of emojis.values()) {
      out.push(line(cleanName(emoji.name, 'emoji_senza_nome'), emoji.id));
    }
    out.push('');

    out.push('[BOTS]');
    if (bots.size === 0) out.push('Nessun bot.');
    for (const bot of bots.values()) {
      const botName = cleanName(bot.user?.username, 'bot_senza_nome');
      out.push(line(botName, bot.id));
    }
    out.push('');

    const fileName = `id-list-${guild.id}.txt`;
    const attachment = new AttachmentBuilder(Buffer.from(out.join('\n'), 'utf8'), { name: fileName });

    await message.reply({
      content: 'Ecco la lista completa degli ID.',
      files: [attachment],
      allowedMentions: { repliedUser: false }
    }).catch(() => {});
  }
};

