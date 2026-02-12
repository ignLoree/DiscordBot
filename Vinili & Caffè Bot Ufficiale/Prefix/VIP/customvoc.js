const { ChannelType, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');
const { formatDuration } = require('../../Utils/Moderation/moderation');
const { parseFlexibleDuration } = require('../../Utils/Moderation/durationParser');
const { resolveCustomRoleState, buildExpiryText } = require('../../Utils/Community/customRoleState');

const CUSTOM_VOICE_CATEGORY_ID = IDs.categories.categoryPrivate;

function parseOptionalDuration(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return { provided: false, clear: false, ms: null, error: null };

  if (['off', 'none', 'no', 'perma', 'permanent', 'permanente'].includes(value)) {
    return { provided: true, clear: true, ms: null, error: null };
  }

  const ms = parseFlexibleDuration(value);
  if (!ms) {
    return {
      provided: true,
      clear: false,
      ms: null,
      error: 'Durata non valida. Esempi: `14d`, `2w`, `2 settimane`, oppure `permanente`.'
    };
  }
  return { provided: true, clear: false, ms, error: null };
}

function sanitizeVoiceBaseName(name) {
  const clean = String(name || '')
    .replace(/[^\p{L}\p{N} _',.!?\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'privata';
  return clean;
}

function buildCustomVocName(emoji, baseName) {
  const safeEmoji = String(emoji || '\uD83C\uDFA7').trim() || '\uD83C\uDFA7';
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `\u0F04${safeEmoji}\uFE32`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

function findExistingVoiceChannel(guild, roleId) {
  return guild.channels.cache.find((ch) => {
    if (ch.type !== ChannelType.GuildVoice) return false;
    if (ch.parentId !== CUSTOM_VOICE_CATEGORY_ID) return false;
    const overwrite = ch.permissionOverwrites.cache.get(roleId);
    if (!overwrite) return false;
    return overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)
      && overwrite.allow.has(PermissionsBitField.Flags.Connect)
      && overwrite.allow.has(PermissionsBitField.Flags.Speak);
  }) || null;
}

function buildVoicePanelEmbed(channel, customRole, doc, durationOption) {
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Pannello Vocale Privata')
    .setDescription([
      `<:vegacheckmark:1443666279058772028> Canale: ${channel}`,
      `<:dot:1443660294596329582> Categoria: <#${CUSTOM_VOICE_CATEGORY_ID}>`,
      `<:dot:1443660294596329582> Accesso consentito a chi possiede ${customRole}`,
      '',
      `Scadenza custom: ${buildExpiryText(doc)}`
    ].join('\n'));

  if (durationOption?.provided && !durationOption.clear && durationOption.ms) {
    embed.addFields({
      name: 'Durata impostata',
      value: `**${formatDuration(durationOption.ms)}**`,
      inline: true
    });
  }

  return embed;
}

function buildVoicePanelRow(ownerId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customvoc_name:${ownerId}:${channelId}`)
      .setLabel('Modifica Nome')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customvoc_emoji:${ownerId}:${channelId}`)
      .setLabel('Aggiungi Emoji')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function updateCustomRoleTiming(guildId, userId, durationOption, extraSet = {}) {
  const setData = { ...extraSet };
  if (durationOption?.provided) {
    setData.expiresAt = durationOption.clear ? null : new Date(Date.now() + durationOption.ms);
  }
  if (!Object.keys(setData).length) return null;
  return CustomRole.findOneAndUpdate(
    { guildId, userId },
    { $set: setData },
    { new: true }
  ).lean().catch(() => null);
}

module.exports = {
  name: 'customvoc',
  aliases: ['customvoice', 'crvoice', 'vocprivata'],
  description: 'Crea la tua vocale privata nella categoria dedicata usando il tuo ruolo personalizzato.',

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;

    const durationOption = parseOptionalDuration(args[0]);
    if (durationOption.error) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(`<:vegax:1443934876440068179> ${durationOption.error}`)
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const state = await resolveCustomRoleState({
      guild: message.guild,
      userId: message.author.id,
      client: message.client,
      cleanupExpired: true
    });

    if (state.status === 'none') {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrole create`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (state.status === 'expired') {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription([
              '<:vegax:1443934876440068179> Il tuo custom role temporaneo e scaduto.',
              `Scadenza: ${buildExpiryText(state.doc)}`,
              'Usa `+customrole create` per crearne uno nuovo.'
            ].join('\n'))
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (state.status === 'missing_role') {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste piu. Ricrealo con `+customrole create`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const customRole = state.role;
    const customRoleDoc = state.doc;

    const me = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Mi serve il permesso `Gestisci Canali` per creare la vocale privata.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const category = message.guild.channels.cache.get(CUSTOM_VOICE_CATEGORY_ID)
      || await message.guild.channels.fetch(CUSTOM_VOICE_CATEGORY_ID).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Categoria vocale privata non trovata o non valida.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const existing = findExistingVoiceChannel(message.guild, customRole.id);
    if (existing) {
      const updatedDoc = await updateCustomRoleTiming(
        message.guild.id,
        message.author.id,
        durationOption,
        { customVocChannelId: existing.id }
      );
      await safeMessageReply(message, {
        embeds: [
          buildVoicePanelEmbed(existing, customRole, updatedDoc || customRoleDoc, durationOption)
        ],
        components: [buildVoicePanelRow(message.author.id, existing.id)],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const channelName = buildCustomVocName(
      customRoleDoc?.customVocEmoji || customRole.unicodeEmoji || '\uD83C\uDFA7',
      message.member.displayName || message.author.username
    );

    const channel = await message.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: CUSTOM_VOICE_CATEGORY_ID,
      reason: `Private voice channel for ${message.author.tag}`,
      permissionOverwrites: [
        {
          id: message.guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        },
        {
          id: customRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        },
        {
          id: message.client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.MoveMembers
          ]
        }
      ]
    }).catch(() => null);

    if (!channel) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non sono riuscito a creare la vocale privata.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const updatedDoc = await updateCustomRoleTiming(
      message.guild.id,
      message.author.id,
      durationOption,
      { customVocChannelId: channel.id }
    );

    await safeMessageReply(message, {
      embeds: [
        buildVoicePanelEmbed(channel, customRole, updatedDoc || customRoleDoc, durationOption)
      ],
      components: [buildVoicePanelRow(message.author.id, channel.id)],
      allowedMentions: { repliedUser: false }
    });
  }
};
