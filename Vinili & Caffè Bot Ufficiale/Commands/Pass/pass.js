const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { buildProfileEmbed } = require('../../UI/Pass/profile');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('pass')
    .setDescription('Apri il Pass stagionale'),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const user = await getOrCreatePassUser({
      guildId,
      seasonId: season.seasonId,
      userId: interaction.user.id
    });
    const embed = await buildProfileEmbed(season, user);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('pass_nav')
      .setPlaceholder('Seleziona una sezione')
      .addOptions([
        { label: 'Profilo', value: 'profile', emoji: '\u{1F464}' },
        { label: 'Nodi', value: 'nodes', emoji: '\u{1F9E9}' },
        { label: 'Missioni', value: 'missions', emoji: '\u{1F4DC}' },
        { label: 'Raid', value: 'raid', emoji: '\u2694\uFE0F' }
      ]);
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};
