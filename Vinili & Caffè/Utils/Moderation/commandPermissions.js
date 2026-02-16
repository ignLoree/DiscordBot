const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const IDs = require('../Config/ids');
const { buildPrefixLookupKeys, buildSlashLookupKeys, hasTemporaryCommandPermission } = require('./temporaryCommandPermissions');
const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');
const EMPTY_PERMISSIONS = { slash: {}, prefix: {}, buttons: {}, selectMenus: {}, modals: {} };
let cache = { mtimeMs: 0, data: EMPTY_PERMISSIONS };
let idsFallbackCache = null;

const SPONSOR_GUILD_IDS = new Set([
  '1471511676019933354',
  '1471511928739201047',
  '1471512183547498579',
  '1471512555762483330',
  '1471512797140484230',
  '1471512808448458958'
]);

function isSponsorGuild(guildId) {
  return SPONSOR_GUILD_IDS.has(String(guildId || ''));
}

function hasSponsorStaffPerms(member) {
  if (!member) return false;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

function hasAdministrator(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

const TICKET_BUTTON_IDS = new Set([
  'ticket_partnership', 'ticket_highstaff', 'ticket_supporto', 'ticket_open_desc_modal',
  'claim_ticket', 'unclaim', 'close_ticket', 'close_ticket_motivo'
]);


function getIdsConfig() {
  if (idsFallbackCache) return idsFallbackCache;
  try {
    idsFallbackCache = require('../Config/ids');
    return idsFallbackCache;
  } catch {
    return {};
  }
}

function loadPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) return EMPTY_PERMISSIONS;
    const stat = fs.statSync(PERMISSIONS_PATH);
    if (cache.data && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const raw = fs.readFileSync(PERMISSIONS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    cache = { mtimeMs: stat.mtimeMs, data: parsed || EMPTY_PERMISSIONS };
    return cache.data;
  } catch {
    return EMPTY_PERMISSIONS;
  }
}

function resolveRoleReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith('ids.roles.')) key = key.slice('ids.roles.'.length);
  else if (key.startsWith('roles.')) key = key.slice('roles.'.length);

  const idsCfg = (typeof IDs !== 'undefined' && IDs) ? IDs : getIdsConfig();
  const resolved = idsCfg?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds
    .map((value) => resolveRoleReference(value))
    .filter(Boolean);
}

function collectMemberRoleIds(member) {
  if (!member) return new Set();
  const ids = new Set();

  const cache = member?.roles?.cache;
  if (cache && typeof cache.forEach === 'function') {
    cache.forEach((_, roleId) => ids.add(String(roleId)));
  }

  const rawRoles = member?.roles;
  if (Array.isArray(rawRoles)) {
    for (const roleId of rawRoles) {
      if (roleId) ids.add(String(roleId));
    }
  } else if (rawRoles && Array.isArray(rawRoles._roles)) {
    for (const roleId of rawRoles._roles) {
      if (roleId) ids.add(String(roleId));
    }
  }

  const plainRoles = Array.isArray(member?._roles) ? member._roles : [];
  for (const roleId of plainRoles) {
    if (roleId) ids.add(String(roleId));
  }

  return ids;
}

function hasAnyRole(member, roleIds) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized)) return true;
  if (normalized.length === 0) return false;
  const memberRoleIds = collectMemberRoleIds(member);
  if (!memberRoleIds.size) return false;
  return normalized.some((roleId) => memberRoleIds.has(String(roleId)));
}

async function fetchLiveMember(entity) {
  const guild = entity?.guild || entity?.member?.guild || null;
  const userId =
    entity?.user?.id
    || entity?.author?.id
    || entity?.member?.id
    || entity?.member?.user?.id
    || null;
  if (!guild || !userId || typeof guild.members?.fetch !== 'function') return null;
  return guild.members.fetch(userId).catch(() => null);
}

