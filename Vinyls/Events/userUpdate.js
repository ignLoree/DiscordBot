const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { getJoinGateConfigSnapshot } = require("../Services/Moderation/joinGateService");
const {
  kickForJoinGate,
  matchUsernameFilters,
  getJoinGateNameCandidate,
} = require("./guildMemberAdd");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("../Services/Moderation/securityProfilesService");

const ARROW = "<:VC_right_arrow:1482459908245815296>";
const CORE_EXEMPT_USER_IDS = new Set(["1466495522474037463", "1329118940110127204"]);
const USER_UPDATE_DEDUPE_MS = 15_000;
const recentUserUpdateActions = new Map();

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

function makeUserUpdateDedupeKey(guildId, userId, match) {
  return [String(guildId || ""), String(userId || ""), String(match?.type || ""), String(match?.value || "")].join(":");
}

function shouldSkipRecentUserUpdateAction(guildId, userId, match) {
  const key = makeUserUpdateDedupeKey(guildId, userId, match);
  const now = Date.now();
  const lastAt = Number(recentUserUpdateActions.get(key) || 0);
  if (now - lastAt < USER_UPDATE_DEDUPE_MS) return true;
  recentUserUpdateActions.set(key, now);
  return false;
}

async function punishUsernameMatchPostJoin(member, match, cfg) {
  const reason = "Username matches blocked pattern (post-join filter).";
  const extraLines = [
    `${ARROW} **Rule:** Username Filter (post-join)`,
    `${ARROW} **Match Type:** ${match.type}`,
    `${ARROW} **Match:** ${match.value}`,
  ];
  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  if (action === "log") {
    const logChannel = IDs.channels.modLogs
      ? member.guild.channels.cache.get(IDs.channels.modLogs) ||
        (await getGuildChannelCached(member.guild, IDs.channels.modLogs))
      : null;
    if (logChannel?.isTextBased?.()) {
      await logChannel
        .send({ embeds: [buildJoinGateTriggeredEmbed(member, reason)] })
        .catch(() => {});
    }
    return;
  }
  await kickForJoinGate(member, reason, extraLines, action);
}

module.exports = {
  name: "userUpdate",
  async execute(oldUser, newUser, client) {
    try {
      const resolvedClient = client || newUser?.client || oldUser?.client;
      if (!resolvedClient || !newUser?.id) return;

      const usernameChanged = oldUser?.username !== newUser?.username;
      const globalNameChanged = oldUser?.globalName !== newUser?.globalName;

      if (!newUser?.bot) {
        if (!usernameChanged && !globalNameChanged) return;
        const cfg = getJoinGateConfigSnapshot();
        if (
          !cfg?.enabled ||
          !cfg?.usernameFilter?.enabled ||
          !cfg?.usernameFilter?.postJoinEnabled
        ) {
          return;
        }
        const nameCandidate = getJoinGateNameCandidate({
          user: newUser,
          displayName: newUser.globalName || newUser.username,
        });
        const match = matchUsernameFilters(nameCandidate, cfg.usernameFilter);
        if (!match) return;
        for (const guild of resolvedClient.guilds.cache.values()) {
          if (
            CORE_EXEMPT_USER_IDS.has(String(newUser.id)) ||
            String(guild.ownerId || "") === String(newUser.id) ||
            isSecurityProfileImmune(String(guild?.id || ""), String(newUser.id || ""))
          ) {
            continue;
          }
          const member =
            guild.members.cache.get(newUser.id) || (await getGuildMemberCached(guild, newUser.id));
          if (!member || member.user?.bot) continue;
          if (hasAdminsProfileCapability(member, "fullImmunity")) continue;
          if (shouldSkipRecentUserUpdateAction(guild.id, newUser.id, match)) continue;
          await punishUsernameMatchPostJoin(member, match, cfg);
        }
        return;
      }

      for (const guild of resolvedClient.guilds.cache.values()) {
        queueIdsCatalogSync(resolvedClient, guild.id, "botUserUpdate");
      }
    } catch (error) {
      global.logger?.error?.("[userUpdate] failed:", error);
    }
  },
};