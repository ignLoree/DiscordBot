const axios = require('axios');
const { AiExchange, AiKnowledge, AiActionRequest } = require('../../Schemas/AI/aiChatSchemas');
const IDs = require('../../Utils/Config/ids');

const AI_CHAT_CHANNEL_ID = String(process.env.AI_CHAT_CHANNEL_ID || '1471108621629784104');
const AI_MENTION_CHAT_CHANNEL_ID = String(process.env.AI_MENTION_CHAT_CHANNEL_ID || '1442569130573303898');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_IMAGES_URL = process.env.OPENAI_IMAGES_URL || 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
const AI_TEXT_DAILY_LIMIT = Math.max(1, Number(process.env.AI_TEXT_DAILY_LIMIT || 80));
const AI_IMAGE_DAILY_LIMIT = Math.max(1, Number(process.env.AI_IMAGE_DAILY_LIMIT || 12));
const AI_TEXT_COOLDOWN_MS = Math.max(0, Number(process.env.AI_TEXT_COOLDOWN_MS || 12000));
const AI_IMAGE_COOLDOWN_MS = Math.max(0, Number(process.env.AI_IMAGE_COOLDOWN_MS || 30000));
const AI_OWNER_USER_ID = String(
  process.env.AI_OWNER_USER_ID
  || process.env.BOT_OWNER_ID
  || process.env.OWNER_ID
  || ''
);
const aiBudgetState = new Map();

function normalizeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .slice(0, 40);
}

function toLimitedText(value, max = 1500) {
  return String(value || '').trim().slice(0, max);
}

function extractKnowledgeItems(content) {
  const text = String(content || '').trim();
  if (!text) return [];
  const items = [];

  const patterns = [
    /(?:ricorda|salva|annota)\s+che\s+(.{2,120}?)\s*(?:=|:)\s*(.{2,600})$/i,
    /(?:remember|save)\s+that\s+(.{2,120}?)\s*(?:=|:)\s*(.{2,600})$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const key = toLimitedText(match[1], 120).toLowerCase();
    const value = toLimitedText(match[2], 600);
    if (key && value) items.push({ key, value });
  }

  return items;
}

function extractActionRequest(content) {
  const text = String(content || '').trim();
  if (!text) return null;
  const patterns = [
    /(?:vorrei che il bot|il bot dovrebbe|aggiungi comando|aggiungi funzione|deve fare)\s+(.{4,700})$/i,
    /(?:i want the bot to|the bot should|add command|add feature)\s+(.{4,700})$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const description = toLimitedText(match[1], 700);
    if (description) return description;
  }
  return null;
}

function detectSensitiveActionIntent(content) {
  const text = String(content || '').toLowerCase().trim();
  if (!text) return null;

  const moderationPatterns = [
    /\bban(nare|na|)\b/i,
    /\bkick(are|)\b/i,
    /\btimeout\b/i,
    /\bmute\b/i,
    /\bwarn\b/i,
    /\bsanzion/i,
    /\bdepex/i,
    /\bpromuov/i
  ];
  if (moderationPatterns.some((pattern) => pattern.test(text))) return 'moderation';

  const adminPatterns = [
    /\b(aggiungi|crea|fai)\s+(un\s+)?comando\b/i,
    /\badd\s+(a\s+)?command\b/i,
    /\bdelete\s+channel\b/i,
    /\bcancella\s+canale\b/i,
    /\bassegna\s+ruolo\b/i,
    /\bgive\s+role\b/i,
    /\bmodifica\s+permess/i
  ];
  if (adminPatterns.some((pattern) => pattern.test(text))) return 'admin';

  return null;
}

function canRequestSensitiveActions(message) {
  const userId = String(message?.author?.id || '');
  if (!userId) return false;
  if (AI_OWNER_USER_ID) return userId === AI_OWNER_USER_ID;
  const guildOwnerId = String(message?.guild?.ownerId || '');
  if (guildOwnerId) return userId === guildOwnerId;
  const ownerRoleId = String(IDs?.roles?.owner || '');
  if (ownerRoleId) return Boolean(message?.member?.roles?.cache?.has(ownerRoleId));
  return false;
}

function getSensitiveActionDenyMessage(intentType) {
  if (intentType === 'moderation') {
    return 'Non posso gestire azioni di moderazione: queste richieste sono abilitate solo per l owner del bot.';
  }
  return 'Non posso creare o modificare comandi/funzioni: questa azione e riservata solo all owner del bot.';
}

function getUtcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function canBypassAiBudget(message) {
  return canRequestSensitiveActions(message);
}

function getAiBudgetEntry(userId, now = Date.now()) {
  const key = String(userId || '');
  const dayKey = getUtcDayKey(now);
  const current = aiBudgetState.get(key);
  if (!current || current.dayKey !== dayKey) {
    const fresh = {
      dayKey,
      textCount: 0,
      imageCount: 0,
      lastTextAt: 0,
      lastImageAt: 0
    };
    aiBudgetState.set(key, fresh);
    return fresh;
  }
  return current;
}

function consumeAiBudget(userId, kind, now = Date.now()) {
  const entry = getAiBudgetEntry(userId, now);
  if (kind === 'image') {
    entry.imageCount += 1;
    entry.lastImageAt = now;
    return;
  }
  entry.textCount += 1;
  entry.lastTextAt = now;
}

function checkAiBudget(userId, kind, now = Date.now()) {
  const entry = getAiBudgetEntry(userId, now);
  const cooldownMs = kind === 'image' ? AI_IMAGE_COOLDOWN_MS : AI_TEXT_COOLDOWN_MS;
  const dailyLimit = kind === 'image' ? AI_IMAGE_DAILY_LIMIT : AI_TEXT_DAILY_LIMIT;
  const lastAt = kind === 'image' ? entry.lastImageAt : entry.lastTextAt;
  const used = kind === 'image' ? entry.imageCount : entry.textCount;

  if (cooldownMs > 0 && lastAt > 0 && now - lastAt < cooldownMs) {
    return {
      ok: false,
      reason: 'cooldown',
      waitSeconds: Math.ceil((cooldownMs - (now - lastAt)) / 1000)
    };
  }
  if (used >= dailyLimit) {
    return {
      ok: false,
      reason: 'daily_limit',
      used,
      dailyLimit
    };
  }
  return { ok: true };
}

function getAiBudgetDenyMessage(kind, budgetCheck) {
  if (budgetCheck?.reason === 'cooldown') {
    const seconds = Math.max(1, Number(budgetCheck.waitSeconds || 1));
    return `Aspetta ancora ${seconds}s prima della prossima richiesta ${kind === 'image' ? 'immagine' : 'AI'}.`;
  }
  if (budgetCheck?.reason === 'daily_limit') {
    return `Hai raggiunto il limite giornaliero per ${kind === 'image' ? 'le immagini' : 'le risposte AI'} (${budgetCheck.used}/${budgetCheck.dailyLimit}).`;
  }
  return 'Richiesta AI non disponibile in questo momento.';
}

function hasBotMention(message) {
  const botId = String(message?.client?.user?.id || '');
  if (!botId) return false;
  const mentionRegex = new RegExp(`<@!?${botId}>`);
  return mentionRegex.test(String(message?.content || ''));
}

function detectMood(messageText) {
  const text = String(messageText || '').toLowerCase();
  const spicy = [
    'cazzo', 'stronzo', 'porco', 'vaffanculo', 'idiota', 'merda',
    'incazz', 'bastardo', 'coglione', 'scemo', 'troia'
  ];
  if (spicy.some((word) => text.includes(word))) return 'angry-funny';
  return 'friendly-funny';
}

function stripBotMentions(text) {
  return String(text || '').replace(/<@!?\d+>/g, '').trim();
}

function detectImageRequestPrompt(content) {
  const text = stripBotMentions(String(content || '')).trim();
  if (!text) return null;

  const patterns = [
    /^\/?img(?:agine)?\s+(.{3,1200})$/i,
    /^\/?image\s+(.{3,1200})$/i,
    /(?:genera|crea|fammi|generate|create|draw)\s+(?:una?\s+)?(?:immagine|image|foto|art)\s*[:\-]?\s*(.{3,1200})$/i,
    /(?:immagine|image)\s*[:\-]\s*(.{3,1200})$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const prompt = toLimitedText(match[1], 1200);
    if (prompt) return prompt;
  }

  return null;
}

