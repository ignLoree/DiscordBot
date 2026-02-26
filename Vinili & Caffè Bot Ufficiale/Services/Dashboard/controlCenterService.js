const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { isSecurityProfileImmune } = require("../Moderation/securityProfilesService");

const DATA_DIR = path.resolve(__dirname, "../../Data/Dashboard");
const STATE_PATH = path.join(DATA_DIR, "controlCenter.json");
const CORE_EVENTS = new Set(["ready", "clientready", "clienterror"]);
const CONTROL_MODES = new Set(["enabled", "disabled", "maintenance"]);
const MAX_ACTIVITY_ROWS = 220;

const DEFAULT_STATE = {
  version: 2,
  updatedAt: 0,
  global: {
    modules: {},
    commands: { prefix: {}, slash: {} },
    events: {},
    routes: {},
    routeGroups: {},
  },
  guilds: {},
};

const BYPASS_ROLE_IDS = [IDs.roles?.Founder, IDs.roles?.CoFounder]
  .filter(Boolean)
  .map((id) => String(id));

const EVENT_GROUP_RULES = [
  { key: "messages", match: /^message/i },
  { key: "members", match: /^guildmember/i },
  { key: "channels", match: /^channel/i },
  { key: "roles", match: /^role/i },
  { key: "threads", match: /^thread/i },
  { key: "reactions", match: /^messagereaction/i },
  { key: "invites", match: /^invite/i },
  { key: "webhooks", match: /^webhook/i },
  { key: "voice", match: /^voicestate/i },
  { key: "stickers", match: /^sticker/i },
  { key: "emojis", match: /^emoji/i },
  { key: "presence", match: /^(presence|userupdate)/i },
  { key: "guild", match: /^guild/i },
  { key: "interaction", match: /^interaction/i },
  { key: "system", match: /^(ready|clientready|clienterror)$/i },
];

let state = loadState();
let dmPingCache = { value: -1, at: 0 };
const activityFeed = [];

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, payload) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function sanitizeMode(value) {
  const mode = String(value || "enabled").trim().toLowerCase();
  return CONTROL_MODES.has(mode) ? mode : "enabled";
}

function sanitizeMapObject(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || "").trim().toLowerCase();
    if (!key) continue;
    out[key] = sanitizeMode(v);
  }
  return out;
}

function sanitizeRoutesObject(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || "").trim().toLowerCase();
    const channelId = String(v || "").trim();
    if (!key || !/^\d{16,20}$/.test(channelId)) continue;
    out[key] = channelId;
  }
  return out;
}

function normalizeScope(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const commands = base.commands && typeof base.commands === "object" ? base.commands : {};
  return {
    modules: sanitizeMapObject(base.modules),
    commands: {
      prefix: sanitizeMapObject(commands.prefix),
      slash: sanitizeMapObject(commands.slash),
    },
    events: sanitizeMapObject(base.events),
    routes: sanitizeRoutesObject(base.routes),
    routeGroups: sanitizeRoutesObject(base.routeGroups),
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : DEFAULT_STATE;
  const guilds = {};
  if (source.guilds && typeof source.guilds === "object") {
    for (const [guildId, guildScope] of Object.entries(source.guilds)) {
      const key = String(guildId || "").trim();
      if (!/^\d{16,20}$/.test(key)) continue;
      guilds[key] = normalizeScope(guildScope);
    }
  }
  return {
    version: 2,
    updatedAt: Number(source.updatedAt || 0),
    global: normalizeScope(source.global),
    guilds,
  };
}

function loadState() {
  ensureDir();
  return normalizeState(readJsonSafe(STATE_PATH, DEFAULT_STATE));
}

function saveState() {
  ensureDir();
  state.updatedAt = Date.now();
  return writeJsonSafe(STATE_PATH, state);
}

function getGuildScope(guildId, create = false) {
  const key = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(key)) return null;
  if (!state.guilds[key] && create) state.guilds[key] = normalizeScope({});
  return state.guilds[key] || null;
}

function pickMode(guildMode, globalMode) {
  return sanitizeMode(guildMode || globalMode || "enabled");
}

function hasMaintenanceBypass(member, guildOwnerId = "") {
  if (!member) return false;
  const memberId = String(member.id || member.user?.id || "");
  if (memberId && String(guildOwnerId || "") === memberId) return true;
  if (isSecurityProfileImmune(String(member?.guild?.id || ""), memberId)) return true;
  const fromCache = BYPASS_ROLE_IDS.some((roleId) => member.roles?.cache?.has?.(roleId));
  if (fromCache) return true;
  if (Array.isArray(member.roles)) {
    return BYPASS_ROLE_IDS.some((roleId) => member.roles.includes(roleId));
  }
  return false;
}

