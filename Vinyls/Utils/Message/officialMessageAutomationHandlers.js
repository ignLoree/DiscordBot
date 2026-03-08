const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { recordDiscadiaBump, recordDiscadiaVote, recordBump, awardBumpVoteExp, getVoteCooldownMs } = require("../../Services/Bump/bumpService");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../../Services/Community/expService");
const { upsertVoteRole } = require("../../Services/Community/communityOpsService");
const { grantEventLevels } = require("../../Services/Community/activityEventRewardsService");
const { PAUSE_REQUEST_ROLE_IDS, createPauseRequest } = require("../Pause/pauseRequestRuntime");
const IDs = require("../Config/ids");
const SuggestionCount = require("../../Schemas/Suggestion/suggestionSchema");
const VOTE_CHANNEL_ID = IDs.channels.supporters;
const VOTE_ROLE_ID = IDs.roles.Voter;
const VOTE_URL = IDs.links.vote;
const VOTE_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;
const MEDIA_BLOCK_ROLE_IDS = [IDs.roles.PicPerms].filter(Boolean);
const processedBumpMessages = new Map();
const MEMBER_FETCH_CACHE_TTL_MS = 15_000;
const memberFetchCache = new Map();

function hasMediaPermission(member) {
  return MEDIA_BLOCK_ROLE_IDS.some((roleId) =>
    member?.roles?.cache?.has(roleId),
  );
}

function channelAllowsMedia(message) {
  const channel = message?.channel;
  const member = message?.member;
  if (!channel || !member) return false;
  const perms = channel.permissionsFor(member);
  if (!perms) return false;
  const hasAttachment = Boolean(message.attachments?.size);
  const hasLink = /https?:\/\/\S+/i.test(String(message.content || "")) || /discord\.gg\/\S+|\.gg\/\S+/i.test(String(message.content || ""));
  if (hasAttachment) return perms.has("AttachFiles");
  if (hasLink) return perms.has("EmbedLinks");
  return perms.has("AttachFiles") || perms.has("EmbedLinks");
}

function isMediaMessage(message) {
  if (message.attachments?.size) return true;
  const content = String(message.content || "");
  if (/https?:\/\/\S+/i.test(content)) return true;
  if (/discord\.gg\/\S+|\.gg\/\S+/i.test(content)) return true;
  return false;
}

function isDiscordInviteLinkMessage(message) {
  const content = String(message?.content || "");
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]{2,}/i.test(
    content,
  );
}

function getRandomExp() {
  const min = 100;
  const max = 250;
  const step = 5;
  const count = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * count) * step;
}

function extractVoteCountFromText(text) {
  const cleaned = (text || "").replace(/\*\*/g, "");
  const match = cleaned.match(/(?:have\s+)?got\s+(\d+)\s+votes?/i);
  if (match) return Number(match[1]);
  const matchHave = cleaned.match(/have\s+(\d+)\s+votes?/i);
  if (matchHave) return Number(matchHave[1]);
  const matchAlt = cleaned.match(/(\d+)\s+(?:votes?|voti)/i);
  if (matchAlt) return Number(matchAlt[1]);
  return null;
}

