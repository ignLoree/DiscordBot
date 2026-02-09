const IDs = require('../../Utils/Config/ids');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');

const { safeMessageReply } = require('../../Utils/Moderation/reply');

const CUSTOM_ROLE_ALLOWED_ROLE_IDS = [
  IDs.roles.customRoleAccessA,
  IDs.roles.customRoleAccessB,
  IDs.roles.customRoleAccessC,
  IDs.roles.customRoleAccessD
];

function hasCustomRoleAccess(member) {
  return CUSTOM_ROLE_ALLOWED_ROLE_IDS.some((id) => member?.roles?.cache?.has(id));
}

function buildNoPermEmbed(message) {
  const rolesText = CUSTOM_ROLE_ALLOWED_ROLE_IDS.map((id) => `<@&${id}>`).join(', ');
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> **Non hai i permessi**")
    .setDescription("Questo comando è **VIP**, riservato ad una categoria di utenti specifici.")
    .addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `ottieni uno dei seguenti ruoli: <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[0]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[1]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[2]}>, <@&${CUSTOM_ROLE_ALLOWED_ROLE_IDS[3]}>`
    });
}

function buildPanelEmbed(member, role, guild) {
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('? Modifica Ruolo')
    .setDescription([
      '<a:VC_Flowers:1468687836055212174> Modifica il tuo ruolo personalizzato.',
      '__Altri__ comandi li trovi nel menù con il comando `+help`',
      'Puoi configurarlo con i pulsanti qui sotto.',
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
      embeds: [buildPanelEmbed(message.member, role, message.guild)],
      components: buildPanelRows(message.author.id, role.id),
      allowedMentions: { repliedUser: false }
    });
  }
};




