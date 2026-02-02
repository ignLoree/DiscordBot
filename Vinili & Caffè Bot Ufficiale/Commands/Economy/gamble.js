const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addCurrency, spendCurrency, getOrCreateWallet } = require('../../Services/Economy/economyService');
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Sistema di gambling per Vinili e Caffè')
    .addSubcommand(sc =>
      sc.setName('coinflip')
        .setDescription('Testa o croce')
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta da usare')
            .setRequired(true)
            .addChoices(
              { name: 'Caffè', value: 'coffee' },
              { name: 'Vinili', value: 'vinyl' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità da puntare')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(o =>
          o.setName('scelta')
            .setDescription('Testa o croce')
            .setRequired(true)
            .addChoices(
              { name: 'Testa', value: 'testa' },
              { name: 'Croce', value: 'croce' }
            )
        )
    )
    .addSubcommand(sc =>
      sc.setName('dice')
        .setDescription('Scegli un numero da 1 a 6')
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta da usare')
            .setRequired(true)
            .addChoices(
              { name: 'Caffè', value: 'coffee' },
              { name: 'Vinili', value: 'vinyl' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità da puntare')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(o =>
          o.setName('numero')
            .setDescription('Numero (1-6)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(6)
        )
    )
    .addSubcommand(sc =>
      sc.setName('slots')
        .setDescription('Slot machine')
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta da usare')
            .setRequired(true)
            .addChoices(
              { name: 'Caffè', value: 'coffee' },
              { name: 'Vinili', value: 'vinyl' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità da puntare')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sc =>
      sc.setName('roulette')
        .setDescription('Roulette')
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta da usare')
            .setRequired(true)
            .addChoices(
              { name: 'Caffè', value: 'coffee' },
              { name: 'Vinili', value: 'vinyl' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità da puntare')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(o =>
          o.setName('puntata')
            .setDescription('Tipo di puntata')
            .setRequired(true)
            .addChoices(
              { name: 'Rosso', value: 'rosso' },
              { name: 'Nero', value: 'nero' },
              { name: 'Verde', value: 'verde' },
              { name: 'Numero', value: 'numero' }
            )
        )
        .addIntegerOption(o =>
          o.setName('numero')
            .setDescription('Numero (0-36) se scegli Numero')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(36)
        )
    )
    .addSubcommand(sc =>
      sc.setName('blackjack')
        .setDescription('Blackjack rapido')
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta da usare')
            .setRequired(true)
            .addChoices(
              { name: 'Caffè', value: 'coffee' },
              { name: 'Vinili', value: 'vinyl' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità da puntare')
            .setRequired(true)
            .setMinValue(1)
        )
    ),
  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: 'Questo comando è disponibile solo in un server.' });
    const config = interaction.client?.config2 || {};
    const cooldownMs = config.gamblingCooldownMs || 4000;
    const userId = interaction.user.id;
    if (isOnCooldown(userId, cooldownMs)) {
      return interaction.reply({ content: `⏳ Aspetta un attimo prima di rigiocare.`, ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const currency = interaction.options.getString('valuta', true);
    const amount = interaction.options.getInteger('amount', true);
    const currencyLabel = formatCurrencyLabel(currency);
    const spent = await spendCurrency({ guildId, userId, currency, amount });
    if (!spent) {
      await getOrCreateWallet({ guildId, userId });
      return interaction.reply({ content: `<:vegax:1443934876440068179> Saldo insufficiente per puntare ${amount} ${currencyLabel}.`, ephemeral: true });
    }
    setCooldown(userId);
    let resultText = 'N/A';
    let payout = 0;
    let gameName = sub;
    let useEditReply = false;
    let resultImageUrl = null;
    let preReplyEmbed = null;
    let preReplyDelayMs = 0;
    let replied = false;
    if (sub === 'coinflip') {
      const scelta = interaction.options.getString('scelta', true);
      const win = Math.random() < 0.4;
      const resultSide = win ? scelta : (scelta === 'testa' ? 'croce' : 'testa');
      resultText = `È uscito: **${resultSide}**`;
      useEditReply = true;
      preReplyDelayMs = 3000;
      preReplyEmbed = new EmbedBuilder()
        .setColor(config.embedEconomy || '#6f4e37')
        .setTitle('🪙 COINFLIP')
        .setDescription('Lancio in corso...')
        .setImage('https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXkxbWU3NTBncGZhN2p3czI5eXJrcDJmb3hseTA5bjkycXU2bmh0byZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/C4omPTb1RZBuMtKx4N/giphy.gif')
        .setTimestamp();
      if (win) payout = toMultiplier(amount, 1.8);
    }
    if (sub === 'dice') {
      const scelta = interaction.options.getInteger('numero', true);
      const win = Math.random() < 0.08;
      const roll = win ? scelta : pickDiceNumber(scelta);
      resultText = `Hai scelto **${scelta}**, è uscito **${roll}**`;
      if (win) payout = toMultiplier(amount, 4.0);
    }
    if (sub === 'slots') {
      const symbols = [
        { value: '🍒', weight: 40 },
        { value: '🍋', weight: 35 },
        { value: '🍇', weight: 18 },
        { value: '⭐', weight: 6 },
        { value: '💎', weight: 1 }
      ];
      const a = pickWeighted(symbols);
      const b = pickWeighted(symbols);
      const c = pickWeighted(symbols);
      resultText = `| ${a} | ${b} | ${c} |`;
      if (a === b && b === c) {
        const payoutTable = {
          '🍒': 2.0,
          '🍋': 2.5,
          '🍇': 4.0,
          '⭐': 10.0,
          '💎': 25.0
        };
        payout = toMultiplier(amount, payoutTable[a] || 0);
      }
      useEditReply = true;
      const rollingEmbed = new EmbedBuilder()
        .setColor(config.embedEconomy || '#6f4e37')
        .setTitle('🎰 SLOTS')
        .setDescription('Rolling...')
        .setTimestamp();
      await interaction.reply({ embeds: [rollingEmbed] });
      replied = true;
      for (let i = 0; i < 3; i += 1) {
        await sleep(700);
        const ra = pickWeighted(symbols);
        const rb = pickWeighted(symbols);
        const rc = pickWeighted(symbols);
        const animEmbed = new EmbedBuilder()
          .setColor(config.embedEconomy || '#6f4e37')
          .setTitle('🎰 SLOTS')
          .setDescription(`| ${ra} | ${rb} | ${rc} |`)
          .setFooter({ text: 'Rolling...' });
        await interaction.editReply({ embeds: [animEmbed] });
      }
    }
    if (sub === 'roulette') {
      const puntata = interaction.options.getString('puntata', true);
      const numero = interaction.options.getInteger('numero');
      if (puntata === 'numero' && (numero === null || typeof numero === 'undefined')) {
        await addCurrency({ guildId, userId, [currency]: amount });
        return interaction.reply({ content: '<:vegax:1443934876440068179> Devi specificare un numero (0-36).', ephemeral: true });
      }
      const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      const winChance = puntata === 'numero' ? 0.02 : puntata === 'verde' ? 0.04 : 0.42;
      const win = Math.random() < winChance;
      let resultNumber = 0;
      if (win) {
        if (puntata === 'numero') {
          resultNumber = numero;
        } else if (puntata === 'verde') {
          resultNumber = 0;
        } else if (puntata === 'rosso') {
          const options = Array.from(reds);
          resultNumber = options[Math.floor(Math.random() * options.length)];
        } else {
          const options = Array.from({ length: 37 }, (_, i) => i).filter(n => n !== 0 && !reds.has(n));
          resultNumber = options[Math.floor(Math.random() * options.length)];
        }
      } else {
        const all = Array.from({ length: 37 }, (_, i) => i);
        const losers = puntata === 'numero'
          ? all.filter(n => n !== numero)
          : puntata === 'verde'
            ? all.filter(n => n !== 0)
            : puntata === 'rosso'
              ? all.filter(n => n === 0 || !reds.has(n))
              : all.filter(n => n === 0 || reds.has(n));
        resultNumber = losers[Math.floor(Math.random() * losers.length)];
      }
      const color = resultNumber === 0 ? 'verde' : reds.has(resultNumber) ? 'rosso' : 'nero';
      resultText = `È uscito **${resultNumber} (${color})**`;
      if (win) {
        if (puntata === 'numero') payout = toMultiplier(amount, 10.0);
        else if (puntata === 'verde') payout = toMultiplier(amount, 5.0);
        else payout = toMultiplier(amount, 1.5);
      }
    }
    if (sub === 'blackjack') {
      const player = [drawCard(), drawCard()];
      const dealer = [drawCard(), drawCard()];
      while (handValue(player) < 16) player.push(drawCard());
      while (handValue(dealer) < 18) dealer.push(drawCard());
      const pVal = handValue(player);
      const dVal = handValue(dealer);
      resultText = `Tuo: **${pVal}** (${player.join(', ')}) | Banco: **${dVal}** (${dealer.join(', ')})`;
      const playerBust = pVal > 21;
      const dealerBust = dVal > 21;
      if (!playerBust && (dealerBust || pVal > dVal)) {
        payout = toMultiplier(amount, 1.6);
      }
    }
    if (payout > 0) {
      await addCurrency({ guildId, userId, [currency]: payout });
    }
    const net = payout - amount;
    if (preReplyEmbed && !replied) {
      await interaction.reply({ embeds: [preReplyEmbed] });
      replied = true;
      if (preReplyDelayMs > 0) await sleep(preReplyDelayMs);
    }
    const embed = new EmbedBuilder()
      .setColor(config.embedEconomy || '#6f4e37')
      .setTitle(`🎲 ${sub.toUpperCase()}`)
      .setDescription(resultText)
      .addFields(
        { name: 'Puntata', value: `${amount} ${currencyLabel}`, inline: true },
        { name: 'Payout', value: `${payout} ${currencyLabel}`, inline: true },
        { name: 'Netto', value: `${net >= 0 ? '+' : ''}${net} ${currencyLabel}`, inline: true }
      )
      .setFooter({ text: 'Buona fortuna!' })
      .setTimestamp();
    if (resultImageUrl) {
      embed.setImage(resultImageUrl);
    }
    if (useEditReply) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
    await logGamble({
      client: interaction.client,
      guild: interaction.guild,
      user: interaction.user,
      game: gameName,
      bet: amount,
      currencyLabel,
      result: resultText,
      payout,
      net,
      channelId: interaction.channelId
    });
  }
};

function now() {
  return Date.now();
}
function isOnCooldown(userId, ms) {
  const last = cooldowns.get(userId) || 0;
  return now() - last < ms;
}
function setCooldown(userId) {
  cooldowns.set(userId, now());
}
function pickWeighted(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    if ((r -= it.weight) <= 0) return it.value;
  }
  return items[items.length - 1].value;
}
function formatCurrencyLabel(currency) {
  return currency === 'coffee' ? '☕ Caffè' : '📀 Vinili';
}
function toMultiplier(amount, mult) {
  return Math.max(0, Math.floor(amount * mult));
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function pickDiceNumber(exclude) {
  const nums = [1, 2, 3, 4, 5, 6].filter(n => n !== exclude);
  return nums[Math.floor(Math.random() * nums.length)];
}
function drawCard() {
  const deck = [
    { value: 2, weight: 12 },
    { value: 3, weight: 12 },
    { value: 4, weight: 11 },
    { value: 5, weight: 11 },
    { value: 6, weight: 10 },
    { value: 7, weight: 10 },
    { value: 8, weight: 9 },
    { value: 9, weight: 9 },
    { value: 10, weight: 26 },
    { value: 11, weight: 4 }
  ];
  return pickWeighted(deck);
}
function handValue(cards) {
  let sum = cards.reduce((s, v) => s + v, 0);
  let aces = cards.filter(v => v === 11).length;
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
  }
  return sum;
}
async function logGamble({ client, guild, user, game, bet, currencyLabel, result, payout, net, channelId }) {
  const logChannelId = client?.config2?.gamblingLogChannelId;
  if (!logChannelId) return;
  const channel = guild?.channels?.cache?.get(logChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(client?.config2?.embedEconomy || '#6f4e37')
    .setTitle('Gambling Log')
    .addFields(
      { name: 'Gioco', value: game, inline: true },
      { name: 'Utente', value: `<@${user.id}> (${user.id})`, inline: true },
      { name: 'Canale', value: channelId ? `<#${channelId}>` : 'N/A', inline: true },
      { name: 'Puntata', value: `${bet} ${currencyLabel}`, inline: true },
      { name: 'Risultato', value: result, inline: true },
      { name: 'Payout', value: `${payout} ${currencyLabel}`, inline: true },
      { name: 'Netto', value: `${net >= 0 ? '+' : ''}${net} ${currencyLabel}`, inline: true }
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}