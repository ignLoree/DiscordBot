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

async function fetchMorningPrompt(cfg) {
  const apiUrl = cfg?.apiUrl || 'https://api.adviceslip.com/advice';
  const res = await axios.get(apiUrl, {
    timeout: 15000,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
  const rawAdvice = String(res?.data?.slip?.advice || '').trim();
  if (!rawAdvice) return null;

  const italianAdvice = await translateToItalian(cfg, decodeUrl3986(rawAdvice)).catch(() => null);
  if (!italianAdvice) return null;

  const cleaned = italianAdvice.replace(/[.!?]+$/g, '').trim();
  if (!cleaned) return null;
  return `Appena sveglio/a, su quale aspetto vuoi concentrarti oggi partendo da questo spunto: "${cleaned}"?`;
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
    const prompt = await fetchMorningPrompt(cfg).catch(() => null);
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
