const { EmbedBuilder, PermissionsBitField, AuditLogEvent, UserFlagsBitField, } = require("discord.js");
const { InviteTrack, InviteReminderState, } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { getNoDmSet } = require("../Utils/noDmList");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  scheduleMemberCounterRefresh,
} = require("../Utils/Community/memberCounterUtils");
const {
  processJoinRaidForMember,
  registerJoinRaidSecuritySignal,
} = require("../Services/Moderation/joinRaidService");
const {
  getJoinGateConfigSnapshot,
} = require("../Services/Moderation/joinGateService");
const { getSecurityLockState } = require("../Services/Moderation/securityOrchestratorService");
const { markJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const { applyRolePersistForMember } = require("../Services/Moderation/rolePersistService");
const { createModCase, getModConfig, logModCase } = require("../Utils/Moderation/moderation");
const {
  markJoinGateSuspiciousAccount,
} = require("../Services/Moderation/suspiciousAccountService");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("../Services/Moderation/securityProfilesService");

const INVITE_LOG_CHANNEL_ID = IDs.channels.chat;
const THANKS_CHANNEL_ID = IDs.channels.supporters;
const INFO_PERKS_CHANNEL_ID = IDs.channels.info;
const INVITE_REWARD_TIERS = [
  {
    target: 5,
    roleIds: [
      IDs.roles.Promoter,
      IDs.roles.PicPerms || "1468938195348754515",
    ].filter(Boolean),
  },
  {
    target: 25,
    roleIds: [IDs.roles.Propulsor].filter(Boolean),
  },
  {
    target: 100,
    roleIds: [IDs.roles.Catalyst].filter(Boolean),
  },
];
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const ARROW = "<:VC_right_arrow:1473441155055096081>";
const JOIN_GATE_WHITELIST_ROLE_IDS = new Set(
  [
    IDs.roles.Founder,
    IDs.roles.CoFounder,
  ]
    .filter(Boolean)
    .map(String),
);
const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const SUSPICIOUS_JOIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const recentJoinSignalsByGuild = new Map();

function isConfiguredExempt(guild, userId, member = null) {
  const uid = String(userId || "");
  if (!uid) return false;
  if (CORE_EXEMPT_USER_IDS.has(uid)) return true;
  if (String(guild?.ownerId || "") === uid) return true;
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), uid)) return true;
  return false;
}

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function formatAccountAge(createdAt) {
  const now = Date.now();
  const ageMs = now - createdAt.getTime();
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;

  const parts = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function ensureInviteCache(client) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }
}

async function resolveInviteInfo(member) {
  const guild = member.guild;
  ensureInviteCache(member.client);

  const invites = await guild.invites.fetch().catch(() => null);
  const cache = member.client.inviteCache.get(guild.id);
  let usedInvite = null;

  if (invites && cache) {
    for (const invite of invites.values()) {
      const cached = cache.get(invite.code);
      if (
        cached &&
        typeof invite.uses === "number" &&
        invite.uses > (cached.uses || 0)
      ) {
        usedInvite = invite;
        break;
      }
    }
  }

  if (invites) {
    const map = new Map();
    for (const invite of invites.values()) {
      map.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
      });
    }
    member.client.inviteCache.set(guild.id, map);
  }

  let vanityCode = guild.vanityURLCode || null;
  if (!usedInvite && !vanityCode && guild.features?.includes("VANITY_URL")) {
    const vanityData = await guild.fetchVanityData().catch(() => null);
    vanityCode = vanityData?.code || null;
  }
  if (!usedInvite && vanityCode) {
    return {
      link: `https://discord.gg/${vanityCode}`,
      inviterTag: "Vanity URL",
      totalInvites: 0,
      isVanity: true,
      inviterId: null,
    };
  }

  const link = usedInvite
    ? `https://discord.gg/${usedInvite.code}`
    : "Link non disponibile";
  const inviterId = usedInvite?.inviter?.id || null;
  const inviterTag = inviterId ? `<@${inviterId}>` : "Sconosciuto";

  let totalInvites = 0;
  if (invites && inviterId) {
    totalInvites = invites
      .filter((invite) => invite.inviter?.id === inviterId)
      .reduce((sum, invite) => sum + (invite.uses || 0), 0);
  }

  return { link, inviterTag, totalInvites, isVanity: false, inviterId };
}

