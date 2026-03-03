const { EmbedBuilder } = require("discord.js");
const { inspect } = require("node:util");
const { MentionReaction, AutoResponder } = require("../../Schemas/Community/autoInteractionSchemas");
const countschema = require("../../Schemas/Counting/countingSchema");
const AFK = require("../../Schemas/Afk/afkSchema");
const { getGuildAutoResponderCache, setGuildAutoResponderCache } = require("../Community/autoResponderCache");
const { safeMessageReply } = require("../Moderation/reply");
const IDs = require("../Config/ids");

const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const COUNTING_CACHE_TTL_MS = 60_000;
const countingConfigCache = new Map();

async function getCountingConfig(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  const now = Date.now();
  const cached = countingConfigCache.get(key);
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  const doc = await countschema.findOne({ Guild: key }).catch(() => null);
  countingConfigCache.set(key, {
    value: doc || null,
    expiresAt: now + COUNTING_CACHE_TTL_MS,
  });
  return doc || null;
}

function invalidateCountingConfig(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  countingConfigCache.delete(key);
}

async function handleAfk(message) {
  const guildId = message.guild?.id;
  if (!guildId) return;
  const userId = message.author.id;
  const afkData = await AFK.findOne({ guildId, userId }).lean();
  if (afkData) {
    const member = message.guild.members.cache.get(userId);
    if (member && afkData.originalName) {
      await member.setNickname(afkData.originalName).catch(() => {});
    }
    await AFK.deleteOne({ guildId, userId });
    const msg=await safeMessageReply(message,`<:VC_PepeWave:1331589315175907412> Bentornato <@${userId}>!Ho rimosso il tuo stato AFK.`,
    );
    if (msg) {
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 5000);
    }
  }

  const mentions = message.mentions?.users;
  if (!mentions || mentions.size === 0) return;

  for (const [mentionedId, mentionedUser] of mentions) {
    if (mentionedUser.bot) continue;
    const targetAfk=await AFK.findOne({guildId,userId:mentionedId,}).lean();
    if (!targetAfk) continue;

    const reason = targetAfk.reason ? `\nMotivo: ${targetAfk.reason}` : "";
    const msg=await safeMessageReply(message,`**${mentionedUser.username}**è AFK dal<t:${Math.floor(new Date(targetAfk.since||targetAfk.createdAt||Date.now()).getTime()/1000,)}:R>.${reason}`,
    );
    if (msg) {
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 7000);
    }
  }
}

function resolveReactionToken(token) {
  const value = String(token || "");
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  if (value.startsWith("unicode:")) return value.slice("unicode:".length);
  return value;
}

function normalizeForTriggerMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getGuildAutoResponders(guildId) {
  if (!guildId) return [];
  const cached = getGuildAutoResponderCache(guildId);
  if (cached) return cached;
  const docs=await AutoResponder.find({guildId,enabled:true}).lean().catch(() => []);
  const rules=Array.isArray(docs)?docs.map((doc) => ({triggerLower:String(doc?.triggerLower||"").trim().toLowerCase(),triggerLoose:normalizeForTriggerMatch(doc?.triggerLower||doc?.trigger||"",),triggerTokens:normalizeForTriggerMatch(doc?.triggerLower||doc?.trigger||"",).split(/\s+/).filter((token) => token.length>=3),response:String(doc?.response||""),reactions:Array.isArray(doc?.reactions)?doc.reactions:[],})).filter((doc) => Boolean(doc.triggerLower)).sort((a,b) => b.triggerLower.length-a.triggerLower.length):[];
  setGuildAutoResponderCache(guildId, rules);
  return rules;
}

