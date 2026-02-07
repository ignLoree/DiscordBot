const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const CustomRole = require('../../Schemas/Community/customRoleSchema');

const THUMBNAIL_URL = 'https://images-ext-1.discordapp.net/external/qGJ0Tl7_BO1f7ichIGhodCqFJDuvfRdwagvKo44IhrE/https/i.imgur.com/9zzrBbk.png?format=webp&quality=lossless&width=120&height=114';
const ANCHOR_ROLE_ID = '1469452890761596981';
const CUSTOM_ROLE_ALLOWED_ROLE_IDS = [
  '1442568950805430312',
  '1442568916114346096',
  '1329497467481493607',
  '1442568931326824488'
];

function hasCustomRoleAccess(member) {
  return CUSTOM_ROLE_ALLOWED_ROLE_IDS.some((id) => member?.roles?.cache?.has(id));
}

function buildNoPermEmbed(message) {
  const rolesText = CUSTOM_ROLE_ALLOWED_ROLE_IDS.map((id) => `<@&${id}>`).join(', ');
  return new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle('<:vegax:1443934876440068179> ➤ Non hai i permessi')
    .setDescription([
      'Questo comando è riservato agli utenti che possiedono i seguenti ruoli:',
      rolesText
    ].join('\n'))
    .setFooter({ text: `Comando eseguito da: ${message.author.username}` });
}

function trimRoleName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Custom Role';
  return clean.slice(0, 32);
}

function buildPanelEmbed(member, role) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('🎨 Ruolo Creato')
    .setDescription([
      '❄️ Il tuo ruolo è stato creato. **Ora personalizzalo!**',
      'Altri comandi li trovi nel menù con il comando `+help`',
      'Puoi modificare il ruolo con i bottoni sottostanti.',
      '',
      `**Ruolo:**`,
      `${role}`
    ].join('\n'))
    .setThumbnail(THUMBNAIL_URL)
    .setFooter({ text: `Comando eseguito da ${member.user.username}.` });
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

    const embed = buildPanelEmbed(message.member, role);
    const components = buildPanelRows(message.author.id, role.id);
    await safeMessageReply(message, {
      embeds: [embed],
      components,
      allowedMentions: { repliedUser: false }
    });
  }
};
