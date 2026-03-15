const { EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const { getGuildChannelCached, getGuildMemberCached, getGuildRoleCached } = require("./interactionEntityCache");
const IDs = require("../Config/ids");
const CUSTOM_VOICE_CATEGORY_ID = IDs?.categories?.categoryPrivate || null;

async function fetchGuildChannel(guild, channelId) {
  return getGuildChannelCached(guild, channelId);
}

async function fetchGuildMember(guild, userId) {
  return getGuildMemberCached(guild, userId);
}

async function fetchGuildRole(guild, roleId) {
  return getGuildRoleCached(guild, roleId);
}

async function replyEphemeral(interaction, payload) {
  if (interaction?.deferred && !interaction?.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  if (interaction?.replied) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

function parseRoleActionId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length !== 3) return null;
  const [head, ownerId, roleId] = parts;
  if (!head || !ownerId || !roleId) return null;
  return { head, ownerId, roleId };
}

function parseVoiceActionId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length !== 3) return null;
  const [head, ownerId, channelId] = parts;
  if (!head || !ownerId || !channelId) return null;
  if (head !== "customvoc_name" && head !== "customvoc_emoji") return null;
  return { head, ownerId, channelId };
}

function findCustomVoiceByRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return (
    guild.channels.cache.find((ch) => {
      if (ch.type !== ChannelType.GuildVoice) return false;
      if (CUSTOM_VOICE_CATEGORY_ID && ch.parentId !== CUSTOM_VOICE_CATEGORY_ID)
        return false;
      const overwrite = ch.permissionOverwrites.cache.get(roleId);
      if (!overwrite) return false;
      return (
        overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
        overwrite.allow.has(PermissionsBitField.Flags.Speak)
      );
    }) || null
  );
}

function canManageRole(interaction, role) {
  const me =
    interaction.guild?.members?.me ||
    interaction.guild?.members?.cache?.get(interaction.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles))
    return false;
  if (!role) return false;
  return role.position < me.roles.highest.position;
}

function refreshEmbedRoleLine(sourceEmbed, role) {
  const embed = sourceEmbed
    ? EmbedBuilder.from(sourceEmbed)
    : new EmbedBuilder().setColor("#6f4e37");
  const oldDesc = String(embed.data?.description || "");
  let nextDesc = oldDesc;
  if (/\*\*Ruolo:\*\*/.test(oldDesc)) {
    nextDesc = oldDesc.replace(
      /(\*\*Ruolo:\*\*\n)([\s\S]*)$/m,
      `$1${role}`,
    );
  } else {
    nextDesc = [oldDesc, "", "<:VC_Mention:1482526855289634997> **Ruolo:**", `${role}`]
      .join("\n")
      .trim();
  }
  embed.setDescription(nextDesc);
  return embed;
}

function sanitizeVoiceBaseName(name) {
  const clean = String(name || "")
    .replace(/[^\p{L}\p{N}_ ',.!?\-']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "privata";
  return clean;
}

function parseCustomVocName(rawName) {
  const name = String(rawName || "").trim();
  if (!name) return { emoji: "", baseName: "privata" };

  const separators = ["\uFE32", "︲", "|"];
  for (const separator of separators) {
    if (!name.includes(separator)) continue;
    const parts = name.split(separator);
    const left = String(parts.shift() || "")
      .replace(/^\u0F04/u, "")
      .replace(/^༄/u, "")
      .trim();
    const right = parts.join(separator).trim();
    return { emoji: left, baseName: right || "privata" };
  }

  return { emoji: "", baseName: name };
}

function buildCustomVocName(emoji, baseName) {
  const safeEmoji = String(emoji || "\uD83C\uDFA7").trim() || "\uD83C\uDFA7";
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `\u0F04${safeEmoji}\uFE32`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

module.exports = { fetchGuildChannel, fetchGuildMember, fetchGuildRole, replyEphemeral, parseRoleActionId, parseVoiceActionId, findCustomVoiceByRole, canManageRole, refreshEmbedRoleLine, sanitizeVoiceBaseName, parseCustomVocName, buildCustomVocName };