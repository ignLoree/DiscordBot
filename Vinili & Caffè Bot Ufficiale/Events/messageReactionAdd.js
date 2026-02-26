const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
const communitySchemas = require("../Schemas/Community/communitySchemas");
const SkullboardPost = communitySchemas?.SkullboardPost;
const IDs = require("../Utils/Config/ids");
const renderSkullboardCanvas = require("../Utils/Render/skullboardCanvas");
const { cacheRoleIcon } = require("../Utils/Cache/roleIconCache");
const SKULL_EMOJI = "\u{1F480}";
const SKULLBOARD_CHANNEL_ID = IDs.channels.quotes;
const SKULL_SOURCE_WHITELIST_CHANNEL_IDS = new Set([
  "1442569130573303898",
  "1442569136067575809",
  "1442569138114662490",
  "1442569141717438495",
]);
const MAX_REPLY_CONTENT_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 80;

function normalizeEmojiName(value) {
  return String(value || "")
    .replace(/[\uFE0E\uFE0F]/g, "")
    .trim();
}

function isSkullReaction(reaction) {
  const name = normalizeEmojiName(reaction?.emoji?.name);
  return name === normalizeEmojiName(SKULL_EMOJI) || name === "\u2620";
}

function clamp(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function sanitizeUsername(member, author) {
  const fallback = author?.username || "Sconosciuto";
  const raw = (member?.displayName || fallback).replace(/\n/g, " ").trim();
  return clamp(raw || fallback, MAX_DISPLAY_NAME_LENGTH);
}

function extractMessageFiles(message) {
  const files = [];
  const attachments = [...(message?.attachments?.values?.() || [])];
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    files.push({
      attachment: attachment.url,
      name: attachment.name || `file-${files.length + 1}`,
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
  const text = String(message?.content || "").trim();
  if (text) parts.push(text);

  const stickerUrls = extractStickerUrls(message);
  if (stickerUrls.length) {
    parts.push(stickerUrls.join("\n"));
  }

  if (parts.length) return parts.join("\n").trim();

  if (message?.attachments?.size > 0) {
    const firstAttachment = [...message.attachments.values()][0];
    const attachmentName = firstAttachment?.name || "file";
    if (firstAttachment?.contentType?.startsWith("image/")) return "[Immagine]";
    if (firstAttachment?.contentType?.startsWith("video/")) return "[Video]";
    return `[Allegato: ${attachmentName}]`;
  }

  if (message?.embeds?.length > 0) {
    const embed = message.embeds[0];
    if (embed.title || embed.description) {
      const embedText = [embed.title, embed.description]
        .filter(Boolean)
        .join(" - ")
        .slice(0, 100);
      return `[Embed] ${embedText}`;
    }
    return "[Embed]";
  }

  return "[Messaggio vuoto]";
}

function getNameColor(member) {
  if (!member) return null;
  const color = member.roles?.highest?.color;
  return color ? `#${color.toString(16).padStart(6, "0")}` : null;
}

async function getRoleIcon(member) {
  if (!member?.roles) return null;
  const hoistedRole = member.roles.cache.find(
    (role) => role.hoist && role.iconURL(),
  );
  const iconUrl = hoistedRole?.iconURL({ extension: "png", size: 64 }) || null;
  if (!iconUrl) return null;
  return cacheRoleIcon(iconUrl);
}

async function prepareReplyData(message) {
  if (!message.reference?.messageId) return null;

  const replied = await message.channel.messages
    .fetch(message.reference.messageId)
    .catch(() => null);
  if (!replied || !replied.author) return null;

  const repliedMember =
    replied.member ||
    (await message.guild?.members?.fetch?.(replied.author.id).catch(() => null));

  return {
    content: String(replied.content || "").slice(0, MAX_REPLY_CONTENT_LENGTH),
    author: sanitizeUsername(repliedMember, replied.author),
    nameColor: getNameColor(repliedMember),
    avatarUrl: replied.author.displayAvatarURL({ extension: "png", size: 64 }),
    roleIconUrl: await getRoleIcon(repliedMember),
  };
}

async function resolveReactionMessage(reaction) {
  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }
  const message = reaction.message?.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  return message || null;
}

async function findSkullboardChannel(guild) {
  if (!guild || !SKULLBOARD_CHANNEL_ID) return null;
  return (
    guild.channels.cache.get(SKULLBOARD_CHANNEL_ID) ||
    (await guild.channels.fetch(SKULLBOARD_CHANNEL_ID).catch(() => null))
  );
}

async function findAuthorMember(message) {
  return (
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null))
  );
}

async function renderSkullCanvas(
  message,
  member,
  content,
  replyData,
  mediaUrl,
  hasMedia,
  hasEmbedOnly,
) {
  return renderSkullboardCanvas({
    avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
    username: sanitizeUsername(member, message.author),
    message: content || "[Messaggio vuoto]",
    nameColor: getNameColor(member),
    createdAt: message.createdAt,
    reply: replyData,
    roleIconUrl: await getRoleIcon(member),
    mediaUrl,
    hasMedia,
    hasEmbedOnly,
  });
}

