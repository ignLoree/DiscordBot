const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const MinigameUser = require('../../Schemas/Minigames/minigameUserSchema');
const { addExpWithLevel } = require('../Community/expService');

const activeGames = new Map();
const pendingGames = new Map();
const loopState = new WeakSet();

const REWARD_CHANNEL_ID = "1442569138114662490";
const EXP_REWARDS = [
  { exp: 100, roleId: "1468675561948971058" },
  { exp: 500, roleId: "1468675567015428239" },
  { exp: 1000, roleId: "1468675570865803407" },
  { exp: 1500, roleId: "1468675576326918302" },
  { exp: 2500, roleId: "1468675580609429536" },
  { exp: 5000, roleId: "1468675584094769427" },
  { exp: 10000, roleId: "1468675587747877028" },
  { exp: 50000, roleId: "1468675590747062355" },
  { exp: 100000, roleId: "1468675595058811075" }
];

let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getConfig(client) {
  return client?.config2?.minigames || null;
}

function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || null;
}

function randomBetween(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffleString(value) {
  const arr = String(value || '').split('');
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function normalizeWord(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidWord(word) {
  if (!word) return false;
  if (word.length < 5 || word.length > 6) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(word);
}

async function loadWordList(cfg) {
  const now = Date.now();
  if (cachedWords && (now - cachedWordsAt) < WORD_CACHE_TTL_MS) return cachedWords;

  const apiUrl = cfg?.guessWord?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (Array.isArray(res?.data?.words)) {
        list = res.data.words;
      }
    } catch {}
  }

  if (!list.length) {
    list = Array.isArray(cfg?.guessWord?.words) ? cfg.guessWord.words : [];
  }

  const filtered = list
    .map(normalizeWord)
    .filter(isValidWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function isWithinAllowedWindow(now, start, end) {
  const startMinutes = (start?.hour ?? 9) * 60 + (start?.minute ?? 0);
  const endMinutes = (end?.hour ?? 23) * 60 + (end?.minute ?? 45);
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= startMinutes && current <= endMinutes;
}

function buildGuessNumberEmbed(min, max, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina il numero .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp}exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarlo!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
}

function buildGuessWordEmbed(scrambled, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Indovina la parola .ᐟ ✧')
    .setDescription([
      `<a:VC_Beer:1448687940560490547> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp** ˚﹒`,
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'));
}

function buildFindBotEmbed(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Trova il bot .ᐟ ✧')
    .setDescription([
      '<a:VC_Beer:1448687940560490547> Trova il messaggio del bot tra i canali del server, premi il bottone e vinci la ricompensa!',
      `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per trovarlo!`,
      `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`
    ].join('\n'))
}

function buildMinuteHintEmbed(channelId) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<a:VC_Heart:1448672728822448141>⁺Indizio')
    .setDescription(`⟢ <a:VC_Arrow:1448672967721615452> <#${channelId}>`);
}

function buildHintEmbed(isHigher) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(isHigher ? '📈 <a:VC_Arrow:1448672967721615452> Più alto!' : '📉 <a:VC_Arrow:1448672967721615452> Più basso!');
}

function buildWinEmbed(winnerId, rewardExp, totalExp) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('𓂃★ Un utente ha vinto !')
    .setDescription([
      `<a:VC_Winner:1448687700235256009> Complimenti <@${winnerId}>, hai vinto e guadagnato **${rewardExp}exp**.ᐟ ✧`,
      '',
      '📊 **Le tue statistiche:**',
      `<a:VC_Arrow:1448672967721615452> Ora hai un totale di **${totalExp}exp**`,
    ].join('\n'))
    .setFooter({ text: '⇢ digita il comando "+mstats" per vedere i tuoi progressi' });
}

function getHighestEligibleReward(totalExp) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of EXP_REWARDS) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

function getNextReward(totalExp) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member, reward, totalExp) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    '<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>',
    '',
    `<a:VC_Events:1448688007438667796> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** punti ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    '',
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** punti per la prossima ricompensa!`
      : '<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!',
  ].join('\n')
  .setFooter({ text: `Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche con il comando \`+mstats\``})

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: member.displayName || member.user?.username || 'Utente', iconURL: member.displayAvatarURL() })
    .setDescription(description);
}

async function handleExpReward(client, member, totalExp) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => {});

  const rewardChannel = getChannelSafe(client, REWARD_CHANNEL_ID) || await member.guild.channels.fetch(REWARD_CHANNEL_ID).catch(() => null);
  if (!rewardChannel) return;
  await rewardChannel.send({ content: `${member}`, embeds: [buildRewardEmbed(member, reward, totalExp)] }).catch(() => {});
}

