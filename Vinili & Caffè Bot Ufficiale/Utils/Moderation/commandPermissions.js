const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const IDs = require('../Config/ids');

const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');
const EMPTY_PERMISSIONS = { slash: {}, prefix: {}, buttons: {}, selectMenus: {}, modals: {} };
let cache = { mtimeMs: 0, data: EMPTY_PERMISSIONS };
let idsFallbackCache = null;

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

function hasAnyRole(member, roleIds) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized)) return true;
  if (normalized.length === 0) return false;
  return normalized.some((roleId) => member?.roles?.cache?.has(roleId));
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

function checkSlashPermission(interaction) {
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  if (!Array.isArray(roles)) return true;
  if (!interaction.inGuild()) return false;
  return hasAnyRole(interaction.member, roles);
}

function checkPrefixPermission(message, commandName, subcommandName = null) {
  const data = loadPermissions();
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  if (!Array.isArray(roles)) return true;
  if (!message.guild) return false;
  return hasAnyRole(message.member, roles);
}

function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || '');
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
    if (!hasAnyRole(interaction.member, policy.roles)) {
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

function checkStringSelectPermission(interaction) {
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

  if (Array.isArray(policy.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: 'missing_role',
        requiredRoles: policy.roles,
        ownerId: null
      };
    }
    if (!hasAnyRole(interaction.member, policy.roles)) {
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

function checkModalPermission(interaction) {
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
    if (!hasAnyRole(interaction.member, policy.roles)) {
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
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  return resolveSlashRoles(data, interaction.commandName, group, sub);
}

function getPrefixRequiredRoles(commandName, subcommandName = null) {
  const data = loadPermissions();
  return resolvePrefixRoles(data, commandName, subcommandName);
}

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = 'comando') {
  const roles = Array.isArray(requiredRoleIds) ? requiredRoleIds.filter(Boolean) : [];
  const rolesText = roles.length
    ? roles.map((id) => `<@&${id}>`).join(', ')
    : 'Nessun ruolo configurato.';

  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> **Non hai i permessi**')
    .setDescription(`Questo ${entityLabel} e riservato ad una categoria di utenti specifici.`)
    .addFields({
      name: '<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**',
      value: `ottieni uno dei seguenti ruoli: ${rolesText}`
    });
}

function buildGlobalNotYourControlEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> **Accesso negato**')
    .setDescription('Questo controllo non e associato al tuo comando.');
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
