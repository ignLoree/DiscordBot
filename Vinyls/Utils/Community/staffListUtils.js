const IDs = require("../Config/ids");
const { getClientGuildCached, getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const StaffModel = require("../../Schemas/Staff/staffSchema");
const STAFF_LIST_MARKER = "staff list";
const STAFF_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_UP = { [String(IDs.roles.Member || "")]: String(IDs.roles.Helper), [String(IDs.roles.Helper)]: String(IDs.roles.Mod), [String(IDs.roles.Mod)]: String(IDs.roles.Coordinator), [String(IDs.roles.Coordinator)]: String(IDs.roles.Supervisor) };
const ROLE_EMOJIS = { [IDs.roles.PartnerManager]: { emoji: "<:partnermanager:1443651916838998099>"}, [IDs.roles.Helper]: { emoji: "<:helper:1443651909448630312>" }, [IDs.roles.Mod]: { emoji: "<:mod:1443651914209165454>" }, [IDs.roles.Coordinator]: { emoji: "<:coordinator:1443651923168202824>" }, [IDs.roles.Supervisor]: { emoji: "<:supervisor:1443651907900932157>" }, [IDs.roles.Admin]: { emoji: "<:admin:1443651911059247225>" }, [IDs.roles.Manager]: { emoji: "<:manager:1443651919829536940>" }, [IDs.roles.CoFounder]: { emoji: "<:cofounder:1443651915752804392>" }, [IDs.roles.Founder]: { emoji: "<:founder:1443651924674216128>" }, };
const ROLE_EXCLUSIONS = { [IDs.roles.PartnerManager]: ["1442568907801100419"], };
const STAFF_ROLE_IDS = Object.keys(ROLE_EMOJIS);

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function ensureState(client) {
  if (!client._staffListState) {
    client._staffListState = {
      messageIdByGuild: new Map(),
      contentHashByGuild: new Map(),
      timersByGuild: new Map(),
    };
  }
  return client._staffListState;
}

function iterMembers(membersSource) {
  if (!membersSource) return [];
  if (typeof membersSource.values === "function") return membersSource.values();
  if (Array.isArray(membersSource)) return membersSource.values();
  return [];
}

function memberHasStaffRole(member) {
  return STAFF_ROLE_IDS.some((roleId) => member?.roles?.cache?.has?.(roleId));
}

function didStaffMembershipChange(oldMember, newMember) {
  return memberHasStaffRole(oldMember) !== memberHasStaffRole(newMember);
}

function isPexEntry(row) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  const isPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
  const reasonHasPex = String(row?.reason || "").toLowerCase().includes("pex");
  const isPartnerManagerPex = newRole === String(IDs.roles.PartnerManager || "");
  return isPromotion || reasonHasPex || isPartnerManagerPex;
}

async function getStaffPexedLast7Days(guildId) {
  const since = new Date(Date.now() - STAFF_NEW_DAYS_MS);
  const docs = await StaffModel.find(
    { guildId: String(guildId) },
    { userId: 1, rolesHistory: 1 },
  )
    .lean()
    .catch(() => []);
  const out = new Set();
  for (const doc of docs || []) {
    const history = Array.isArray(doc?.rolesHistory) ? doc.rolesHistory : [];
    const pexedInWindow = history.some((row) => {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return false;
      if (when.getTime() < since.getTime()) return false;
      return isPexEntry(row);
    });
    if (pexedInWindow && doc?.userId) out.add(String(doc.userId));
  }
  return out;
}

function buildContent(guild, membersSource = guild.members.cache, pexedLast7Days = new Set()) {
  const staffRoleIds = STAFF_ROLE_IDS.slice().reverse();
  let content = "## STAFF LIST\n\n";

  for (const roleId of staffRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;

    const excludedMembers = new Set(ROLE_EXCLUSIONS[roleId] || []);
    const filteredMembers = [];
    for (const member of iterMembers(membersSource)) {
      if (!member?.roles?.cache?.has?.(roleId)) continue;
      if (excludedMembers.has(member.id)) continue;
      filteredMembers.push(member);
    }

    const memberCount = filteredMembers.length;
    const { emoji } = ROLE_EMOJIS[roleId];
    const membersList = filteredMembers
      .map((member) => {
        const newBadge = pexedLast7Days.has(member.id) ? ` ${STAFF_NEW_EMOJI}` : "";
        return `<:dot:1443660294596329582> <@${member.id}>${newBadge}`;
      })
      .join("\n") || "<:dot:1443660294596329582>";

    content += `${emoji} **<@&${roleId}>︲\`${memberCount}\`**\n\n${membersList}\n\n`;
  }

  return content;
}

async function resolveMessage(channel, client, guildId) {
  const state = ensureState(client);
  const knownId = state.messageIdByGuild.get(guildId);
  if (knownId) {
    const known = channel.messages.cache.get(knownId) || (await channel.messages.fetch(knownId).catch(() => null));
    if (known) return known;
    state.messageIdByGuild.delete(guildId);
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const existing = messages?.find((message) => message.author?.id === client.user?.id && String(message.content || "").toLowerCase().includes(STAFF_LIST_MARKER),) || null;
  if (existing) state.messageIdByGuild.set(guildId, existing.id);
  return existing;
}

async function fetchMembersForStaffList(guild) {
  const all = new Map();
  let after = null;
  const limit = 1000;

  while (true) {
    const chunk = await guild.members
      .fetch({ limit, after: after ?? undefined, force: true })
      .catch(() => null);
    if (!chunk?.size) break;

    for (const [id, member] of chunk) all.set(id, member);

    if (chunk.size < limit) break;
    const last = chunk.last?.();
    after = last?.id ?? null;
    await wait(400);
  }

  return all.size ? all : guild.members.cache;
}

async function refreshStaffList(client, guildId = IDs.guilds.main, { force = false } = {}) {
  const state = ensureState(client);
  const guild = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
  if (!guild) return;

  const channelId = IDs.channels.staffList;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return;

  const membersSource = await fetchMembersForStaffList(guild);
  const pexedLast7Days = await getStaffPexedLast7Days(guild.id);

  const content = buildContent(guild, membersSource, pexedLast7Days);
  const previousHash = state.contentHashByGuild.get(guildId);
  if (!force && previousHash === content) return;

  const message = await resolveMessage(channel, client, guildId);
  if (
    !force &&
    !previousHash &&
    message &&
    message.content !== null &&
    message.content !== undefined
  ) {
    if (String(message.content).trim() === String(content).trim()) {
      state.contentHashByGuild.set(guildId, content);
      return;
    }
  }

  if (message) {
    if (force || message.content !== content) {
      const edited = await message.edit(content).catch(() => null);
      if (edited) state.messageIdByGuild.set(guildId, edited.id);
    }
  } else {
    const sent = await channel.send(content).catch(() => null);
    if (sent) state.messageIdByGuild.set(guildId, sent.id);
  }

  state.contentHashByGuild.set(guildId, content);
}

function scheduleStaffListRefresh(client, guildId = IDs.guilds.main, delayMs = 500) {
  const state = ensureState(client);
  const existingTimer = state.timersByGuild.get(guildId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => { state.timersByGuild.delete(guildId); refreshStaffList(client, guildId).catch((err) => { global.logger.error("[STAFF LIST] refresh failed:", err); }); }, delayMs);
  timer.unref?.();

  state.timersByGuild.set(guildId, timer);
}

module.exports = { STAFF_ROLE_IDS, memberHasStaffRole, didStaffMembershipChange, refreshStaffList, scheduleStaffListRefresh };