async function hasAnyRoleWithLiveFallback(entity, roleIds) {
  if (hasAnyRole(entity?.member, roleIds)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAnyRole(freshMember, roleIds);
}

function resolveSlashRoles(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== 'object') return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key])) return normalizeRoleList(subcommands[key]);
  }
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === 'string') {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolvePrefixRoles(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== 'object') return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === 'string') {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolveComponentPolicy(map, customId) {
  if (!map || typeof map !== 'object') return null;

  if (Object.prototype.hasOwnProperty.call(map, customId)) {
    return map[customId];
  }

  const wildcardKeys = Object.keys(map)
    .filter((key) => key.endsWith('*'))
    .sort((a, b) => b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }

  return null;
}

function normalizeButtonPolicy(policy) {
  if (policy == null) return null;

  if (typeof policy === 'string') {
    const resolved = resolveRoleReference(policy);
    return { roles: resolved ? [resolved] : [] };
  }

  if (Array.isArray(policy)) {
    return { roles: normalizeRoleList(policy) };
  }

  if (typeof policy === 'object') {
    let roles = null;
    if (Array.isArray(policy.roles)) {
      roles = normalizeRoleList(policy.roles);
    } else if (typeof policy.roles === 'string') {
      const resolved = resolveRoleReference(policy.roles);
      roles = resolved ? [resolved] : [];
    }

    const parsedOwnerSegment = Number.parseInt(policy.ownerSegment, 10);
    const ownerSegment = Number.isFinite(parsedOwnerSegment) ? parsedOwnerSegment : null;
    const ownerSeparator = typeof policy.ownerSeparator === 'string' && policy.ownerSeparator.length > 0
      ? policy.ownerSeparator
      : ':';
    const ownerFromMessageMention = Boolean(policy.ownerFromMessageMention);

    return { roles, ownerSegment, ownerSeparator, ownerFromMessageMention };
  }

  return null;
}

function extractOwnerIdFromMessageMention(message) {
  if (!message) return null;

  const scan = (text) => {
    const match = String(text || '').match(/<@!?(\d{16,20})>/);
    return match?.[1] || null;
  };

  const fromContent = scan(message.content);
  if (fromContent) return fromContent;

  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const fromDescription = scan(embed?.description);
    if (fromDescription) return fromDescription;
    const fromTitle = scan(embed?.title);
    if (fromTitle) return fromTitle;
    const fields = Array.isArray(embed?.fields) ? embed.fields : [];
    for (const field of fields) {
      const fromFieldName = scan(field?.name);
      if (fromFieldName) return fromFieldName;
      const fromFieldValue = scan(field?.value);
      if (fromFieldValue) return fromFieldValue;
    }
  }

  return null;
}

function getDevIds(client) {
  const rawIds = IDs?.developers ?? IDs?.guilds?.developers ?? '';
  const fromIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id).trim()).filter(Boolean)
    : String(rawIds).split(',').map((id) => id.trim()).filter(Boolean);
  const raw = client?.config?.developers ?? '';
  const fromConfig = Array.isArray(raw)
    ? raw.map((id) => String(id).trim()).filter(Boolean)
    : String(raw).split(',').map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set([...fromIds, ...fromConfig]));
}

async function checkSlashPermission(interaction) {
  const userId = interaction?.user?.id || null;

  if (interaction.commandName === 'dmbroadcast') {
    const client = interaction.client;
    const devIds = getDevIds(client);
    if (devIds.length === 0) return false;
    return devIds.includes(userId);
  }

  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  if (guildId && userId) {
    const group = interaction.options?.getSubcommandGroup?.(false) || null;
    const sub = interaction.options?.getSubcommand?.(false) || null;
    const keys = buildSlashLookupKeys(interaction.commandName, group, sub);
    const hasOverride = await hasTemporaryCommandPermission({ guildId, userId, keys });
    if (hasOverride) return true;
  }

  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  if (!Array.isArray(roles)) return true;
  if (!interaction.inGuild()) return false;
  return hasAnyRoleWithLiveFallback(interaction, roles);
}

