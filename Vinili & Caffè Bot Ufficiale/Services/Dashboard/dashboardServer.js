const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const https = require("https");
const IDs = require("../../Utils/Config/ids");
const logsApi = require("../../Utils/Moderation/logs");
const { getModConfig, createModCase, logModCase } = require("../../Utils/Moderation/moderation");

const {
  CONTROL_MODES,
  getControlCenterSnapshot,
  getOverviewPayload,
  setModuleMode,
  setCommandMode,
  setEventMode,
  setEventRouteChannel,
  setEventGroupRouteChannel,
  getEventActivity,
} = require("./controlCenterService");

let dashboardServer = null;
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.DASHBOARD_SESSION_TTL_HOURS || 24 * 30));
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60_000;
const DASHBOARD_DATA_DIR = path.resolve(__dirname, "../../Data/Dashboard");
const SESSION_STORE_PATH = path.join(DASHBOARD_DATA_DIR, "sessions.json");
const sessions = new Map();
const oauthStates = new Map();
let sessionsPersistTimer = null;

function readStatic(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function text(res, status, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function getDashboardToken(client) {
  return process.env.DASHBOARD_TOKEN || process.env.BOT_DASHBOARD_TOKEN || client?.config?.dashboard?.token || "";
}

function getRequestBaseUrl(req) {
  const protoHeader = String(req?.headers?.["x-forwarded-proto"] || "").trim().toLowerCase();
  const proto = protoHeader === "https" ? "https" : "http";
  const host = String(req?.headers?.host || "").trim();
  if (host) return `${proto}://${host}`;
  const fallbackHost = process.env.DASHBOARD_HOST || "127.0.0.1";
  const fallbackPort = process.env.DASHBOARD_PORT || 4050;
  return `http://${fallbackHost}:${fallbackPort}`;
}

function getOauthConfig(client, req = null) {
  const clientId = process.env.DASHBOARD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID || IDs.bots.ViniliCaffeBot;
  const clientSecret = process.env.DASHBOARD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || "";
  const redirectUri =
    process.env.DASHBOARD_OAUTH_REDIRECT_URI ||
    `${getRequestBaseUrl(req)}/api/auth/callback`;
  const enabled = Boolean(clientId && clientSecret);
  return { enabled, clientId, clientSecret, redirectUri };
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  const out = {};
  for (const chunk of raw.split(";")) {
    const [k, ...rest] = chunk.split("=");
    const key = String(k || "").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("=") || "");
  }
  return out;
}

function setCookie(res, name, value, maxAgeSec = 0) {
  const attrs = [
    `${name}=${encodeURIComponent(value || "")}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (maxAgeSec > 0) attrs.push(`Max-Age=${Math.floor(maxAgeSec)}`);
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function cleanupMaps() {
  const now = Date.now();
  let sessionsChanged = false;
  for (const [k, row] of sessions.entries()) {
    if (!row || Number(row.expiresAt || 0) <= now) {
      sessions.delete(k);
      sessionsChanged = true;
    }
  }
  for (const [k, row] of oauthStates.entries()) {
    if (!row || Number(row.expiresAt || 0) <= now) oauthStates.delete(k);
  }
  if (sessionsChanged) schedulePersistSessions();
}

function getSession(req) {
  cleanupMaps();
  const sid = String(parseCookies(req).dash_sid || "").trim();
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return { sid, ...session };
}

function createSession(res, user) {
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, {
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  setCookie(res, "dash_sid", sid, Math.floor(SESSION_TTL_MS / 1000));
  schedulePersistSessions();
}

function destroySession(req, res) {
  const sid = String(parseCookies(req).dash_sid || "").trim();
  if (sid) {
    sessions.delete(sid);
    schedulePersistSessions();
  }
  setCookie(res, "dash_sid", "", 0);
}

function buildDiscordAuthorizeUrl(oauth) {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, {
    expiresAt: Date.now() + 10 * 60_000,
    redirectUri: String(oauth.redirectUri || ""),
  });
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

function httpsRequest({ method = "GET", hostname, path: reqPath, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method, hostname, path: reqPath, headers },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += String(chunk || "");
        });
        res.on("end", () => {
          const status = Number(res.statusCode || 0);
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { raw };
          }
          resolve({ status, data: parsed });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function exchangeCodeForToken(oauth, code) {
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: oauth.redirectUri,
  }).toString();

  const result = await httpsRequest({
    method: "POST",
    hostname: "discord.com",
    path: "/api/oauth2/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`oauth_token_failed_${result.status}`);
  }
  return result.data;
}

function loadSessionsFromDisk() {
  try {
    fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
    if (!fs.existsSync(SESSION_STORE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(SESSION_STORE_PATH, "utf8"));
    const now = Date.now();
    for (const row of Array.isArray(raw?.rows) ? raw.rows : []) {
      const sid = String(row?.sid || "").trim();
      const expiresAt = Number(row?.expiresAt || 0);
      if (!sid || expiresAt <= now) continue;
      sessions.set(sid, {
        user: row.user || null,
        createdAt: Number(row?.createdAt || now),
        expiresAt,
      });
    }
  } catch {}
}

function persistSessionsNow() {
  try {
    fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
    const rows = [];
    const now = Date.now();
    for (const [sid, row] of sessions.entries()) {
      if (!row || Number(row.expiresAt || 0) <= now) continue;
      rows.push({
        sid,
        user: row.user || null,
        createdAt: Number(row.createdAt || now),
        expiresAt: Number(row.expiresAt || now + SESSION_TTL_MS),
      });
    }
    fs.writeFileSync(SESSION_STORE_PATH, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
  } catch {}
}

function schedulePersistSessions() {
  if (sessionsPersistTimer) return;
  sessionsPersistTimer = setTimeout(() => {
    sessionsPersistTimer = null;
    persistSessionsNow();
  }, 400);
}

async function fetchDiscordUser(accessToken) {
  const me = await httpsRequest({
    method: "GET",
    hostname: "discord.com",
    path: "/api/users/@me",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (me.status < 200 || me.status >= 300) throw new Error(`oauth_me_failed_${me.status}`);

  const guilds = await httpsRequest({
    method: "GET",
    hostname: "discord.com",
    path: "/api/users/@me/guilds",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (guilds.status < 200 || guilds.status >= 300) throw new Error(`oauth_guilds_failed_${guilds.status}`);

  return {
    id: String(me.data?.id || ""),
    username: String(me.data?.username || ""),
    globalName: String(me.data?.global_name || me.data?.username || ""),
    avatar: String(me.data?.avatar || ""),
    guilds: Array.isArray(guilds.data)
      ? guilds.data.map((g) => ({ id: String(g.id || ""), name: String(g.name || "") }))
      : [],
  };
}

function isAuthorizedByToken(req, parsedUrl, expectedToken) {
  if (!expectedToken) return false;
  const headerToken = String(req.headers["x-dashboard-token"] || "").trim();
  const qsToken = String(parsedUrl.query?.token || "").trim();
  return headerToken === expectedToken || qsToken === expectedToken;
}

function sanitizeGuildId(value) {
  const id = String(value || "").trim();
  return /^\d{16,20}$/.test(id) ? id : "";
}

function sanitizeMode(value) {
  const mode = String(value || "enabled").trim().toLowerCase();
  return CONTROL_MODES.includes(mode) ? mode : "enabled";
}

function normalizeScopeGuildId(value) {
  const scope = String(value || "").trim().toLowerCase();
  if (!scope || scope === "global" || scope === "all") return "";
  return sanitizeGuildId(value);
}

function listGuildChannels(client, guildId) {
  const gid = sanitizeGuildId(guildId);
  if (!gid) return [];
  const guild = client?.guilds?.cache?.get(gid) || null;
  if (!guild) return [];
  return guild.channels.cache
    .filter((channel) => channel?.isTextBased?.() && !channel.isThread?.())
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildCommandsHelpPayload(client) {
  const prefix = [];
  for (const command of client?.pcommands?.values?.() || []) {
    prefix.push({
      name: String(command?.name || ""),
      aliases: Array.isArray(command?.aliases) ? command.aliases : [],
      category: String(command?.folder || "utility"),
      description: String(command?.description || ""),
      usage: String(command?.usage || ""),
      examples: Array.isArray(command?.examples) ? command.examples : [],
      subcommands: Array.isArray(command?.subcommands) ? command.subcommands : [],
      subcommandDescriptions:
        command?.subcommandDescriptions && typeof command.subcommandDescriptions === "object"
          ? command.subcommandDescriptions
          : {},
    });
  }
  prefix.sort((a, b) => a.name.localeCompare(b.name));

  const slashMap = new Map();
  for (const command of client?.commands?.values?.() || []) {
    const name = String(command?.data?.name || command?.name || "").trim().toLowerCase();
    const type = Number(command?.data?.type || 1);
    if (!name || type !== 1 || slashMap.has(name)) continue;
    const json = command?._helpDataJson || command?.data?.toJSON?.() || {};
    slashMap.set(name, {
      name,
      category: String(command?.category || "utility"),
      description: String(json?.description || command?.helpDescription || ""),
      options: Array.isArray(json?.options) ? json.options : [],
    });
  }
  const slash = Array.from(slashMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { prefix, slash };
}

function getGuildRoleOptions(guild) {
  if (!guild?.roles?.cache) return [];
  return guild.roles.cache
    .filter((role) => !role.managed && role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));
}

async function getGuildUsersPage(client, guildId, query = "") {
  const guild = client?.guilds?.cache?.get(guildId) || null;
  if (!guild) return { ok: false, reason: "guild_not_found" };
  await guild.members.fetch().catch(() => {});

  const q = String(query || "").trim().toLowerCase();
  const users = guild.members.cache
    .map((member) => {
      const user = member.user;
      return {
        id: user.id,
        username: user.username,
        tag: user.tag || `${user.username}`,
        displayName: member.displayName || user.username,
        bot: Boolean(user.bot),
        joinedAt: Number(member.joinedTimestamp || 0),
        createdAt: Number(user.createdTimestamp || 0),
        timedOutUntil: Number(member.communicationDisabledUntilTimestamp || 0),
        roles: member.roles.cache
          .filter((role) => role.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((role) => ({ id: role.id, name: role.name })),
      };
    })
    .filter((row) => {
      if (!q) return true;
      return (
        row.id.includes(q) ||
        row.username.toLowerCase().includes(q) ||
        row.tag.toLowerCase().includes(q) ||
        row.displayName.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.joinedAt - a.joinedAt);

  return { ok: true, guild, users };
}

async function runUserAction(client, payload = {}) {
  const guildId = sanitizeGuildId(payload.guildId);
  const userId = String(payload.userId || "").trim();
  const action = String(payload.action || "").trim().toLowerCase();
  const reason = String(payload.reason || "Dashboard action").slice(0, 450);
  if (!guildId || !/^\d{16,20}$/.test(userId)) return { ok: false, reason: "invalid_target" };

  const guild = client?.guilds?.cache?.get(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const member =
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null));
  const roleId = String(payload.roleId || "").trim();
  const nicknameRaw = String(payload.nickname ?? "").trim();
  const durationMinutes = Math.max(1, Math.min(28 * 24 * 60, Number(payload.durationMinutes || 60)));
  const durationMs = durationMinutes * 60_000;

  if (action === "timeout") {
    if (!member) return { ok: false, reason: "member_not_found" };
    await member.timeout(durationMs, reason);
    try {
      const config = await getModConfig(guild.id);
      const { doc } = await createModCase({
        guildId: guild.id,
        action: "MUTE",
        userId,
        modId: client.user?.id || guild.client?.user?.id,
        reason: `[Dashboard] ${reason}`,
        durationMs,
        context: null,
      });
      await logModCase({ client, guild, modCase: doc, config });
    } catch (e) {
      global.logger?.warn?.("[Dashboard] ModCase creation (timeout) failed:", guild.id, userId, e?.message || e);
    }
    return { ok: true, message: `Timeout ${durationMinutes}m applicato.` };
  }
  if (action === "untimeout") {
    if (!member) return { ok: false, reason: "member_not_found" };
    await member.timeout(null, reason);
    return { ok: true, message: "Timeout rimosso." };
  }
  if (action === "kick") {
    if (!member) return { ok: false, reason: "member_not_found" };
    await member.kick(reason);
    try {
      const config = await getModConfig(guild.id);
      const { doc } = await createModCase({
        guildId: guild.id,
        action: "KICK",
        userId,
        modId: client.user?.id || guild.client?.user?.id,
        reason: `[Dashboard] ${reason}`,
        durationMs: null,
        context: null,
      });
      await logModCase({ client, guild, modCase: doc, config });
    } catch (e) {
      global.logger?.warn?.("[Dashboard] ModCase creation (kick) failed:", guild.id, userId, e?.message || e);
    }
    return { ok: true, message: "Utente espulso." };
  }
  if (action === "ban") {
    await guild.members.ban(userId, { reason, deleteMessageSeconds: 604800 });
    try {
      const config = await getModConfig(guild.id);
      const { doc } = await createModCase({
        guildId: guild.id,
        action: "BAN",
        userId,
        modId: client.user?.id || guild.client?.user?.id,
        reason: `[Dashboard] ${reason}`,
        durationMs: null,
        context: null,
      });
      await logModCase({ client, guild, modCase: doc, config });
    } catch (e) {
      global.logger?.warn?.("[Dashboard] ModCase creation (ban) failed:", guild.id, userId, e?.message || e);
    }
    return { ok: true, message: "Utente bannato." };
  }
  if (action === "unban") {
    await guild.bans.remove(userId, reason);
    return { ok: true, message: "Ban rimosso." };
  }
  if (action === "add_role") {
    if (!member) return { ok: false, reason: "member_not_found" };
    if (!/^\d{16,20}$/.test(roleId)) return { ok: false, reason: "invalid_role" };
    await member.roles.add(roleId, reason);
    return { ok: true, message: "Ruolo aggiunto." };
  }
  if (action === "remove_role") {
    if (!member) return { ok: false, reason: "member_not_found" };
    if (!/^\d{16,20}$/.test(roleId)) return { ok: false, reason: "invalid_role" };
    await member.roles.remove(roleId, reason);
    return { ok: true, message: "Ruolo rimosso." };
  }
  if (action === "set_nickname") {
    if (!member) return { ok: false, reason: "member_not_found" };
    await member.setNickname(nicknameRaw || null, reason);
    return { ok: true, message: "Nickname aggiornato." };
  }
  return { ok: false, reason: "invalid_action" };
}

async function canManageScope(client, session, guildId) {
  if (!session?.user?.id) return false;
  if (!guildId) return false;
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return false;
  if (String(guild.ownerId || "") === String(session.user.id || "")) return true;

  const member = guild.members?.cache?.get(session.user.id) || (await guild.members?.fetch?.(session.user.id).catch(() => null));
  if (!member) return false;
  const founder = String(IDs.roles?.Founder || "");
  const coFounder = String(IDs.roles?.CoFounder || "");
  return (founder && member.roles.cache.has(founder)) || (coFounder && member.roles.cache.has(coFounder));
}

function ensureApiAuth(client, req, parsedUrl) {
  const token = getDashboardToken(client);
  if (isAuthorizedByToken(req, parsedUrl, token)) {
    return { ok: true, via: "token", session: null };
  }
  const session = getSession(req);
  if (session) return { ok: true, via: "oauth", session };
  return { ok: false, reason: "unauthorized" };
}

function isTokenAdmin(client, req, parsedUrl) {
  const token = getDashboardToken(client);
  return isAuthorizedByToken(req, parsedUrl, token);
}

function createDashboardServer(client) {
  const uiRoot = path.resolve(__dirname, "../../UI/Dashboard");
  const html = readStatic(path.join(uiRoot, "index.html"), "<h1>Dashboard missing</h1>");
  const css = readStatic(path.join(uiRoot, "dashboard.css"), "");
  const js = readStatic(path.join(uiRoot, "dashboard.js"), "");

  return http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = String(parsedUrl.pathname || "/");
    const oauth = getOauthConfig(client, req);

    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      return text(res, 200, html, "text/html; charset=utf-8");
    }
    if (pathname === "/dashboard.css") return text(res, 200, css, "text/css; charset=utf-8");
    if (pathname === "/dashboard.js") return text(res, 200, js, "application/javascript; charset=utf-8");

    if (pathname === "/api/auth/login" && req.method === "GET") {
      if (!oauth.enabled) return json(res, 400, { ok: false, reason: "oauth_not_configured" });
      return json(res, 200, { ok: true, url: buildDiscordAuthorizeUrl(oauth) });
    }

    if (pathname === "/api/auth/callback" && req.method === "GET") {
      if (!oauth.enabled) return text(res, 400, "OAuth non configurato");
      const code = String(parsedUrl.query?.code || "").trim();
      const stateValue = String(parsedUrl.query?.state || "").trim();
      const stateRow = oauthStates.get(stateValue);
      oauthStates.delete(stateValue);
      if (!code || !stateRow || Number(stateRow.expiresAt || 0) <= Date.now()) {
        return text(res, 400, "OAuth state non valido o scaduto");
      }
      try {
        const callbackOauth = {
          ...oauth,
          redirectUri: String(stateRow.redirectUri || oauth.redirectUri || ""),
        };
        const tokenPayload = await exchangeCodeForToken(callbackOauth, code);
        const user = await fetchDiscordUser(String(tokenPayload.access_token || ""));
        createSession(res, user);
        res.writeHead(302, { Location: "/dashboard" });
        return res.end();
      } catch (error) {
        return text(
          res,
          500,
          `OAuth error: ${error.message}\nredirect_uri=${String(stateRow?.redirectUri || oauth.redirectUri || "")}`,
        );
      }
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const session = getSession(req);
      return json(res, 200, {
        ok: true,
        oauthEnabled: oauth.enabled,
        authenticated: Boolean(session),
        user: session?.user || null,
      });
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      destroySession(req, res);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/dashboard/overview" && req.method === "GET") {
      const overview = await getOverviewPayload(client);
      return json(res, 200, { ok: true, overview });
    }

    if (pathname === "/api/dashboard/activity" && req.method === "GET") {
      const limit = Number(parsedUrl.query?.limit || 70);
      return json(res, 200, { ok: true, rows: getEventActivity(limit) });
    }

    if (pathname === "/api/dashboard/controls" && req.method === "GET") {
      const guildId = sanitizeGuildId(parsedUrl.query?.guildId);
      const snapshot = getControlCenterSnapshot(client, guildId);
      return json(res, 200, { ok: true, snapshot });
    }

    if (pathname === "/api/dashboard/channels" && req.method === "GET") {
      const guildId = sanitizeGuildId(parsedUrl.query?.guildId);
      return json(res, 200, { ok: true, channels: listGuildChannels(client, guildId) });
    }

    if (pathname === "/api/dashboard/commands-help" && req.method === "GET") {
      return json(res, 200, { ok: true, data: buildCommandsHelpPayload(client) });
    }

    if (pathname === "/api/dashboard/errors" && req.method === "GET") {
      const limit = Number(parsedUrl.query?.limit || 80);
      const rows =
        typeof logsApi?.getRecentErrors === "function"
          ? logsApi.getRecentErrors(limit)
          : [];
      return json(res, 200, { ok: true, rows });
    }

    if (pathname === "/api/dashboard/console" && req.method === "GET") {
      const limit = Number(parsedUrl.query?.limit || 220);
      const rows =
        typeof logsApi?.getRecentConsole === "function"
          ? logsApi.getRecentConsole(limit)
          : [];
      return json(res, 200, { ok: true, rows });
    }

    if (pathname === "/api/dashboard/process" && req.method === "POST") {
      if (!isTokenAdmin(client, req, parsedUrl)) {
        return json(res, 403, { ok: false, reason: "token_required" });
      }
      const body = await new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk) => {
          raw += String(chunk || "");
          if (raw.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      });
      const action = String(body.action || "").trim().toLowerCase();
      if (action === "start") {
        return json(res, 200, {
          ok: true,
          message: "Bot già avviato. Da spento va avviato dal pannello hosting.",
        });
      }
      if (action === "restart") {
        json(res, 200, { ok: true, message: "Riavvio avviato." });
        setTimeout(() => process.exit(0), 600);
        return;
      }
      if (action === "stop") {
        json(res, 200, { ok: true, message: "Spegnimento avviato." });
        setTimeout(() => process.exit(0), 600);
        return;
      }
      return json(res, 400, { ok: false, reason: "invalid_action" });
    }

    if (!pathname.startsWith("/api/dashboard/")) {
      return json(res, 404, { ok: false, reason: "not_found" });
    }

    const auth = ensureApiAuth(client, req, parsedUrl);
    if (!auth.ok) return json(res, 401, { ok: false, reason: auth.reason });

    let body = {};
    if (req.method === "POST") {
      body = await new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk) => {
          raw += String(chunk || "");
          if (raw.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      });
    }

    const scopeGuildId = normalizeScopeGuildId(body.guildId);
    if (auth.session && req.method === "POST") {
      const allowed = await canManageScope(client, auth.session, scopeGuildId);
      if (!allowed) return json(res, 403, { ok: false, reason: "missing_founder_or_cofounder" });
    }

    if (pathname === "/api/dashboard/users" && req.method === "GET") {
      const guildId = sanitizeGuildId(parsedUrl.query?.guildId);
      if (!guildId) return json(res, 400, { ok: false, reason: "guild_required" });
      if (auth.session) {
        const allowed = await canManageScope(client, auth.session, guildId);
        if (!allowed) return json(res, 403, { ok: false, reason: "missing_founder_or_cofounder" });
      }
      const page = Math.max(1, Number(parsedUrl.query?.page || 1));
      const limit = Math.max(10, Math.min(100, Number(parsedUrl.query?.limit || 40)));
      const q = String(parsedUrl.query?.q || "");
      const data = await getGuildUsersPage(client, guildId, q);
      if (!data.ok) return json(res, 404, data);

      const total = data.users.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      const rows = data.users.slice(start, start + limit);
      return json(res, 200, {
        ok: true,
        page: safePage,
        total,
        totalPages,
        rows,
        roleOptions: getGuildRoleOptions(data.guild),
      });
    }

    if (pathname === "/api/dashboard/user-action" && req.method === "POST") {
      const guildId = sanitizeGuildId(body.guildId);
      if (!guildId) return json(res, 400, { ok: false, reason: "guild_required" });
      if (auth.session) {
        const allowed = await canManageScope(client, auth.session, guildId);
        if (!allowed) return json(res, 403, { ok: false, reason: "missing_founder_or_cofounder" });
      }
      const out = await runUserAction(client, body).catch((error) => ({
        ok: false,
        reason: String(error?.message || "action_failed"),
      }));
      return json(res, out.ok ? 200 : 400, out);
    }

    if (pathname === "/api/dashboard/module" && req.method === "POST") {
      const moduleKey = String(body.moduleKey || "").trim().toLowerCase();
      const mode = sanitizeMode(body.mode);
      const out = setModuleMode({ guildId: scopeGuildId, moduleKey, mode });
      return json(res, out.ok ? 200 : 400, out);
    }

    if (pathname === "/api/dashboard/command" && req.method === "POST") {
      const commandType = String(body.commandType || "prefix").toLowerCase() === "slash" ? "slash" : "prefix";
      const commandName = String(body.commandName || "").trim().toLowerCase();
      const mode = sanitizeMode(body.mode);
      const out = setCommandMode({ guildId: scopeGuildId, commandType, commandName, mode });
      return json(res, out.ok ? 200 : 400, out);
    }

    if (pathname === "/api/dashboard/event" && req.method === "POST") {
      const eventName = String(body.eventName || "").trim().toLowerCase();
      const mode = sanitizeMode(body.mode);
      const out = setEventMode({ guildId: scopeGuildId, eventName, mode });
      return json(res, out.ok ? 200 : 400, out);
    }

    if (pathname === "/api/dashboard/route" && req.method === "POST") {
      const eventName = String(body.eventName || "").trim().toLowerCase();
      const channelId = String(body.channelId || "").trim();
      const out = setEventRouteChannel({ guildId: scopeGuildId, eventName, channelId });
      return json(res, out.ok ? 200 : 400, out);
    }

    if (pathname === "/api/dashboard/route-group" && req.method === "POST") {
      const eventGroup = String(body.eventGroup || "").trim().toLowerCase();
      const channelId = String(body.channelId || "").trim();
      const out = setEventGroupRouteChannel({ guildId: scopeGuildId, eventGroup, channelId });
      return json(res, out.ok ? 200 : 400, out);
    }

    return json(res, 404, { ok: false, reason: "not_found" });
  });
}

function startDashboardServer(client) {
  if (dashboardServer) return dashboardServer;
  const enabled = String(process.env.DASHBOARD_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) return null;
  loadSessionsFromDisk();

  const port = Math.max(1024, Number(process.env.DASHBOARD_PORT || client?.config?.dashboard?.port || 4050));
  const host = process.env.DASHBOARD_HOST || "127.0.0.1";

  dashboardServer = createDashboardServer(client);
  dashboardServer.listen(port, host, () => {
    global.logger?.info?.(`[DASHBOARD] Avviata su http://${host}:${port}/dashboard`);
  });
  dashboardServer.on("error", (error) => {
    global.logger?.error?.("[DASHBOARD] errore server:", error);
  });
  return dashboardServer;
}

module.exports = {
  startDashboardServer,
};