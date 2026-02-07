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

function decodeHtmlEntities(input) {
  const text = String(input || '');
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'e')
    .replace(/&uuml;/g, 'u')
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

function decodeUrl3986(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch {
    return String(value || '');
  }
}

async function fetchMorningPrompt(cfg, guildId) {
  const token = await getOpenTdbToken(cfg, guildId).catch(() => null);
  const params = new URLSearchParams({
    amount: '1',
    category: String(cfg?.category || 9), // General Knowledge
    type: 'multiple',
    encode: 'url3986'
  });
  if (token) params.set('token', token);
  const apiUrl = cfg?.apiUrl || 'https://opentdb.com/api.php';
  const res = await axios.get(`${apiUrl}?${params.toString()}`, {
    timeout: 15000,
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
  });
  const results = Array.isArray(res?.data?.results) ? res.data.results : [];
  const first = results[0];
  const rawQuestion = decodeHtmlEntities(decodeUrl3986(first?.question || '')).trim();
  if (!rawQuestion) return null;
  const italianAdvice = await translateToItalian(cfg, rawQuestion).catch(() => null);
  if (!italianAdvice) return null;
  const cleaned = decodeHtmlEntities(italianAdvice).replace(/[.!?]+$/g, '').trim();
  if (!cleaned) return null;
  return `Buongiorno! Appena sveglio/a, cosa risponderesti a questa domanda: "${cleaned}"?`;
}

async function getOpenTdbToken(cfg, guildId) {
  if (!guildId) return null;
  const tokenUrl = cfg?.tokenUrl || 'https://opentdb.com/api_token.php?command=request';
  const tokenUrlBase = cfg?.tokenUrlBase || 'https://opentdb.com/api_token.php';
  const state = await MorningReminderState.findOne({ guildId }).lean();
  const existingToken = state?.sessionToken || null;
  if (existingToken) {
    const reset = await axios.get(`${tokenUrlBase}?command=reset&token=${existingToken}`, { timeout: 10000 }).catch(() => null);
    if (reset?.data?.response_code === 0) return existingToken;
  }
  const res = await axios.get(tokenUrl, { timeout: 10000 });
  const token = String(res?.data?.token || '').trim();
  if (!token) return null;
  await MorningReminderState.updateOne(
    { guildId },
    { $set: { sessionToken: token } },
    { upsert: true }
  );
  return token;
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
  const maxAttempts = Number.isInteger(cfg.maxAttempts) ? cfg.maxAttempts : 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prompt = await fetchMorningPrompt(cfg, guildId).catch(() => null);
    if (!prompt) continue;
    const key = prompt.trim().toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    state.usedQuestions = Array.from(used).slice(-200);
    await MorningReminderState.updateOne(
      { guildId },
      {
        $set: {
          usedQuestions: state.usedQuestions
        }
      }
    );
    return prompt;
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
  await MorningReminderState.updateOne(
    { guildId: channel.guild.id },
    {
      $set: {
        lastSentAt: new Date(),
        lastSentDate: today
      }
    }
  );
}

module.exports = { maybeRunMorningReminder };
