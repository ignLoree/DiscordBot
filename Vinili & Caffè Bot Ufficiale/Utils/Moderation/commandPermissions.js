const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
} = require("discord.js");
const IDs = require("../Config/ids");
const {
  buildPrefixLookupKeys,
  buildSlashLookupKeys,
  hasTemporaryCommandPermission,
} = require("./temporaryCommandPermissions");
const PERMISSIONS_PATH = path.join(process.cwd(), "permissions.json");
const EMPTY_PERMISSIONS = {
  slash: {},
  prefix: {},
  channels: {},
  buttons: {},
  selectMenus: {},
  modals: {},
};
let cache = { mtimeMs: 0, data: EMPTY_PERMISSIONS };
let idsFallbackCache = null;

const MAIN_GUILD_ID = IDs?.guilds?.main || null;
const ALLOWED_GUILD_IDS = new Set(
  [IDs?.guilds?.main, IDs?.guilds?.test].filter(Boolean).map(String),
);
function isAllowedGuildUfficiale(guildId) {
  return !guildId || ALLOWED_GUILD_IDS.has(String(guildId));
}
function isMainGuild(guildId) {
  return Boolean(MAIN_GUILD_ID) && String(guildId || "") === String(MAIN_GUILD_ID);
}

const TICKET_BUTTON_IDS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_supporto",
  "ticket_open_desc_modal",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
]);

const VERIFY_OR_TICKET_IDS = new Set([
  "verify_start",
  "verify_enter",
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_supporto",
  "ticket_open_desc_modal",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
  "ticket_open_menu",
]);
function isBackupInteraction(customId) {
  const id = String(customId || "").trim();
  if (!id) return false;
  return (
    id.startsWith("backup_") ||
    id.startsWith("backup-load_") ||
    id.startsWith("backup_list_")
  );
}
function isVerifyOrTicketInteraction(customId) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (VERIFY_OR_TICKET_IDS.has(id)) return true;
  if (
    id.startsWith("verify_code:") ||
    id.startsWith("modal_close_ticket") ||
    id.startsWith("ticket_open_desc_modal_submit:")
  )
    return true;
  return false;
}

async function isGuildOwnerOrAdmin(interaction) {
  if (!interaction?.inGuild?.()) return false;
  const userId = String(interaction?.user?.id || "");
  if (!userId) return false;

  const guild = interaction.guild || null;
  const ownerId = String(guild?.ownerId || "");
  if (ownerId && ownerId === userId) return true;

  const member = interaction.member;
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;

  const freshMember = await fetchLiveMember(interaction);
  if (freshMember?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (guild && typeof guild.fetchOwner === "function") {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner?.id && String(owner.id) === userId) return true;
  }

  return false;
}

function getIdsConfig() {
  if (idsFallbackCache) return idsFallbackCache;
  try {
    idsFallbackCache = require("../Config/ids");
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
    const raw = fs.readFileSync(PERMISSIONS_PATH, "utf-8");
    const parsed = JSON.parse(raw) || {};
    const normalized = {
      slash: parsed.slash || {},
      prefix: parsed.prefix || {},
      channels: parsed.channels || {},
      buttons: parsed.buttons || {},
      selectMenus: parsed.selectMenus || {},
      modals: parsed.modals || {},
    };
    cache = { mtimeMs: stat.mtimeMs, data: normalized };
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
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  const resolved = idsCfg?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value)).filter(Boolean);
}

const PERMISSION_NAME_LOOKUP = (() => {
  const map = new Map();
  const sources = [PermissionsBitField?.Flags, PermissionFlagsBits];
  for (const source of sources) {
    const entries = Object.entries(source || {});
    for (const [name, value] of entries) {
      if (value == null) continue;
      const exact = String(name).trim().toLowerCase();
      const compact = String(name)
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      map.set(exact, value);
      map.set(compact, value);
    }
  }
  return map;
})();

function resolvePermissionReference(value) {
  if (value == null) return null;

  if (typeof value === "bigint") return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return null;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  let key = raw;
  if (key.startsWith("PermissionFlagsBits.")) {
    key = key.slice("PermissionFlagsBits.".length);
  } else if (key.startsWith("PermissionsBitField.Flags.")) {
    key = key.slice("PermissionsBitField.Flags.".length);
  }

  const exact = key.toLowerCase();
  const compact = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    PERMISSION_NAME_LOOKUP.get(exact) ?
    PERMISSION_NAME_LOOKUP.get(compact) ?
    null
  );
}

function normalizePermissionList(permissionFlags) {
  if (!Array.isArray(permissionFlags)) return permissionFlags;
  const dedup = new Set();
  for (const flag of permissionFlags) {
    const resolved = resolvePermissionReference(flag);
    if (resolved == null) continue;
    dedup.add(String(resolved));
  }
  return Array.from(dedup, (value) => BigInt(value));
}

function resolveChannelReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);

  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  const resolved = idsCfg?.channels?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeChannelList(channelIds) {
  if (!Array.isArray(channelIds)) return channelIds;
  return channelIds
    .map((value) => resolveChannelReference(value))
    .filter(Boolean);
}

function resolveCommandChannelPolicy(data, keys) {
  const map = data?.channels;
  if (!map || typeof map !== "object") return null;
  for (const key of keys || []) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const normalized = normalizeChannelList(map[key]);
    if (Array.isArray(normalized)) return normalized;
  }
  return null;
}

function collectMemberRoleIds(member) {
  if (!member) return new Set();
  const ids = new Set();

  const cache = member?.roles?.cache;
  if (cache && typeof cache.forEach === "function") {
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

function hasAllPermissions(member, permissionFlags) {
  const normalized = normalizePermissionList(permissionFlags);
  if (!Array.isArray(normalized)) return true;
  if (normalized.length === 0) return false;
  const memberPermissions = member?.permissions;
  if (!memberPermissions || typeof memberPermissions.has !== "function")
    return false;
  return normalized.every((flag) => memberPermissions.has(flag));
}

async function fetchLiveMember(entity) {
  const guild = entity?.guild || entity?.member?.guild || null;
  const userId =
    entity?.user?.id ||
    entity?.author?.id ||
    entity?.member?.id ||
    entity?.member?.user?.id ||
    null;
  if (!guild || !userId || typeof guild.members?.fetch !== "function")
    return null;
  return guild.members.fetch(userId).catch(() => null);
}

async function hasAnyRoleWithLiveFallback(entity, roleIds) {
  if (hasAnyRole(entity?.member, roleIds)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAnyRole(freshMember, roleIds);
}

async function hasAllPermissionsWithLiveFallback(entity, permissionFlags) {
  if (hasAllPermissions(entity?.member, permissionFlags)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAllPermissions(freshMember, permissionFlags);
}

function resolveSlashRoles(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key]))
      return normalizeRoleList(subcommands[key]);
  }
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolveSlashPermissions(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    const cfg = subcommands[key];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (subcommandName) {
    const cfg = subcommands[subcommandName];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (Array.isArray(cmd.permissions))
    return normalizePermissionList(cmd.permissions);
  if (typeof cmd.permissions === "string") {
    const resolved = resolvePermissionReference(cmd.permissions);
    return resolved != null ? [resolved] : [];
  }
  return null;
}

function resolvePrefixRoles(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolvePrefixPermissions(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName) {
    const cfg = subcommands[subcommandName];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (Array.isArray(cmd.permissions))
    return normalizePermissionList(cmd.permissions);
  if (typeof cmd.permissions === "string") {
    const resolved = resolvePermissionReference(cmd.permissions);
    return resolved != null ? [resolved] : [];
  }
  return null;
}

function resolveComponentPolicy(map, customId) {
  if (!map || typeof map !== "object") return null;

  if (Object.prototype.hasOwnProperty.call(map, customId)) {
    return map[customId];
  }

  const wildcardKeys = Object.keys(map)
    .filter((key) => key.endsWith("*"))
    .sort((a, b) => b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }

  return null;
}

function normalizeButtonPolicy(policy) {
  if (policy == null) return null;

  if (typeof policy === "string") {
    const resolved = resolveRoleReference(policy);
    return { roles: resolved ? [resolved] : [], permissions: null };
  }

  if (Array.isArray(policy)) {
    return { roles: normalizeRoleList(policy), permissions: null };
  }

  if (typeof policy === "object") {
    let roles = null;
    if (Array.isArray(policy.roles)) {
      roles = normalizeRoleList(policy.roles);
    } else if (typeof policy.roles === "string") {
      const resolved = resolveRoleReference(policy.roles);
      roles = resolved ? [resolved] : [];
    }
    let permissions = null;
    if (Array.isArray(policy.permissions)) {
      permissions = normalizePermissionList(policy.permissions);
    } else if (typeof policy.permissions === "string") {
      const resolved = resolvePermissionReference(policy.permissions);
      permissions = resolved != null ? [resolved] : [];
    }

    const parsedOwnerSegment = Number.parseInt(policy.ownerSegment, 10);
    const ownerSegment = Number.isFinite(parsedOwnerSegment)
      ? parsedOwnerSegment
      : null;
    const ownerSeparator =
      typeof policy.ownerSeparator === "string" &&
      policy.ownerSeparator.length > 0
        ? policy.ownerSeparator
        : ":";
    const ownerFromMessageMention = Boolean(policy.ownerFromMessageMention);
    const ownerOrRole = Boolean(policy.ownerOrRole);
    const grantRecipientOnly = Boolean(policy.grantRecipientOnly);
    const verifyStartRequired = Boolean(policy.verifyStartRequired);

    return {
      roles,
      permissions,
      ownerSegment,
      ownerSeparator,
      ownerFromMessageMention,
      ownerOrRole,
      grantRecipientOnly,
      verifyStartRequired,
    };
  }

  return null;
}

function getPendingCustomRoleGrant(token) {
  try {
    const mod = require("../../Events/interaction/customRoleHandlers");
    if (typeof mod?.getPendingRoleGrantByToken !== "function") return null;
    return mod.getPendingRoleGrantByToken(token);
  } catch {
    return null;
  }
}

function hasActiveVerifySession(userId) {
  try {
    const mod = require("../../Events/interaction/verifyHandlers");
    if (typeof mod?.hasActiveVerifySession !== "function") return false;
    return Boolean(mod.hasActiveVerifySession(userId));
  } catch {
    return false;
  }
}

function extractOwnerIdFromMessageMention(message) {
  if (!message) return null;

  const scan = (text) => {
    const match = String(text || "").match(/<@!?(\d{16,20})>/);
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
  const rawIds = IDs?.developers ? IDs?.guilds?.developers ? "";
  const fromIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id).trim()).filter(Boolean)
    : String(rawIds)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
  const raw = client?.config?.developers ? "";
  const fromConfig = Array.isArray(raw)
    ? raw.map((id) => String(id).trim()).filter(Boolean)
    : String(raw)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
  return Array.from(new Set([...fromIds, ...fromConfig]));
}

async function checkSlashPermission(interaction, options = {}) {
  const userId = interaction?.user?.id || null;
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const onMainGuild = isMainGuild(guildId);

  if (String(interaction?.commandName || "").toLowerCase() === "backup") {
    const allowed = await isGuildOwnerOrAdmin(interaction);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  if (interaction.commandName === "dmbroadcast" && onMainGuild) {
    const client = interaction.client;
    const devIds = getDevIds(client);
    if (devIds.length === 0) return false;
    return devIds.includes(userId);
  }

  if (guildId && !onMainGuild) {
    const allowed = await hasAllPermissionsWithLiveFallback(interaction, [
      PermissionFlagsBits.Administrator,
    ]);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  if (guildId && userId) {
    const group = interaction.options?.getSubcommandGroup?.(false) || null;
    const sub = interaction.options?.getSubcommand?.(false) || null;
    const keys = buildSlashLookupKeys(interaction.commandName, group, sub);
    const hasOverride = await hasTemporaryCommandPermission({
      guildId,
      userId,
      keys,
    });
    if (hasOverride) {
      if (options.returnDetails) {
        return { allowed: true, reason: null, requiredRoles: null, channels: null };
      }
      return true;
    }
  }

  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const channelPolicy = resolveCommandChannelPolicy(
    data,
    buildSlashLookupKeys(interaction.commandName, group, sub),
  );
  if (Array.isArray(channelPolicy)) {
    const channelId = interaction?.channelId || interaction?.channel?.id || null;
    const allowed =
      Boolean(channelId) && channelPolicy.includes(String(channelId));
    if (!allowed) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "channel",
          requiredRoles: null,
          channels: channelPolicy,
        };
      }
      return false;
    }
  }
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  const permissions = resolveSlashPermissions(
    data,
    interaction.commandName,
    group,
    sub,
  );
  if (!Array.isArray(roles) && !Array.isArray(permissions)) {
    if (options.returnDetails) {
      return { allowed: true, reason: null, requiredRoles: null, channels: channelPolicy || null };
    }
    return true;
  }
  if (!interaction.inGuild()) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: Array.isArray(roles) ? "missing_role" : "missing_permission",
        requiredRoles: roles,
        channels: channelPolicy || null,
      };
    }
    return false;
  }
  const hasRole = !Array.isArray(roles)
    ? true
    : await hasAnyRoleWithLiveFallback(interaction, roles);
  const hasPermissions = !Array.isArray(permissions)
    ? true
    : await hasAllPermissionsWithLiveFallback(interaction, permissions);
  const allowed = hasRole && hasPermissions;
  const reason = !hasRole
    ? "missing_role"
    : !hasPermissions
      ? "missing_permission"
      : null;
  if (options.returnDetails) {
    return {
      allowed,
      reason,
      requiredRoles: !hasRole ? roles : null,
      channels: channelPolicy || null,
    };
  }
  return allowed;
}