function buildTimeoutNumberEmbed(number) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! Il numero era **${number}**.`);
}

function buildTimeoutWordEmbed(word) {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription(`<a:VC_Timer:1462779065625739344> Tempo scaduto! La parola era **${word}**.`);
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setDescription('<a:VC_Timer:1462779065625739344> Tempo scaduto! Nessuno ha trovato il bot.');
}

function getAvailableGameTypes(cfg) {
  const types = [];
  if (cfg?.guessNumber) types.push('guessNumber');
  if (cfg?.guessWord) types.push('guessWord');
  if (cfg?.findBot) types.push('findBot');
  return types;
}

async function scheduleMinuteHint(client, hintChannelId, durationMs, channelId) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!mainChannel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await mainChannel.send({ embeds: [buildMinuteHintEmbed(hintChannelId)] }).catch(() => {});
  }, delay);
}

async function startGuessNumberGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  const max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  const rewardExp = Number(cfg?.guessNumber?.rewardExp || 100);
  const durationMs = Math.max(60000, Number(cfg?.guessNumber?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const gameMessage = await channel.send({ embeds: [buildGuessNumberEmbed(min, max, rewardExp, durationMs)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    await channel.send({ embeds: [buildTimeoutNumberEmbed(game.target)] }).catch(() => {});
  }, durationMs);

  activeGames.set(channelId, {
    type: 'guessNumber',
    target,
    min,
    max,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    gameMessageId: gameMessage?.id || null
  });

  return true;
}

async function startGuessWordGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const words = await loadWordList(cfg);
  if (!words.length) return false;

  const rewardExp = Number(cfg?.guessWord?.rewardExp || 150);
  const durationMs = Math.max(60000, Number(cfg?.guessWord?.durationMs || 180000));

  const channel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const target = String(words[randomBetween(0, words.length - 1)] || '').toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const scrambled = shuffleString(target);
  const gameMessage = await channel.send({ embeds: [buildGuessWordEmbed(scrambled, rewardExp, durationMs)] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    await channel.send({ embeds: [buildTimeoutWordEmbed(game.target)] }).catch(() => {});
  }, durationMs);

  activeGames.set(channelId, {
    type: 'guessWord',
    target,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    gameMessageId: gameMessage?.id || null
  });

  return true;
}

async function pickRandomFindBotChannel(guild, requiredRoleId) {
  if (!guild) return null;
  const role = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : null;
  const me = guild.members.me || guild.members.cache.get(guild.client.user.id);

  const channels = guild.channels.cache.filter((channel) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (!channel.viewable) return false;
    if (!channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    if (role && !channel.permissionsFor(role)?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });

  const list = Array.from(channels.values());
  if (list.length === 0) return null;
  return list[randomBetween(0, list.length - 1)];
}

async function startFindBotGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = Math.max(60000, Number(cfg?.findBot?.durationMs || 300000));
  const rewardExp = Number(cfg?.findBot?.rewardExp || 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;

  const mainChannel = getChannelSafe(client, channelId) || await client.channels.fetch(channelId).catch(() => null);
  if (!mainChannel?.guild) return false;

  const targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId);
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await targetChannel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('trova il bot')
      .setStyle(ButtonStyle.Primary)
  );
  const gameMessage = await targetChannel.send({ embeds: [buildFindBotEmbed(durationMs)], components: [row] }).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game || game.customId !== customId) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    if (game.channelId && game.messageId) {
      const ch = mainChannel.guild.channels.cache.get(game.channelId) || await mainChannel.guild.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(game.messageId).catch(() => null);
        if (msg) {
          const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(row.components[0]).setDisabled(true)
          );
          await msg.edit({ components: [disabledRow] }).catch(() => {});
        }
        await ch.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => {});
      }
    }
  }, durationMs);

  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId);

  activeGames.set(channelId, {
    type: 'findBot',
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    customId
  });

  return true;
}

async function hasRecentActivity(channel, windowMs, minMessages) {
  const window = Math.max(60 * 1000, Number(windowMs || 15 * 60 * 1000));
  const threshold = Math.max(1, Number(minMessages || 5));
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return false;
  const now = Date.now();
  let count = 0;
  for (const msg of messages.values()) {
    if (msg.author?.bot) continue;
    if ((now - msg.createdTimestamp) <= window) {
      count += 1;
      if (count >= threshold) return true;
    }
  }
  return false;
}

async function maybeStartRandomGame(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (activeGames.has(cfg.channelId)) return;

  const now = new Date();
  const windowStart = cfg?.timeWindow?.start;
  const windowEnd = cfg?.timeWindow?.end;
  if (!isWithinAllowedWindow(now, windowStart, windowEnd)) return;

  const channel = getChannelSafe(client, cfg.channelId) || await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return;

  const hasActivity = await hasRecentActivity(channel, cfg.activityWindowMs, cfg.minMessages);
  if (!hasActivity) return;

  const pending = pendingGames.get(cfg.channelId);
  const gameType = pending?.type || 'guessNumber';
  if (gameType === 'guessWord') {
    const started = await startGuessWordGame(client, cfg);
    if (started) pendingGames.delete(cfg.channelId);
    return;
  }
  if (gameType === 'findBot') {
    const started = await startFindBotGame(client, cfg);
    if (started) pendingGames.delete(cfg.channelId);
    return;
  }
  const started = await startGuessNumberGame(client, cfg);
  if (started) pendingGames.delete(cfg.channelId);
}

function startMinigameLoop(client) {
  if (loopState.has(client)) return;
  loopState.add(client);

  const tick = async () => {
    const cfg = getConfig(client);
    if (!cfg?.enabled) return;
    if (!pendingGames.has(cfg.channelId)) {
      const available = getAvailableGameTypes(cfg);
      if (available.length === 0) return;
      const type = available[randomBetween(0, available.length - 1)];
      pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    }
    await maybeStartRandomGame(client);
  };

  const cfg = getConfig(client);
  const intervalMs = Math.max(60 * 1000, Number(cfg?.intervalMs || 15 * 60 * 1000));
  tick();
  setInterval(tick, intervalMs);
}

async function awardWinAndReply(message, rewardExp) {
  let nextTotal = Number(rewardExp || 0);
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: message.guild.id, userId: message.author.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  try {
    await addExpWithLevel(message.guild, message.author.id, Number(rewardExp || 0), false);
  } catch {}
  await message.reply({ embeds: [buildWinEmbed(message.author.id, rewardExp, nextTotal)] }).catch(() => {});
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member) {
    await handleExpReward(message.client, member, nextTotal);
  }
}

async function handleMinigameMessage(message, client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  if (message.channelId !== cfg.channelId) return false;

  const game = activeGames.get(cfg.channelId);
  if (!game) return false;

  const content = String(message.content || '').trim();

  if (game.type === 'guessNumber') {
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }

    await message.reply({ embeds: [buildHintEmbed(guess < game.target)] }).catch(() => {});
    return true;
  }

  if (game.type === 'guessWord') {
    if (/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(content) && !/^\d+$/.test(content)) {
      await message.react('<:vegax:1443934876440068179>').catch(() => {});
    } else {
      return false;
    }
    const guess = content.toLowerCase();
    if (guess.length < 5 || guess.length > 6) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  return false;
}

async function handleMinigameButton(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  const game = activeGames.get(cfg.channelId);
  if (!game || game.type !== 'findBot') return false;
  if (interaction.customId !== game.customId) return false;

  clearTimeout(game.timeout);
  if (game.hintTimeout) clearTimeout(game.hintTimeout);
  activeGames.delete(cfg.channelId);

  const rewardExp = game.rewardExp;
  let nextTotal = Number(rewardExp || 0);
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  try {
    await addExpWithLevel(interaction.guild, interaction.user.id, Number(rewardExp || 0), false);
  } catch {}

  const winEmbed = buildWinEmbed(interaction.user.id, rewardExp, nextTotal);
  await interaction.reply({ embeds: [winEmbed] }).catch(() => {});
  const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (member) {
    await handleExpReward(interaction.client, member, nextTotal);
  }

  try {
    const channel = interaction.channel;
    const message = await channel.messages.fetch(game.messageId).catch(() => null);
    if (message) {
      const row = message.components?.[0];
      if (row?.components?.[0]) {
        const disabledRow = new ActionRowBuilder().addComponents(
          ButtonBuilder.from(row.components[0]).setDisabled(true)
        );
        await message.edit({ components: [disabledRow] }).catch(() => {});
      }
    }
  } catch {}

  return true;
}

module.exports = { startMinigameLoop, handleMinigameMessage, handleMinigameButton };