async function persistKnowledge(guildId, userId, knowledgeItems) {
  if (!guildId || !Array.isArray(knowledgeItems) || !knowledgeItems.length) return;
  for (const item of knowledgeItems) {
    await AiKnowledge.findOneAndUpdate(
      { guildId, key: item.key },
      {
        $set: { value: item.value, sourceUserId: userId || '' },
        $inc: { updates: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null);
  }
}

async function persistActionRequest(guildId, channelId, userId, description) {
  if (!guildId || !channelId || !userId || !description) return;
  await AiActionRequest.create({
    guildId,
    channelId,
    userId,
    description: toLimitedText(description, 700),
    status: 'open'
  }).catch(() => null);
}

function getOverlapScore(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of tokensA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap;
}

async function findLocalFallbackReply(guildId, channelId, userMessage) {
  const tokens = normalizeTokens(userMessage);
  const docs = await AiExchange.find({ guildId, channelId })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean()
    .catch(() => []);
  if (!docs.length) return null;

  let best = null;
  let bestScore = 0;
  for (const doc of docs) {
    const score = getOverlapScore(tokens, Array.isArray(doc.tokens) ? doc.tokens : normalizeTokens(doc.userMessage));
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }
  if (!best || bestScore < 2) return null;
  return `In base a conversazioni precedenti: ${String(best.botReply || '').slice(0, 1400)}`;
}

async function buildContext(guildId, channelId) {
  const [recentExchanges, knowledgeRows, openActions] = await Promise.all([
    AiExchange.find({ guildId, channelId })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean()
      .catch(() => []),
    AiKnowledge.find({ guildId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean()
      .catch(() => []),
    AiActionRequest.find({ guildId, status: 'open' })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean()
      .catch(() => [])
  ]);

  const memoryText = recentExchanges
    .reverse()
    .map((row) => `Utente: ${String(row.userMessage || '').slice(0, 280)}\nBot: ${String(row.botReply || '').slice(0, 280)}`)
    .join('\n\n');

  const knowledgeText = knowledgeRows
    .map((row) => `- ${row.key}: ${String(row.value || '').slice(0, 220)}`)
    .join('\n');

  const actionsText = openActions
    .map((row) => `- ${String(row.description || '').slice(0, 220)}`)
    .join('\n');

  return {
    memoryText,
    knowledgeText,
    actionsText
  };
}

async function generateAiReply(guildName, userTag, userMessage, context) {
  if (!OPENAI_API_KEY) return null;

  const systemPrompt = [
    'Sei un assistente Discord italiano, utile e concreto.',
    'Rispondi in modo breve, chiaro e naturale.',
    'Usa la memoria/knowledge solo se pertinente alla domanda corrente.',
    'Se l\'utente chiede automazioni o funzioni bot, proponi istruzioni pratiche.',
    'Non inventare fatti non presenti nel contesto.'
  ].join(' ');

  const userPrompt = [
    `Server: ${guildName}`,
    `Utente: ${userTag}`,
    '',
    'Memoria recente:',
    context.memoryText || '(vuota)',
    '',
    'Knowledge salvata:',
    context.knowledgeText || '(vuota)',
    '',
    'Richieste funzione bot aperte:',
    context.actionsText || '(vuote)',
    '',
    'Messaggio utente:',
    userMessage
  ].join('\n');

  const response = await axios.post(
    OPENAI_URL,
    {
      model: OPENAI_MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    },
    {
      timeout: 22000,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  ).catch(() => null);

  const text = response?.data?.choices?.[0]?.message?.content;
  return toLimitedText(text || '', 1800) || null;
}

async function generateMentionReply(guildName, userTag, userMessage, context, mood) {
  if (!OPENAI_API_KEY) return null;

  const style =
    mood === 'angry-funny'
      ? 'Rispondi in tono ironico/incazzato ma senza minacce reali, senza odio, breve e divertente.'
      : 'Rispondi in tono conviviale, simpatico e naturale, breve.';

  const systemPrompt = [
    'Sei il bot del server Discord, personalità viva e umoristica.',
    style,
    'Non fare wall of text, resta sotto 5 righe.',
    'Puoi fare battute ma evita contenuti pericolosi o discriminatori.'
  ].join(' ');

  const userPrompt = [
    `Server: ${guildName}`,
    `Utente: ${userTag}`,
    '',
    'Memoria recente:',
    context.memoryText || '(vuota)',
    '',
    'Knowledge salvata:',
    context.knowledgeText || '(vuota)',
    '',
    'Messaggio utente:',
    userMessage
  ].join('\n');

  const response = await axios.post(
    OPENAI_URL,
    {
      model: OPENAI_MODEL,
      temperature: mood === 'angry-funny' ? 0.9 : 0.75,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    },
    {
      timeout: 18000,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  ).catch(() => null);

  const text = response?.data?.choices?.[0]?.message?.content;
  return toLimitedText(text || '', 700) || null;
}

async function generateAiImage(prompt) {
  if (!OPENAI_API_KEY) return null;
  const normalizedPrompt = toLimitedText(prompt, 1200);
  if (!normalizedPrompt) return null;

  const response = await axios.post(
    OPENAI_IMAGES_URL,
    {
      model: OPENAI_IMAGE_MODEL,
      prompt: normalizedPrompt,
      size: OPENAI_IMAGE_SIZE
    },
    {
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  ).catch(() => null);

  const url = response?.data?.data?.[0]?.url;
  if (typeof url === 'string' && url.trim()) return url.trim();
  return null;
}

function localMentionFallback(mood) {
  const friendly = [
    'Eccomi, presente. Che facciamo di bello?',
    'Sono qui, dimmi tutto e vediamo di combinare qualcosa.',
    'Sempre operativo. Spara pure la tua idea.'
  ];
  const angryFunny = [
    'Oh piano, che oggi ho pazienza in modalità risparmio.',
    'Mi hai chiamato male ma rispondo lo stesso. Che vuoi fare?',
    'Ok, sfogati pure. Poi però lavoriamo seriamente.'
  ];
  const list = mood === 'angry-funny' ? angryFunny : friendly;
  return list[Math.floor(Math.random() * list.length)];
}

async function handleAiChatMessage(message) {
  if (!message?.guild || !message?.channel || !message?.author) return false;
  if (message.author.bot) return false;
  if (String(message.channel.id) !== AI_CHAT_CHANNEL_ID) return false;

  const userMessage = toLimitedText(
    message.content && message.content.trim()
      ? message.content
      : `[Messaggio senza testo, allegati: ${Number(message.attachments?.size || 0)}]`,
    1800
  );
  if (!userMessage) return false;

  const guildId = String(message.guild.id);
  const channelId = String(message.channel.id);
  const userId = String(message.author.id);
  const sensitiveIntent = detectSensitiveActionIntent(userMessage);
  const isAllowedSensitive = canRequestSensitiveActions(message);
  const isBudgetBypass = canBypassAiBudget(message);
  const imagePrompt = detectImageRequestPrompt(userMessage);

  if (sensitiveIntent && !isAllowedSensitive) {
    const denyText = getSensitiveActionDenyMessage(sensitiveIntent);
    await message.reply({
      content: denyText,
      allowedMentions: { repliedUser: false }
    }).catch(() => null);
    await AiExchange.create({
      guildId,
      channelId,
      userId,
      username: String(message.author.tag || message.author.username || ''),
      userMessage,
      botReply: denyText,
      tokens: normalizeTokens(userMessage)
    }).catch(() => null);
    return true;
  }

  if (imagePrompt) {
    if (!isBudgetBypass) {
      const budget = checkAiBudget(userId, 'image');
      if (!budget.ok) {
        await message.reply({
          content: getAiBudgetDenyMessage('image', budget),
          allowedMentions: { repliedUser: false }
        }).catch(() => null);
        return true;
      }
      consumeAiBudget(userId, 'image');
    }

    const imageUrl = await generateAiImage(imagePrompt);
    const imageReply = imageUrl
      ? `Ecco l'immagine: ${imageUrl}`
      : 'Non riesco a generare l immagine in questo momento. Riprova tra poco.';

    await message.reply({
      content: imageReply,
      allowedMentions: { repliedUser: false }
    }).catch(() => null);

    await AiExchange.create({
      guildId,
      channelId,
      userId,
      username: String(message.author.tag || message.author.username || ''),
      userMessage,
      botReply: toLimitedText(imageReply, 1800),
      tokens: normalizeTokens(userMessage)
    }).catch(() => null);
    return true;
  }

  if (!isBudgetBypass) {
    const budget = checkAiBudget(userId, 'text');
    if (!budget.ok) {
      await message.reply({
        content: getAiBudgetDenyMessage('text', budget),
        allowedMentions: { repliedUser: false }
      }).catch(() => null);
      return true;
    }
    consumeAiBudget(userId, 'text');
  }

  const knowledgeItems = extractKnowledgeItems(userMessage);
  const actionRequest = isAllowedSensitive ? extractActionRequest(userMessage) : null;

  await Promise.all([
    persistKnowledge(guildId, userId, knowledgeItems),
    persistActionRequest(guildId, channelId, userId, actionRequest)
  ]);

  const context = await buildContext(guildId, channelId);
  let replyText = await generateAiReply(
    message.guild?.name || 'Server',
    message.author?.tag || userId,
    userMessage,
    context
  );

  if (!replyText) {
    const fallback = await findLocalFallbackReply(guildId, channelId, userMessage);
    replyText = fallback || 'Messaggio ricevuto. Ho salvato questa informazione nella memoria del canale.';
  }

  const sent = await message.reply({
    content: replyText,
    allowedMentions: { repliedUser: false }
  }).catch(() => null);

  await AiExchange.create({
    guildId,
    channelId,
    userId,
    username: String(message.author.tag || message.author.username || ''),
    userMessage,
    botReply: toLimitedText(replyText, 1800),
    tokens: normalizeTokens(userMessage)
  }).catch(() => null);

  return Boolean(sent);
}

async function handleAiMentionChatMessage(message) {
  if (!message?.guild || !message?.channel || !message?.author) return false;
  if (message.author.bot) return false;
  if (String(message.channel.id) !== AI_MENTION_CHAT_CHANNEL_ID) return false;
  if (!hasBotMention(message)) return false;

  const guildId = String(message.guild.id);
  const channelId = String(message.channel.id);
  const userId = String(message.author.id);
  const userMessage = toLimitedText(String(message.content || ''), 1200);
  const userMessageNoMention = toLimitedText(stripBotMentions(message.content || ''), 1200);
  const mood = detectMood(userMessage);
  const sensitiveIntent = detectSensitiveActionIntent(userMessage);
  const isAllowedSensitive = canRequestSensitiveActions(message);
  const isBudgetBypass = canBypassAiBudget(message);
  const imagePrompt = detectImageRequestPrompt(userMessageNoMention || userMessage);

  if (sensitiveIntent && !isAllowedSensitive) {
    const denyText = getSensitiveActionDenyMessage(sensitiveIntent);
    const sentDeny = await message.reply({
      content: denyText,
      allowedMentions: { repliedUser: false }
    }).catch(() => null);
    await AiExchange.create({
      guildId,
      channelId,
      userId,
      username: String(message.author.tag || message.author.username || ''),
      userMessage,
      botReply: denyText,
      tokens: normalizeTokens(userMessage)
    }).catch(() => null);
    return Boolean(sentDeny);
  }

  if (imagePrompt) {
    if (!isBudgetBypass) {
      const budget = checkAiBudget(userId, 'image');
      if (!budget.ok) {
        const denyBudget = await message.reply({
          content: getAiBudgetDenyMessage('image', budget),
          allowedMentions: { repliedUser: false }
        }).catch(() => null);
        return Boolean(denyBudget);
      }
      consumeAiBudget(userId, 'image');
    }

    const imageUrl = await generateAiImage(imagePrompt);
    const imageReply = imageUrl
      ? `Ecco l'immagine: ${imageUrl}`
      : 'Non riesco a generare l immagine in questo momento. Riprova tra poco.';
    const sentImage = await message.reply({
      content: imageReply,
      allowedMentions: { repliedUser: false }
    }).catch(() => null);
    await AiExchange.create({
      guildId,
      channelId,
      userId,
      username: String(message.author.tag || message.author.username || ''),
      userMessage,
      botReply: toLimitedText(imageReply, 700),
      tokens: normalizeTokens(userMessage)
    }).catch(() => null);
    return Boolean(sentImage);
  }

  if (!isBudgetBypass) {
    const budget = checkAiBudget(userId, 'text');
    if (!budget.ok) {
      const denyBudget = await message.reply({
        content: getAiBudgetDenyMessage('text', budget),
        allowedMentions: { repliedUser: false }
      }).catch(() => null);
      return Boolean(denyBudget);
    }
    consumeAiBudget(userId, 'text');
  }

  const context = await buildContext(guildId, channelId);
  let replyText = await generateMentionReply(
    message.guild?.name || 'Server',
    message.author?.tag || userId,
    userMessage,
    context,
    mood
  );

  if (!replyText) {
    const fallback = await findLocalFallbackReply(guildId, channelId, userMessage);
    replyText = fallback || localMentionFallback(mood);
  }

  const sent = await message.reply({
    content: replyText,
    allowedMentions: { repliedUser: false }
  }).catch(() => null);

  await AiExchange.create({
    guildId,
    channelId,
    userId,
    username: String(message.author.tag || message.author.username || ''),
    userMessage,
    botReply: toLimitedText(replyText, 700),
    tokens: normalizeTokens(userMessage)
  }).catch(() => null);

  return Boolean(sent);
}

module.exports = {
  handleAiChatMessage,
  handleAiMentionChatMessage,
  AI_CHAT_CHANNEL_ID,
  AI_MENTION_CHAT_CHANNEL_ID
};
