const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField
} = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { createCustomRoleGrantRequest } = require('../../Events/interaction/customRoleHandlers');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');
const { formatDuration } = require('../../Utils/Moderation/moderation');
const { parseFlexibleDuration } = require('../../Utils/Moderation/durationParser');
const { resolveCustomRoleState, buildExpiryText } = require('../../Utils/Community/customRoleState');

const ANCHOR_ROLE_ID = IDs.roles.separatore1;
const REQUEST_TIMEOUT_MS = 60_000;
const VALID_SUBCOMMANDS = new Set(['create', 'modify', 'add', 'remove']);

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Custom Role')
    .setDescription([
      'Usa uno di questi subcommands:',
      '`+customrole create [durata]`',
      '`+customrole modify`',
      '`+customrole add @utente`',
      '`+customrole remove`',
      '',
      'Durata opzionale in `create`: `14d`, `2w`, `2 settimane`, `permanente`.'
    ].join('\n'));
}

function trimRoleName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Custom Role';
  return clean.slice(0, 32);
}

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

async function resolveActiveCustomRole(message) {
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
    return null;
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
    return null;
  }

  if (state.status === 'missing_role') {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrole create`.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return null;
  }

  return state;
}

function buildPanelRows(ownerId, roleId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customrole_name:${ownerId}:${roleId}`)
      .setLabel('Modifica Nome')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customrole_color:${ownerId}:${roleId}`)
      .setLabel('Modifica Colore')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customrole_members:${ownerId}:${roleId}`)
      .setLabel('Aggiungi Utenti')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customrole_emoji:${ownerId}:${roleId}`)
      .setLabel('Aggiungi Emoji')
      .setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customrole_delete:${ownerId}:${roleId}`)
      .setLabel('Elimina Ruolo')
      .setStyle(ButtonStyle.Danger)
  );
  return [row1, row2];
}

function buildCreatePanelEmbed(role, guild, doc, durationOption) {
  const lines = [
    '<a:VC_Flowers:1468687836055212174> Il tuo ruolo è stato creato/aggiornato. Personalizzalo con i bottoni sotto.',
    'Altri comandi li trovi con `+help`.',
    '',
    '**Ruolo:**',
    `${role}`
  ];

  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<:vegacheckmark:1443666279058772028> Custom Role')
    .setDescription(lines.join('\n'));

  if (doc?.expiresAt) {
    embed.addFields({
      name: 'Scadenza',
      value: `<t:${Math.floor(new Date(doc.expiresAt).getTime() / 1000)}:F>`,
      inline: true
    });
  } else {
    embed.addFields({
      name: 'Scadenza',
      value: 'Permanente',
      inline: true
    });
  }

  if (durationOption?.provided && !durationOption.clear && durationOption.ms) {
    embed.addFields({
      name: 'Durata impostata',
      value: `**${formatDuration(durationOption.ms)}**`,
      inline: true
    });
  }

  const guildIcon = guild?.iconURL?.({ extension: 'png', size: 256, forceStatic: false }) || null;
  if (guildIcon) embed.setThumbnail(guildIcon);
  return embed;
}

function buildModifyPanelEmbed(role, guild, doc) {
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Modifica Ruolo')
    .setDescription([
      '<a:VC_Flowers:1468687836055212174> Modifica il tuo ruolo personalizzato.',
      'Altri comandi li trovi con `+help`.',
      'Puoi configurarlo con i pulsanti qui sotto.',
      '',
      '**Ruolo:**',
      `${role}`,
      '',
      `**Scadenza:** ${buildExpiryText(doc)}`
    ].join('\n'));

  const guildIcon = guild?.iconURL?.({ extension: 'png', size: 256, forceStatic: false }) || null;
  if (guildIcon) embed.setThumbnail(guildIcon);
  return embed;
}

async function resolveOrCreateRole(message, durationOption) {
  const guild = message.guild;
  const me = guild.members.me || guild.members.cache.get(message.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { error: 'Mi serve il permesso `Gestisci Ruoli`.' };
  }

  const state = await resolveCustomRoleState({
    guild,
    userId: message.author.id,
    client: message.client,
    cleanupExpired: true
  });

  let doc = state.status === 'active' ? state.doc : null;
  let role = state.status === 'active' ? state.role : null;

  if (state.status === 'expired') {
    await CustomRole.deleteOne({ guildId: guild.id, userId: message.author.id }).catch(() => {});
    doc = null;
    role = null;
  }

  if (!role) {
    const roleName = trimRoleName(message.member?.displayName || message.author.username);
    role = await guild.roles.create({
      name: roleName,
      color: '#f4b6d7',
      reason: `Custom role for ${message.author.tag}`
    }).catch(() => null);
    if (!role) return { error: 'Non sono riuscito a creare il ruolo.' };

    if (role.position >= me.roles.highest.position) {
      await role.delete().catch(() => {});
      return { error: 'Non posso gestire quel ruolo: sposta il mio ruolo più in alto.' };
    }

    const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null);
    if (anchor) {
      const targetPosition = Math.max(1, anchor.position - 1);
      if (targetPosition < me.roles.highest.position) {
        await role.setPosition(targetPosition).catch(() => {});
      }
    }
  }

  await message.member.roles.add(role.id).catch(() => {});

  const update = { guildId: guild.id, userId: message.author.id, roleId: role.id };
  if (durationOption?.provided) {
    update.expiresAt = durationOption.clear ? null : new Date(Date.now() + durationOption.ms);
  } else if (!doc) {
    update.expiresAt = null;
  }

  const updatedDoc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: message.author.id },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);

  return { role, doc: updatedDoc || doc || null };
}