async function trackInviteJoin(member, inviterId) {
  if (!inviterId || inviterId === member.id) return;

  const inviterMember =
    member.guild.members.cache.get(inviterId) ||
    (await member.guild.members.fetch(inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return;

  await InviteTrack.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id },
    {
      $set: { inviterId, active: true, leftAt: null },
      $setOnInsert: { joinedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function tryAwardInviteRole(member, inviteInfo) {
  if (!inviteInfo || inviteInfo.isVanity || !inviteInfo.inviterId) {
    return { awarded: false, roleIds: [], targets: [] };
  }
  const totalInvites = Number(inviteInfo.totalInvites || 0);
  if (!Number.isFinite(totalInvites) || totalInvites < INVITE_REWARD_TIERS[0].target) {
    return { awarded: false, roleIds: [], targets: [] };
  }

  const guild = member.guild;
  const inviterMember =
    guild.members.cache.get(inviteInfo.inviterId) ||
      (await guild.members.fetch(inviteInfo.inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return { awarded: false, roleIds: [], targets: [] };

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return { awarded: false, roleIds: [], targets: [] };

  const rolesToAdd = [];
  const reachedTargets = [];
  for (const tier of INVITE_REWARD_TIERS) {
    if (totalInvites < Number(tier.target || 0)) continue;
    reachedTargets.push(Number(tier.target || 0));
    for (const roleId of Array.isArray(tier.roleIds) ? tier.roleIds : []) {
      const role =
        guild.roles.cache.get(roleId) ||
        (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;
      if (inviterMember.roles.cache.has(role.id)) continue;
      if (role.position >= me.roles.highest.position) continue;
      rolesToAdd.push(role.id);
    }
  }
  if (!rolesToAdd.length) {
    return { awarded: false, roleIds: [], targets: reachedTargets };
  }

  await inviterMember.roles.add(rolesToAdd).catch(() => {});
  return { awarded: true, roleIds: rolesToAdd, targets: reachedTargets };
}

function getNextInviteRewardTier(totalInvites) {
  const safeInvites = Math.max(0, Number(totalInvites || 0));
  return INVITE_REWARD_TIERS.find((tier) => safeInvites < Number(tier.target || 0)) || null;
}

async function addBotRoles(member) {
  const roleIds = [IDs.roles.Bots].filter(Boolean);
  if (!roleIds.length) return;
  const me = member.guild.members.me;

  if (!me) {
    global.logger.warn(
      "[guildMemberAdd] Bot member not cached; cannot add bot roles.",
    );
    return;
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    global.logger.warn(
      "[guildMemberAdd] Missing Manage Roles permission; cannot add bot roles.",
    );
    return;
  }

  const roles = roleIds
    .map((id) => member.guild.roles.cache.get(id))
    .filter(Boolean);

  const missingRoles = roleIds.filter(
    (id) => !member.guild.roles.cache.has(id),
  );
  if (missingRoles.length) {
    global.logger.warn(
      "[guildMemberAdd] Some bot roles not found:",
      missingRoles,
    );
  }
  if (!roles.length) return;

  const blocked = roles.filter(
    (role) => role.position >= me.roles.highest.position,
  );
  if (blocked.length) {
    global.logger.warn(
      "[guildMemberAdd] Bot role hierarchy prevents adding roles:",
      blocked.map((role) => role.id),
    );
    return;
  }

  await member.roles.add(roles);
}

function buildWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setAuthor({
      name: member.user.username,
      iconURL: member.user.displayAvatarURL({ size: 128 }),
    })
    .setTitle(
      "<a:VC_HeartsPink:1468685897389052008> Benvenuto/a su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>",
    )
    .setDescription(
      `__${member.displayName}__ benvenuto/a nella nostra community <a:VC_Sparkles:1468546911936974889>\n` +
        "Passa su <#1469429150669602961> per **abbellire il tuo profilo** con i ruoli & colori.",
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setImage(
      "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo in ${member.guild.memberCount} membri` });
}

function buildDmWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_RightWing:1448672889845973214> Welcome to Vinili & Caffè!")
    .setDescription(
      [
        `Ei **${member.displayName}** welcome, glad to have you here!`,
        "",
        "Joining the server you automatically accept the rules.",
        "Entrando nel server accetti automaticamente le nostre regole.",
        "<a:VC_Arrow:1448672967721615452> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>",
        "------------------------------",
        "<:VC_Dot:1443932948599668746> Check out our GUILD TAGS",
        "<:moon:1470064812615667827>[⭑.ᐟ](<https://discord.gg/E6vrm5zE6B>)<:VC_Luna1:1471613026158514246><:VC_Luna2:1471613140654489783> & <a:VC_Money:1448671284748746905>[⭑.ᐟ](<https://discord.gg/QnTN5P578g>)<:VC_Cash1:1471614972034547884><:VC_Cash2:1471615052435161162>",
        "<:VC_Firework:1470796227913322658>[⭑.ᐟ](<https://discord.gg/WMuZ4EMAkc>)<:VC_Porn1:1471615143434518661><:VC_Porn2:1471615225743675554> & <a:VC_PepeEggPlant:1331622686014570588>[⭑.ᐟ](<https://discord.gg/uqUNS9f5m5>)<:VC_SixNine1:1471615411639292047><:VC_SixNine2:1471615623044796519>",
        "<a:VC_PepeSmoke:1331590685673132103>[⭑.ᐟ](<https://discord.gg/SzBwnxHXNv>)<:VC_Weed1:1471615705601282119><:VC_Weed2:1471615783615463467> & <a:VC_PepeExcited:1331621719093284956>[⭑.ᐟ](<https://discord.gg/z3EXtJwvQH>)<:VC_Figa1:1471615881929818328><:VC_Figa2:1471615955955355873>",
        "<a:VC_Arrow:1448672967721615452> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>",
        "------------------------------",
        "<a:VC_Exclamation:1448687427836444854> Verify Yourself: <https://discord.com/channels/1329080093599076474/1442569059983163403>",
      ].join("\n"),
    )
    .setThumbnail(member.guild.iconURL({ size: 256 }))
    .setFooter({
      text: `${member.guild.name} • Ora siamo in ${member.guild.memberCount}`,
      iconURL: member.guild.iconURL(),
    })
    .setTimestamp();
}

async function sendBotAddLog(member) {
  const guild = member?.guild;
  if (!guild || !member?.user?.bot) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId
    ? (guild.channels.cache.get(modLogId) ||
        (await guild.channels.fetch(modLogId).catch(() => null)))
    : null;
  if (!logChannel?.isTextBased?.()) return;

  let executor = null;
  const entry = await fetchRecentBotAddEntry(guild, member.user.id);
  if (entry?.executor) executor = entry.executor;

  const responsible = formatActor(executor);
  const createdTs = Math.floor(new Date(member.user.createdAt).getTime() / 1000);
  const nowTs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Bot Add")
    .setDescription(
      [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${member.user} \`${member.user.id}\``,
        `${ARROW} <t:${nowTs}:F>`,
        "",
        "**Additional Information**",
        `${ARROW} **Id:** \`${member.user.id}\``,
        `${ARROW} **Username:** ${member.user.username}`,
        `${ARROW} **Creation:** <t:${createdTs}:R>`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}
async function handleBotJoin(member, joinGateConfig) {
  queueIdsCatalogSync(member.client, member.guild.id, "botJoin");
  await sendBotAddLog(member).catch(() => {});
  await sendJoinGateNoAvatarLog(member).catch(() => {});

  const botAddEntry = await fetchRecentBotAddEntry(member.guild, member.user.id);
  const executorId = botAddEntry?.executorId || botAddEntry?.executor?.id || null;
  const executorText = botAddEntry?.executor
    ? formatActor(botAddEntry.executor)
    : "sconosciuto";
  const verifiedBot = await isVerifiedBot(member.user);

  if (
    joinGateConfig?.enabled &&
    joinGateConfig?.unverifiedBotAdditions?.enabled &&
    !verifiedBot
  ) {
    const result = await kickForJoinGate(member, "Unverified bot addition.", [
      `${ARROW} **Rule:** Unverified Bot Additions`,
      `${ARROW} **Responsible:** ${executorText}`,
    ], joinGateConfig?.unverifiedBotAdditions?.action || "kick");
    if (result?.blocked) return;
  }

  if (joinGateConfig?.enabled && joinGateConfig?.botAdditions?.enabled) {
    if (!executorId) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions skipped (audit unavailable) target=${member.user?.id || "unknown"}`,
      );
    } else {
      const authorized = await isAuthorizedBotAdder(member.guild, executorId);
      if (!authorized) {
        const result = await kickForJoinGate(
          member,
          "Bot added by unauthorized member.",
          [
            `${ARROW} **Rule:** Bot Additions`,
            `${ARROW} **Responsible:** ${executorText}`,
          ],
          joinGateConfig?.botAdditions?.action || "kick",
        );
        if (result?.blocked) return;
      }
    }
  }

  try {
    await addBotRoles(member);
  } catch (error) {
    global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
  }

  const welcomeChannel = await resolveGuildChannel(
    member.guild,
    IDs.channels.chat,
  );
  if (welcomeChannel) {
    await welcomeChannel
      .send({
        content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
        embeds: [buildWelcomeEmbed(member)],
      })
      .catch(() => {});
  }

  const inviteChannel = await resolveGuildChannel(
    member.guild,
    INVITE_LOG_CHANNEL_ID,
  );
  if (!inviteChannel) return;

  try {
    const info = await resolveInviteInfo(member);
    if (info.isVanity) {
      await inviteChannel
        .send({
          content:
            "<:VC_Reply:1468262952934314131> Bot entrato tramite vanity **.gg/viniliecaffe**",
        })
        .catch(() => {});
    } else {
      await inviteChannel
        .send({
          content: `<:VC_Reply:1468262952934314131> Bot entrato con il link <${info.link}>,\n-# -> invitato da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
        })
        .catch(() => {});
    }
  } catch {}
}

function isTooYoungAccount(member, minAgeDays = 3) {
  const safeMinDays = Math.max(0, Number(minAgeDays || 0));
  const minAgeMs = safeMinDays * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdAt.getTime();
  return accountAgeMs < minAgeMs;
}

function hasNoAvatar(member) {
  if (!member?.user) return false;
  return !member.user.avatar;
}

function getJoinGateNameCandidate(member) {
  return String(
    member?.user?.globalName ||
      member?.displayName ||
      member?.user?.username ||
      "",
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inviteLikeInName(text) {
  const normalized = normalizeText(text);
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|invite\.gg\/|dsc\.gg\/)/i.test(
    normalized,
  );
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate, rules) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord && normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules.wildcardWords)
    ? rules.wildcardWords
    : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }
  return null;
}

function toAccountNameSkeleton(input) {
  return normalizeText(input)
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b");
}

function hasMixedScripts(input) {
  const value = String(input || "");
  if (!value) return false;
  const hasLatin = /[A-Za-z]/.test(value);
  const hasCyrillic = /[\u0400-\u04FF]/.test(value);
  const hasGreek = /[\u0370-\u03FF]/.test(value);
  const nonLatinScripts = Number(hasCyrillic) + Number(hasGreek);
  return hasLatin && nonLatinScripts > 0;
}

function normalizeCompact(input) {
  return normalizeText(input).replace(/\s+/g, "");
}

function countVowels(input) {
  return (String(input || "").match(/[aeiou]/gi) || []).length;
}

function looksRandomName(input) {
  const raw = String(input || "").trim();
  if (!raw) return false;

  const compact = normalizeCompact(raw);
  if (compact.length < 6 || compact.length > 18) return false;
  if (!/^[a-z0-9._-]+$/i.test(raw)) return false;

  const alnum = compact.replace(/[^a-z0-9]/g, "");
  const letterOnly = alnum.replace(/\d/g, "");
  const vowelCount = countVowels(letterOnly);
  const vowelRatio = letterOnly.length > 0 ? vowelCount / letterOnly.length : 0;
  const digitCount = (alnum.match(/\d/g) || []).length;
  const uniqueRatio = alnum.length > 0 ? new Set(alnum.split("")).size / alnum.length : 0;
  const longConsonantRun = /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(letterOnly);

  return (
    (digitCount >= 2 && vowelRatio <= 0.25 && uniqueRatio >= 0.68) ||
    (longConsonantRun && vowelRatio <= 0.3) ||
    (vowelCount === 0 && letterOnly.length >= 6)
  );
}

function pruneJoinSignals(records) {
  const now = Date.now();
  return records.filter((item) => now - Number(item?.joinedAt || 0) <= SUSPICIOUS_JOIN_WINDOW_MS);
}

function trackRecentJoinSignal(member) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  if (!guildId || !userId) return;

  const avatarHash = String(member?.user?.avatar || "");
  const nameSkeleton = toAccountNameSkeleton(
    `${member?.user?.username || ""} ${member?.user?.globalName || ""}`.trim(),
  );
  const existing = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  existing.push({
    userId,
    joinedAt: Date.now(),
    avatarHash: avatarHash || null,
    nameSkeleton: nameSkeleton || null,
  });
  if (existing.length > 2500) {
    existing.splice(0, existing.length - 2500);
  }
  recentJoinSignalsByGuild.set(guildId, existing);
}

function getJoinSignalStats(member) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  const avatarHash = String(member?.user?.avatar || "");
  if (!guildId || !userId) {
    return { reusedAvatarCount: 0, similarNameCount: 0 };
  }

  const records = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  recentJoinSignalsByGuild.set(guildId, records);
  const normalizedName = toAccountNameSkeleton(
    `${member?.user?.username || ""} ${member?.user?.globalName || ""}`.trim(),
  );

  const reusedAvatarCount = avatarHash
    ? records.filter(
        (item) =>
          item?.userId !== userId &&
          item?.avatarHash &&
          String(item.avatarHash) === avatarHash,
      ).length
    : 0;

  const similarNameCount = normalizedName
    ? records.filter(
        (item) =>
          item?.userId !== userId &&
          item?.nameSkeleton &&
          String(item.nameSkeleton) === normalizedName,
      ).length
    : 0;

  return { reusedAvatarCount, similarNameCount };
}

function detectSuspiciousAccount(member) {
  const usernameRaw = String(member?.user?.username || "");
  const globalNameRaw = String(member?.user?.globalName || "");
  const displayNameRaw = String(member?.displayName || "");
  const combinedRaw = `${usernameRaw} ${globalNameRaw} ${displayNameRaw}`.trim();
  const combinedSkeleton = toAccountNameSkeleton(combinedRaw);
  const accountAgeMs = Date.now() - new Date(member.user.createdAt).getTime();
  const ageHours = accountAgeMs / (60 * 60 * 1000);
  const ageDays = ageHours / 24;

  const suspiciousKeywords = [
    "support",
    "moderator",
    "admin",
    "staff",
    "official",
    "nitro",
    "airdrop",
    "crypto",
    "steam",
    "gift",
    "discord",
    "giveaway",
  ];

  const signalLabels = [];
  let score = 0;
  let strongSignals = 0;

  if (inviteLikeInName(combinedRaw)) {
    score += 80;
    strongSignals += 1;
    signalLabels.push("invite-link");
  }

  const keywordHits = suspiciousKeywords.filter((kw) =>
    combinedSkeleton.includes(kw),
  );
  if (keywordHits.length > 0) {
    const keywordScore = Math.min(45, 18 + keywordHits.length * 9);
    score += keywordScore;
    if (keywordHits.some((kw) => ["nitro", "airdrop", "crypto", "gift", "giveaway"].includes(kw))) {
      strongSignals += 1;
    }
    signalLabels.push(`keywords:${keywordHits.slice(0, 3).join(",")}`);
  }

  const digitCount = (combinedRaw.match(/\d/g) || []).length;
  const separatorCount = (combinedRaw.match(/[._-]/g) || []).length;
  if (digitCount >= 6) {
    score += 20;
    signalLabels.push(`digits:${digitCount}`);
  }
  if (separatorCount >= 4) {
    score += 12;
    signalLabels.push(`separators:${separatorCount}`);
  }
  if (/(.)\1{4,}/i.test(combinedRaw)) {
    score += 10;
    signalLabels.push("repeated-chars");
  }
  if (hasMixedScripts(combinedRaw)) {
    score += 30;
    strongSignals += 1;
    signalLabels.push("mixed-scripts");
  }

  if (looksRandomName(usernameRaw) || looksRandomName(globalNameRaw)) {
    score += 24;
    strongSignals += 1;
    signalLabels.push("random-name");
  }

  if (ageHours <= 24) {
    score += 32;
    signalLabels.push("age<=24h");
  } else if (ageHours <= 72) {
    score += 24;
    signalLabels.push("age<=72h");
  } else if (ageDays <= 7) {
    score += 12;
    signalLabels.push("age<=7d");
  } else if (ageDays <= 30) {
    score += 6;
    signalLabels.push("age<=30d");
  }

  if (hasNoAvatar(member) && ageDays <= 30) {
    score += 24;
    signalLabels.push("no-avatar+young");
  }

  const { reusedAvatarCount, similarNameCount } = getJoinSignalStats(member);
  if (reusedAvatarCount >= 2) {
    score += 36;
    strongSignals += 1;
    signalLabels.push(`avatar-reused:${reusedAvatarCount + 1}`);
  } else if (reusedAvatarCount === 1) {
    score += 16;
    signalLabels.push("avatar-reused:2");
  }
  if (similarNameCount >= 2) {
    score += 18;
    signalLabels.push(`name-clone:${similarNameCount + 1}`);
  }

  const suspicious =
    score >= 75 || (strongSignals >= 2 && score >= 58);
  if (suspicious) {
    return `score ${Math.min(100, score)}/100 | segnali: ${signalLabels.slice(0, 5).join(" | ")}`;
  }
  return null;
}

async function fetchRecentBotAddEntry(guild, botId) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return null;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: AUDIT_FETCH_LIMIT })
      .catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const found =
        logs.entries.find((entry) => {
          const createdTs = Number(entry?.createdTimestamp || 0);
          return (
            createdTs > 0 &&
            now - createdTs <= AUDIT_LOOKBACK_MS &&
            String(entry?.target?.id || "") === String(botId || "")
          );
        }) || null;
      if (found) return found;
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  return null;
}

