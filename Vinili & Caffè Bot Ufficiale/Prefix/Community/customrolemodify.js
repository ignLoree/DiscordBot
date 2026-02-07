const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const CustomRole = require('../../Schemas/Community/customRoleSchema');
const { safeMessageReply } = require('../../Utils/Moderation/message');

const THUMBNAIL_URL = 'https://images-ext-1.discordapp.net/external/qGJ0Tl7_BO1f7ichIGhodCqFJDuvfRdwagvKo44IhrE/https/i.imgur.com/9zzrBbk.png?format=webp&quality=lossless&width=120&height=114';
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

function buildPanelEmbed(member, role) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('🎨 Modifica Ruolo')
    .setDescription([
      '❄️ Modifica il tuo ruolo personalizzato.',
      'Altri comandi li trovi nel menù con il comando `+help`',
      'Puoi configurarlo con i pulsanti qui sotto.',
      '',
      '**Ruolo:**',
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

module.exports = {
  name: 'customrolemodify',
  aliases: ['crmodify', 'customroleedit'],

  async execute(message) {
    if (!message.guild || !message.member) return;
    if (!hasCustomRoleAccess(message.member)) {
      await safeMessageReply(message, { embeds: [buildNoPermEmbed(message)], allowedMentions: { repliedUser: false } });
      return;
    }

    const doc = await CustomRole.findOne({ guildId: message.guild.id, userId: message.author.id }).lean().catch(() => null);
    if (!doc?.roleId) {
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

    const role = message.guild.roles.cache.get(doc.roleId) || await message.guild.roles.fetch(doc.roleId).catch(() => null);
    if (!role) {
      await CustomRole.deleteOne({ guildId: message.guild.id, userId: message.author.id }).catch(() => {});
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrolecreate`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [buildPanelEmbed(message.member, role)],
      components: buildPanelRows(message.author.id, role.id),
      allowedMentions: { repliedUser: false }
    });
  }
};