function buildSkullEmbed(user, message, postImageName) {
  const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
  const formattedDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(message.createdAt);

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ extension: "png", size: 64 }),
    })
    .setDescription(
      `Aggiungi la reazione ${SKULL_EMOJI} a un messaggio per pubblicarlo nella SkullBoard`,
    )
    .addFields(
      { name: "Autore", value: message.author.toString(), inline: true },
      { name: "Canale", value: `<#${message.channel.id}>`, inline: true },
      { name: "Messaggio", value: `[Cliccami](${messageLink})`, inline: true },
    )
    .setImage(`attachment://${postImageName}`)
    .setFooter({ text: formattedDate })
    .setTimestamp(message.createdAt);
}

async function maybeBuildReplyReference(message, skullboardChannel) {
  if (!message.reference?.messageId) return null;

  const mirroredReply = await SkullboardPost.findOne({
    guildId: message.guild.id,
    messageId: message.reference.messageId,
  })
    .lean()
    .catch(() => null);
  if (!mirroredReply?.postMessageId) return null;

  const mirroredMsg = await skullboardChannel.messages
    .fetch(mirroredReply.postMessageId)
    .catch(() => null);
  if (!mirroredMsg) return null;

  return { messageReference: mirroredMsg.id, failIfNotExists: false };
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user) {
    let inFlightKey = null;
    let inFlightSet = null;
    try {
      if (!SkullboardPost) return;
      if (user?.bot) return;
      if (!isSkullReaction(reaction)) return;

      const message = await resolveReactionMessage(reaction);
      if (!message || !message.guild || !message.author) return;
      if (!SKULL_SOURCE_WHITELIST_CHANNEL_IDS.has(String(message.channel?.id || ""))) {
        return;
      }
      if (message.channel?.id === SKULLBOARD_CHANNEL_ID) return;

      if (message.client) {
        if (!message.client._skullboardInFlight) {
          message.client._skullboardInFlight = new Set();
        }
        inFlightSet = message.client._skullboardInFlight;
        inFlightKey = `${message.guild.id}:${message.id}`;
        if (inFlightSet.has(inFlightKey)) return;
        inFlightSet.add(inFlightKey);
      }

      const existing = await SkullboardPost.findOne({
        guildId: message.guild.id,
        messageId: message.id,
      })
        .lean()
        .catch(() => null);
      if (existing?.postMessageId) return;

      const skullboardChannel = await findSkullboardChannel(message.guild);
      if (!skullboardChannel?.isTextBased?.()) return;

      const member = await findAuthorMember(message);
      const content = buildBaseContent(message);
      const files = extractMessageFiles(message);
      const replyData = await prepareReplyData(message);

      const firstAttachment = files[0];
      const mediaUrl = firstAttachment?.attachment || null;
      const hasMedia = Boolean(mediaUrl);
      const hasEmbedOnly =
        !String(message.content || "").trim() &&
        !(message.attachments?.size > 0) &&
        (message.embeds?.length || 0) > 0;

      let canvasBuffer;
      try {
        canvasBuffer = await renderSkullCanvas(
          message,
          member,
          content,
          replyData,
          mediaUrl,
          hasMedia,
          hasEmbedOnly,
        );
      } catch (error) {
        global.logger?.error?.("[SKULLBOARD] Canvas render failed:", error);
        return;
      }

      const imageName = "skullboard.png";
      const imageAttachment = new AttachmentBuilder(canvasBuffer, {
        name: imageName,
      });
      const skullEmbed = buildSkullEmbed(user, message, imageName);

      const payload = {
        embeds: [skullEmbed],
        files: [imageAttachment],
        allowedMentions: { parse: [] },
      };

      const replyRef = await maybeBuildReplyReference(
        message,
        skullboardChannel,
      );
      if (replyRef) {
        payload.reply = replyRef;
      }

      const postMessage = await skullboardChannel
        .send(payload)
        .catch(() => null);
      if (!postMessage) return;

      await postMessage.react(SKULL_EMOJI).catch(() => {});

      await SkullboardPost.findOneAndUpdate(
        { guildId: message.guild.id, messageId: message.id },
        { $set: { postMessageId: postMessage.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      const confirmEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `Il messaggio è stato pubblicato nella <#${SKULLBOARD_CHANNEL_ID}>.`,
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Vai al Post")
          .setEmoji(SKULL_EMOJI)
          .setURL(postMessage.url),
      );

      await message.channel
        .send({
          embeds: [confirmEmbed],
          components: [row],
        })
        .catch(() => {});
    } catch (err) {
      global.logger?.error?.("[SKULLBOARD] Error:", err);
    } finally {
      if (inFlightSet && inFlightKey) inFlightSet.delete(inFlightKey);
    }
  },
};