async function isVerifiedBot(user) {
  if (!user?.bot) return false;
  let flags = user.flags || null;
  if (!flags && typeof user.fetchFlags === "function") {
    flags = await user.fetchFlags().catch(() => null);
  }
  return Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
}

async function isAuthorizedBotAdder(guild, executorId) {
  if (!guild || !executorId) return false;
  const executorMember =
    guild.members.cache.get(String(executorId || "")) ||
    (await guild.members.fetch(String(executorId || "")).catch(() => null));
  if (isConfiguredExempt(guild, executorId, executorMember)) return true;
  const executor = executorMember;
  if (!executor) return false;
  if (
    executor.permissions.has(PermissionsBitField.Flags.Administrator) ||
    executor.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }
  return [...JOIN_GATE_WHITELIST_ROLE_IDS].some((roleId) =>
    executor.roles.cache.has(roleId),
  );
}

async function sendJoinGatePunishDm(member, reason, extraLines = []) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`JoinGate action in ${member.guild.name}`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
        ...extraLines.filter(Boolean),
      ].join("\n"),
    );
  try {
    const dmChannel =
      member.user.dmChannel || (await member.user.createDM().catch(() => null));
    if (!dmChannel) return false;
    await dmChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

function buildJoinGateTriggeredEmbed(member, reason) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

async function kickForJoinGate(member, reason, extraLines = [], action = "kick") {
  const me = member.guild.members.me;
  const normalizedAction = ["kick", "ban", "timeout", "log"].includes(
    String(action || "").toLowerCase(),
  )
    ? String(action || "").toLowerCase()
    : "log";
  const canKick =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) &&
    Boolean(member?.kickable);
  const canBan =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) &&
    Boolean(member?.bannable);
  const canTimeout =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) &&
    Boolean(member?.moderatable);
  const joinGateCfg = getJoinGateConfigSnapshot();
  const dmPunishedMembers =
    typeof joinGateCfg?.dmPunishedMembers === "boolean"
      ? joinGateCfg.dmPunishedMembers
      : true;
  let dmSent = false;
  if (normalizedAction !== "log" && dmPunishedMembers) {
    // Try DM while we still share a guild with the user.
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  }

  let punished = false;
  let appliedAction = normalizedAction;
  if (normalizedAction === "kick" && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] kick failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && canBan) {
    punished = await member.guild.members
      .ban(member.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] ban failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && !canBan && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] kick (ban fallback) failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "kick";
  } else if (normalizedAction === "timeout" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate timeout: ${reason}`)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  }
  if (!punished && normalizedAction !== "log" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate fallback timeout: ${reason}`)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] fallback timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "timeout";
  }
  if (!punished && normalizedAction !== "log") {
    appliedAction = "log";
  }
  if (!dmSent && appliedAction !== "log" && punished && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  }
  const blocked = appliedAction === "log" ? false : punished;
  if (punished) {
    if (appliedAction === "kick") {
      markJoinGateKick(member.guild.id, member.id, reason);
    }
    // Join Gate → only feed Join Raid; do not trigger AntiNuke or AutoMod panic.
    await registerJoinRaidSecuritySignal(member, {
      reason: `Join Gate action: ${reason}`,
      enableAntiNuke: false,
      antiNukeHeat: 0,
      enableAutoMod: false,
      raidBoost: 0,
    }).catch(() => null);

    if (member.guild?.client && appliedAction !== "log") {
      const modAction =
        appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
      const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
      try {
        const config = await getModConfig(member.guild.id);
        const { doc, created } = await createModCase({
          guildId: member.guild.id,
          action: modAction,
          userId: member.id,
          modId: member.client.user.id,
          reason: `JoinGate: ${reason}`,
          durationMs,
          context: {},
          dedupe: { enabled: true, windowMs: 15_000, matchReason: true },
        });
        if (created) {
          await logModCase({ client: member.client, guild: member.guild, modCase: doc, config });
        }
      } catch (e) {
        global.logger?.warn?.("[JoinGate] ModCase creation failed:", member.guild.id, member.id, e?.message || e);
      }
    }
  }
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId
    ? (member.guild.channels.cache.get(modLogId) ||
        (await member.guild.channels.fetch(modLogId).catch(() => null)))
    : null;
  if (logChannel?.isTextBased?.()) {
    const actionLabel =
      appliedAction === "ban"
        ? "banned"
        : appliedAction === "timeout"
          ? "timed out"
          : appliedAction === "kick"
            ? "kicked"
            : "flagged";
    const embed = punished
      ? new EmbedBuilder()
          .setColor("#A97142")
          .setTitle(`${member.user.username} has been ${actionLabel}!!`)
          .setDescription(
            [
              `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
              `${ARROW} **Reason:** ${reason}`,
              ...extraLines.filter(Boolean),
              "",
              "**More Details:**",
              `${ARROW} **Member Direct Messaged?** ${dmSent ? "✅" : "❌"}`,
              `${ARROW} **Member Punished?** ${punished ? "✅" : "❌"}`,
            ].join("\n"),
          )
          .setFooter({ text: "© 2025 Vinili & Caffè. Tutti i diritti riservati." })
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      : buildJoinGateTriggeredEmbed(member, reason);
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
  return {
    blocked,
    attempted:
      appliedAction === "log"
        ? false
        : appliedAction === "ban"
          ? canBan
          : appliedAction === "kick"
            ? canKick
            : appliedAction === "timeout"
              ? canTimeout
              : false,
    punished,
    dmSent,
    canKick,
    canBan,
    canTimeout,
    action: appliedAction,
  };
}

async function sendJoinGateNoAvatarLog(member) {
  if (!member?.guild || !member?.user) return;
  if (!hasNoAvatar(member)) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId
    ? (member.guild.channels.cache.get(modLogId) ||
        (await member.guild.channels.fetch(modLogId).catch(() => null)))
    : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = buildJoinGateTriggeredEmbed(member, "Account has no avatar.");

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function sendSuspiciousAccountLog(member, reason) {
  if (!member?.guild || !reason) return;
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId
    ? (member.guild.channels.cache.get(modLogId) ||
        (await member.guild.channels.fetch(modLogId).catch(() => null)))
    : null;
  if (!logChannel?.isTextBased?.()) return;
  const embed = buildJoinGateTriggeredEmbed(member, reason);
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function handleTooYoungAccount(member, joinGateConfig = null) {
  const createdTs = toUnix(member.user.createdAt);
  const cfg = joinGateConfig || getJoinGateConfigSnapshot();
  const minAgeDays = Number(cfg?.newAccounts?.minAgeDays || 3);
  await kickForJoinGate(member, "Account is too young to be allowed.", [
    `${ARROW} **Rule:** Minimum Account Age`,
    `${ARROW} **Account Age:** <t:${createdTs}:R>`,
    `${ARROW} **Minimum Age:** ${minAgeDays} days`,
  ], cfg?.newAccounts?.action || "kick");
}

async function sendJoinLog(member) {
  const joinLeaveLogChannel = await resolveGuildChannel(
    member.guild,
    JOIN_LEAVE_LOG_CHANNEL_ID,
  );
  if (!joinLeaveLogChannel) return;

  const accountAge = formatAccountAge(member.user.createdAt);
  const joinLogEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Member Joined")
    .setDescription(
      [
        `${member.user} ${member.user.tag}.`,
        "",
        "**Account Age**",
        accountAge
      ].join("\n"),
    )
    .setFooter({ text:`ID: ${member.user.id}`})
    .setTimestamp()
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }));

  await joinLeaveLogChannel.send({ embeds: [joinLogEmbed] }).catch((err) => {
    global.logger.error("[guildMemberAdd] Failed to send join log:", err);
  });
}

async function sendDmWelcome(member) {
  const dmEmbed = buildDmWelcomeEmbed(member);
  await member.send({ embeds: [dmEmbed] }).catch((err) => {
    global.logger.warn(
      `[guildMemberAdd] Could not send DM to ${member.user.tag}:`,
      err.message,
    );
  });
}

async function announceInviteInfo(member, channel, info) {
  if (!channel || !info) return;

  if (info.isVanity) {
    await channel
      .send({
        content:
          "<:VC_Reply:1468262952934314131> L'utente ha usato il link vanity **.gg/viniliecaffe**",
      })
      .catch(() => {});
    return;
  }

  await channel
    .send({
      content: `<:VC_Reply:1468262952934314131> è entratx con il link <${info.link}>,\n-# -> invitato da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
    })
    .catch(() => {});
}