async function checkPrefixPermission(
  message,
  commandName,
  subcommandName = null,
  options = {},
) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  const safeCommand = String(commandName || "").toLowerCase();
  const onMainGuild = isMainGuild(guildId);

  if (safeCommand === "restart") {
    let allowed = false;
    if (message?.guild && message?.member) {
      const isOwner =
        String(message.guild.ownerId || "") === String(userId || "");
      const isAdmin = Boolean(
        message.member.permissions?.has?.(PermissionFlagsBits.Administrator),
      );
      allowed = isOwner || isAdmin;
    }
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  if (guildId && !onMainGuild) {
    const allowed = await hasAllPermissionsWithLiveFallback(message, [
      PermissionFlagsBits.Administrator,
    ]);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  if (guildId && userId) {
    const keys = buildPrefixLookupKeys(commandName, subcommandName);
    const hasOverride = await hasTemporaryCommandPermission({
      guildId,
      userId,
      keys,
    });
    if (hasOverride) {
      if (options.returnDetails) {
        return { allowed: true, reason: null, requiredRoles: null, channels: null };
      }
      return true;
    }
  }

  const data = loadPermissions();
  const channelPolicy = resolveCommandChannelPolicy(
    data,
    buildPrefixLookupKeys(commandName, subcommandName),
  );
  if (Array.isArray(channelPolicy)) {
    const channelId = message?.channelId || message?.channel?.id || null;
    const allowed =
      Boolean(channelId) && channelPolicy.includes(String(channelId));
    if (!allowed) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "channel",
          requiredRoles: null,
          channels: channelPolicy,
        };
      }
      return false;
    }
  }
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  const permissions = resolvePrefixPermissions(data, commandName, subcommandName);
  if (!Array.isArray(roles) && !Array.isArray(permissions)) {
    if (options.returnDetails) {
      return { allowed: true, reason: null, requiredRoles: null, channels: channelPolicy || null };
    }
    return true;
  }
  if (!message.guild) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: Array.isArray(roles) ? "missing_role" : "missing_permission",
        requiredRoles: roles,
        channels: channelPolicy || null,
      };
    }
    return false;
  }
  const hasRole = !Array.isArray(roles)
    ? true
    : await hasAnyRoleWithLiveFallback(message, roles);
  const hasPermissions = !Array.isArray(permissions)
    ? true
    : await hasAllPermissionsWithLiveFallback(message, permissions);
  const allowed = hasRole && hasPermissions;
  const reason = !hasRole
    ? "missing_role"
    : !hasPermissions
      ? "missing_permission"
      : null;
  if (options.returnDetails) {
    return {
      allowed,
      reason,
      requiredRoles: !hasRole ? roles : null,
      channels: channelPolicy || null,
    };
  }
  return allowed;
}

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (guildId && !isAllowedGuildUfficiale(guildId)) {
    if (isVerifyOrTicketInteraction(customId) || isBackupInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
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

  if (policy.verifyStartRequired) {
    const hasSession = hasActiveVerifySession(interaction?.user?.id || null);
    if (!hasSession) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: interaction?.user?.id || null,
      };
    }
  }

  if (policy.grantRecipientOnly) {
    const [, token] = String(customId).split(":");
    const request = getPendingCustomRoleGrant(token);
    if (
      request &&
      interaction?.user?.id &&
      String(interaction.user.id) !== String(request.targetId)
    ) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: String(request.targetId),
      };
    }
  }

  const hasOwnerConstraint =
    (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) ||
    policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

