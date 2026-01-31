const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getOrCreateWallet } = require('../../Services/Economy/economyService');

module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('wallet-admin')
    .setDescription('Gestisci valute Caffe e Vinile')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente target')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('azione')
        .setDescription('Azione')
        .setRequired(true)
        .addChoices(
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'set', value: 'set' }
        )
    )
    .addStringOption(o =>
      o.setName('valuta')
        .setDescription('Valuta')
        .setRequired(true)
        .addChoices(
          { name: 'caffè', value: 'coffee' },
          { name: 'vinili', value: 'vinyl' }
        )
    )
    .addIntegerOption(o =>
      o.setName('amount')
        .setDescription('Quantita')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const target = interaction.options.getUser('utente', true);
    const action = interaction.options.getString('azione', true);
    const currency = interaction.options.getString('valuta', true);
    const amount = interaction.options.getInteger('amount', true);
    if (amount < 0) throw new Error('Quantità non valida.');
    const wallet = await getOrCreateWallet({ guildId, userId: target.id });
    if (action === 'set') {
      wallet[currency] = amount;
    } else if (action === 'add') {
      wallet[currency] = (wallet[currency] || 0) + amount;
    } else if (action === 'remove') {
      wallet[currency] = Math.max(0, (wallet[currency] || 0) - amount);
    }
    await wallet.save();
    return interaction.reply({
      content: `<:vegacheckmark:1443666279058772028> Wallet aggiornato per <@${target.id}>: ☕ Caffè ${wallet.coffee || 0} | 📀 Vinili ${wallet.vinyl || 0}`,
      allowedMentions: { users: [target.id] }
    });
  }
};