function extractUserIdFromText(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function shouldSkipProcessedBump(key, ttlMs = 5 * 60 * 1000) {
  if (!key) return false;
  const now = Date.now();
  const last = processedBumpMessages.get(key) || 0;
  if (last && now - last < ttlMs) return true;
  processedBumpMessages.set(key, now);
  for (const [k, ts] of processedBumpMessages.entries()) {
    if (now - ts > ttlMs) processedBumpMessages.delete(k);
  }
  return false;
}

async function getCachedOrFetchMember(guild, userId) {
  if (!guild || !userId) return null;
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember;

  const cacheKey = `${String(guild.id)}:${String(userId)}`;
  const now = Date.now();
  const cached = memberFetchCache.get(cacheKey);
  if (cached?.member && now < Number(cached.expiresAt || 0)) {
    return cached.member;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = guild.members.fetch(userId).catch(() => null);
  memberFetchCache.set(cacheKey, { member: null, expiresAt: 0, promise });
  const member = await promise;
  memberFetchCache.set(cacheKey, {
    member,
    expiresAt: Date.now() + MEMBER_FETCH_CACHE_TTL_MS,
    promise: null,
  });
  return member;
}

function extractNameFromText(text) {
  if (!text) return null;
  const match = text.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) || text.match(/!?\s*([^\s]+)\s+has voted/i);
  return match?.[1] || null;
}

function sanitizeName(name) {
  if (!name) return null;
  return name.replace(/^[!@#:_*`~\\-\\.]+|[!@#:_*`~\\-\\.]+$/g, "");
}

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (value) => { if (typeof value === "string" && value.trim()) parts.push(value); };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.url);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function getMessageTextParts(message) {
  const embed = message.embeds?.[0];
  const embedText = flattenEmbedText(embed);
  return {
    content: message.content || "",
    embedText,
    embedTitle: embed?.title || "",
    fieldsText: "",
  };
}

async function resolveUserFromMessage(message) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const idFromContent = extractUserIdFromText(content) || extractUserIdFromText(embedText) || extractUserIdFromText(fieldsText);
  if (idFromContent) {
    return message.guild.members
      .fetch(idFromContent)
      .then((m) => m.user)
      .catch(() => null);
  }

  const nameRaw = extractNameFromText(content) || extractNameFromText(embedText) || extractNameFromText(embedTitle) || extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw);
  if (nameClean) {
    const name = nameClean.toLowerCase();
    const cached = message.guild.members.cache.find((m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
    if (cached) return cached.user;
    const searched = await message.guild.members.fetch({ query: nameClean, limit: 5 }).catch(() => null);
    if (searched?.size) {
      const exact = searched.find((m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
      return (exact || searched.first()).user || null;
    }
  }

  return null;
}

function getVoteManagerBotIds(client) {
  return new Set(
    [
      IDs.bots?.DISBOARD,
      IDs.bots?.Discadia,
      client?.config?.disboard?.botId,
      client?.config?.discadia?.botId,
    ]
      .filter(Boolean)
      .map((id) => String(id)),
  );
}

async function handleVoteManagerMessage(message, client) {
  if (!message.guild) return false;
  if (message.channel?.id !== VOTE_CHANNEL_ID) return false;
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  if (!isAutomatedSource) return false;
  const allowedBotIds = getVoteManagerBotIds(client);
  const isVoteManagerAuthor = allowedBotIds.has(String(message.author?.id || ""));
  const isVoteManagerApp = allowedBotIds.has(String(message.applicationId || ""));
  const sourceName = String(`${message.author?.globalName || ""}${message.author?.username || ""}`,
  ).toLowerCase();
  const hasVoteLikeBotName = /(vote|discadia|disboard)/i.test(sourceName);
  if (!isVoteManagerAuthor && !isVoteManagerApp && !hasVoteLikeBotName) {
    return false;
  }

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const voteText = `${content}${embedText}${embedTitle}${fieldsText}`.toLowerCase();
  const looksLikeVote = /has voted|voted/i.test(voteText) || /ha votato|votato/i.test(voteText) || (voteText.includes("discadia") && /(vote|voto|votato)/i.test(voteText));
  if (!looksLikeVote) return false;

  const user = await resolveUserFromMessage(message);
  const nameRaw = extractNameFromText(content) || extractNameFromText(embedText) || extractNameFromText(embedTitle) || extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw) || "Utente";

  const fullText = `${content} ${embedText} ${embedTitle} ${fieldsText}`;
  const voteCount = extractVoteCountFromText(content) || extractVoteCountFromText(embedText) || extractVoteCountFromText(embedTitle) || extractVoteCountFromText(fieldsText) || extractVoteCountFromText(fullText);
  if (voteCount === null) {
    global.logger.warn("[VOTE EMBED] Vote count not found. Text:", fullText);
  }

  let expValue = 0;
  let resolvedVoteCount = voteCount;
  const voteRewardExtras = [];
  if (user?.id && message.guild?.id) {
    try {
      const result = await recordDiscadiaVote(message.client, message.guild.id, user.id);
      if (result && typeof result.voteCount === "number") {
        resolvedVoteCount = result.voteCount;
      }
      const baseExpRandom = resolvedVoteCount === 1 ? 250 : getRandomExp();
      const voteCooldownMs = getVoteCooldownMs(message.client);
      const reward = await awardBumpVoteExp(message.client, message.guild, user.id, "discadia_vote", result?.previousLastVoteAt ?? null, voteCooldownMs, baseExpRandom);
      if (reward?.effectiveExp != null) {
        expValue = reward.effectiveExp;
      }
      if (reward?.fastBonus > 0) voteRewardExtras.push("<a:VC_Flame:1473106990493335665> Risposta rapida **+" + reward.fastBonus + " exp**");
      if (reward?.streakBonus > 0) voteRewardExtras.push("<a:VC_Flame:1473106990493335665> Streak " + reward.newStreak + " **+" + reward.streakBonus + " exp**");
    } catch { }
    try {
      const expiresAt = new Date(Date.now() + VOTE_ROLE_DURATION_MS);
      await upsertVoteRole(message.guild.id, user.id, expiresAt);
      const member = await getCachedOrFetchMember(message.guild, user.id);
      if (member && !member.roles.cache.has(VOTE_ROLE_ID)) {
        await member.roles.add(VOTE_ROLE_ID).catch(() => { });
      }
      grantEventLevels(
        message.guild.id,
        user.id,
        1,
        "Evento: voto Discadia",
        member || undefined,
        message.client,
      ).catch(() => { });
    } catch { }
  }

  const dividerUrl = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
  const voteLabel = typeof resolvedVoteCount === "number" ? `${resolvedVoteCount}°` : "";
  const voteRoleText = VOTE_ROLE_ID ? `<a:VC_Money:1448671284748746905> <a:VC_Arrow:1448672967721615452> Il ruolo <@&${VOTE_ROLE_ID}> per 24 ore`
    : "<a:VC_Money:1448671284748746905> <a:VC_Arrow:1448672967721615452> Reward voto assegnata per 24 ore";
  const descriptionLines = [
    `<a:VC_ThankYou:1330186319673950401> Grazie ${user ? `${user}` : nameClean} per aver votato su [Discadia](<https://discadia.com/server/viniliecaffe/>) il server!`,
    "",
    "`Hai guadagnato:`",
    `<:VC_EXP:1468714279673925883> <a:VC_Arrow:1448672967721615452> **${expValue} EXP** per il tuo ${voteLabel ? `**${voteLabel} voto**` : "**voto**"}`,
    ...(voteRewardExtras.length > 0 ? voteRewardExtras : []),
    voteRoleText,
    "",
    "<:VC_update:1478721333096349817> Vota di nuovo tra __24 ore__ per ottenere **altri exp** dal **bottone sottostante**.",
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Vote:1448729692235628818> **Un nuovo voto!**")
    .setDescription(descriptionLines.join("\n"))
    .setFooter({ text: "Ogni volta che voterai il valore dell'exp guadagnata varierà: a volte sarà più alto, altre volte più basso, mentre altre ancora uguale al precedente", }).setImage(dividerUrl);

  const components = [];
  if (VOTE_URL) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setEmoji("<a:VC_HeartPink:1448673486603292685>")
          .setLabel("Vota cliccando qui")
          .setURL(VOTE_URL),
      ),
    );
  }

  const mention = user ? `${user}` : "";
  const sent = await message.channel.send({ content: mention, embeds: [embed], components, }).catch((error) => { const detail = error?.message || error?.code || error; global.logger?.error?.("[VOTE EMBED] Failed to send embed:", detail); return null; });
  if (sent) {
    await message.delete().catch(() => { });
  }
  return true;
}

async function handleDisboardBump(message, client) {
  const disboard = client?.config?.disboard;
  if (!disboard || !message.guild) return false;
  const authorName = String(message.author?.globalName || message.author?.username || "",);
  const sourceName = `${authorName} ${String(message.applicationId || "")}`.toLowerCase();
  const isDisboardSource = message.author?.id === IDs.bots.DISBOARD || (Boolean(message.author?.bot) && /disboard/i.test(authorName)) || /disboard/i.test(sourceName);
  if (!message.author || !isDisboardSource) return false;

  const patterns = Array.isArray(disboard.bumpSuccessPatterns) ? disboard.bumpSuccessPatterns.map((p) => String(p).toLowerCase()) : [];
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
    }
  }
  const lowered = haystacks.map((text) => String(text || "").toLowerCase());
  const isBump = patterns.some((pattern) => lowered.some((text) => text.includes(pattern)),);
  if (!isBump) return false;

  const dedupeKey = `disboard:${message.guild.id}:${message.id}`;
  if (shouldSkipProcessedBump(dedupeKey)) return true;
  const bumpUserId = message.interaction?.user?.id || null;
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const disboardCooldownMs = (client?.config?.disboard?.cooldownMinutes ?? 120) * 60 * 1000;
  const recordResult = await recordBump(client, message.guild.id, bumpUserId);
  let thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" +
    bumpMention;
  if (bumpUserId && recordResult?.previousLastBumpAt !== undefined) {
    const reward = await awardBumpVoteExp(client, message.guild, bumpUserId, "disboard", recordResult.previousLastBumpAt, disboardCooldownMs).catch(() => null);
    if (reward?.effectiveExp != null) {
      const parts = ["<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**", "<:VC_EXP:1468714279673925883> **" + reward.effectiveExp + " exp** guadagnati!"];
      if (reward.fastBonus > 0) parts.push("<a:VC_Flame:1473106990493335665> Risposta rapida +" + reward.fastBonus + " exp");
      if (reward.streakBonus > 0) parts.push("<a:VC_Flame:1473106990493335665> Streak " + reward.newStreak + " +" + reward.streakBonus + " exp");
      parts.push("<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" + bumpMention);
      thanksMessage = parts.join("\n");
    }
  }
  const channel = message.channel || (await message.guild.channels.fetch(message.channelId).catch(() => null));
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      await channel.send({ content: thanksMessage.trim() }).catch(() => { });
    }
  }
  return true;
}

