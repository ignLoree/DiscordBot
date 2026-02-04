const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const moment = require('moment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("Mostra le informazioni di unÉ™ utente.")
    .addSubcommand(command =>
      command.setName('info')
        .setDescription(`Mostra le informazioni di unÉ™ utente.`)
        .addUserOption((op) =>
          op.setName("user")
            .setDescription("Seleziona l'utente di cui vuoi ricevere le informazioni.")
            .setRequired(false))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand()
    await interaction.deferReply()
    let member = interaction.options.getMember('user') || interaction.member
    function trimFieldValues(field) {
      if (typeof field.value === 'string' && field.value.length > 1024) {
        field.value = field.value.slice(0, 1021) + '...';
      }
      return field;
    }
    switch (sub) {
      case 'info':
        try {
          if (!member) return safeEditReply(interaction, { embeds: [new EmbedBuilder().setColor('Red').setDescription(`<:vegax:1443934876440068179> Non riesco a trovare l'utente ${member}`)], flags: 1 << 6 });
          const perms = {
            administrator: 'Administrator',
            manageGuild: 'Manage Server',
            manageRoles: 'Manage Roles',
            manageChannels: 'Manage Channels',
            manageMessages: 'Manage Messages',
            manageWebhooks: 'Manage Webhooks',
            manageNicknames: 'Manage Nicknames',
            manageEmojis: 'Manage Emojis',
            kickMembers: 'Kick Members',
            banMembers: 'Ban Members',
            mentionEveryone: 'Mention Everyone',
            timeoutMembers: 'Timeout Members',
          };
          const extra = [];
          let team = [];
          const roles = member.roles.cache.map(r => {
            if (r.id === interaction.guild.id) {
              return '';
            }
            return `<@&${r.id}>`;
          }).join('  ') || 'Nessun ruolo';
          const embed = {
            color: 0x6f4e37,
            author: {
              name: member.user.tag,
              icon_url: member.user.displayAvatarURL(),
            },
            thumbnail: {
              url: member.user.displayAvatarURL()
            },
            description: `\n<@!${member.id}>`,
            fields: [
              { name: 'EntratÉ™', value: moment.unix(member.joinedAt / 1000).format('llll'), inline: true },
              { name: 'RegistratÉ™', value: moment.unix(member.user.createdAt / 1000).format('llll'), inline: true },
              { name: `Ruoli [${member.roles.cache.size - 1}]`, value: roles.length > 2048 ? `Troppi ruoli da mostrare.` : roles, inline: false },
            ],
            footer: { text: `ID: ${member.id}` },
            timestamp: new Date(),
          };
          if (member.permissions) {
            let infoPerms = []
            if (member.permissions.has(PermissionFlagsBits.Administrator)) infoPerms.push(perms['administrator']);
            if (member.permissions.has(PermissionFlagsBits.ManageGuild)) infoPerms.push(perms['manageGuild'])
            if (member.permissions.has(PermissionFlagsBits.ManageRoles)) infoPerms.push(perms['manageRoles'])
            if (member.permissions.has(PermissionFlagsBits.ManageChannels)) infoPerms.push(perms['manageChannels'])
            if (member.permissions.has(PermissionFlagsBits.ManageMessages)) infoPerms.push(perms['manageMessages'])
            if (member.permissions.has(PermissionFlagsBits.ManageWebhooks)) infoPerms.push(perms['manageWebhooks'])
            if (member.permissions.has(PermissionFlagsBits.ManageNicknames)) infoPerms.push(perms['manageNicknames'])
            if (member.permissions.has(PermissionFlagsBits.KickMembers)) infoPerms.push(perms['kickMembers'])
            if (member.permissions.has(PermissionFlagsBits.BanMembers)) infoPerms.push(perms['banMembers'])
            if (member.permissions.has(PermissionFlagsBits.MentionEveryone)) infoPerms.push(perms['mentionEveryone'])
            if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) infoPerms.push(perms['timeoutMembers'])
            if (infoPerms.length) {
              embed.fields.push({ name: 'Permessi', value: infoPerms.join(', '), inline: false });
            }
          }
          if (member.id === client.user.id) {
            team.push('Vinili & Caffè Bot');
          }
          if (member.id === '295500038401163264') {
            extra.push(`Il creatore di Vinili & Caffè`);
          }
          if (member.id === interaction.guild.ownerId) {
            extra.push(`Server Owner`);
          } else if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            extra.push(`Server Admin`);
          } else if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            extra.push(`Server Manager`);
          } else if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            extra.push(`Server Moderator`);
          }
          if (extra.length) {
            embed.fields.push({ name: 'Riconoscimenti', value: extra.join(', '), inline: false });
          }
          if (team.length) {
            embed.fields.push({ name: 'Vinili & Caffè Team', value: `${team.join(', ')}`, inline: false });
          }
          embed.fields = embed.fields.map(trimFieldValues);
          await safeEditReply(interaction, { embeds: [embed] })
        } catch (error) {
          global.logger.error(error);
        }
    }
  }
}

