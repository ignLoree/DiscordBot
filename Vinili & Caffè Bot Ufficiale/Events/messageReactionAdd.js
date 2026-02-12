const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const communitySchemas = require('../Schemas/Community/communitySchemas');
const SkullboardPost = communitySchemas?.SkullboardPost;
const IDs = require('../Utils/Config/ids');

const SKULL_EMOJI = '\u{1F480}';
const SKULLBOARD_CHANNEL_ID = IDs.channels.quotes;
const WEBHOOK_NAME = 'Skullboard Mirror';
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

  if (!parts.length && !(message?.attachments?.size > 0)) {
    parts.push('[Messaggio vuoto]');
  }

  return parts.join('\n').trim();
}

async function getOrCreateWebhook(channel, clientUser) {
  const hooks = await channel.fetchWebhooks().catch(() => null);
  if (hooks) {
    const existing = hooks.find((hook) => hook.owner?.id === clientUser.id && hook.token);
    if (existing) return existing;
  }

  return channel.createWebhook({
    name: WEBHOOK_NAME,
    avatar: clientUser.displayAvatarURL({ extension: 'png', size: 256 })
  }).catch(() => null);
}

function prependReplyQuote(content, repliedMessage, repliedMember) {
  const authorName = repliedMember?.displayName || repliedMessage?.author?.username || 'Unknown';
  const mention = repliedMessage?.author?.id ? `<@${repliedMessage.author.id}>` : `@${authorName}`;
  const quoted = String(repliedMessage?.content || '').trim() || '[Messaggio senza testo]';
  const quoteLine = `> ${mention}: ${clamp(quoted, 160)}`;
  if (!content) return quoteLine;
  return `${quoteLine}\n${content}`;
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

      const webhook = await getOrCreateWebhook(skullboardChannel, message.client.user);
      if (!webhook) return;

      const author = message.author;
      const member = message.member || await message.guild.members.fetch(author.id).catch(() => null);

      let content = buildBaseContent(message);
      const files = extractMessageFiles(message);

      const payload = {
        username: sanitizeUsername(member, author),
        avatarURL: author.displayAvatarURL({ extension: 'png', size: 256 }),
        content: '',
        files,
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

        if (!payload.reply) {
          const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (replied) {
            const repliedMember = replied.member || await message.guild.members.fetch(replied.author.id).catch(() => null);
            content = prependReplyQuote(content, replied, repliedMember);
          }
        }
      }

      payload.content = clamp(content || '[Messaggio vuoto]', MAX_CONTENT_LENGTH);

      const postMessage = await webhook.send({ ...payload, wait: true }).catch(() => null);
      if (!postMessage) return;

      await postMessage.react(SKULL_EMOJI).catch(() => {});

      await SkullboardPost.findOneAndUpdate(
        { guildId: message.guild.id, messageId: message.id },
        { $set: { postMessageId: postMessage.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const confirmEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`Il messaggio e stato pubblicato nella <#${SKULLBOARD_CHANNEL_ID}>.`);

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