function getModeForKey({ guildId = "", table = "modules", commandType = "", key = "" } = {}) {
  const safeKey = String(key || "").trim().toLowerCase();
  if (!safeKey) return "enabled";
  const guildScope = getGuildScope(guildId, false);

  if (table === "commands") {
    const type = String(commandType || "prefix").toLowerCase() === "slash" ? "slash" : "prefix";
    return pickMode(guildScope?.commands?.[type]?.[safeKey], state?.global?.commands?.[type]?.[safeKey]);
  }

  return pickMode(guildScope?.[table]?.[safeKey], state?.global?.[table]?.[safeKey]);
}

function setModuleMode({ guildId = "", moduleKey = "", mode = "enabled" } = {}) {
  const key = String(moduleKey || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "invalid_module" };
  const scope = guildId ? getGuildScope(guildId, true) : state.global;
  if (!scope) return { ok: false, reason: "invalid_guild" };
  scope.modules[key] = sanitizeMode(mode);
  return saveState() ? { ok: true, mode: scope.modules[key] } : { ok: false, reason: "save_failed" };
}

function setCommandMode({ guildId = "", commandType = "prefix", commandName = "", mode = "enabled" } = {}) {
  const key = String(commandName || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "invalid_command" };
  const scope = guildId ? getGuildScope(guildId, true) : state.global;
  if (!scope) return { ok: false, reason: "invalid_guild" };
  const type = String(commandType || "prefix").toLowerCase() === "slash" ? "slash" : "prefix";
  scope.commands[type][key] = sanitizeMode(mode);
  return saveState() ? { ok: true, mode: scope.commands[type][key] } : { ok: false, reason: "save_failed" };
}

function setEventMode({ guildId = "", eventName = "", mode = "enabled" } = {}) {
  const key = String(eventName || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "invalid_event" };
  const scope = guildId ? getGuildScope(guildId, true) : state.global;
  if (!scope) return { ok: false, reason: "invalid_guild" };
  scope.events[key] = sanitizeMode(mode);
  return saveState() ? { ok: true, mode: scope.events[key] } : { ok: false, reason: "save_failed" };
}

function setEventRouteChannel({ guildId = "", eventName = "", channelId = "" } = {}) {
  const key = String(eventName || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "invalid_event" };
  const scope = guildId ? getGuildScope(guildId, true) : state.global;
  if (!scope) return { ok: false, reason: "invalid_guild" };
  const id = String(channelId || "").trim();
  if (!id) delete scope.routes[key];
  else {
    if (!/^\d{16,20}$/.test(id)) return { ok: false, reason: "invalid_channel" };
    scope.routes[key] = id;
  }
  return saveState() ? { ok: true, channelId: scope.routes[key] || "" } : { ok: false, reason: "save_failed" };
}

function setEventGroupRouteChannel({ guildId = "", eventGroup = "", channelId = "" } = {}) {
  const key = String(eventGroup || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "invalid_group" };
  const scope = guildId ? getGuildScope(guildId, true) : state.global;
  if (!scope) return { ok: false, reason: "invalid_guild" };
  const id = String(channelId || "").trim();
  if (!id) delete scope.routeGroups[key];
  else {
    if (!/^\d{16,20}$/.test(id)) return { ok: false, reason: "invalid_channel" };
    scope.routeGroups[key] = id;
  }
  return saveState() ? { ok: true, channelId: scope.routeGroups[key] || "" } : { ok: false, reason: "save_failed" };
}

function getEventGroup(eventName = "") {
  const safe = String(eventName || "").trim().toLowerCase();
  for (const row of EVENT_GROUP_RULES) {
    if (row.match.test(safe)) return row.key;
  }
  return "other";
}