async function handleDiscadiaBump(message, client) {
  const discadia = client?.config?.discadia;
  if (!discadia || !message.guild) return false;
  const authorName = String(message.author?.globalName || message.author?.username || "",);
  const sourceName = String([message.author?.globalName || "", message.author?.username || "", message.author?.tag || "", message.author?.id || "", message.applicationId || "",].filter(Boolean).join(" "),);
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  const patterns = Array.isArray(discadia.bumpSuccessPatterns) ? discadia.bumpSuccessPatterns.map((p) => String(p).toLowerCase()) : ["has been successfully bumped", "successfully bumped", "bumped successfully",];
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
      if (embed?.footer?.text) haystacks.push(embed.footer.text);
      if (embed?.author?.name) haystacks.push(embed.author.name);
      if (Array.isArray(embed?.fields)) {
        for (const field of embed.fields) {
          if (field?.name) haystacks.push(field.name);
          if (field?.value) haystacks.push(field.value);
        }
      }
    }
  }
  const normalized = haystacks.map((text) => String(text).toLowerCase()).map((text) => text.replace(/\s+/g, " ").trim());
  const joined = normalized.join("\n");
  const hasPattern = patterns.some((pattern) => joined.includes(pattern));
  const hasSuccessWord = /(server has been bumped|has been successfully bumped|bump(?:ed)?successfully|successfully bumped|successful bump|bump complete|bump done|thanks for bumping|you can bump again|bump effettuato|bump eseguito|bump completato|bump andato a buon fine|server bumpato con successo|bump riuscito|puoi bumpare di nuovo|potrai bumpare di nuovo)/i.test(joined,);
  const hasBumpWord = /\bbump(?:ed)?\b/i.test(joined);
  const hasFailureWord = /already bumped|already has been bumped|cannot bump|can 't bump|please wait|too early|wait before|failed to bump|bump failed|errore bump|impossibile bumpare|devi aspettare|attendi prima di bumpare|troppo presto per bumpare|bump non riuscito|bump fallito/i.test(joined,);
  const hasDiscadiaWord = /\bdiscadia\b/i.test(joined);
  const hasDiscadiaDomain = /discadia\.com/i.test(joined);
  const interactionCommandName = String(message.interaction?.commandName || message.interactionMetadata?.name || "",).trim().toLowerCase();
  const isBumpInteraction = interactionCommandName === "bump";
  const isLikelyCommandChannel = String(message.channelId || "") === String(IDs.channels.commands || "");
  const isFromDiscadiaBot = String(message.author?.id) === String(IDs.bots?.Discadia || "");
  const sourceFingerprint = `${authorName} ${sourceName}`.toLowerCase();
  const looksLikeDiscadiaSource = isFromDiscadiaBot || /\bdiscadia\b/i.test(sourceFingerprint) || hasDiscadiaWord || hasDiscadiaDomain;
  const looksLikeDisboardSource = /\bdisboard\b/i.test(sourceFingerprint);
  const hasBumpSuccessText = hasPattern || hasSuccessWord;
  const isSuccessInCommandChannel = isLikelyCommandChannel && !hasFailureWord && (hasBumpSuccessText || (isBumpInteraction && hasBumpWord));
  const isBumpFromDiscadiaInCommands = isFromDiscadiaBot && isLikelyCommandChannel && (isBumpInteraction || hasBumpWord) && !hasFailureWord;
  const isBump = !hasFailureWord && (isBumpFromDiscadiaInCommands || isSuccessInCommandChannel || (looksLikeDiscadiaSource && (hasBumpSuccessText || (isBumpInteraction && hasBumpWord))) || (isAutomatedSource && !looksLikeDisboardSource && hasBumpSuccessText));
  if (!isBump) return false;
  const dedupeKey = `discadia:${message.guild.id}:${message.id}`;
  if (shouldSkipProcessedBump(dedupeKey)) return true;
  const bumpUserId = message.interaction?.user?.id || message.interactionMetadata?.user?.id || extractUserIdFromText(message.content) || extractUserIdFromText(joined) || null;
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const discadiaCooldownMs = (client?.config?.discadia?.cooldownMinutes ?? 1440) * 60 * 1000;
  const recordResult = await recordDiscadiaBump(client, message.guild.id, bumpUserId);
  let thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server su Discadia!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **24 ore!**\n" +
    bumpMention;
  if (bumpUserId && recordResult?.previousLastBumpAt !== undefined) {
    const reward = await awardBumpVoteExp(client, message.guild, bumpUserId, "discadia_bump", recordResult.previousLastBumpAt, discadiaCooldownMs).catch(() => null);
    if (reward?.effectiveExp != null) {
      const parts = ["<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server su Discadia!__**", "<:VC_EXP:1468714279673925883> **" + reward.effectiveExp + " exp** guadagnati!"];
      if (reward.fastBonus > 0) parts.push("<a:VC_Flame:1473106990493335665> Risposta rapida +" + reward.fastBonus + " exp");
      if (reward.streakBonus > 0) parts.push("<a:VC_Flame:1473106990493335665> Streak " + reward.newStreak + " +" + reward.streakBonus + " exp");
      parts.push("<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **24 ore!**\n" + bumpMention);
      thanksMessage = parts.join("\n");
    }
  }
  const channel = message.channel || (message.channelId ? await message.guild.channels.fetch(message.channelId).catch(() => null) : null);
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      try {
        await channel.send({ content: thanksMessage.trim() });
      } catch {
        const fallbackChannelId = IDs.channels.commands || null;
        if (fallbackChannelId) {
          const fallbackChannel = message.guild.channels.cache.get(fallbackChannelId) || (await message.guild.channels.fetch(fallbackChannelId).catch(() => null));
          if (fallbackChannel?.isTextBased?.()) {
            await fallbackChannel.send({ content: thanksMessage.trim() }).catch(() => { });
          }
        }
      }
    }
  }
  return true;
}