async function handleCreate(message, args) {
  const durationOption = parseOptionalDuration(args.join(' '));
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

  const { role, doc, error } = await resolveOrCreateRole(message, durationOption);
  if (error) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription(`<:vegax:1443934876440068179> ${error}`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  await safeMessageReply(message, {
    embeds: [buildCreatePanelEmbed(role, message.guild, doc, durationOption)],
    components: buildPanelRows(message.author.id, role.id),
    allowedMentions: { repliedUser: false }
  });
}

async function handleModify(message) {
  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  await safeMessageReply(message, {
    embeds: [buildModifyPanelEmbed(state.role, message.guild, state.doc)],
    components: buildPanelRows(message.author.id, state.role.id),
    allowedMentions: { repliedUser: false }
  });
}

async function handleAdd(message) {
  const target = message.mentions?.members?.first() || null;
  if (!target || target.id === message.author.id) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('Errore di sintassi')
          .setDescription([
            'Sintassi corretta:',
            '`+customrole add @utente`',
            'Devi taggare un utente valido diverso da te.'
          ].join('\n'))
      ],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  const started = await createCustomRoleGrantRequest({
    client: message.client,
    guildId: message.guild.id,
    channelId: message.channel.id,
    requesterId: message.author.id,
    targetId: target.id,
    roleId: state.role.id,
    timeoutMs: REQUEST_TIMEOUT_MS
  });

  if (!started?.ok) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Non sono riuscito ad avviare la richiesta (controlla DM aperti e permessi).')
      ],
      allowedMentions: { repliedUser: false }
    });
  }
}

async function handleRemove(message) {
  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  const role = state.role;
  const me = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) || role.position >= me.roles.highest.position) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Non posso gestire questo ruolo (permessi/gerarchia).')
      ],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  await message.guild.members.fetch().catch(() => {});
  const membersWithRole = Array.from(role.members.values())
    .filter((m) => !m.user?.bot && m.id !== message.author.id)
    .slice(0, 25);

  if (!membersWithRole.length) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle('Seleziona un utente')
          .setDescription('Nessun utente valido (diverso da te) ha attualmente il tuo ruolo personalizzato.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`customrole_remove_select:${message.author.id}:${role.id}`)
      .setPlaceholder('Seleziona un utente')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        membersWithRole.map((member) => ({
          label: member.user.username.slice(0, 100),
          value: member.id,
          description: (member.displayName || member.user.username).slice(0, 100)
        }))
      )
  );

  await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle('Seleziona un utente')
        .setDescription([
          'Usa il menu a tendina qui sotto per rimuovere un utente dal tuo ruolo personalizzato.',
          `Scadenza ruolo: ${buildExpiryText(state.doc)}`
        ].join('\n'))
    ],
    components: [row],
    allowedMentions: { repliedUser: false }
  });
}

module.exports = {
  name: 'customrole',
  aliases: [
    'cr',
    'customrolecreate',
    'crcreate',
    'customrolemodify',
    'customroleedit',
    'crmodify',
    'customroleadd',
    'cradd',
    'customroleremove',
    'crremove'
  ],
  subcommands: ['create', 'modify', 'add', 'remove'],
  subcommandAliases: {
    customrolecreate: 'create',
    crcreate: 'create',
    customrolemodify: 'modify',
    customroleedit: 'modify',
    crmodify: 'modify',
    customroleadd: 'add',
    cradd: 'add',
    customroleremove: 'remove',
    crremove: 'remove'
  },
  description: 'Gestisce il custom role con subcommands: create, modify, add, remove.',

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    const subcommand = String(args[0] || '').trim().toLowerCase();

    if (!VALID_SUBCOMMANDS.has(subcommand)) {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const rest = args.slice(1);
    if (subcommand === 'create') return handleCreate(message, rest);
    if (subcommand === 'modify') return handleModify(message);
    if (subcommand === 'add') return handleAdd(message);
    if (subcommand === 'remove') return handleRemove(message);
  }
};
