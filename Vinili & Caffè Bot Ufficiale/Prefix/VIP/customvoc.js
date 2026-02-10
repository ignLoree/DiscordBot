const { ChannelType, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const CUSTOM_VOICE_CATEGORY_ID = IDs.channels.customVoiceCategory;
const CUSTOM_ROLE_ALLOWED_ROLE_IDS = [
  IDs.roles.customRoleAccessA,
  IDs.roles.customRoleAccessB,
  IDs.roles.customRoleAccessC,
  IDs.roles.customRoleAccessD
];

function hasCustomRoleAccess(member) {
  return CUSTOM_ROLE_ALLOWED_ROLE_IDS.some((id) => member?.roles?.cache?.has(id));
}

function buildNoPermEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> Non hai i permessi')
    .setDescription('Questo comando e riservato agli utenti VIP con accesso ai ruoli personalizzati.');
}

function sanitizeVoiceBaseName(name) {
  const clean = String(name || '')
    .replace(/[^\p{L}\p{N} _\-',’]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'privata';
  return clean;
}

function buildCustomVocName(emoji, baseName) {
  const safeEmoji = String(emoji || '🎧').trim() || '🎧';
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `༄${safeEmoji}︲`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

async function resolveCustomRole(guild, userId) {
  const doc = await CustomRole.findOne({ guildId: guild.id, userId }).lean().catch(() => null);
  if (!doc?.roleId) return { role: null, doc };
  const role = guild.roles.cache.get(doc.roleId) || await guild.roles.fetch(doc.roleId).catch(() => null);
  return { role: role || null, doc };
}

function findExistingVoiceChannel(guild, roleId) {
  return guild.channels.cache.find((ch) => {
    if (ch.type !== ChannelType.GuildVoice) return false;
    if (ch.parentId !== CUSTOM_VOICE_CATEGORY_ID) return false;
    const overwrite = ch.permissionOverwrites.cache.get(roleId);
    if (!overwrite) return false;
    return overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
      overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
      overwrite.allow.has(PermissionsBitField.Flags.Speak);
  }) || null;
}

function buildVoicePanelEmbed(channel, customRole) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Pannello Vocale Privata')
    .setDescription([
      `<:vegacheckmark:1443666279058772028> Canale: ${channel}`,
      `<:dot:1443660294596329582> Categoria: <#${CUSTOM_VOICE_CATEGORY_ID}>`,
      `<:dot:1443660294596329582> Accesso consentito a chi possiede ${customRole}`,
      '',
      'Usa il bottone per modificare il nome del canale.'
    ].join('\n'));
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

module.exports = {
  name: 'customvoc',
  aliases: ['customvoice', 'crvoice', 'vocprivata'],
  description: 'Crea la tua vocale privata nella categoria dedicata usando il tuo ruolo personalizzato.',

  async execute(message) {
    if (!message.guild || !message.member) return;

    if (!hasCustomRoleAccess(message.member)) {
      await safeMessageReply(message, { embeds: [buildNoPermEmbed()], allowedMentions: { repliedUser: false } });
      return;
    }

    const { role: customRole, doc: customRoleDoc } = await resolveCustomRole(message.guild, message.author.id);
    if (!customRole) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrolecreate`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

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
      await safeMessageReply(message, {
        embeds: [
          buildVoicePanelEmbed(existing, customRole)
        ],
        components: [buildVoicePanelRow(message.author.id, existing.id)],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const channelName = buildCustomVocName(customRoleDoc?.customVocEmoji || customRole.unicodeEmoji || '🎧', message.member.displayName || message.author.username);
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

    await safeMessageReply(message, {
      embeds: [
        buildVoicePanelEmbed(channel, customRole)
      ],
      components: [buildVoicePanelRow(message.author.id, channel.id)],
      allowedMentions: { repliedUser: false }
    });
  }
};


