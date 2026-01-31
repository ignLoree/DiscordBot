const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser, spendTickets, spendFragments } = require('../../Services/Pass/passService');
const { grantRewards } = require('../../Services/Pass/rewardService');
const { Transaction } = require('../../Schemas/Pass/transaction');
function loadShop() {
  const filePath = path.join(__dirname, '../../Data/shop.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const items = Array.isArray(data.items) ? data.items : [];
  const exchangeRates = data.exchangeRates || {};
  return { items, exchangeRates };
}
function findItem(items, id) {
  return items.find(i => i.id === id);
}
function formatItemLine(item) {
  const price = item.priceTickets || 0;
  const name = item.name || item.id;
  const desc = item.description ? ` - ${item.description}` : '';
  return `\`${item.id}\` - ${name} (ðŸ§© ${price})${desc}`;
}
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Shop del Pass')
    .addSubcommand(sc =>
      sc
        .setName('view')
        .setDescription('Mostra lo shop')
    )
    .addSubcommand(sc =>
      sc
        .setName('buy')
        .setDescription('Compra un oggetto dallo shop')
        .addStringOption(o =>
          o.setName('id')
            .setDescription('ID item')
            .setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('exchange')
        .setDescription('Scambia frammenti in ticket')
        .addStringOption(o =>
          o.setName('fragment')
            .setDescription('Tipo frammento')
            .setRequired(true)
            .addChoices(
              { name: 'common', value: 'common' },
              { name: 'rare', value: 'rare' },
              { name: 'epic', value: 'epic' },
              { name: 'legendary', value: 'legendary' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Numero frammenti da scambiare')
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const sub = interaction.options.getSubcommand();
    const { items, exchangeRates } = loadShop();
    if (sub === 'view') {
      const lines = items.map(formatItemLine);
      const embed = new EmbedBuilder()
        .setTitle('Shop Pass')
        .setDescription(lines.join('\n') || 'Nessun item disponibile.');
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === 'buy') {
      const id = interaction.options.getString('id', true);
      const item = findItem(items, id);
      if (!item) throw new Error('Item non trovato.');
      const price = item.priceTickets || 0;
      if (price <= 0) throw new Error('Item non valido.');
      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id
      });
      await spendTickets(u, price);
      await Transaction.create({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        type: 'spend',
        currency: 'tickets',
        amount: price,
        reason: `shop_purchase:${id}`
      });
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        passUser: u,
        rewards: item.rewards,
        reason: `shop_purchase:${id}`
      });
      return interaction.reply({
        content: `Acquisto completato: ${item.name || item.id}.`
      });
    }
    if (sub === 'exchange') {
      const fragment = interaction.options.getString('fragment', true);
      const amount = interaction.options.getInteger('amount', true);
      if (amount <= 0) throw new Error('Quantita non valida.');
      const rate = exchangeRates[fragment];
      if (!rate || rate <= 0) throw new Error('Tasso di cambio non disponibile.');
      const tickets = Math.floor(amount / rate);
      if (tickets <= 0) throw new Error('Frammenti insufficienti per ottenere ticket.');
      const usedFragments = tickets * rate;
      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id
      });
      await spendFragments(u, { [fragment]: usedFragments });
      await Transaction.create({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        type: 'spend',
        currency: `fragment:${fragment}`,
        amount: usedFragments,
        reason: 'fragment_exchange'
      });
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        passUser: u,
        rewards: { tickets },
        reason: 'fragment_exchange'
      });
      return interaction.reply({
        content: `Scambio completato: -${usedFragments} \u{1F9E9} ${fragment}, +${tickets} \u{1F39F} ticket.`
      });
    }
  }
};
