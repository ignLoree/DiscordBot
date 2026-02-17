const { ChannelType, PermissionsBitField } = require("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");

const CUSTOM_VOICE_CATEGORY_ID = IDs?.categories?.categoryPrivate || null;
const CHECK_INTERVAL_MS = 60 * 1000;
let expiryLoopHandle = null;

function findVoiceByRole(guild, roleId) {
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

async function resolveVoiceChannel(guild, doc) {
  if (!guild || !doc) return null;
  let channel = null;

  if (doc.customVocChannelId) {
    channel =
      guild.channels.cache.get(doc.customVocChannelId) ||
      (await guild.channels.fetch(doc.customVocChannelId).catch(() => null));
  }
  if (!channel && doc.roleId) {
    channel = findVoiceByRole(guild, doc.roleId);
  }
  if (channel && channel.type !== ChannelType.GuildVoice) return null;
  return channel || null;
}

async function canManageRole(guild, role) {
  if (!guild || !role) return false;
  const me =
    guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles))
    return false;
  return role.position < me.roles.highest.position;
}

async function canManageChannels(guild) {
  if (!guild) return false;
  const me =
    guild.members.me || (await guild.members.fetchMe().catch(() => null));
  return Boolean(
    me?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

async function processExpiredCustomRole(client, doc) {
  if (!client || !doc?._id) return false;

  const guild =
    client.guilds.cache.get(doc.guildId) ||
    (await client.guilds.fetch(doc.guildId).catch(() => null));
  if (!guild) {
    await CustomRole.deleteOne({ _id: doc._id }).catch(() => {});
    return true;
  }

  let role =
    guild.roles.cache.get(doc.roleId) ||
    (await guild.roles.fetch(doc.roleId).catch(() => null));
  let voiceChannel = await resolveVoiceChannel(guild, doc);
  let roleHandled = !role;
  let channelHandled = !voiceChannel;

  if (role) {
    if (await canManageRole(guild, role)) {
      await role
        .delete(`Custom role expired for user ${doc.userId}`)
        .catch(() => {});
      role =
        guild.roles.cache.get(doc.roleId) ||
        (await guild.roles.fetch(doc.roleId).catch(() => null));
      roleHandled = !role;
    }
  }

  if (voiceChannel) {
    if (await canManageChannels(guild)) {
      await voiceChannel
        .delete(`Custom private voice expired for user ${doc.userId}`)
        .catch(() => {});
      const stillExists =
        guild.channels.cache.get(voiceChannel.id) ||
        (await guild.channels.fetch(voiceChannel.id).catch(() => null));
      channelHandled = !stillExists;
      voiceChannel = stillExists;
    }
  }

  if (roleHandled && channelHandled) {
    await CustomRole.deleteOne({ _id: doc._id }).catch(() => {});
    return true;
  }

  if (channelHandled && doc.customVocChannelId) {
    await CustomRole.updateOne(
      { _id: doc._id },
      { $set: { customVocChannelId: null } },
    ).catch(() => {});
  }

  return false;
}

async function runExpiredCustomRolesSweep(client) {
  if (!client) return;
  const now = new Date();
  const rows = await CustomRole.find({
    expiresAt: { $ne: null, $lte: now },
  })
    .lean()
    .catch(() => []);

  for (const row of rows) {
    await processExpiredCustomRole(client, row).catch(() => {});
  }
}

function startCustomRoleExpiryLoop(client) {
  if (!client) return null;
  if (expiryLoopHandle) return expiryLoopHandle;
  expiryLoopHandle = setInterval(() => {
    runExpiredCustomRolesSweep(client).catch(() => {});
  }, CHECK_INTERVAL_MS);
  return expiryLoopHandle;
}

module.exports = {
  runExpiredCustomRolesSweep,
  startCustomRoleExpiryLoop,
};