function getEventGroupsCatalog() {
  const out = new Set(EVENT_GROUP_RULES.map((x) => x.key));
  out.add("other");
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function resolveEventRouteChannel(guildId, eventName) {
  const key = String(eventName || "").trim().toLowerCase();
  if (!key) return "";
  const group = getEventGroup(key);
  const guildScope = getGuildScope(guildId, false);
  return String(
    guildScope?.routes?.[key] ||
      state?.global?.routes?.[key] ||
      guildScope?.routeGroups?.[group] ||
      state?.global?.routeGroups?.[group] ||
      "",
  ).trim();
}

function inferModuleKeyFromPrefixCommand(command) {
  const explicit = String(command?.moduleKey || "").trim().toLowerCase();
  if (explicit) return explicit;
  const folder = String(command?.folder || "utility").trim().toLowerCase();
  if (folder === "staff") return "moderation";
  if (folder === "level") return "leveling";
  return folder;
}

function inferModuleKeyFromSlashCommand(command) {
  const explicit = String(command?.moduleKey || "").trim().toLowerCase();
  if (explicit) return explicit;
  const category = String(command?.category || "utility").trim().toLowerCase();
  if (["staff", "admin", "moderation"].includes(category)) return "moderation";
  return category;
}

function getCommandExecutionGate({ guildId = "", commandType = "prefix", commandName = "", moduleKey = "utility", member = null, guildOwnerId = "" } = {}) {
  const type = String(commandType || "prefix").toLowerCase() === "slash" ? "slash" : "prefix";
  const cmdKey = String(commandName || "").trim().toLowerCase();
  const modKey = String(moduleKey || "").trim().toLowerCase();
  const commandMode = getModeForKey({ guildId, table: "commands", commandType: type, key: cmdKey });
  const moduleMode = getModeForKey({ guildId, table: "modules", key: modKey });
  const bypass = hasMaintenanceBypass(member, guildOwnerId);

  if (commandMode === "disabled") return { allowed: false, reason: "command_disabled" };
  if (commandMode === "maintenance" && !bypass) return { allowed: false, reason: "command_maintenance" };
  if (moduleMode === "disabled") return { allowed: false, reason: "module_disabled" };
  if (moduleMode === "maintenance" && !bypass) return { allowed: false, reason: "module_maintenance" };
  return { allowed: true, reason: "ok" };
}

function inferGuildIdFromEventArgs(args = []) {
  for (const arg of args) {
    const guildId = String(arg?.guild?.id || arg?.guildId || "").trim();
    if (/^\d{16,20}$/.test(guildId)) return guildId;
    if (arg?.members?.cache && arg?.channels?.cache && /^\d{16,20}$/.test(String(arg.id || ""))) return String(arg.id);
  }
  return "";
}

function isEventExecutionAllowed({ eventName = "", guildId = "" } = {}) {
  const key = String(eventName || "").trim().toLowerCase();
  if (!key || CORE_EVENTS.has(key)) return { allowed: true, reason: "ok" };
  const mode = getModeForKey({ guildId, table: "events", key });
  if (mode === "disabled") return { allowed: false, reason: "event_disabled" };
  if (mode === "maintenance") return { allowed: false, reason: "event_maintenance" };
  return { allowed: true, reason: "ok" };
}

function pushEventActivity(row = {}) {
  activityFeed.unshift({
    at: Date.now(),
    eventName: String(row.eventName || "").toLowerCase(),
    eventGroup: String(row.eventGroup || "other").toLowerCase(),
    guildId: String(row.guildId || ""),
    guildName: String(row.guildName || ""),
    allowed: Boolean(row.allowed),
    routeChannelId: String(row.routeChannelId || ""),
    detail: String(row.detail || ""),
  });
  if (activityFeed.length > MAX_ACTIVITY_ROWS) activityFeed.length = MAX_ACTIVITY_ROWS;
}

function getEventActivity(limit = 70) {
  const safe = Math.max(1, Math.min(200, Number(limit || 70)));
  return activityFeed.slice(0, safe);
}

function pingEmoji(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "⚪";
  if (value <= 80) return "🟢";
  if (value <= 160) return "🟡";
  if (value <= 280) return "🟠";
  return "🔴";
}

function getHostIps() {
  const out = [];
  const ifaces = os.networkInterfaces() || {};
  for (const rows of Object.values(ifaces)) {
    for (const row of rows || []) {
      if (!row || row.internal) continue;
      if (row.family === "IPv4") out.push(row.address);
    }
  }
  return Array.from(new Set(out));
}

async function sampleDmPing(client) {
  const now = Date.now();
  if (now - Number(dmPingCache.at || 0) < 20_000) return dmPingCache.value;
  const start = Date.now();
  try {
    await client?.users?.fetch?.(String(client?.user?.id || ""), { force: true });
    dmPingCache = { value: Date.now() - start, at: now };
  } catch {
    dmPingCache = { value: -1, at: now };
  }
  return dmPingCache.value;
}

function buildOverview(client) {
  const wsPing = Number(client?.ws?.ping || -1);
  const dbCode = Number(mongoose?.connection?.readyState || 0);
  const dbMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  const users = client?.guilds?.cache?.reduce?.((acc, g) => acc + Number(g.memberCount || 0), 0) || 0;

  return {
    now: Date.now(),
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
    guilds: Number(client?.guilds?.cache?.size || 0),
    users: Number(users),
    channels: Number(client?.channels?.cache?.size || 0),
    wsPing,
    wsPingEmoji: pingEmoji(wsPing),
    dbState: dbMap[dbCode] || "unknown",
    dbCode,
    ips: getHostIps(),
  };
}

function getAllEventNames(client) {
  const names = new Set();
  for (const name of client?._eventHandlers?.keys?.() || []) names.add(String(name || "").toLowerCase());
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function getAllPrefixCommands(client) {
  const rows = [];
  for (const command of client?.pcommands?.values?.() || []) {
    rows.push({ name: String(command?.name || "").toLowerCase(), module: inferModuleKeyFromPrefixCommand(command) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function getAllSlashCommands(client) {
  const rows = [];
  const seen = new Set();
  for (const command of client?.commands?.values?.() || []) {
    const name = String(command?.data?.name || command?.name || "").toLowerCase();
    const type = Number(command?.data?.type || 1);
    if (!name || type !== 1 || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, module: inferModuleKeyFromSlashCommand(command) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function getModuleCatalog(client) {
  const dynamic = new Set([
    "moderation", "security", "automod", "antinuke", "joinraid", "joingate", "welcome", "events",
    "birthday", "chatreminder", "tickets", "leveling", "minigames", "tts", "backup", "community", "utility", "vip", "partner",
  ]);
  for (const row of getAllPrefixCommands(client)) dynamic.add(row.module);
  for (const row of getAllSlashCommands(client)) dynamic.add(row.module);
  return Array.from(dynamic).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function buildGuildList(client) {
  return (client?.guilds?.cache?.map?.((g) => ({ id: g.id, name: g.name })) || []).sort((a, b) => a.name.localeCompare(b.name));
}

function getControlCenterSnapshot(client, guildId = "") {
  const gid = String(guildId || "").trim();
  return {
    updatedAt: Number(state.updatedAt || 0),
    global: normalizeScope(state.global),
    guild: gid ? normalizeScope(getGuildScope(gid, false) || {}) : normalizeScope({}),
    catalog: {
      modules: getModuleCatalog(client),
      eventGroups: getEventGroupsCatalog(),
      events: getAllEventNames(client),
      prefixCommands: getAllPrefixCommands(client),
      slashCommands: getAllSlashCommands(client),
      guilds: buildGuildList(client),
    },
  };
}

async function getOverviewPayload(client) {
  const base = buildOverview(client);
  const dmPing = await sampleDmPing(client);
  return { ...base, dmPing, dmPingEmoji: pingEmoji(dmPing) };
}

async function maybeMirrorEventToRoute({ guild = null, guildId = "", eventName = "", args = [], allowed = true } = {}) {
  const safeEvent = String(eventName || "").trim().toLowerCase();
  if (!safeEvent) return { ok: false, reason: "invalid_event" };
  const gid = String(guildId || guild?.id || "").trim();
  const group = getEventGroup(safeEvent);
  const routeChannelId = gid ? resolveEventRouteChannel(gid, safeEvent) : "";

  const preview = [];
  for (const arg of args.slice(0, 3)) {
    if (!arg || typeof arg !== "object") continue;
    if (arg.id && arg.name) preview.push(`${arg.constructor?.name || "Object"}: ${arg.name} (${arg.id})`);
    else if (arg.id) preview.push(`${arg.constructor?.name || "Object"}: ${arg.id}`);
  }

  pushEventActivity({
    eventName: safeEvent,
    eventGroup: group,
    guildId: gid,
    guildName: String(guild?.name || ""),
    allowed,
    routeChannelId,
    detail: preview.join(" | "),
  });

  if (!gid) return { ok: false, reason: "missing_guild" };
  if (!routeChannelId) return { ok: false, reason: "missing_route" };

  const resolvedGuild = guild || global.botClient?.guilds?.cache?.get(gid) || null;
  if (!resolvedGuild) return { ok: false, reason: "guild_unavailable" };
  const channel = resolvedGuild.channels?.cache?.get(routeChannelId) || (await resolvedGuild.channels?.fetch?.(routeChannelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_unavailable" };

  await channel.send({
    content: `📡 [${group}] evento \`${safeEvent}\`${preview.length ? ` • ${preview.join(" | ")}` : ""}`,
    allowedMentions: { parse: [] },
  }).catch(() => null);

  return { ok: true };
}

module.exports = {
  CONTROL_MODES: Array.from(CONTROL_MODES.values()),
  getControlCenterSnapshot,
  getOverviewPayload,
  setModuleMode,
  setCommandMode,
  setEventMode,
  setEventRouteChannel,
  setEventGroupRouteChannel,
  resolveEventRouteChannel,
  inferModuleKeyFromPrefixCommand,
  inferModuleKeyFromSlashCommand,
  getCommandExecutionGate,
  inferGuildIdFromEventArgs,
  isEventExecutionAllowed,
  maybeMirrorEventToRoute,
  getEventActivity,
  getEventGroup,
};