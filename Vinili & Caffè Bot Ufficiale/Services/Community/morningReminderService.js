const fs = require('fs');
const path = require('path');
const CONFIG = require('../../config');
const { MorningReminderState } = require('../../Schemas/Community/morningReminderSchema');
let cachedQuestions = null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadQuestions() {
  if (cachedQuestions) return cachedQuestions;
  const cfg = CONFIG.morningReminder || {};
  const filePath = cfg.questionsFile
    ? path.join(__dirname, '..', '..', cfg.questionsFile)
    : path.join(__dirname, '..', '..', 'Data', 'morningQuestions.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const items = JSON.parse(raw);
  cachedQuestions = Array.isArray(items) ? items : [];
  return cachedQuestions;
}
async function getState(guildId) {
  return MorningReminderState.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}
async function pickQuestion(guildId) {
  const items = loadQuestions();
  if (!items.length) return 'Cosa ti rende orgoglioso di questa settimana?';
  const state = await getState(guildId);
  const used = new Set(state.usedQuestionIndexes || []);
  let available = items.map((_, idx) => idx).filter(idx => !used.has(idx));
  if (available.length === 0) {
    state.usedQuestionIndexes = [];
    await state.save();
    available = items.map((_, idx) => idx);
  }
  const selectedIndex = available[Math.floor(Math.random() * available.length)];
  state.usedQuestionIndexes.push(selectedIndex);
  await state.save();
  return items[selectedIndex];
}
function getTargetTime(now, hour, minute) {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  return target;
}
async function maybeRunMorningReminder(client) {
  const cfg = CONFIG.morningReminder || {};
  if (!cfg.enabled) return;
  const channelId = cfg.channelId;
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const now = new Date();
  const targetHour = Number.isInteger(cfg.hour) ? cfg.hour : 8;
  const targetMinute = Number.isInteger(cfg.minute) ? cfg.minute : 15;
  const target = getTargetTime(now, targetHour, targetMinute);
  const state = await getState(channel.guild.id);
  const today = todayKey();
  if (state.lastSentDate === today) return;
  if (now < target) return;
  const roleId = cfg.roleId;
  const tag = roleId ? `<@&${roleId}>` : '';
  const question = await pickQuestion(channel.guild.id);
  await channel.send({
    content: `<:VC_PepeWave:1331589315175907412> ${tag} Buongiorno a tutti!\n${question}`
  });
  state.lastSentAt = new Date();
  state.lastSentDate = today;
  await state.save();
}

module.exports = { maybeRunMorningReminder };