async function checkPrefixPermission(message, commandName, subcommandName = null) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  if (commandName === 'ticket' && isSponsorGuild(message?.guild?.id)) {
    if (!subcommandName) return true;

    const staffSubs = new Set([
      'add', 'remove', 'closerequest', 'close', 'claim', 'unclaim', 'switchpanel', 'rename'
    ]);

    if (staffSubs.has(String(subcommandName))) {
      return hasSponsorStaffPerms(message.member);
    }

    return true;
  }

  if ((commandName === 'ticket' || commandName === 'verify') && message.guild && message.member && hasAdministrator(message.member)) {
    return true;
  }

  if (guildId && userId) {
    const keys = buildPrefixLookupKeys(commandName, subcommandName);
    const hasOverride = await hasTemporaryCommandPermission({ guildId, userId, keys });
    if (hasOverride) return true;
  }

  const data = loadPermissions();
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  if (!Array.isArray(roles)) return true;
  if (!message.guild) return false;
  return hasAnyRoleWithLiveFallback(message, roles);
}

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || '');
  if (TICKET_BUTTON_IDS.has(customId) && interaction?.member && hasAdministrator(interaction.member)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (isSponsorGuild(interaction?.guildId)) {
    const staffTicketButtons = new Set([
      'claim_ticket',
      'unclaim',
      'close_ticket',
      'close_ticket_motivo'
    ]);

    if (staffTicketButtons.has(customId)) {
      if (hasSponsorStaffPerms(interaction.member)) {
        return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
      }
      return { allowed: false, reason: 'missing_role', requiredRoles: ['Admin/ManageChannels'], ownerId: null };
    }
  }

  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const data = loadPermissions();
  const rawPolicy = resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    const ownerId = customId.split(policy.ownerSeparator || ':')[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId
      };
    }
  }

  if (policy.ownerFromMessageMention) {
    const ownerId = extractOwnerIdFromMessageMention(interaction?.message);
    if (!ownerId || (interaction?.user?.id && interaction.user.id !== ownerId)) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null
      };
    }
  }

  if (Array.isArray(policy.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
  }

  return { allowed: true, reason: null, requiredRoles: policy.roles || null, ownerId: null };
}

async function checkStringSelectPermission(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.selectMenus, customId)
    ?? resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    const ownerId = customId.split(policy.ownerSeparator || ':')[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId
      };
    }
  }

  if (policy.ownerFromMessageMention) {
    const ownerId = extractOwnerIdFromMessageMention(interaction?.message);
    if (!ownerId || (interaction?.user?.id && interaction.user.id !== ownerId)) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null
      };
    }
  }

  if (Array.isArray(policy.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
  }

  return { allowed: true, reason: null, requiredRoles: policy.roles || null, ownerId: null };
}

async function checkModalPermission(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.modals, customId)
    ?? resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    const ownerId = customId.split(policy.ownerSeparator || ':')[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId
      };
    }
  }

  if (policy.ownerFromMessageMention) {
    const ownerId = extractOwnerIdFromMessageMention(interaction?.message);
    if (!ownerId || (interaction?.user?.id && interaction.user.id !== ownerId)) {
      return {
        allowed: false,
        reason: 'not_owner',
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null
      };
    }
  }

  if (Array.isArray(policy.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
  }

  return { allowed: true, reason: null, requiredRoles: policy.roles || null, ownerId: null };
}

function getSlashRequiredRoles(interaction) {
  if (interaction.commandName === 'dmbroadcast') {
    return [];
  }
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  return resolveSlashRoles(data, interaction.commandName, group, sub);
}

function getPrefixRequiredRoles(commandName, subcommandName = null) {
  const data = loadPermissions();
  return resolvePrefixRoles(data, commandName, subcommandName);
}

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = 'comando', customDescription = null) {
  const roles = Array.isArray(requiredRoleIds) ? requiredRoleIds.filter(Boolean) : [];
  const rolesText = roles.length
    ? roles.map((id) => `<@&${id}>`).join(', ')
    : 'Nessun ruolo configurato.';
  const description = customDescription != null
    ? customDescription
    : `Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

  const embed = new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> **Non hai i permessi**')
    .setDescription(description);
  if (roles.length > 0) {
    embed.addFields({
      name: '<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**',
      value: `Ottieni uno dei seguenti ruoli: ${rolesText}`
    });
  }
  return embed;
}

function buildGlobalNotYourControlEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> **Accesso negato**')
    .setDescription('Questo controllo non è associato al tuo comando.');
}

module.exports = {
  checkSlashPermission,
  checkPrefixPermission,
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  getSlashRequiredRoles,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalNotYourControlEmbed,
  hasAnyRole
};
