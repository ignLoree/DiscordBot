const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const renderSkullboardCanvas = require('../Utils/Render/skullboardCanvas');
const SkullboardPost = require('../Schemas/Community/skullboardPostSchema');

const SKULL_EMOJI = '💀';
const SKULLBOARD_CHANNEL_ID = '1468540884537573479';

module.exports = {
  name: Events.MessageReactionAdd,

  async execute(reaction, user, client) {
    try {
      if (user?.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);
      const message = reaction.message?.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
      if (!message || !message.guild) return;
      if (message.channel?.id === SKULLBOARD_CHANNEL_ID) return;

      const emojiName = reaction.emoji?.name;
      if (emojiName !== SKULL_EMOJI) return;
      if ((reaction.count || 0) < 1) return;

      const existing = await SkullboardPost.findOne({ guildId: message.guild.id, messageId: message.id }).lean().catch(() => null);
      if (existing?.postMessageId) return;

      const author = message.author;
      const avatarUrl = author.displayAvatarURL({ extension: 'png', size: 256 });
      const member = message.member || await message.guild.members.fetch(author.id).catch(() => null);
      const nameColor = member?.displayHexColor && member.displayHexColor !== '#000000'
        ? member.displayHexColor
        : '#f2f3f5';
      let roleIconUrl = null;
      if (member?.roles?.cache?.size) {
        const sortedRoles = [...member.roles.cache.values()]
          .filter(r => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position);
        for (const role of sortedRoles) {
          const icon = role?.iconURL?.({ size: 32, extension: 'png' }) || null;
          if (icon) {
            roleIconUrl = icon;
            break;
          }
        }
      }
      const text = message.content || (message.embeds?.[0]?.description || '');
      let reply = null;
      if (message.reference?.messageId) {
        const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (replied) {
          reply = {
            author: replied.member?.displayName || replied.author?.username || 'Unknown',
            content: replied.content || (replied.embeds?.[0]?.description || '')
          };
        }
      }

      const screenshot = await renderSkullboardCanvas({
        avatarUrl,
        username: member?.displayName || author.username,
        message: text || '[Messaggio vuoto]',
        nameColor,
        createdAt: message.createdAt,
        reply,
        roleIconUrl
      });
      const attachment = new AttachmentBuilder(screenshot, { name: 'skullboard.png' });

      const postEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({ name: author.username, iconURL: author.displayAvatarURL({ size: 64 }) })
        .setDescription('Aggiungi la reazione 💀 ad un messaggio per pubblicarlo nella SkullBoard')
        .addFields(
          { name: 'Autore', value: `${author}`, inline: true },
          { name: 'Canale', value: `${message.channel}`, inline: true },
          { name: 'Messaggio', value: `[Cliccami](${message.url})`, inline: true }
        )
        .setImage('attachment://skullboard.png')
        .setFooter({ text: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) });

      const skullboardChannel = message.guild.channels.cache.get(SKULLBOARD_CHANNEL_ID)
        || await message.guild.channels.fetch(SKULLBOARD_CHANNEL_ID).catch(() => null);
      if (!skullboardChannel?.isTextBased?.()) return;

      const postMessage = await skullboardChannel.send({ embeds: [postEmbed], files: [attachment] }).catch(() => null);
      if (!postMessage) return;
      await postMessage.react('💀').catch(() => {});

      await SkullboardPost.findOneAndUpdate(
        { guildId: message.guild.id, messageId: message.id },
        { $set: { postMessageId: postMessage.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const confirmEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`Il messaggio è stato pubblicato nella <#${SKULLBOARD_CHANNEL_ID}>.`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Vai al Post')
          .setEmoji('💀')
          .setURL(postMessage.url)
      );
      await message.channel.send({ embeds: [confirmEmbed], components: [row] }).catch(() => {});
    } catch (err) {
      global.logger.error('[SKULLBOARD] Error:', err);
    }
  }
};