async function maybeSendInviteReward(member, info) {
  const inviteChannel = await resolveGuildChannel(
    member.guild,
    THANKS_CHANNEL_ID,
  );
  const rewardResult = await tryAwardInviteRole(member, info).catch(() => ({
    awarded: false,
    roleIds: [],
  }));
  if (!inviteChannel || !rewardResult?.awarded || !info?.inviterId) return;

  const rewardedRolesText = (rewardResult.roleIds || [])
    .map((id) => `<@&${id}>`)
    .join(", ");

  const rewardEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:ThankYou:1329504268369002507> Grazie per gli inviti!")
    .setDescription(
      `<@${info.inviterId}> hai raggiunto **${Math.max(...(rewardResult.targets || [0]))} inviti** e hai ottenuto ${rewardedRolesText || "nuovi ruoli"}` +
        `<a:Boost_Cycle:1329504283007385642> Controlla <#${INFO_PERKS_CHANNEL_ID}> per i nuovi vantaggi.`,
    );
  await inviteChannel.send({ embeds: [rewardEmbed] }).catch(() => {});
}

async function maybeSendInviteNearRewardReminder(member, info) {
  if (!member?.guild || !info || info.isVanity || !info.inviterId) return;
  const totalInvites = Number(info.totalInvites || 0);
  const nextTier = getNextInviteRewardTier(totalInvites);
  if (!nextTier) return;
  if (Number(nextTier.target || 0) - totalInvites !== 1) return;

  const inviterId = String(info.inviterId);
  const guild = member.guild;
  const inviterMember =
    guild.members.cache.get(inviterId) ||
    (await guild.members.fetch(inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return;

  const noDmSet = await getNoDmSet(guild.id).catch(() => new Set());
  if (noDmSet.has(inviterId)) return;

  const state = await InviteReminderState.findOne({
    guildId: guild.id,
    userId: inviterId,
  }).lean().catch(() => null);
  const sentTargets = Array.isArray(state?.inviteNearTargets)
    ? state.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
    : [];
  if (sentTargets.includes(Number(nextTier.target || 0))) return;

  const rewardRoleText = (Array.isArray(nextTier.roleIds) ? nextTier.roleIds : [])
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "ruolo reward inviti";
  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Ci sei quasi con gli inviti!")
        .setDescription(
          [
            `<a:VC_PandaClap:1331620157398712330> Ti manca solo **1 invito** per arrivare a **${nextTier.target}**.`,
            `Quando raggiungi la soglia, ricevi ${rewardRoleText}.`,
            INFO_PERKS_CHANNEL_ID
              ? `Controlla i perks in <#${INFO_PERKS_CHANNEL_ID}>.`
              : "Controlla il canale info del server.",
          ].join("\n"),
        ),
    ],
  };

  const sent = await inviterMember.user.send(payload).then(() => true).catch(() => false);
  if (!sent) return;

  await InviteReminderState.updateOne(
    { guildId: guild.id, userId: inviterId },
    { $addToSet: { inviteNearTargets: Number(nextTier.target || 0) } },
    { upsert: true },
  ).catch(() => null);
}

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    try {
      if (!member?.guild || !member?.user) return;
      const joinGateConfig = getJoinGateConfigSnapshot();
      const isCoreExempt = isConfiguredExempt(member?.guild, member?.id, member);
      if (!isCoreExempt) {
        const lockState = await getSecurityLockState(member.guild);
        if (lockState.joinLockActive) {
          await kickForJoinGate(
            member,
            "Ingresso bloccato: lockdown di sicurezza attivo.",
            [
              `${ARROW} **Rule:** Security Join Lock`,
              `${ARROW} **Sources:** ${lockState.sources.join(", ")}`,
            ],
            "kick",
          );
          return;
        }
      }

      if (member.user?.bot) {
        if (isCoreExempt) {
          await sendJoinLog(member);
          return;
        }
        await sendJoinLog(member);
        await handleBotJoin(member, joinGateConfig);
        return;
      }

      // Come Wick: Join Raid gira per ogni join (regardless of Join Gate). Se Join Gate fa match si passa joinGateFeedOnly per non doppia escalation.
      if (!isCoreExempt) {
        trackRecentJoinSignal(member);
        let joinGateMatch = null;
        if (
          joinGateConfig?.enabled &&
          joinGateConfig?.newAccounts?.enabled &&
          isTooYoungAccount(member, joinGateConfig?.newAccounts?.minAgeDays)
        ) {
          joinGateMatch = {
            rule: "tooYoung",
            action: joinGateConfig?.newAccounts?.action || "kick",
          };
        }
        if (!joinGateMatch && joinGateConfig?.enabled && joinGateConfig?.noAvatar?.enabled && hasNoAvatar(member)) {
          joinGateMatch = {
            rule: "noAvatar",
            reason: "Account has no avatar.",
            extraLines: [`${ARROW} **Rule:** No Avatar`],
            action: joinGateConfig?.noAvatar?.action || "log",
          };
        }
        const nameCandidate = getJoinGateNameCandidate(member);
        if (
          !joinGateMatch &&
          joinGateConfig?.enabled &&
          joinGateConfig?.advertisingName?.enabled &&
          inviteLikeInName(nameCandidate)
        ) {
          joinGateMatch = {
            rule: "advertising",
            reason: "Advertising invite link in username.",
            extraLines: [
              `${ARROW} **Rule:** Advertising Name`,
              `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.advertisingName?.action || "kick",
          };
        }
        const usernameMatch =
          !joinGateMatch && joinGateConfig?.enabled
            ? matchUsernameFilters(nameCandidate, joinGateConfig?.usernameFilter)
            : null;
        if (!joinGateMatch && usernameMatch) {
          joinGateMatch = {
            rule: "usernameFilter",
            reason: "Username matches blocked pattern.",
            extraLines: [
              `${ARROW} **Rule:** Username Filter`,
              `${ARROW} **Match Type:** ${usernameMatch.type}`,
              `${ARROW} **Match:** ${usernameMatch.value}`,
              `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.usernameFilter?.action || "kick",
          };
        }
        const suspiciousReason =
          joinGateConfig?.enabled && joinGateConfig?.suspiciousAccount?.enabled
            ? detectSuspiciousAccount(member)
            : null;
        if (suspiciousReason) {
          await markJoinGateSuspiciousAccount(member.guild.id, member.id, {
            source: "joingate",
            reason: suspiciousReason,
          }).catch(() => null);
        }
        if (!joinGateMatch && suspiciousReason) {
          joinGateMatch = {
            rule: "suspicious",
            reason: `Suspicious account: ${suspiciousReason}`,
            extraLines: [
              `${ARROW} **Rule:** Suspicious Account`,
              `${ARROW} **Reason:** ${suspiciousReason}`,
            ],
            action: joinGateConfig?.suspiciousAccount?.action || "log",
          };
        }
        await processJoinRaidForMember(member, { joinGateFeedOnly: !!joinGateMatch }).catch((err) => {
          global.logger?.warn?.("[guildMemberAdd] Join Raid failed:", member.guild.id, member.id, err?.message || err);
        });
        if (joinGateMatch) {
          if (joinGateMatch.rule === "tooYoung") {
            await handleTooYoungAccount(member, joinGateConfig);
            return;
          }
          const kickResult = await kickForJoinGate(
            member,
            joinGateMatch.reason,
            joinGateMatch.extraLines || [],
            joinGateMatch.action,
          );
          if (kickResult?.blocked) return;
        }
      }

      if (isCoreExempt) {
        scheduleMemberCounterRefresh(member.guild, {
          delayMs: 250,
          secondPassMs: 1800,
        });
        await applyRolePersistForMember(member).catch(() => {});
        await sendJoinLog(member);
        return;
      }

      const welcomeChannel = await resolveGuildChannel(
        member.guild,
        IDs.channels.chat,
      );
      if (!welcomeChannel) {
        global.logger.info("[guildMemberAdd] Welcome channel not found.");
      }

      scheduleMemberCounterRefresh(member.guild, {
        delayMs: 250,
        secondPassMs: 1800,
      });
      await applyRolePersistForMember(member).catch(() => {});
      await sendJoinLog(member);
      await sendDmWelcome(member);

      if (welcomeChannel) {
        await welcomeChannel
          .send({
            content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
            embeds: [buildWelcomeEmbed(member)],
          })
          .catch(() => {});
      }

      const info = await resolveInviteInfo(member).catch(() => null);
      if (info && !info.isVanity && info.inviterId) {
        await trackInviteJoin(member, info.inviterId).catch(() => {});
      }
      await maybeSendInviteNearRewardReminder(member, info);
      await maybeSendInviteReward(member, info);
      await announceInviteInfo(member, welcomeChannel, info);
    } catch (error) {
      global.logger?.error?.("[guildMemberAdd] failed:", error);
    }
  },
};