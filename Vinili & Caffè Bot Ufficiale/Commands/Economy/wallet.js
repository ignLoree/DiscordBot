const { SlashCommandBuilder } = require('discord.js');
const { getOrCreateWallet } = require('../../Services/Economy/economyService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Mostra il tuo saldo Caffè e Vinili')
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente da controllare')
        .setRequired(false)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const target = interaction.options.getUser('utente') || interaction.user;
    const wallet = await getOrCreateWallet({ guildId, userId: target.id });
    return interaction.reply({
      content: `<:VC_Wallet:1462794843746205815> Wallet di <@${target.id}>: ☕ Caffè ${wallet.coffee || 0} | 📀 Vinili ${wallet.vinyl || 0}`,
      allowedMentions: { users: [target.id] }
    });
  }
};