async function handleSuggestionChannelMessage(message) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const suggestionsChannelId = String(IDs.channels.suggestions || "1442569147559973094",);
  if (String(message.channelId) !== suggestionsChannelId) return false;

  const suggestionText = String(message.content || "").trim();
  if (!suggestionText) return false;

  const counterFilter = { GuildID: message.guild.id, ChannelID: "__counter__", Msg: "__counter__", AuthorID: "__system__", };
  const counter = await SuggestionCount.findOneAndUpdate(counterFilter, { $inc: { count: 1 }, $setOnInsert: { Upmembers: [], Downmembers: [], upvotes: 0, downvotes: 0, sID: "__counter__", }, }, { new: true, upsert: true, setDefaultsOnInsert: true },);
  const suggestionId = String(counter?.count || 1);

  const suggestionEmbed =
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(`**<:VC_Mention:1443994358201323681> Mandato da:**\n${message.author.username}
    
    **<:PinkQuestionMark:1471892611026391306> Suggerimento:**
    
    ${suggestionText}
    
    **<a:VC_Vote:1448729692235628818> Numero voti:**\n\n`,
      )
      .setFields(
        { name: "<:thumbsup:1471292172145004768>", value: "0", inline: true },
        { name: "<:thumbsdown:1471292163957457013>", value: "0", inline: true },
      )
      .setTimestamp()
      .setFooter({
        text: `User ID:${message.author.id}|sID:${suggestionId}`,
      });

  const voteRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("upv").setEmoji("<:thumbsup:1471292172145004768>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("downv").setEmoji("<:thumbsdown:1471292163957457013>").setStyle(ButtonStyle.Secondary),);
  const staffRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("suggestion_staff_accept").setLabel("Accetta").setEmoji("<:success:1461731530333229226>").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("suggestion_staff_reject").setLabel("Rifiuta").setEmoji("<:cancel:1461730653677551691>").setStyle(ButtonStyle.Danger),);

  const posted = await message.channel.send({ content: "<@&1442568894349840435>", embeds: [suggestionEmbed], components: [voteRow, staffRow], }).catch(() => null);
  if (!posted) return false;

  await SuggestionCount.create({
    GuildID: message.guild.id,
    ChannelID: message.channel.id,
    Msg: posted.id,
    AuthorID: message.author.id,
    upvotes: 0,
    downvotes: 0,
    Upmembers: [],
    Downmembers: [],
    sID: suggestionId,
  }).catch(() => { });

  const thread = await posted.startThread({
    name: `Thread per il suggerimento ${suggestionId}`,
    autoArchiveDuration: 10080,
  })
    .catch(() => null);
  if (thread) {
    await thread
      .send(
        `Ho creato questo thread per discutere del suggerimento di <@${message.author.id}>`,
      )
      .catch(() => { });
  }

  await message.delete().catch(() => { });
  return true;
}

