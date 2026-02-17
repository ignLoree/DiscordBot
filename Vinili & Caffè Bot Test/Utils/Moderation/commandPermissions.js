const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

const PERMISSIONS_PATH = path.join(process.cwd(), "permissions.json");
const EMPTY_PERMISSIONS = {
  slash: {},
  prefix: {},
  buttons: {},
  selectMenus: {},
  modals: {},
};

let cache = { mtimeMs: 0, data: EMPTY_PERMISSIONS };

function getAllowedGuildIds() {
  const sponsorGuildIds = Array.isArray(IDs?.guilds?.sponsorGuildIds)
    ? IDs.guilds.sponsorGuildIds
    : [];
  return new Set([IDs?.guilds?.test, ...sponsorGuildIds].filter(Boolean).map(String));
}

function isAllowedGuildTest(guildId) {
  if (!guildId) return false;
  const allowed = getAllowedGuildIds();
  return allowed.has(String(guildId));
}

const TICKET_BUTTON_IDS = new Set([
  "ticket_open_desc_modal",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
]);

function isSponsorGuild(guildId) {
  const sponsorGuildIds = Array.isArray(IDs?.guilds?.sponsorGuildIds)
    ? IDs.guilds.sponsorGuildIds
    : [];
  return sponsorGuildIds.map(String).includes(String(guildId || ""));
}

function hasSponsorStaffRole(member, guildId) {
  if (!member || !guildId) return false;
  const map = IDs?.roles?.sponsorStaffRoleIds || {};
  const roleId = map[guildId];
  if (!roleId) return false;
  return member?.roles?.cache?.has(roleId) === true;
}

function hasVerificatoRole(member, guildId) {
  if (!member || !guildId) return false;
  const map = IDs?.verificatoRoleIds || {};
  const roleId = map[guildId];
  if (!roleId) return false;
  return member?.roles?.cache?.has(roleId) === true;
}

function loadPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) return EMPTY_PERMISSIONS;
    const stat = fs.statSync(PERMISSIONS_PATH);
    if (cache.data && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const raw = fs.readFileSync(PERMISSIONS_PATH, "utf-8");
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
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const resolved = IDs?.roles?.[key];
  return resolved ? String(resolved) : null;
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value)).filter(Boolean);
}

function collectMemberRoleIds(member) {
  if (!member) return new Set();
  const ids = new Set();

  if (member?.roles?.cache && typeof member.roles.cache.forEach === "function") {
    member.roles.cache.forEach((_, roleId) => ids.add(String(roleId)));
  }
  if (Array.isArray(member?.roles)) {
    for (const roleId of member.roles) {
      if (roleId) ids.add(String(roleId));
    }
  }
  if (Array.isArray(member?._roles)) {
    for (const roleId of member._roles) {
      if (roleId) ids.add(String(roleId));
    }
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
    entity?.user?.id ||
    entity?.author?.id ||
    entity?.member?.id ||
    entity?.member?.user?.id ||
    null;
  if (!guild || !userId || typeof guild.members?.fetch !== "function") return null;
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
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key])) return normalizeRoleList(subcommands[key]);
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

function resolveComponentPolicy(map, customId) {
  if (!map || typeof map !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(map, customId)) return map[customId];

  const wildcardKeys = Object.keys(map)
    .filter((key) => key.endsWith("*"))
    .sort((a, b) => b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }
  return null;
}

function normalizeComponentPolicy(policy) {
  if (policy == null) return null;

  if (typeof policy === "string") {
    const resolved = resolveRoleReference(policy);
    return { roles: resolved ? [resolved] : [] };
  }

  if (Array.isArray(policy)) return { roles: normalizeRoleList(policy) };

  if (typeof policy === "object") {
    let roles = null;
    if (Array.isArray(policy.roles)) roles = normalizeRoleList(policy.roles);
    else if (typeof policy.roles === "string") {
      const resolved = resolveRoleReference(policy.roles);
      roles = resolved ? [resolved] : [];
    }

    const ownerSegment = Number.isFinite(Number.parseInt(policy.ownerSegment, 10))
      ? Number.parseInt(policy.ownerSegment, 10)
      : null;

    return {
      roles,
      ownerSegment,
      ownerSeparator:
        typeof policy.ownerSeparator === "string" && policy.ownerSeparator
          ? policy.ownerSeparator
          : ":",
      ownerFromMessageMention: Boolean(policy.ownerFromMessageMention),
    };
  }

  return null;
}

function extractOwnerIdFromMessageMention(message) {
  if (!message) return null;
  const scan = (text) => String(text || "").match(/<@!?(\d{16,20})>/)?.[1] || null;

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
  const fromConfig = client?.config?.developers;
  if (Array.isArray(fromConfig)) return fromConfig.map(String);
  if (typeof fromConfig === "string") {
    return fromConfig
      .split(",")
      .map((id) => String(id).trim())
      .filter(Boolean);
  }
  return [];
}

async function checkSlashPermission(interaction) {
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const userId = interaction?.user?.id || null;
  if (!guildId || !isAllowedGuildTest(guildId)) return false;

  if (interaction.commandName === "dmbroadcast") {
    const devIds = getDevIds(interaction?.client);
    return devIds.includes(String(userId || ""));
  }

  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  if (!Array.isArray(roles)) return true;
  if (!interaction.inGuild?.()) return false;
  return hasAnyRoleWithLiveFallback(interaction, roles);
}

async function checkPrefixPermission(message, commandName, subcommandName = null) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  if (!guildId || !isAllowedGuildTest(guildId)) return false;

  if (commandName === "restart") {
    const devIds = getDevIds(message?.client);
    return devIds.includes(String(userId || ""));
  }

  const data = loadPermissions();
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  if (!Array.isArray(roles)) return true;
  if (!message.guild) return false;
  return hasAnyRoleWithLiveFallback(message, roles);
}

function evaluateComponentPolicy(interaction, policy) {
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    const ownerId =
      String(interaction?.customId || "").split(policy.ownerSeparator || ":")[
        policy.ownerSegment
      ] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: policy.roles || null,
        ownerId,
      };
    }
  }

  if (policy.ownerFromMessageMention) {
    const ownerId = extractOwnerIdFromMessageMention(interaction?.message);
    if (!ownerId || (interaction?.user?.id && interaction.user.id !== ownerId)) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
  }

  return null;
}

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  if (guildId && !isAllowedGuildTest(guildId)) {
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isSponsorGuild(guildId) && TICKET_BUTTON_IDS.has(customId)) {
    if (!hasSponsorStaffRole(interaction?.member, guildId)) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: ["Staff"],
        ownerId: null,
      };
    }
  }

  const data = loadPermissions();
  const rawPolicy = resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy?.roles || null,
    ownerId: null,
  };
}

async function checkStringSelectPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  if (guildId && !isAllowedGuildTest(guildId)) {
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isSponsorGuild(guildId) && customId === "ticket_open_menu") {
    if (!hasVerificatoRole(interaction?.member, guildId)) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: ["Verificato"],
        ownerId: null,
      };
    }
  }

  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.selectMenus, customId) ??
    resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy?.roles || null,
    ownerId: null,
  };
}

async function checkModalPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  if (guildId && !isAllowedGuildTest(guildId)) {
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.modals, customId) ??
    resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: policy.roles,
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy?.roles || null,
    ownerId: null,
  };
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
      : `Questo ${entityLabel} e riservato ad una categoria di utenti specifici.`;

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
    .setDescription("Questo controllo non e associato al tuo comando.");
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
  isSponsorGuild,
  hasSponsorStaffRole,
};
