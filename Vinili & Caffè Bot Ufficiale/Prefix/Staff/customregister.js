const { ChannelType, EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const CUSTOM_VOICE_CATEGORY_ID = IDs.categories.categoryPrivate;

function parseUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  if (!raw) return null;
  const id = String(raw).match(/^<@!?(\d+)>$/)?.[1] || (String(raw).match(/^\d{17,20}$/) ? String(raw) : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

async function parseRole(message, raw) {
  const mentionedRole = message.mentions?.roles?.first();
  if (mentionedRole) return mentionedRole;
  if (!raw) return null;
  const roleId = String(raw).match(/^<@&(\d+)>$/)?.[1] || (String(raw).match(/^\d{17,20}$/) ? String(raw) : null);
  if (!roleId) return null;
  return message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null);
}

function parseVoiceChannel(guild, raw) {
  if (!raw) return null;
  const channelId = String(raw).match(/^<#(\d+)>$/)?.[1] || (String(raw).match(/^\d{17,20}$/) ? String(raw) : null);
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId) || null;
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
}

module.exports = {
  name: 'customregister',
  aliases: ['customsync', 'registercustom'],
  description: 'Registra custom role/vocale già esistenti nel sistema.',

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;

    const mode = String(args[0] || '').toLowerCase();
    if (!mode || !['role', 'voc', 'voice'].includes(mode)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Custom Register')
            .setDescription([
              '`+customregister role @utente @ruolo`',
              '`+customregister voc #canale @utente @ruolo`',
              '',
              'Note:',
              `- il canale vocale privato dovrebbe stare in <#${CUSTOM_VOICE_CATEGORY_ID}>`,
              '- se il ruolo non è nel DB, viene registrato automaticamente'
            ].join('\n'))
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (mode === 'role') {
      const user = await parseUser(message, args[1]);
      const role = await parseRole(message, args[2]);
      if (!user || !role) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Uso: `+customregister role @utente @ruolo`.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      await CustomRole.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $set: { guildId: message.guild.id, userId: user.id, roleId: role.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => null);

      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member && !member.roles.cache.has(role.id)) {
        await member.roles.add(role.id).catch(() => {});
      }

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Registrazione completata')
            .setDescription(`Associato ${role} a ${user} nel database custom role.`)
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const voiceChannel = parseVoiceChannel(message.guild, args[1]);
    const user = await parseUser(message, args[2]);
    const role = await parseRole(message, args[3]);
    if (!voiceChannel || !user) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Uso: `+customregister voc #canale @utente @ruolo`.')],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    let effectiveRole = role;
    if (!effectiveRole) {
      const doc = await CustomRole.findOne({ guildId: message.guild.id, userId: user.id }).lean().catch(() => null);
      if (doc?.roleId) {
        effectiveRole = message.guild.roles.cache.get(doc.roleId) || await message.guild.roles.fetch(doc.roleId).catch(() => null);
      }
    }
    if (!effectiveRole) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Ruolo non trovato. Passa anche `@ruolo` nel comando.')],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await CustomRole.findOneAndUpdate(
      { guildId: message.guild.id, userId: user.id },
      { $set: { guildId: message.guild.id, userId: user.id, roleId: effectiveRole.id, customVocChannelId: voiceChannel.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null);

    await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
      ViewChannel: false,
      Connect: false,
      Speak: false
    }).catch(() => {});
    await voiceChannel.permissionOverwrites.edit(effectiveRole.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true
    }).catch(() => {});
    await voiceChannel.permissionOverwrites.edit(message.client.user.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
      MoveMembers: true
    }).catch(() => {});

    const inExpectedCategory = voiceChannel.parentId === CUSTOM_VOICE_CATEGORY_ID;
    const categoryNote = inExpectedCategory
      ? 'Canale già nella categoria corretta.'
      : `Attenzione: canale non in <#${CUSTOM_VOICE_CATEGORY_ID}>.`;

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle('Registrazione vocale completata')
          .setDescription([
            `Canale: ${voiceChannel}`,
            `Utente: ${user}`,
            `Ruolo: ${effectiveRole}`,
            categoryNote
          ].join('\n'))
      ],
      allowedMentions: { repliedUser: false }
    });
  }
};


