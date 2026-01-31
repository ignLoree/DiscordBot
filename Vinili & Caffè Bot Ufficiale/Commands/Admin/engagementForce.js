const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { forceRunEngagement } = require('../../Services/Economy/engagementService');

module.exports = {
  skipDeploy: false,
  data: new SlashCommandBuilder()
    .setName('engagement-force')
    .setDescription("Forza l'avvio di un engagement")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Tipo engagement (default: casuale)')
        .setRequired(false)
        .addChoices(
          { name: 'casuale', value: 'random' },
          { name: 'quiz', value: 'quiz' },
          { name: 'scramble', value: 'scramble' },
          { name: 'flag', value: 'flag' },
          { name: 'calciatore', value: 'player' }
        )
    )
    .addBooleanOption(o =>
      o.setName('ping')
        .setDescription('Tagga il ruolo games')
        .setRequired(false)
    )
    .addRoleOption(o =>
      o.setName('ruolo')
        .setDescription('Ruolo da taggare (override)')
        .setRequired(false)
    )
    .addChannelOption(o =>
      o.setName('canale')
        .setDescription("Canale in cui forzare l'engagement")
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName('ignora-orario')
        .setDescription('Avvia anche fuori fascia oraria')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 1 << 6 });

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
            .setColor('Red')
        ],
        flags: 1 << 6
      });
    }

    const ignoreWindow = interaction.options.getBoolean('ignora-orario') || false;
    const tipo = interaction.options.getString('tipo') || 'random';
    const ping = interaction.options.getBoolean('ping');
    const role = interaction.options.getRole('ruolo');
    const channel = interaction.options.getChannel('canale');
    const selectedType = tipo === 'random' ? null : tipo;

    const ok = await forceRunEngagement(interaction.client, {
      ignoreWindow,
      type: selectedType,
      ping: ping !== false,
      channelId: channel?.id || null,
      pingRoleId: role?.id || null
    });

    if (!ok) {
      return interaction.editReply({
        content: '<:vegax:1443934876440068179> Non ho potuto avviare il minigioco (canale mancante o fuori fascia).',
        flags: 1 << 6
      });
    }

    return interaction.editReply({
      content: '<:vegacheckmark:1443666279058772028> Minigioco avviato.',
      flags: 1 << 6
    });
  }
};