const CONFIG = require('../../config');
const { MorningReminderState } = require('../../Schemas/Community/morningReminderSchema');
const axios = require('axios');

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function getState(guildId) {
  return MorningReminderState.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}

function decodeUrl3986(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch {
    return String(value || '');
  }
}

async function getTriviaToken(cfg) {
  const tokenUrl = cfg?.tokenUrl || 'https://opentdb.com/api_token.php?command=request';
  const res = await axios.get(tokenUrl, { timeout: 15000 });
  const token = res?.data?.token;
  return token || null;
}

async function resetTriviaToken(cfg, token) {
  if (!token) return null;
  const base = cfg?.tokenUrlBase || 'https://opentdb.com/api_token.php';
  const url = `${base}?command=reset&token=${encodeURIComponent(token)}`;
  const res = await axios.get(url, { timeout: 15000 }).catch(() => null);
  const nextToken = res?.data?.token || token;
  return nextToken;
}

async function fetchTriviaQuestion(cfg, token) {
  const baseUrl = cfg?.apiUrl || 'https://opentdb.com/api.php';
  const params = new URLSearchParams({
    amount: '1',
    type: 'multiple',
    encode: 'url3986'
  });
  if (token) params.set('token', token);
  const url = `${baseUrl}?${params.toString()}`;
  const res = await axios.get(url, { timeout: 15000 });
  return res?.data || null;
}

async function translateToItalian(cfg, text) {
  const translateUrl = cfg?.translateApiUrl || 'https://api.mymemory.translated.net/get';
  const params = new URLSearchParams({
    q: text,
    langpair: 'en|it'
  });
  const url = `${translateUrl}?${params.toString()}`;
  const res = await axios.get(url, { timeout: 15000 });
  const translated = res?.data?.responseData?.translatedText;
  return translated || null;
}

async function pickQuestion(guildId) {
  const cfg = CONFIG.morningReminder || {};
  const state = await getState(guildId);
  const used = new Set(state.usedQuestions || []);
  let token = state.sessionToken;

  if (!token) {
    token = await getTriviaToken(cfg);
    if (!token) return null;
    state.sessionToken = token;
    await state.save();
  }

  const maxAttempts = Number.isInteger(cfg.maxAttempts) ? cfg.maxAttempts : 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const data = await fetchTriviaQuestion(cfg, token).catch(() => null);
    const responseCode = Number(data?.response_code);
    if (responseCode === 3) {
      token = await getTriviaToken(cfg);
      if (!token) return null;
      state.sessionToken = token;
      await state.save();
      continue;
    }
    if (responseCode === 4) {
      token = await resetTriviaToken(cfg, token);
      state.sessionToken = token;
      await state.save();
      continue;
    }
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    if (!result?.question) continue;
    const englishQuestion = decodeUrl3986(result.question);
    const italianQuestion = await translateToItalian(cfg, englishQuestion).catch(() => null);
    if (!italianQuestion) continue;
    const key = italianQuestion.trim().toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    state.usedQuestions = Array.from(used).slice(-200);
    state.sessionToken = token;
    await state.save();
    return italianQuestion;
  }
  return null;
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
  if (!question) return;
  await channel.send({
    content: `<:VC_PepeWave:1331589315175907412> ${tag} Buongiorno a tutti!\n${question}`
  });
  state.lastSentAt = new Date();
  state.lastSentDate = today;
  await state.save();
}

module.exports = { maybeRunMorningReminder };