function containsWholeLoosePhrase(normalizedLooseText, normalizedLooseNeedle) {
  const haystack = String(normalizedLooseText || "").trim();
  const needle = String(normalizedLooseNeedle || "").trim();
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function ruleMatchesMessage(normalizedText, normalizedLoose, rule) {
  void normalizedText;
  if (!rule) return false;
  if (
    rule.triggerLoose &&
    containsWholeLoosePhrase(normalizedLoose, rule.triggerLoose)
  ) return true;
  return false;
}

async function handleAutoResponders(message) {
  const guildId = message.guild?.id;
  if (!guildId) return;
  const normalized=String(message.content||"").toLowerCase().trim();
  if (!normalized) return;
  if (normalized.startsWith("+")) return;
  const normalizedLoose = normalizeForTriggerMatch(message.content || "");

  const rules = await getGuildAutoResponders(guildId);
  if (!Array.isArray(rules) || !rules.length) return;

  const matched=rules.find((rule) => ruleMatchesMessage(normalized,normalizedLoose,rule),);
  if (!matched) return;

  const response = String(matched.response || "").trim();
  if (response) {
    await message.channel
      .send({
        content: response,
        allowedMentions: { repliedUser: false },
      })
      .catch(() => {});
  }

  const seen = new Set();
  const list = Array.isArray(matched.reactions) ? matched.reactions : [];
  for (const token of list) {
    const emoji = resolveReactionToken(token);
    if (!emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    await message.react(emoji).catch(() => {});
  }
}

async function handleMentionAutoReactions(message) {
  const mentionedUsers = message.mentions?.users;
  if (!mentionedUsers || mentionedUsers.size === 0) return;
  const explicitMentionIds = new Set();
  const mentionRegex = /<@!?(\d{16,20})>/g;
  let match = null;
  const content = String(message.content || "");
  while ((match = mentionRegex.exec(content)) !== null) {
    explicitMentionIds.add(String(match[1]));
  }
  if (!explicitMentionIds.size) return;
  const targetIds=Array.from(new Set(mentionedUsers.filter((user) => !user.bot&&explicitMentionIds.has(user.id)).map((user) => user.id),),);
  if (!targetIds.length) return;
  const docs=await MentionReaction.find({guildId:message.guild.id,userId:{$in:targetIds},}).lean().catch(() => []);
  if (!Array.isArray(docs) || !docs.length) return;
  const uniqueTokens = new Set();
  for (const doc of docs) {
    const list = Array.isArray(doc?.reactions) ? doc.reactions : [];
    for (const token of list) {
      if (token) uniqueTokens.add(String(token));
      if (uniqueTokens.size >= 10) break;
    }
    if (uniqueTokens.size >= 10) break;
  }
  for (const token of uniqueTokens) {
    const emoji = resolveReactionToken(token);
    if (!emoji) continue;
    await message.react(emoji).catch(() => {});
  }
}

function logEventError(client, label, error) {
  const normalizeErrorText=(value) => {if(value instanceof Error){return value.stack||value.message||String(value);}if(typeof value==="string")return value;if(typeof value==="undefined")return "Unknown error";try{return inspect(value,{depth:3,colors:false});}catch{return String(value);}};

  const payload = `[${label}] ${normalizeErrorText(error)}`;
  setImmediate(() => {
    if (client?.logs?.error) {
      client.logs.error(payload);
      return;
    }
    global.logger?.error?.(payload);
  });
}

async function handleCounting(message, client) {
  const countdata = await getCountingConfig(message.guild.id);
  if (!countdata) return;
  const member = message.member;
  if (!member) return;
  const countchannel = message.guild.channels.cache.get(COUNTING_CHANNEL_ID);
  if (!countchannel) {
    logEventError(
      client,
      "COUNTING",
      `Counting channel not found for guild: ${message.guild.id}`,
    );
    return;
  }
  if (message.channel.id !== countchannel.id) return;
  if (!COUNTING_ALLOWED_REGEX.test(message.content)) {
    return message.delete().catch(() => {});
  }
  let messageValue;
  try {
    const math = require("mathjs");
    const expression=message.content.replace(/\s+/g,"").replace(/x/g,"*").replace(/:/g,"/");
    messageValue = math.evaluate(expression);
  } catch {
    return message.delete().catch(() => {});
  }
  const reaction = "<:vegacheckmark:1443666279058772028>";
  if (message.author.id === countdata.LastUser) {
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:vegax:1443934876440068179> Non puoi contare da solo! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:vegax:1443934876440068179>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else if (
    messageValue - 1 !== countdata.Count ||
    messageValue === countdata.Count ||
    messageValue > countdata.Count + 1
  ) {
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:vegax:1443934876440068179> Hai sbagliato numero! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
    countdata.Count = 0;
    message
      .react("<:vegax:1443934876440068179>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else {
    countdata.Count += 1;
    countdata.LastUser = message.author.id;
    message
      .react(reaction)
      .catch((err) => logEventError(client, "COUNTING", err));
  }
  await countdata.save();
  invalidateCountingConfig(message.guild.id);
}

module.exports = {
  handleAfk,
  handleAutoResponders,
  handleCounting,
  handleMentionAutoReactions,
  logEventError,
};