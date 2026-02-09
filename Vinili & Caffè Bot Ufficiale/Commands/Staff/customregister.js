const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const CustomRole = require('../../Schemas/Community/customRoleSchema');

const CUSTOM_VOICE_CATEGORY_ID = '1442569078379118755';

function okEmbed(description) {
  return new EmbedBuilder().setColor('#6f4e37').setDescription(description);
}

function errEmbed(description) {
  return new EmbedBuilder().setColor('Red').setDescription(`<:vegax:1443934876440068179> ${description}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customregister')
    .setDescription('Registra custom role/vocale gia esistenti nel sistema.')
    .addSubcommand((sub) =>
      sub
        .setName('role')
        .setDescription('Registra un ruolo custom gia creato per un utente.')
        .addUserOption((opt) => opt.setName('utente').setDescription('Utente proprietario del custom role.').setRequired(true))
        .addRoleOption((opt) => opt.setName('ruolo').setDescription('Ruolo custom da associare.').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('voc')
        .setDescription('Registra/sistema una vocale custom gia creata.')
        .addChannelOption((opt) =>
          opt
            .setName('canale')
            .setDescription('Canale vocale privato da registrare.')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addUserOption((opt) => opt.setName('utente').setDescription('Utente proprietario.').setRequired(true))
        .addRoleOption((opt) => opt.setName('ruolo').setDescription('Ruolo custom da usare (opzionale).').setRequired(false))
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ embeds: [errEmbed('Questo comando va usato in un server.')], flags: 1 << 6 }).catch(() => {});
      return;
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});

    const sub = interaction.options.getSubcommand();

    if (sub === 'role') {
      const user = interaction.options.getUser('utente', true);
      const role = interaction.options.getRole('ruolo', true);

      await CustomRole.findOneAndUpdate(
        { guildId: interaction.guild.id, userId: user.id },
        { $set: { guildId: interaction.guild.id, userId: user.id, roleId: role.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => null);

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member && !member.roles.cache.has(role.id)) {
        await member.roles.add(role.id).catch(() => {});
      }

      await interaction.editReply({
        embeds: [okEmbed(`Associato ${role} a ${user} nel database custom role.`)]
      }).catch(() => {});
      return;
    }

    const voiceChannel = interaction.options.getChannel('canale', true);
    const user = interaction.options.getUser('utente', true);
    let role = interaction.options.getRole('ruolo', false);

    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await interaction.editReply({ embeds: [errEmbed('Il canale selezionato non e una vocale valida.')] }).catch(() => {});
      return;
    }

    if (!role) {
      const doc = await CustomRole.findOne({ guildId: interaction.guild.id, userId: user.id }).lean().catch(() => null);
      if (doc?.roleId) {
        role = interaction.guild.roles.cache.get(doc.roleId) || await interaction.guild.roles.fetch(doc.roleId).catch(() => null);
      }
    }

    if (!role) {
      await interaction.editReply({
        embeds: [errEmbed('Ruolo non trovato. Passa anche l opzione `ruolo` oppure registra prima il custom role.')]
      }).catch(() => {});
      return;
    }

    await CustomRole.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: user.id },
      { $set: { guildId: interaction.guild.id, userId: user.id, roleId: role.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null);

    const me = interaction.guild.members.me || interaction.guild.members.cache.get(interaction.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      await interaction.editReply({ embeds: [errEmbed('Mi serve il permesso `Gestisci Canali` per sistemare la vocale.')] }).catch(() => {});
      return;
    }

    await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      ViewChannel: false,
      Connect: false,
      Speak: false
    }).catch(() => {});
    await voiceChannel.permissionOverwrites.edit(role.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true
    }).catch(() => {});
    await voiceChannel.permissionOverwrites.edit(interaction.client.user.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
      MoveMembers: true
    }).catch(() => {});

    const inExpectedCategory = voiceChannel.parentId === CUSTOM_VOICE_CATEGORY_ID;
    await interaction.editReply({
      embeds: [
        okEmbed([
          `Canale: ${voiceChannel}`,
          `Utente: ${user}`,
          `Ruolo: ${role}`,
          inExpectedCategory
            ? 'Canale gia nella categoria corretta.'
            : `Attenzione: canale non in <#${CUSTOM_VOICE_CATEGORY_ID}>.`
        ].join('\n'))
      ]
    }).catch(() => {});
  }
};
