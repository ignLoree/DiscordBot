const fs = require('fs');
const path = require('path');

const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');
const EMPTY_PERMISSIONS = { slash: {}, prefix: {} };
let cache = { mtimeMs: 0, data: EMPTY_PERMISSIONS };

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

function hasAnyRole(member, roleIds) {
  if (!Array.isArray(roleIds)) return true;
  if (roleIds.length === 0) return false;
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function resolveSlashRoles(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return cmd;
  if (typeof cmd !== 'object') return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key])) return subcommands[key];
  }
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return subcommands[subcommandName];
  }
  if (Array.isArray(cmd.roles)) return cmd.roles;
  return null;
}

function resolvePrefixRoles(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return cmd;
  if (typeof cmd !== 'object') return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return subcommands[subcommandName];
  }
  if (Array.isArray(cmd.roles)) return cmd.roles;
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

module.exports = { checkSlashPermission, checkPrefixPermission, hasAnyRole };
