const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const https = require("https");
const IDs = require("../../Utils/Config/ids");

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
const SESSION_TTL_MS = 8 * 60 * 60_000;
const sessions = new Map();
const oauthStates = new Map();

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

function getOauthConfig(client) {
  const clientId = process.env.DASHBOARD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID || IDs.bots.ViniliCaffeBot;
  const clientSecret = process.env.DASHBOARD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || "";
  const redirectUri = process.env.DASHBOARD_OAUTH_REDIRECT_URI || `http://${process.env.DASHBOARD_HOST || "127.0.0.1"}:${process.env.DASHBOARD_PORT || 4050}/api/auth/callback`;
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
  for (const [k, row] of sessions.entries()) {
    if (!row || Number(row.expiresAt || 0) <= now) sessions.delete(k);
  }
  for (const [k, row] of oauthStates.entries()) {
    if (!row || Number(row.expiresAt || 0) <= now) oauthStates.delete(k);
  }
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
}

function destroySession(req, res) {
  const sid = String(parseCookies(req).dash_sid || "").trim();
  if (sid) sessions.delete(sid);
  setCookie(res, "dash_sid", "", 0);
}

function buildDiscordAuthorizeUrl(oauth) {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, { expiresAt: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "none",
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

function createDashboardServer(client) {
  const uiRoot = path.resolve(__dirname, "../../UI/Dashboard");
  const html = readStatic(path.join(uiRoot, "index.html"), "<h1>Dashboard missing</h1>");
  const css = readStatic(path.join(uiRoot, "dashboard.css"), "");
  const js = readStatic(path.join(uiRoot, "dashboard.js"), "");

  return http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = String(parsedUrl.pathname || "/");
    const oauth = getOauthConfig(client);

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
        const tokenPayload = await exchangeCodeForToken(oauth, code);
        const user = await fetchDiscordUser(String(tokenPayload.access_token || ""));
        createSession(res, user);
        res.writeHead(302, { Location: "/dashboard" });
        return res.end();
      } catch (error) {
        return text(res, 500, `OAuth error: ${error.message}`);
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
    if (auth.session) {
      const allowed = await canManageScope(client, auth.session, scopeGuildId);
      if (!allowed) return json(res, 403, { ok: false, reason: "missing_founder_or_cofounder" });
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
