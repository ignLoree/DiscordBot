const IDs = require('../Config/ids');

const STAFF_LIST_MARKER = 'staff list';
const ROLE_EMOJIS = {
  [IDs.roles.PartnerManager]: { emoji: '<:partnermanager:1443651916838998099>', number: '∞' },
  [IDs.roles.Helper]: { emoji: '<:helper:1443651909448630312>', number: '∞' },
  [IDs.roles.Mod]: { emoji: '<:mod:1443651914209165454>', number: '6' },
  [IDs.roles.Coordinator]: { emoji: '<:coordinator:1443651923168202824>', number: '4' },
  [IDs.roles.Supervisor]: { emoji: '<:supervisor:1443651907900932157>', number: '4' },
  [IDs.roles.Admin]: { emoji: '<:admin:1443651911059247225>', number: '4' },
  [IDs.roles.Manager]: { emoji: '<:manager:1443651919829536940>', number: '1' },
  [IDs.roles.CoFounder]: { emoji: '<:cofounder:1443651915752804392>', number: '2' },
  [IDs.roles.Founder]: { emoji: '<:founder:1443651924674216128>', number: '1' }
};
const ROLE_EXCLUSIONS = {
  [IDs.roles.PartnerManager]: ['1442568907801100419']
};
const STAFF_ROLE_IDS = Object.keys(ROLE_EMOJIS);

function ensureState(client) {
  if (!client._staffListState) {
    client._staffListState = {
      messageIdByGuild: new Map(),
      contentHashByGuild: new Map(),
      timersByGuild: new Map()
    };
  }
  return client._staffListState;
}

function buildContent(guild) {
  const staffRoleIds = STAFF_ROLE_IDS.slice().reverse();
  let content = '<:pinnednew:1443670849990430750> La __**staff list**__ serve per sapere i __**limiti di ogni ruolo**__, per capire __**quanti staffer ci sono**__ e per poter capire a chi __**chiedere assistenza**__.\n\n';
  for (const roleId of staffRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    const staffMembers = guild.members.cache.filter((member) => member.roles.cache.has(roleId));
    const excludedMembers = ROLE_EXCLUSIONS[roleId] || [];
    const filteredMembers = staffMembers.filter((member) => !excludedMembers.includes(member.id));
    const memberCount = filteredMembers.size;
    const { emoji, number } = ROLE_EMOJIS[roleId];
    const membersList = filteredMembers.map((member) => `<:dot:1443660294596329582> <@${member.id}>`).join('\n') || '<:dot:1443660294596329582>';
    content += `${emoji} • **<@&${roleId}>︲\`${memberCount}/${number}\`**\n\n${membersList}\n\n`;
  }
  return content;
}

async function resolveMessage(channel, client, guildId) {
  const state = ensureState(client);
  const knownId = state.messageIdByGuild.get(guildId);
  if (knownId) {
    const known = channel.messages.cache.get(knownId) || await channel.messages.fetch(knownId).catch(() => null);
    if (known) return known;
    state.messageIdByGuild.delete(guildId);
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const existing = messages?.find((message) =>
    message.author?.id === client.user?.id
    && String(message.content || '').toLowerCase().includes(STAFF_LIST_MARKER)
  ) || null;
  if (existing) state.messageIdByGuild.set(guildId, existing.id);
  return existing;
}

async function refreshStaffList(client, guildId = IDs.guilds.main, { force = false } = {}) {
  const state = ensureState(client);
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const channelId = IDs.channels.staffList;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  await guild.members.fetch().catch(() => {});
  const content = buildContent(guild);
  const previousHash = state.contentHashByGuild.get(guildId);
  if (!force && previousHash === content) return;

  const message = await resolveMessage(channel, client, guildId);
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

function scheduleStaffListRefresh(client, guildId = IDs.guilds.main, delayMs = 1200) {
  const state = ensureState(client);
  const existingTimer = state.timersByGuild.get(guildId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    state.timersByGuild.delete(guildId);
    refreshStaffList(client, guildId).catch((err) => {
      global.logger.error('[STAFF LIST] refresh failed:', err);
    });
  }, delayMs);
  state.timersByGuild.set(guildId, timer);
}

module.exports = {
  STAFF_ROLE_IDS,
  refreshStaffList,
  scheduleStaffListRefresh
};
