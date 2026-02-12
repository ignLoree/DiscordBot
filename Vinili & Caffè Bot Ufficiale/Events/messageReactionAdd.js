const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const communitySchemas = require('../Schemas/Community/communitySchemas');
const SkullboardPost = communitySchemas?.SkullboardPost;
const IDs = require('../Utils/Config/ids');
const renderSkullboardCanvas = require('../Utils/Render/skullboardCanvas');
const { cacheRoleIcon } = require('../Utils/Cache/roleIconCache');

const SKULL_EMOJI = '\u{1F480}';
const SKULLBOARD_CHANNEL_ID = IDs.channels.quotes;
const MAX_CONTENT_LENGTH = 2000;

function normalizeEmojiName(value) {
  return String(value || '').replace(/[\uFE0E\uFE0F]/g, '').trim();
}

function isSkullReaction(reaction) {
  const name = normalizeEmojiName(reaction?.emoji?.name);
  if (name === normalizeEmojiName(SKULL_EMOJI)) return true;
  if (name === '\u2620') return true;
  return false;
}

function clamp(value, max) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function sanitizeUsername(member, author) {
  const fallback = author?.username || 'Unknown';
  const raw = (member?.displayName || fallback).replace(/\n/g, ' ').trim();
  return clamp(raw || fallback, 80);
}

function extractMessageFiles(message) {
  const files = [];
  const attachments = [...(message?.attachments?.values?.() || [])];
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    files.push({
      attachment: attachment.url,
      name: attachment.name || `file-${files.length + 1}`
    });
    if (files.length >= 10) break;
  }
  return files;
}

function extractStickerUrls(message) {
  const stickers = [...(message?.stickers?.values?.() || [])];
  return stickers
    .map((sticker) => sticker?.url || sticker?.imageURL?.() || null)
    .filter(Boolean)
    .slice(0, 3);
}

function buildBaseContent(message) {
  const parts = [];
  const text = String(message?.content || '').trim();
  if (text) parts.push(text);

  const stickerUrls = extractStickerUrls(message);
  if (stickerUrls.length) {
    parts.push(stickerUrls.join('\n'));
  }

  if (!parts.length) {
    if (message?.attachments?.size > 0) {
      const firstAttachment = [...message.attachments.values()][0];
      const attachmentName = firstAttachment?.name || 'file';
      if (firstAttachment?.contentType?.startsWith('image/')) {
        parts.push('[Immagine]');
      } else if (firstAttachment?.contentType?.startsWith('video/')) {
        parts.push('[Video]');
      } else {
        parts.push(`[Allegato: ${attachmentName}]`);
      }
    } else if (message?.embeds?.length > 0) {
      const embed = message.embeds[0];
      if (embed.title || embed.description) {
        const embedText = [embed.title, embed.description]
          .filter(Boolean)
          .join(' - ')
          .slice(0, 100);
        parts.push(`[Embed] ${embedText}`);
      } else {
        parts.push('[Embed]');
      }
    } else {
      parts.push('[Messaggio vuoto]');
    }
  }

  return parts.join('\n').trim();
}

function getNameColor(member) {
  if (!member) return null;
  const color = member.roles?.highest?.color;
  return color ? `#${color.toString(16).padStart(6, '0')}` : null;
}

async function getRoleIcon(member) {
  if (!member?.roles) return null;
  const hoistedRole = member.roles.cache.find((role) => role.hoist && role.iconURL());
  const iconUrl = hoistedRole?.iconURL({ extension: 'png', size: 64 }) || null;
  if (!iconUrl) return null;

  return await cacheRoleIcon(iconUrl);
}

async function prepareReplyData(message) {
  if (!message.reference?.messageId) return null;

  const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  if (!replied) return null;

  const repliedMember = replied.member || await message.guild.members.fetch(replied.author.id).catch(() => null);

  return {
    content: String(replied.content || '').slice(0, 100),
    author: sanitizeUsername(repliedMember, replied.author),
    nameColor: getNameColor(repliedMember),
    avatarUrl: replied.author.displayAvatarURL({ extension: 'png', size: 64 }),
    roleIconUrl: await getRoleIcon(repliedMember)
  };
}