async function handlePauseChannelMessage(message) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const pauseChannelId = String(IDs.channels.pause || "");
  if (!pauseChannelId || String(message.channelId) !== pauseChannelId) return false;

  const allowedRoleIds = new Set(PAUSE_REQUEST_ROLE_IDS.map(String));
  const hasAllowedRole = Array.from(allowedRoleIds).some((roleId) => message.member?.roles?.cache?.has(roleId));
  if (!hasAllowedRole) return false;

  const raw = String(message.content || "").trim();
  if (!raw) return false;
  const match = raw.match(/^(.+?)\s-\s(.+?)\s-\s(.+)$/);
  if (!match) {
    const warning = await message.channel.send({ content: `${message.author} formato non valido. Usa: \`<data richiesta> - <data ritorno> - <motivazione>\`` }).catch(() => null);
    await message.delete().catch(() => { });
    if (warning) {
      const timer = setTimeout(() => warning.delete().catch(() => { }), 8000);
      timer.unref?.();
    }
    return true;
  }

  const rawStart = String(match[1] || "").trim();
  const rawEnd = String(match[2] || "").trim();
  const reason = String(match[3] || "").trim();
  const result = await createPauseRequest({ guild: message.guild, userId: message.author.id, requesterMention: String(message.author), rawStart, rawEnd, reason, member: message.member, });
  if (!result.ok) {
    const warning = await message.channel.send({ content: `${message.author} <:vegax:1443934876440068179> ${result.error}` }).catch(() => null);
    await message.delete().catch(() => { });
    if (warning) {
      const timer = setTimeout(() => warning.delete().catch(() => { }), 8000);
      timer.unref?.();
    }
    return true;
  }

  await message.delete().catch(() => { });
  return true;
}

module.exports = { channelAllowsMedia, getCachedOrFetchMember, handleDisboardBump, handleDiscadiaBump, handlePauseChannelMessage, handleSuggestionChannelMessage, handleVoteManagerMessage, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage };