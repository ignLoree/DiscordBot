const IDs = require('../../Utils/Config/ids');

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');

const { safeMessageReply } = require('../../Utils/Moderation/reply');
module.exports = {
  name: 'customroleremove',
  aliases: ['crremove'],

  async execute(message) {
    if (!message.guild || !message.member) return;

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

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('👤 Seleziona un utente')
      .setDescription('Usa il menù a tendina qui sotto per rimuovere un utente dal tuo ruolo personalizzato.');

    await message.guild.members.fetch().catch(() => {});
    const membersWithRole = Array.from(role.members.values())
      .filter((m) => !m.user?.bot && m.id !== message.author.id)
      .slice(0, 25);

    if (!membersWithRole.length) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('👤 Seleziona un utente')
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
      embeds: [embed],
      components: [row],
      allowedMentions: { repliedUser: false }
    });
  }
};