module.exports = {
  name: 'messageReactionAdd',

  async execute(reaction, user) {
    try {
      if (!SkullboardPost) return;
      if (user?.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);

      const message = reaction.message?.partial
        ? await reaction.message.fetch().catch(() => null)
        : reaction.message;

      if (!message || !message.guild) return;
      if (message.channel?.id === SKULLBOARD_CHANNEL_ID) return;
      if (!isSkullReaction(reaction)) return;

      const existing = await SkullboardPost.findOne({
        guildId: message.guild.id,
        messageId: message.id
      }).lean().catch(() => null);
      if (existing?.postMessageId) return;

      const skullboardChannel = message.guild.channels.cache.get(SKULLBOARD_CHANNEL_ID)
        || await message.guild.channels.fetch(SKULLBOARD_CHANNEL_ID).catch(() => null);
      if (!skullboardChannel?.isTextBased?.()) return;

      const author = message.author;
      const member = message.member || await message.guild.members.fetch(author.id).catch(() => null);

      const content = buildBaseContent(message);
      const files = extractMessageFiles(message);
      const replyData = await prepareReplyData(message);
      const cachedRoleIcon = await getRoleIcon(member);

      const firstAttachment = files[0];
      const mediaUrl = firstAttachment?.attachment || null;
      const hasMedia = Boolean(mediaUrl);
      const hasEmbedOnly = !content && message.embeds?.length > 0;

      let canvasBuffer = null;
      try {
        canvasBuffer = await renderSkullboardCanvas({
          avatarUrl: author.displayAvatarURL({ extension: 'png', size: 256 }),
          username: sanitizeUsername(member, author),
          message: content || '[Messaggio vuoto]',
          nameColor: getNameColor(member),
          createdAt: message.createdAt,
          reply: replyData,
          roleIconUrl: cachedRoleIcon,
          mediaUrl,
          hasMedia,
          hasEmbedOnly
        });
      } catch (error) {
        global.logger.error('[SKULLBOARD] Canvas render failed:', error);
        return;
      }

      const imageAttachment = new AttachmentBuilder(canvasBuffer, { name: 'skullboard.png' });

      const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
      const formattedDate = new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(message.createdAt);

      const skullEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ extension: 'png', size: 64 })
        })
        .setDescription(`Aggiungi la reazione ${SKULL_EMOJI} ad un messaggio per pubblicarlo nella SkullBoard`)
        .addFields(
          {
            name: 'Autore',
            value: author.toString(),
            inline: true
          },
          {
            name: 'Canale',
            value: `<#${message.channel.id}>`,
            inline: true
          },
          {
            name: 'Messaggio',
            value: `[Cliccami](${messageLink})`,
            inline: true
          }
        )
        .setImage('attachment://skullboard.png')
        .setFooter({ text: formattedDate })
        .setTimestamp(message.createdAt);

      const payload = {
        embeds: [skullEmbed],
        files: [imageAttachment],
        allowedMentions: { parse: [] }
      };

      if (message.reference?.messageId) {
        const mirroredReply = await SkullboardPost.findOne({
          guildId: message.guild.id,
          messageId: message.reference.messageId
        }).lean().catch(() => null);

        if (mirroredReply?.postMessageId) {
          const mirroredMsg = await skullboardChannel.messages.fetch(mirroredReply.postMessageId).catch(() => null);
          if (mirroredMsg) {
            payload.reply = { messageReference: mirroredMsg.id, failIfNotExists: false };
          }
        }
      }

      const postMessage = await skullboardChannel.send(payload).catch(() => null);
      if (!postMessage) return;

      await postMessage.react(SKULL_EMOJI).catch(() => {});

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
          .setEmoji(SKULL_EMOJI)
          .setURL(postMessage.url)
      );

      await message.channel.send({ embeds: [confirmEmbed], components: [row] }).catch(() => {});
    } catch (err) {
      global.logger.error('[SKULLBOARD] Error:', err);
    }
  }
};
