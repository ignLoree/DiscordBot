const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../config');
const { EngagementState } = require('../../Schemas/Engagement/engagementState');
const { addCurrency } = require('./economyService');
const { addWin } = require('./engagementStatsService');
let cachedItems = null;

function loadItems() {
  if (cachedItems) return cachedItems;
  const filePath = path.join(__dirname, '..', '..', 'Data', 'engagements.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const clean = raw.replace(/^\uFEFF/, '');
  cachedItems = JSON.parse(clean);
  return cachedItems;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function getState(guildId) {
  return EngagementState.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}

async function pickItem(guildId, type = null, types = null) {
  const state = await getState(guildId);
  const items = loadItems().filter(i => {
    if (type) return i.type === type;
    if (Array.isArray(types) && types.length) return types.includes(i.type);
    return true;
  });
  const used = new Set(state.usedItemIds || []);
  if (state.lastResetDate !== todayKey()) {
    state.usedItemIds = [];
    state.lastResetDate = todayKey();
    await state.save();
  }
  let available = items.filter(i => !used.has(i.id));
  if (available.length === 0) {
    if (type || (Array.isArray(types) && types.length)) {
      state.usedItemIds = state.usedItemIds.filter(id => !items.some(i => i.id === id));
    } else {
      state.usedItemIds = [];
    }
    await state.save();
    available = items;
  }
  const selected = available[Math.floor(Math.random() * available.length)];
  state.usedItemIds.push(selected.id);
  await state.save();
  return selected;
}

function withinActiveWindow(now = new Date()) {
  const { startHour, endHour } = CONFIG.engagement;
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

function withinHourRange(startHour, endHour, now = new Date()) {
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

function isQuizLoopChannel(channel) {
  const cfg = CONFIG.engagementQuizLoop || {};
  return cfg.enabled && channel && channel.id === cfg.channelId;
}

async function maybeRunEngagement(client) {
  const { channelId, intervalMinutes } = CONFIG.engagement;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;
  const state = await getState(channel.guild.id);
  const now = new Date();
  const lastRun = state.lastRunAt ? new Date(state.lastRunAt) : null;
  const minMs = intervalMinutes * 60 * 1000;
  if (!withinActiveWindow(now)) return;
  if (lastRun && now - lastRun < minMs) return;
  if (!(await hasRecentActivity(channel))) return;
  await runEngagement(client, channel);
  state.lastRunAt = new Date();
  await state.save();
}

async function forceRunEngagement(client, { ignoreWindow = false, type = null, ping = true, channelId = null, pingRoleId = null } = {}) {
  const selectedChannelId = channelId || CONFIG.engagement.channelId;
  const channel = client.channels.cache.get(selectedChannelId);
  if (!channel) return false;
  if (!ignoreWindow && !withinActiveWindow(new Date())) return false;
  await runEngagement(client, channel, { type, ping, pingRoleId });
  return true;
}

async function maybeRunQuizLoop(client) {
  return;
}


function buildTagLine(ping = true, pingRoleId = null, type = null) {
  const roleId =
    pingRoleId ||
    CONFIG.engagement.roleId;
  if (!ping) return '';
  return roleId ? `<@&${roleId}>` : '';
}

function getRewardsForType(type) {
  const rewards = CONFIG.engagement.rewards || {};
  return rewards[type] || { coffee: 1, vinyl: 0 };
}

async function runEngagement(client, channel, { type = null, ping = true, rewardsOverride = null, types = null, pingRoleId = null } = {}) {
  if (!client.engagementSessions) client.engagementSessions = new Map();
  if (client.engagementSessions.has(channel.id)) return;
  const item = await pickItem(channel.guild.id, type, types);
  if (!item) return;
  const tag = buildTagLine(ping, pingRoleId, item.type);
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const loopCfg = CONFIG.engagementQuizLoop || {};
  const useLoopRewards = loopCfg.enabled && channel.id === loopCfg.channelId && item.type === 'quiz' && loopCfg.rewards;
  const rewards = rewardsOverride || (useLoopRewards ? loopCfg.rewards : getRewardsForType(item.type));
  if (item.type === 'quiz' || item.type === 'scramble') {
    const labels = ['A', 'B', 'C', 'D'];
    const buttons = item.options.slice(0, 4).map((opt, idx) =>
      new ButtonBuilder()
        .setCustomId(`engage_answer:${sessionId}:${idx}`)
        .setLabel(`${labels[idx]}: ${opt}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    );
    const row = new ActionRowBuilder().addComponents(buttons);
    const content =
      `${tag}\n` +
      `${item.type === 'quiz' ? '⚡ Quiz lampo' : '👻 Parola misteriosa'}\n` +
      `${item.question ? `❓ Domanda: ${item.question}` : `🧩 Indizio: ${item.prompt}`}\n` +
      item.options.map((o, i) => `${labels[i]}) ${o}`).join('\n');
    const msg = await channel.send({ content, components: [row] });
    const timeout = setTimeout(async () => {
      const active = client.engagementSessions.get(channel.id);
      if (!active || active.sessionId !== sessionId || active.ended) return;
      active.ended = true;
      client.engagementSessions.delete(channel.id);
      try {
        const disabled = [row].map(r => {
          const newRow = ActionRowBuilder.from(r);
          newRow.components = newRow.components.map(b => ButtonBuilder.from(b).setDisabled(true));
          return newRow;
        });
        await msg.edit({ content: `${content}\n\n⌛ Tempo scaduto.`, components: disabled });
      } catch { }
    }, 60 * 1000);
    client.engagementSessions.set(channel.id, {
      sessionId,
      type: item.type,
      correctIndex: item.answerIndex,
      channelId: channel.id,
      messageId: msg.id,
      rewards,
      ended: false,
      timeout
    });
    return;
  }
  if (item.type === 'flag') {
    const tag = buildTagLine(ping, pingRoleId, item.type);
    const imageUrl = normalizeImageUrl(item.image);
    const embed = new EmbedBuilder()
      .setTitle('🌍 Indovina la bandiera!')
      .setDescription('🗺️ Indovina il nome della nazione rappresentata dalla bandiera! Scrivi il nome completo in chat.')
      .setFooter({ text: '⌛ Hai 2 minuti per rispondere.' });
    if (imageUrl) embed.setImage(imageUrl);
    await channel.send({ content: tag, embeds: [embed] });
    const collector = channel.createMessageCollector({
      time: 2 * 60 * 1000,
      filter: m => !m.author.bot && m.content
    });
    client.engagementSessions.set(channel.id, {
      sessionId,
      type: item.type,
      ended: false
    });
    const answers = [item.answer, ...(item.aliases || [])].filter(Boolean).map(normalizeText);
    let winner = null;
    collector.on('collect', m => {
      const guess = normalizeText(m.content);
      if (answers.includes(guess)) {
        m.react('<:vegacheckmark:1443666279058772028>').catch(() => {});
        winner = m;
        collector.stop('winner');
        return;
      }
      m.react('<:vegax:1443934876440068179>').catch(() => {});
    });
    collector.on('end', async () => {
      client.engagementSessions.delete(channel.id);
      if (!winner) {
        await channel.send(`<:vegax:1443934876440068179> Sfida conclusa: nessun vincitore. Risposta corretta: ${item.answer}.`);
        if (isQuizLoopChannel(channel)) {
          await startQuizLoopNext(client, channel);
        }
        return;
      }
      await awardWinner(channel.guild.id, winner.author.id, rewards, item.type, channel);
      if (isQuizLoopChannel(channel)) {
        await startQuizLoopNext(client, channel);
      }
    });
  }
  if (item.type === 'player') {
    const tag = buildTagLine(ping, pingRoleId, item.type);
    const imageUrl = normalizeImageUrl(item.image);
    const embed = new EmbedBuilder()
      .setTitle('⚽ Indovina il calciatore!')
      .setDescription(`❓ ${item.prompt} Scrivi il nome completo in chat.`)
      .setFooter({ text: '⌛ Hai 2 minuti per rispondere.' });
    if (imageUrl) embed.setImage(imageUrl);
    await channel.send({ content: tag, embeds: [embed] });
    const collector = channel.createMessageCollector({
      time: 2 * 60 * 1000,
      filter: m => !m.author.bot && m.content
    });
    client.engagementSessions.set(channel.id, {
      sessionId,
      type: item.type,
      ended: false
    });
    const answers = [item.answer, ...(item.aliases || [])].filter(Boolean).map(normalizeText);
    let winner = null;
    collector.on('collect', m => {
      const guess = normalizeText(m.content);
      if (answers.includes(guess)) {
        m.react('<:vegacheckmark:1443666279058772028>').catch(() => {});
        winner = m;
        collector.stop('winner');
        return;
      }
      m.react('<:vegax:1443934876440068179>').catch(() => {});
    });
    collector.on('end', async () => {
      client.engagementSessions.delete(channel.id);
      if (!winner) {
        await channel.send(`<:vegax:1443934876440068179> Sfida conclusa: nessun vincitore. Risposta corretta: ${item.answer}.`);
        if (isQuizLoopChannel(channel)) {
          await startQuizLoopNext(client, channel);
        }
        return;
      }
      await awardWinner(channel.guild.id, winner.author.id, rewards, item.type, channel);
      if (isQuizLoopChannel(channel)) {
        await startQuizLoopNext(client, channel);
      }
    });
  }
}

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let value = url.trim();
  if (!value) return null;
  try {
    value = encodeURI(value);
    const parsed = new URL(value);
    if (parsed.hostname === 'upload.wikimedia.org' && !parsed.pathname.includes('/thumb/')) {
      const parts = parsed.pathname.split('/');
      const filename = parts[parts.length - 1];
      if (filename && filename.includes('.')) {
        const basePath = parts.slice(0, -1).join('/');
        const thumbPath = `${basePath}/thumb/${filename}/640px-${filename}`;
        parsed.pathname = thumbPath;
        return parsed.toString();
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function awardWinner(guildId, userId, rewards, type, channel) {
  await addCurrency({
    guildId,
    userId,
    coffee: rewards.coffee || 0,
    vinyl: rewards.vinyl || 0
  });
  await addWin({ guildId, userId, type });
  const parts = [];
  if (rewards.coffee) parts.push(`+${rewards.coffee} ☕ Caffè`);
  if (rewards.vinyl) parts.push(`+${rewards.vinyl} 📀 Vinili`);
  await channel.send({
    content: `<a:VC_Winner:1448687700235256009> Vincitore: <@${userId}> ${parts.length ? `(${parts.join(', ')})` : ''}`
  });
}

async function hasRecentActivity(channel) {
  const windowMin = CONFIG.engagement.recentWindowMinutes || 30;
  const minMessages = CONFIG.engagement.minRecentMessages || 5;
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    const cutoff = Date.now() - windowMin * 60 * 1000;
    let count = 0;
    for (const msg of messages.values()) {
      if (msg.createdTimestamp < cutoff) continue;
      if (msg.author?.bot) continue;
      count += 1;
    }
    return count >= minMessages;
  } catch {
    return false;
  }
}

async function startQuizLoopNext(client, channel) {
  return;
}


module.exports = { maybeRunEngagement, forceRunEngagement, maybeRunQuizLoop, startQuizLoopNext, hasRecentActivity };