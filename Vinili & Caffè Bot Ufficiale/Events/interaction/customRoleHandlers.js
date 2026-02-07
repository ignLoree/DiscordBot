const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const CustomRole = require('../../Schemas/Community/customRoleSchema');

const pendingRoleGrants = new Map();

function parseCustomRoleId(customId) {
  const [head, ownerId, roleId] = String(customId || '').split(':');
  if (!head || !ownerId || !roleId) return null;
  return { head, ownerId, roleId };
}

async function checkOwnership(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('Red')
        .setTitle('Accesso negato')
        .setDescription('Solo il proprietario di questo ruolo personalizzato puo usare questi controlli.')
    ],
    flags: 1 << 6
  }).catch(() => {});
  return false;
}

async function fetchRole(interaction, roleId) {
  const guild = interaction.guild;
  if (!guild) return null;
  return guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
}

function canManageRole(interaction, role) {
  const me = interaction.guild?.members?.me || interaction.guild?.members?.cache?.get(interaction.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return false;
  if (!role) return false;
  return role.position < me.roles.highest.position;
}

async function createCustomRoleGrantRequest({
  client,
  guildId,
  channelId,
  requesterId,
  targetId,
  roleId,
  timeoutMs = 60_000
}) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild?.channels?.cache?.get(channelId) || await guild?.channels?.fetch(channelId).catch(() => null);
  const targetMember = guild?.members?.cache?.get(targetId) || await guild?.members?.fetch(targetId).catch(() => null);
  const requesterMember = guild?.members?.cache?.get(requesterId) || await guild?.members?.fetch(requesterId).catch(() => null);
  const role = guild?.roles?.cache?.get(roleId) || await guild?.roles?.fetch(roleId).catch(() => null);
  if (!guild || !channel || !targetMember || !requesterMember || !role) return { ok: false };

  const waitingEmbed = new EmbedBuilder()
    .setColor('#f1c40f')
    .setTitle('In attesa di conferma')
    .setDescription(`Sto aspettando che ${targetMember} accetti di ricevere il ruolo **${role.name}**.`);
  const promptMsg = await channel.send({ embeds: [waitingEmbed] }).catch(() => null);
  if (!promptMsg) return { ok: false };

  const token = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:yes`)
      .setLabel('Si')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setLabel('No')
      .setStyle(ButtonStyle.Danger)
  );

  const dmEmbed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Richiesta ruolo personalizzato')
    .setDescription([
      `${requesterMember} vuole aggiungerti il ruolo **${role.name}** nel server **${guild.name}**.`,
      'Accetti?'
    ].join('\n'));

  const dmSent = await targetMember.send({ embeds: [dmEmbed], components: [row] }).catch(() => null);
  if (!dmSent) {
    await promptMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('Impossibile inviare DM')
          .setDescription(`Non posso inviare il messaggio privato a ${targetMember}.`)
      ]
    }).catch(() => {});
    return { ok: false };
  }

  const expiresAt = Date.now() + Math.max(15_000, Number(timeoutMs || 60_000));
  pendingRoleGrants.set(token, {
    guildId,
    channelId,
    requesterId,
    targetId,
    roleId,
    promptMessageId: promptMsg.id,
    dmMessageId: dmSent.id,
    expiresAt
  });

  setTimeout(async () => {
    const req = pendingRoleGrants.get(token);
    if (!req) return;
    pendingRoleGrants.delete(token);
    const g = client.guilds.cache.get(req.guildId) || await client.guilds.fetch(req.guildId).catch(() => null);
    const ch = g?.channels?.cache?.get(req.channelId) || await g?.channels?.fetch(req.channelId).catch(() => null);
    const msg = ch?.messages?.cache?.get(req.promptMessageId) || await ch?.messages?.fetch(req.promptMessageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('Scaduto')
            .setDescription(`<@${req.targetId}> non ha risposto in tempo.`)
        ]
      }).catch(() => {});
    }
  }, Math.max(15_000, Number(timeoutMs || 60_000)));

  return { ok: true, promptMessageId: promptMsg.id };
}

async function handleButton(interaction) {
  if (!interaction.isButton()) return false;
  if (String(interaction.customId || '').startsWith('customrole_grant')) return false;
  const parsed = parseCustomRoleId(interaction.customId);
  if (!parsed || !parsed.head.startsWith('customrole_')) return false;

  const { head, ownerId, roleId } = parsed;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const role = await fetchRole(interaction, roleId);
  if (!role) {
    await CustomRole.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
    await interaction.reply({ content: '<:vegax:1443934876440068179> Ruolo non trovato, crea di nuovo con `+customrolecreate`.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (head === 'customrole_delete') {
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Non posso eliminare questo ruolo (gerarchia/permesi).', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await role.delete(`Custom role deleted by ${interaction.user.tag}`).catch(() => {});
    await CustomRole.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
    await interaction.reply({ content: '<:vegacheckmark:1443666279058772028> Ruolo eliminato.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (head === 'customrole_members') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle('Seleziona un utente')
          .setDescription('Seleziona un utente: ricevera una richiesta in DM per accettare il ruolo.')
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`customrole_add_select:${ownerId}:${roleId}`)
            .setPlaceholder('Seleziona un utente')
            .setMinValues(1)
            .setMaxValues(1)
        )
      ],
      flags: 1 << 6
    }).catch(() => {});
    return true;
  }

  let modalId = null;
  let title = null;
  let label = null;
  let placeholder = null;
  if (head === 'customrole_name') {
    modalId = `customrole_modal_name:${ownerId}:${roleId}`;
    title = 'Modifica nome ruolo';
    label = 'Nuovo nome';
    placeholder = 'Es: Astrofam';
  } else if (head === 'customrole_color') {
    modalId = `customrole_modal_color:${ownerId}:${roleId}`;
    title = 'Modifica colore ruolo';
    label = 'Colore HEX';
    placeholder = 'Es: #ff66cc';
  } else if (head === 'customrole_emoji') {
    modalId = `customrole_modal_emoji:${ownerId}:${roleId}`;
    title = 'Imposta emoji/icona ruolo';
    label = 'Emoji Unicode o URL immagine';
    placeholder = 'Es: 🌟 oppure https://.../icon.png';
  }
  if (!modalId) return true;

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(head !== 'customrole_emoji')
    .setPlaceholder(placeholder)
    .setMaxLength(200);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal).catch(() => {});
  return true;
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('customrole_modal_')) return false;
  const parsed = parseCustomRoleId(interaction.customId.replace('customrole_modal_', 'customrole_'));
  if (!parsed) return false;

  const { ownerId, roleId } = parsed;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const role = await fetchRole(interaction, roleId);
  if (!role) {
    await CustomRole.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
    await interaction.reply({ content: '<:vegax:1443934876440068179> Ruolo non trovato, crea di nuovo con `+customrolecreate`.', flags: 1 << 6 }).catch(() => {});
    return true;
  }
  if (!canManageRole(interaction, role)) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Non posso modificare questo ruolo (gerarchia/permesi).', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const value = interaction.fields.getTextInputValue('value')?.trim() || '';

  if (interaction.customId.startsWith('customrole_modal_name:')) {
    const name = String(value).slice(0, 32).trim();
    if (!name) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Nome non valido.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await role.edit({ name }, `Custom role rename by ${interaction.user.tag}`).catch(() => {});
    await interaction.reply({ content: `<:vegacheckmark:1443666279058772028> Nome aggiornato: **${name}**`, flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (interaction.customId.startsWith('customrole_modal_color:')) {
    const hex = value.startsWith('#') ? value : `#${value}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Inserisci un colore HEX valido, es: `#ff66cc`.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    await role.edit({ color: hex }, `Custom role color by ${interaction.user.tag}`).catch(() => {});
    await interaction.reply({ content: `<:vegacheckmark:1443666279058772028> Colore aggiornato: \`${hex}\``, flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (interaction.customId.startsWith('customrole_modal_emoji:')) {
    const input = value || null;
    if (!input) {
      await role.edit({ unicodeEmoji: null, icon: null }, `Custom role icon cleared by ${interaction.user.tag}`).catch(() => {});
      await interaction.reply({ content: '<:vegacheckmark:1443666279058772028> Emoji/icona ruolo rimossa.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const isUrl = /^https?:\/\/\S+$/i.test(input);
    if (isUrl) {
      const iconBuffer = await fetch(input)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? Buffer.from(b) : null))
        .catch(() => null);
      if (!iconBuffer) {
        await interaction.reply({ content: '<:vegax:1443934876440068179> URL immagine non valida o non raggiungibile.', flags: 1 << 6 }).catch(() => {});
        return true;
      }
      await role.edit({ icon: iconBuffer, unicodeEmoji: null }, `Custom role icon by ${interaction.user.tag}`).catch(() => {});
      await interaction.reply({ content: '<:vegacheckmark:1443666279058772028> Icona ruolo aggiornata da immagine.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    await role.edit({ unicodeEmoji: input, icon: null }, `Custom role emoji by ${interaction.user.tag}`).catch(() => {});
    await interaction.reply({ content: `<:vegacheckmark:1443666279058772028> Emoji ruolo aggiornata: ${input}`, flags: 1 << 6 }).catch(() => {});
    return true;
  }

  return true;
}

async function handleUserSelectMenus(interaction) {
  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu() && interaction.customId.startsWith('customrole_remove_select:')) {
    const [, ownerId, roleId] = String(interaction.customId).split(':');
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;

    const role = await fetchRole(interaction, roleId);
    if (!role) {
      await CustomRole.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
      await interaction.reply({ content: '<:vegax:1443934876440068179> Ruolo non trovato, crea di nuovo con `+customrolecreate`.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Non posso modificare questo ruolo (gerarchia/permesi).', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const targetId = interaction.values?.[0];
    const targetMember = interaction.guild.members.cache.get(targetId) || await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Utente non trovato.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    await targetMember.roles.remove(role.id, `Custom role member removal by ${interaction.user.tag}`).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('Utente Rimosso')
          .setDescription(`L'utente ${targetMember} e stato rimosso dal tuo ruolo.`)
      ],
      components: []
    }).catch(() => {});
    return true;
  }

  if (!interaction.isUserSelectMenu || !interaction.isUserSelectMenu()) return false;

  if (interaction.customId.startsWith('customrole_add_select:')) {
    const [, ownerId, roleId] = String(interaction.customId).split(':');
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;

    const targetId = interaction.values?.[0];
    const role = await fetchRole(interaction, roleId);
    if (!targetId || !role) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Target o ruolo non valido.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const started = await createCustomRoleGrantRequest({
      client: interaction.client,
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      requesterId: ownerId,
      targetId,
      roleId,
      timeoutMs: 60_000
    });

    if (!started?.ok) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Non sono riuscito ad avviare la richiesta (DM chiusi o errore).', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('Richiesta inviata')
          .setDescription(`Ho inviato la richiesta in DM a <@${targetId}>.`)
      ],
      components: []
    }).catch(() => {});
    return true;
  }

  if (interaction.customId.startsWith('customrole_remove_select:')) {
    const [, ownerId, roleId] = String(interaction.customId).split(':');
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;

    const role = await fetchRole(interaction, roleId);
    if (!role) {
      await CustomRole.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
      await interaction.reply({ content: '<:vegax:1443934876440068179> Ruolo non trovato, crea di nuovo con `+customrolecreate`.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Non posso modificare questo ruolo (gerarchia/permesi).', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const targetId = interaction.values?.[0];
    const targetMember = interaction.guild.members.cache.get(targetId) || await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Utente non trovato.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    await targetMember.roles.remove(role.id, `Custom role member removal by ${interaction.user.tag}`).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('Utente Rimosso')
          .setDescription(`L'utente ${targetMember} e stato rimosso dal tuo ruolo.`)
      ],
      components: []
    }).catch(() => {});
    return true;
  }

  return false;
}

async function handleGrantButtons(interaction) {
  if (!interaction.isButton() || !String(interaction.customId || '').startsWith('customrole_grant')) return false;

  const parts = String(interaction.customId).split(':');
  const token = parts[1];
  const action = parts[2];
  const request = pendingRoleGrants.get(token);

  if (!request) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Questa richiesta non e piu valida.', flags: 1 << 6 }).catch(() => {});
    return true;
  }
  if (interaction.user.id !== request.targetId) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('Accesso negato')
          .setDescription('Solo l utente invitato puo rispondere a questa richiesta.')
      ],
      flags: 1 << 6
    }).catch(() => {});
    return true;
  }
  if (Date.now() > request.expiresAt) {
    pendingRoleGrants.delete(token);
    await interaction.reply({ content: 'Richiesta scaduta.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const guild = interaction.client.guilds.cache.get(request.guildId) || await interaction.client.guilds.fetch(request.guildId).catch(() => null);
  const channel = guild?.channels?.cache?.get(request.channelId) || await guild?.channels?.fetch(request.channelId).catch(() => null);
  const role = guild?.roles?.cache?.get(request.roleId) || await guild?.roles?.fetch(request.roleId).catch(() => null);
  const requester = guild?.members?.cache?.get(request.requesterId) || await guild?.members?.fetch(request.requesterId).catch(() => null);
  const targetMember = guild?.members?.cache?.get(request.targetId) || await guild?.members?.fetch(request.targetId).catch(() => null);
  const promptMsg = channel?.messages?.cache?.get(request.promptMessageId) || await channel?.messages?.fetch(request.promptMessageId).catch(() => null);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`).setLabel('Si').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId(`customrole_grant:${token}:no`).setLabel('No').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  if (action === 'no') {
    pendingRoleGrants.delete(token);
    if (promptMsg) {
      await promptMsg.edit({
        embeds: [new EmbedBuilder().setColor('#e67e22').setTitle('Richiesta rifiutata').setDescription(`${targetMember || `<@${request.targetId}>`} ha rifiutato il ruolo ${role ? `**${role.name}**` : ''}.`)]
      }).catch(() => {});
    }
    if (channel) {
      await channel.send({
        embeds: [new EmbedBuilder().setColor('#e67e22').setTitle('Ruolo rifiutato').setDescription(`${targetMember || `<@${request.targetId}>`} ha rifiutato di ricevere il ruolo ${role ? `**${role.name}**` : ''}.`)]
      }).catch(() => {});
    }
    await interaction.update({
      embeds: [new EmbedBuilder().setColor('#e67e22').setTitle('Richiesta rifiutata').setDescription('Hai rifiutato il ruolo.')],
      components: [disabledRow]
    }).catch(() => {});
    return true;
  }

  if (!guild || !channel || !role || !targetMember || !requester) {
    pendingRoleGrants.delete(token);
    await interaction.update({ content: '<:vegax:1443934876440068179> Errore: dati richiesta non validi.', embeds: [], components: [disabledRow] }).catch(() => {});
    return true;
  }
  const me = guild.members.me || guild.members.cache.get(interaction.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) || role.position >= me.roles.highest.position) {
    pendingRoleGrants.delete(token);
    if (promptMsg) {
      await promptMsg.edit({
        embeds: [new EmbedBuilder().setColor('Red').setTitle('Impossibile assegnare').setDescription('Non posso assegnare questo ruolo per permessi/gerarchia.')]
      }).catch(() => {});
    }
    await interaction.update({
      embeds: [new EmbedBuilder().setColor('Red').setTitle('Errore').setDescription('Il bot non puo assegnare questo ruolo.')],
      components: [disabledRow]
    }).catch(() => {});
    return true;
  }

  await targetMember.roles.add(role.id, `Custom role accepted from ${requester.user.tag}`).catch(() => {});
  pendingRoleGrants.delete(token);

  if (promptMsg) {
    await promptMsg.edit({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('Ruolo Concesso').setDescription(`${targetMember} ha accettato il ruolo **${role.name}**.`)]
    }).catch(() => {});
  }
  await channel.send({
    embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('Ruolo Concesso').setDescription(`Il ruolo **${role.name}** e stato assegnato a ${targetMember}.`)]
  }).catch(() => {});
  await interaction.update({
    embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('Richiesta accettata').setDescription(`Hai accettato il ruolo **${role.name}**.`)],
    components: [disabledRow]
  }).catch(() => {});
  return true;
}

async function handleCustomRoleInteraction(interaction) {
  if (await handleUserSelectMenus(interaction)) return true;
  if (await handleGrantButtons(interaction)) return true;
  if (await handleButton(interaction)) return true;
  if (await handleModal(interaction)) return true;
  return false;
}

module.exports = { handleCustomRoleInteraction, createCustomRoleGrantRequest };
