const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const ANCHOR_ROLE_ID = IDs.roles.separatore1;
const CUSTOM_ROLE_ALLOWED_ROLE_IDS = [
  IDs.roles.VIP,
  IDs.roles.Donator,
  IDs.roles.ServerBooster,
  IDs.roles.Level70
];

function hasCustomRoleAccess(member) {
  return CUSTOM_ROLE_ALLOWED_ROLE_IDS.some((id) => member?.roles?.cache?.has(id));
}

function buildNoPermEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> **Non hai i permessi**")
    .setDescription("Questo comando è **VIP**, riservato ad una categoria di utenti specifici.")
    .addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `ottieni uno dei seguenti ruoli: <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[0]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[1]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[2]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[3]}>`
    });
}

function trimRoleName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Custom Role';
  return clean.slice(0, 32);
}

function buildPanelEmbed(member, role, guild) {
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<:vegacheckmark:1443666279058772028> Ruolo Creato')
    .setDescription([
      '<a:VC_Flowers:1468687836055212174> Il tuo ruolo è stato creato. **Ora personalizzalo!**',
      '__Altri comandi__ li trovi nel menù con il comando `+help`',
      'Puoi modificare il ruolo con i bottoni sottostanti.',
      '',
      '**Ruolo:**',
      `${role}`
    ].join('\n'))

  const guildIcon = guild?.iconURL?.({ extension: 'png', size: 256, forceStatic: false }) || null;
  if (guildIcon) embed.setThumbnail(guildIcon);
  return embed;
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

async function resolveOrCreateRole(message) {
  const guild = message.guild;
  const me = guild.members.me || guild.members.cache.get(message.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { error: 'Mi serve il permesso `Gestisci Ruoli`.' };
  }

  let doc = await CustomRole.findOne({ guildId: guild.id, userId: message.author.id }).catch(() => null);
  let role = doc?.roleId ? guild.roles.cache.get(doc.roleId) : null;
  if (!role && doc?.roleId) {
    role = await guild.roles.fetch(doc.roleId).catch(() => null);
  }
  if (role) return { role };

  if (doc?.roleId && !role) {
    await CustomRole.deleteOne({ _id: doc._id }).catch(() => {});
    doc = null;
  }

  const roleName = trimRoleName(message.member?.displayName || message.author.username);
  role = await guild.roles.create({
    name: roleName,
    color: '#f4b6d7',
    reason: `Custom role for ${message.author.tag}`
  }).catch(() => null);
  if (!role) return { error: 'Non sono riuscito a creare il ruolo.' };

  const editable = role.position < me.roles.highest.position;
  if (!editable) {
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

  await message.member.roles.add(role.id).catch(() => {});
  await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: message.author.id },
    { $set: { guildId: guild.id, userId: message.author.id, roleId: role.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => {});

  return { role };
}

module.exports = {
  name: 'customrolecreate',
  aliases: ['crcreate', 'customrole'],

  async execute(message) {
    if (!message.guild || !message.member) return;
    if (!hasCustomRoleAccess(message.member)) {
      await safeMessageReply(message, { embeds: [buildNoPermEmbed(message)], allowedMentions: { repliedUser: false } });
      return;
    }

    const { role, error } = await resolveOrCreateRole(message);
    if (error) {
      const fail = new EmbedBuilder()
        .setColor('Red')
        .setDescription(`<:vegax:1443934876440068179> ${error}`);
      await safeMessageReply(message, { embeds: [fail], allowedMentions: { repliedUser: false } });
      return;
    }

    const embed = buildPanelEmbed(message.member, role, message.guild);
    const components = buildPanelRows(message.author.id, role.id);
    await safeMessageReply(message, {
      embeds: [embed],
      components,
      allowedMentions: { repliedUser: false }
    });
  }
};



