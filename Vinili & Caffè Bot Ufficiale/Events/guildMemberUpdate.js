const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const {
  scheduleStaffListRefresh,
} = require("../Utils/Community/staffListUtils");

const PERK_ROLE_ID = IDs.roles.PicPerms;
const BOOST_FOLLOWUP_DELAY_MS = 5000;

const PLUS_COLOR_REQUIRED_ROLE_IDS = [
  IDs.roles.ServerBooster,
  IDs.roles.Level50,
];
const PLUS_COLOR_ROLE_IDS = [
  IDs.roles.redPlus,
  IDs.roles.orangePlus,
  IDs.roles.yellowPlus,
  IDs.roles.greenPlus,
  IDs.roles.bluePlus,
  IDs.roles.purplePlus,
  IDs.roles.pinkPlus,
  IDs.roles.blackPlus,
  IDs.roles.grayPlus,
  IDs.roles.whitePlus,
  IDs.roles.YinYangPlus,
];

const boostCountCache = new Map();
const boostAnnounceCache = new Map();
const boostFollowupLocks = new Map();

function hasManageRolesPermission(member) {
  const me = member.guild.members.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageRoles));
}

async function addPerkRoleIfPossible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;

  await member.roles.add(role).catch(() => {});
}

async function removePlusColorsIfNotEligible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const hasRequiredRole = PLUS_COLOR_REQUIRED_ROLE_IDS.some((roleId) =>
    member.roles.cache.has(roleId),
  );
  if (hasRequiredRole) return;

  const heldPlusRoles = PLUS_COLOR_ROLE_IDS.filter((roleId) =>
    member.roles.cache.has(roleId),
  );
  if (!heldPlusRoles.length) return;

  const removableRoleIds = heldPlusRoles.filter((roleId) => {
    const role = member.guild.roles.cache.get(roleId);
    return role && role.position < me.roles.highest.position;
  });
  if (!removableRoleIds.length) return;

  await member.roles.remove(removableRoleIds).catch(() => {});
}

function buildBoostEmbed(member, boostCount) {
  return new EmbedBuilder()
    .setAuthor({ name: member.user.username })
    .setTitle(
      "<a:vegarightarrow:1443673039156936837> **__GRAZIE PER IL BOOST!__**",
    )
    .setDescription(
      `<a:ThankYou:1329504268369002507> **Grazie** ${member.user} per aver **boostato** **${member.guild.name}**!
<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.
> <a:Boost_Cycle:1329504283007385642> Ora hai dei **nuovi** perks, vai a __controllarli__ in <#1442569111119990887>!`,
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(member.user.displayAvatarURL());
}

async function sendBoostEmbeds(channel, member, times, boostCount) {
  const safeTimes = Math.max(0, Number(times || 0));
  for (let i = 0; i < safeTimes; i += 1) {
    await channel.send({
      content: `<a:VC_Boost:1448670271115497617> \`┊\`  ${member.user} \`┊\` <@&1442568910070349985>`,
      embeds: [buildBoostEmbed(member, boostCount)],
    });
  }
}

function rolesChanged(oldMember, newMember) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;

  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role) => !newRoles.has(role.id)) ||
    newRoles.some((role) => !oldRoles.has(role.id))
  );
}

function computeBoostDelta(oldMember, newMember, guildId) {
  const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
  const oldCountFromEvent = Number(
    oldMember?.guild?.premiumSubscriptionCount || 0,
  );
  const prevCount =
    typeof boostCountCache.get(guildId) === "number"
      ? boostCountCache.get(guildId)
      : oldCountFromEvent;
  const effectivePrev = oldCountFromEvent > 0 ? oldCountFromEvent : prevCount;
  const countIncreased = currentCount > effectivePrev;
  const boostDelta = countIncreased
    ? Math.max(1, currentCount - effectivePrev)
    : 0;

  return { currentCount, countIncreased, boostDelta };
}

function scheduleBoostFollowup(
  boostAnnounceChannel,
  newMember,
  guildId,
  boostKey,
  currentCount,
) {
  if (boostFollowupLocks.get(boostKey)) return;

  boostFollowupLocks.set(boostKey, true);
  setTimeout(async () => {
    try {
      const freshGuild = await newMember.guild.fetch().catch(() => null);
      const latestCount = Number(
        freshGuild?.premiumSubscriptionCount ||
          newMember.guild.premiumSubscriptionCount ||
          0,
      );
      const knownCount = Number(boostCountCache.get(guildId) || currentCount);
      const missing = Math.max(0, latestCount - knownCount);

      if (missing > 0) {
        await sendBoostEmbeds(
          boostAnnounceChannel,
          newMember,
          missing,
          latestCount,
        );
        boostAnnounceCache.set(boostKey, latestCount);
        boostCountCache.set(guildId, latestCount);
      }
    } catch {
    } finally {
      boostFollowupLocks.delete(boostKey);
    }
  }, BOOST_FOLLOWUP_DELAY_MS);
}

async function handleBoostUpdate(oldMember, newMember) {
  const boostAnnounceChannel = newMember.guild.channels.cache.get(
    IDs.channels.supporters,
  );
  if (!boostAnnounceChannel) return;

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  const guildId = newMember.guild.id;
  const boostKey = `${guildId}:${newMember.id}`;

  const { currentCount, countIncreased, boostDelta } = computeBoostDelta(
    oldMember,
    newMember,
    guildId,
  );
  if (!(newBoostTs && (newBoostTs !== oldBoostTs || countIncreased))) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  const lastAnnouncedCount = boostAnnounceCache.get(boostKey);
  if (countIncreased && lastAnnouncedCount === currentCount) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  await addPerkRoleIfPossible(newMember);
  const sendTimes = countIncreased ? boostDelta : 1;
  await sendBoostEmbeds(
    boostAnnounceChannel,
    newMember,
    sendTimes,
    currentCount,
  );
  boostAnnounceCache.set(boostKey, currentCount);

  scheduleBoostFollowup(
    boostAnnounceChannel,
    newMember,
    guildId,
    boostKey,
    currentCount,
  );
  boostCountCache.set(guildId, currentCount);
}

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    try {
      if (
        newMember?.guild?.id === IDs.guilds.main &&
        rolesChanged(oldMember, newMember)
      ) {
        scheduleStaffListRefresh(client, newMember.guild.id);
      }

      await removePlusColorsIfNotEligible(newMember);
      await handleBoostUpdate(oldMember, newMember);
    } catch (error) {
      global.logger.error(error);
    }
  },
};
