const fs = require("fs");
const path = require("path");
const IDs = require("../Config/ids");

const EMPTY_PERMISSIONS ={slash:{},prefix:{},channels:{},buttons:{},selectMenus:{},modals:{},};
const PERMISSIONS_CANDIDATES =[path.resolve(__dirname,"../../permissions.json"),path.join(process.cwd(),"permissions.json"),];
const PERMISSIONS_CACHE_TTL_MS = 30_000;

let cache = {
  filePath: null,
  mtimeMs: 0,
  data: EMPTY_PERMISSIONS,
  expiresAt: 0,
};

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

function normalizePermissionTree(node) {
  if (Array.isArray(node)) return normalizeRoleList(node);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = normalizePermissionTree(value);
  }
  return out;
}

function loadPermissions() {
  try {
    const now = Date.now();
    if (cache.data && cache.expiresAt > now) return cache.data;

    const permissionsPath = PERMISSIONS_CANDIDATES.find((candidate)=>fs.existsSync(candidate))|| null;
    if (!permissionsPath) return EMPTY_PERMISSIONS;

    const stat = fs.statSync(permissionsPath);
    if (
      cache.data &&
      cache.filePath === permissionsPath &&
      cache.mtimeMs === stat.mtimeMs
    ) {
      cache.expiresAt = now + PERMISSIONS_CACHE_TTL_MS;
      return cache.data;
    }

    const raw = fs.readFileSync(permissionsPath, "utf8");
    const parsed = JSON.parse(raw) || {};
    const normalized ={slash:normalizePermissionTree(parsed ?. slash ||{}),prefix:normalizePermissionTree(parsed ?. prefix ||{}),channels:parsed ?. channels ||{},buttons:parsed ?. buttons ||{},selectMenus:parsed ?. selectMenus ||{},modals:parsed ?. modals ||{},};
    cache = {
      filePath: permissionsPath,
      mtimeMs: stat.mtimeMs,
      data: normalized,
      expiresAt: now + PERMISSIONS_CACHE_TTL_MS,
    };
    return cache.data;
  } catch {
    return EMPTY_PERMISSIONS;
  }
}

module.exports = {
  EMPTY_PERMISSIONS,
  loadPermissions,
};