const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nocolor')
    .setDescription('Rimuove il colore dai ruoli indicati.')
    .addRoleOption(option =>
      option.setName('ruolo1').setDescription('Primo ruolo').setRequired(true))
    .addRoleOption(option =>
      option.setName('ruolo2').setDescription('Secondo ruolo').setRequired(false))
    .addRoleOption(option =>
      option.setName('ruolo3').setDescription('Terzo ruolo').setRequired(false))
    .addRoleOption(option =>
      option.setName('ruolo4').setDescription('Quarto ruolo').setRequired(false))
    .addRoleOption(option =>
      option.setName('ruolo5').setDescription('Quinto ruolo').setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.')
        ],
        ephemeral: true
      });
    }

    const adminRoleIds = Array.isArray(interaction.client?.config?.adminRoleIds)
      ? interaction.client.config.adminRoleIds
      : [];
    const hasAdminRole = adminRoleIds.some(id => interaction.member?.roles?.cache?.has(id));
    if (!hasAdminRole) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.')
        ],
        ephemeral: true
      });
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non ho il permesso `Manage Roles`.')
        ],
        ephemeral: true
      });
    }

    const roles = ['ruolo1', 'ruolo2', 'ruolo3', 'ruolo4', 'ruolo5']
      .map(name => interaction.options.getRole(name))
      .filter(Boolean);

    const meHighest = me.roles.highest;
    const updated = [];
    const skipped = [];

    for (const role of roles) {
      if (role.position >= meHighest.position) {
        skipped.push(`${role}`);
        continue;
      }
      try {
        await role.setColor(null);
        updated.push(`${role}`);
      } catch {
        skipped.push(`${role}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Aggiornamento colori ruolo')
      .setDescription([
        updated.length ? `**Colori rimossi:** ${updated.join(' ')}` : '**Colori rimossi:** nessuno',
        skipped.length ? `**Saltati:** ${skipped.join(' ')}` : ''
      ].filter(Boolean).join('\n'));

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