async function checkStringSelectPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (guildId && !isAllowedGuildUfficiale(guildId)) {
    if (isVerifyOrTicketInteraction(customId) || isBackupInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.selectMenus, customId) ?
    resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const hasOwnerConstraint =
    (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) ||
    policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

async function checkModalPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (guildId && !isAllowedGuildUfficiale(guildId)) {
    if (isVerifyOrTicketInteraction(customId) || isBackupInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.modals, customId) ?
    resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const hasOwnerConstraint =
    (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) ||
    policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

function getSlashRequiredRoles(interaction) {
  if (interaction.commandName === "dmbroadcast") {
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

function buildGlobalPermissionDeniedEmbed(
  requiredRoleIds = [],
  entityLabel = "comando",
  customDescription = null,
) {
  const roles = Array.isArray(requiredRoleIds)
    ? requiredRoleIds.filter(Boolean)
    : [];
  const rolesText = roles.length
    ? roles.map((id) => `<@&${id}>`).join(", ")
    : "Nessun ruolo configurato.";
  const description =
    customDescription != null
      ? customDescription
      : `Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> **Non hai i permessi**")
    .setDescription(description);
  if (roles.length > 0) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `Ottieni uno dei seguenti ruoli: ${rolesText}`,
    });
  }
  return embed;
}

function buildGlobalNotYourControlEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> **Accesso negato**")
    .setDescription("Questo controllo non è associato al tuo comando.");
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
  hasAnyRole,
};
