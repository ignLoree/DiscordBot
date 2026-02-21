const tokenInput = document.getElementById("tokenInput");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const guildSelect = document.getElementById("guildSelect");
const refreshBtn = document.getElementById("refreshBtn");
const oauthLoginBtn = document.getElementById("oauthLoginBtn");
const oauthLogoutBtn = document.getElementById("oauthLogoutBtn");
const authState = document.getElementById("authState");
const processStartBtn = document.getElementById("processStartBtn");
const processRestartBtn = document.getElementById("processRestartBtn");
const processStopBtn = document.getElementById("processStopBtn");
const processStatus = document.getElementById("processStatus");
const usersSearchInput = document.getElementById("usersSearchInput");
const usersSearchBtn = document.getElementById("usersSearchBtn");
const usersPrevBtn = document.getElementById("usersPrevBtn");
const usersNextBtn = document.getElementById("usersNextBtn");
const usersPageInfo = document.getElementById("usersPageInfo");
const usersRoleSelect = document.getElementById("usersRoleSelect");
const usersNicknameInput = document.getElementById("usersNicknameInput");
const usersReasonInput = document.getElementById("usersReasonInput");
const commandsHelpPrefix = document.getElementById("commandsHelpPrefix");
const commandsHelpSlash = document.getElementById("commandsHelpSlash");
const errorsTable = document.getElementById("errorsTable");
const consoleTable = document.getElementById("consoleTable");

const overviewCards = document.getElementById("overviewCards");
const modulesTable = document.getElementById("modulesTable");
const eventsTable = document.getElementById("eventsTable");
const prefixCommandsTable = document.getElementById("prefixCommandsTable");
const slashCommandsTable = document.getElementById("slashCommandsTable");
const activityTable = document.getElementById("activityTable");
const usersTable = document.getElementById("usersTable");

const routeEventSelect = document.getElementById("routeEventSelect");
const routeChannelSelect = document.getElementById("routeChannelSelect");
const saveRouteBtn = document.getElementById("saveRouteBtn");

const routeGroupSelect = document.getElementById("routeGroupSelect");
const routeGroupChannelSelect = document.getElementById("routeGroupChannelSelect");
const saveRouteGroupBtn = document.getElementById("saveRouteGroupBtn");

const rowTemplate = document.getElementById("rowTemplate");

let cachedSnapshot = null;
let currentAuth = null;
let usersPage = 1;
let usersTotalPages = 1;
let usersQuery = "";
let currentScope = "global";
let controlsRequestSeq = 0;
let refreshRunning = false;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getToken() {
  return localStorage.getItem("dashboardToken") || "";
}

function setToken(token) {
  localStorage.setItem("dashboardToken", token || "");
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["x-dashboard-token"] = token;

  const response = await fetch(path, { ...options, headers, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.reason || `HTTP ${response.status}`);
  return data;
}

function hasAuthContext() {
  return Boolean(getToken() || currentAuth?.authenticated);
}

function modeFromTables(globalTable = {}, guildTable = {}, key = "") {
  const safe = String(key || "").toLowerCase();
  return guildTable[safe] || globalTable[safe] || "enabled";
}

function formatSeconds(total) {
  const sec = Math.max(0, Number(total || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function renderOverview(overview) {
  const cards = [
    ["WS Ping", `${overview.wsPingEmoji} ${overview.wsPing} ms`],
    ["DM Ping", `${overview.dmPingEmoji} ${overview.dmPing >= 0 ? `${overview.dmPing} ms` : "N/A"}`],
    ["Uptime", formatSeconds(overview.uptimeSec)],
    ["DB", overview.dbState],
    ["Host", overview.host],
    ["IP", (overview.ips || []).join(", ") || "N/A"],
    ["Guild", String(overview.guilds)],
    ["Utenti", String(overview.users)],
    ["Canali", String(overview.channels)],
    ["RAM RSS", `${overview.memoryMb} MB`],
    ["Node", overview.node],
    ["PID", String(overview.pid)],
  ];

  overviewCards.innerHTML = cards
    .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join("");
}

function buildActionRow(title, activeMode, onSelectMode) {
  const node = rowTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".row-title").textContent = title;
  const buttons = node.querySelectorAll("button");
  buttons.forEach((btn) => {
    const mode = btn.dataset.mode;
    btn.classList.add(`mode-${mode}`);
    if (mode === activeMode) btn.classList.add("active");
    btn.addEventListener("click", () => onSelectMode(mode));
  });
  return node;
}

function renderModeTable({ container, rows, currentModeResolver, onChange }) {
  container.innerHTML = "";
  for (const row of rows) {
    const key = String(row.key || "").toLowerCase();
    const mode = currentModeResolver(key);
    const title = row.label || key;
    container.appendChild(buildActionRow(title, mode, (nextMode) => onChange(key, nextMode)));
  }
}

async function updateRouteChannels() {
  const scope = String(guildSelect.value || "global");
  routeChannelSelect.innerHTML = '<option value="">Nessun canale (disattiva route)</option>';
  routeGroupChannelSelect.innerHTML = '<option value="">Nessun canale (disattiva route gruppo)</option>';
  if (scope === "global") return;
  const data = await api(`/api/dashboard/channels?guildId=${encodeURIComponent(scope)}`);
  for (const channel of data.channels || []) {
    const a = document.createElement("option");
    a.value = channel.id;
    a.textContent = `#${channel.name}`;
    routeChannelSelect.appendChild(a);
    const b = a.cloneNode(true);
    routeGroupChannelSelect.appendChild(b);
  }
}

function fillGuildSelect(guilds = []) {
  const current = String(currentScope || guildSelect.value || "global");
  guildSelect.innerHTML = '<option value="global">Globale (tutti i server)</option>';
  for (const guild of guilds) {
    const opt = document.createElement("option");
    opt.value = guild.id;
    opt.textContent = `${guild.name} (${guild.id})`;
    guildSelect.appendChild(opt);
  }
  guildSelect.value = guilds.some((g) => g.id === current) ? current : "global";
  currentScope = String(guildSelect.value || "global");
}

function renderActivity(rows = []) {
  activityTable.innerHTML = "";
  for (const row of rows) {
    const at = new Date(Number(row.at || 0)).toLocaleTimeString();
    const title = `[${at}] [${row.eventGroup}] ${row.eventName} | guild=${row.guildName || row.guildId || "-"} | allowed=${row.allowed ? "yes" : "no"} | route=${row.routeChannelId || "-"}${row.detail ? ` | ${row.detail}` : ""}`;
    const node = document.createElement("div");
    node.className = "row";
    node.innerHTML = `<div class="row-title">${title}</div><div class="row-actions"></div>`;
    activityTable.appendChild(node);
  }
}

async function refreshActivity() {
  const data = await api("/api/dashboard/activity?limit=60");
  renderActivity(data.rows || []);
}

function getUsersScopeGuildId() {
  const scope = String(guildSelect.value || "global");
  return scope === "global" ? "" : scope;
}

async function runUserAction(userId, action) {
  const guildId = getUsersScopeGuildId();
  if (!guildId) {
    alert("Seleziona prima un server specifico, non lo scope globale.");
    return;
  }
  const body = {
    guildId,
    userId,
    action,
    roleId: String(usersRoleSelect.value || ""),
    nickname: String(usersNicknameInput.value || ""),
    reason: String(usersReasonInput.value || "Dashboard utenti"),
    durationMinutes: 60,
  };
  const out = await api("/api/dashboard/user-action", {
    method: "POST",
    body: JSON.stringify(body),
  });
  processStatus.textContent = `Process: ${out.message || "azione utente eseguita"}`;
  await refreshUsers();
}

function renderUsersRows(rows = []) {
  usersTable.innerHTML = "";
  for (const row of rows) {
    const roleNames = (row.roles || []).slice(0, 4).map((r) => r.name).join(", ") || "-";
    const line = document.createElement("div");
    line.className = "row";
    line.innerHTML = `
      <div class="row-title">${row.displayName} • ${row.tag} • ${row.id} • roles: ${roleNames}</div>
      <div class="row-actions">
        <button data-action="timeout">Timeout 60m</button>
        <button data-action="untimeout">Untimeout</button>
        <button data-action="kick">Kick</button>
        <button data-action="ban">Ban</button>
        <button data-action="unban">Unban</button>
        <button data-action="add_role">+Role</button>
        <button data-action="remove_role">-Role</button>
        <button data-action="set_nickname">Nickname</button>
      </div>
    `;
    line.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => runUserAction(row.id, btn.dataset.action));
    });
    usersTable.appendChild(line);
  }
}

async function refreshUsers() {
  const guildId = getUsersScopeGuildId();
  if (!guildId) {
    usersTable.innerHTML = "";
    usersPageInfo.textContent = "Seleziona un server per vedere gli utenti";
    usersRoleSelect.innerHTML = '<option value="">Seleziona ruolo</option>';
    return;
  }
  const data = await api(
    `/api/dashboard/users?guildId=${encodeURIComponent(guildId)}&page=${usersPage}&limit=35&q=${encodeURIComponent(usersQuery)}`,
  );
  usersPage = Number(data.page || 1);
  usersTotalPages = Number(data.totalPages || 1);
  usersPageInfo.textContent = `Pagina ${usersPage}/${usersTotalPages} • Totale ${Number(data.total || 0)}`;
  usersRoleSelect.innerHTML = '<option value="">Seleziona ruolo</option>';
  for (const role of data.roleOptions || []) {
    const opt = document.createElement("option");
    opt.value = role.id;
    opt.textContent = role.name;
    usersRoleSelect.appendChild(opt);
  }
  renderUsersRows(data.rows || []);
}

function renderCommandsHelp(prefix = [], slash = []) {
  commandsHelpPrefix.innerHTML = "";
  for (const cmd of prefix) {
    const line = document.createElement("div");
    line.className = "row";
    const examples = (cmd.examples || []).slice(0, 2).join(" | ");
    line.innerHTML = `<div class="row-title"><b>+${cmd.name}</b> [${cmd.category}]<br>${cmd.description || "-"}<br><small>Uso: ${cmd.usage || "-"}${examples ? ` • Esempi: ${examples}` : ""}</small></div><div class="row-actions"></div>`;
    commandsHelpPrefix.appendChild(line);
  }

  commandsHelpSlash.innerHTML = "";
  for (const cmd of slash) {
    const optCount = Array.isArray(cmd.options) ? cmd.options.length : 0;
    const line = document.createElement("div");
    line.className = "row";
    line.innerHTML = `<div class="row-title"><b>/${cmd.name}</b> [${cmd.category}]<br>${cmd.description || "-"}<br><small>Opzioni: ${optCount}</small></div><div class="row-actions"></div>`;
    commandsHelpSlash.appendChild(line);
  }
}

function renderErrors(rows = []) {
  errorsTable.innerHTML = "";
  for (const row of rows) {
    const at = new Date(Number(row.at || 0)).toLocaleString();
    const msg = escapeHtml(row.message);
    const line = document.createElement("div");
    line.className = "row";
    line.innerHTML = `<div class="row-title"><b>${at}</b><br><small>${msg}</small></div><div class="row-actions"></div>`;
    errorsTable.appendChild(line);
  }
}

function renderConsole(rows = []) {
  consoleTable.innerHTML = "";
  for (const row of rows) {
    const at = new Date(Number(row.at || 0)).toLocaleString();
    const level = String(row.level || "info").toUpperCase();
    const message = escapeHtml(row.message);
    const line = document.createElement("div");
    line.className = "row console-row";
    line.innerHTML = `<div class="row-title console-title"><b>[${at}] [${level}]</b> ${message}</div><div class="row-actions"></div>`;
    consoleTable.appendChild(line);
  }
}

async function refreshCommandsHelp() {
  if (!hasAuthContext()) {
    renderCommandsHelp([], []);
    return;
  }
  const data = await api("/api/dashboard/commands-help");
  renderCommandsHelp(data?.data?.prefix || [], data?.data?.slash || []);
}

async function refreshErrors() {
  if (!hasAuthContext()) {
    renderErrors([]);
    return;
  }
  const data = await api("/api/dashboard/errors?limit=80");
  renderErrors(data.rows || []);
}

async function refreshConsole() {
  if (!hasAuthContext()) {
    renderConsole([]);
    return;
  }
  const data = await api("/api/dashboard/console?limit=250");
  renderConsole(data.rows || []);
}

async function refreshControls(scopeOverride = "") {
  const reqId = ++controlsRequestSeq;
  const selectedScope = String(scopeOverride || guildSelect.value || currentScope || "global");
  const scope = selectedScope === "global" ? "global" : selectedScope;
  currentScope = scope;
  const guildQuery = scope === "global" ? "" : `?guildId=${encodeURIComponent(scope)}`;
  const data = await api(`/api/dashboard/controls${guildQuery}`);
  if (reqId !== controlsRequestSeq) return;
  cachedSnapshot = data.snapshot;

  fillGuildSelect(cachedSnapshot.catalog.guilds || []);
  if (reqId !== controlsRequestSeq) return;
  await updateRouteChannels();
  if (reqId !== controlsRequestSeq) return;

  const globalScope = cachedSnapshot.global || {};
  const guildScope = cachedSnapshot.guild || {};

  renderModeTable({
    container: modulesTable,
    rows: (cachedSnapshot.catalog.modules || []).map((m) => ({ key: m, label: m })),
    currentModeResolver: (key) => modeFromTables(globalScope.modules, guildScope.modules, key),
    onChange: async (moduleKey, mode) => {
      await api("/api/dashboard/module", { method: "POST", body: JSON.stringify({ guildId: scope, moduleKey, mode }) });
      await refreshControls();
    },
  });

  renderModeTable({
    container: eventsTable,
    rows: (cachedSnapshot.catalog.events || []).map((e) => ({ key: e, label: `${e} [${(cachedSnapshot.catalog.eventGroups || []).find((g) => e.startsWith(g.slice(0, 1))) || "group"}]` })),
    currentModeResolver: (key) => modeFromTables(globalScope.events, guildScope.events, key),
    onChange: async (eventName, mode) => {
      await api("/api/dashboard/event", { method: "POST", body: JSON.stringify({ guildId: scope, eventName, mode }) });
      await refreshControls();
    },
  });

  renderModeTable({
    container: prefixCommandsTable,
    rows: (cachedSnapshot.catalog.prefixCommands || []).map((c) => ({ key: c.name, label: `${c.name} [${c.module}]` })),
    currentModeResolver: (key) => modeFromTables(globalScope.commands?.prefix, guildScope.commands?.prefix, key),
    onChange: async (commandName, mode) => {
      await api("/api/dashboard/command", { method: "POST", body: JSON.stringify({ guildId: scope, commandType: "prefix", commandName, mode }) });
      await refreshControls();
    },
  });

  renderModeTable({
    container: slashCommandsTable,
    rows: (cachedSnapshot.catalog.slashCommands || []).map((c) => ({ key: c.name, label: `${c.name} [${c.module}]` })),
    currentModeResolver: (key) => modeFromTables(globalScope.commands?.slash, guildScope.commands?.slash, key),
    onChange: async (commandName, mode) => {
      await api("/api/dashboard/command", { method: "POST", body: JSON.stringify({ guildId: scope, commandType: "slash", commandName, mode }) });
      await refreshControls();
    },
  });

  routeEventSelect.innerHTML = "";
  for (const eventName of cachedSnapshot.catalog.events || []) {
    const opt = document.createElement("option");
    opt.value = eventName;
    opt.textContent = eventName;
    routeEventSelect.appendChild(opt);
  }

  routeGroupSelect.innerHTML = "";
  for (const group of cachedSnapshot.catalog.eventGroups || []) {
    const opt = document.createElement("option");
    opt.value = group;
    opt.textContent = group;
    routeGroupSelect.appendChild(opt);
  }
}

async function refreshOverview() {
  const data = await api("/api/dashboard/overview");
  renderOverview(data.overview || {});
}

async function refreshAuth() {
  const data = await api("/api/auth/me");
  currentAuth = data;
  if (data.authenticated) {
    authState.textContent = `Auth: ${data.user.globalName || data.user.username} (${data.user.id})`;
  } else {
    authState.textContent = "Auth: non autenticato";
  }
}

async function refreshAll() {
  if (refreshRunning) return;
  refreshRunning = true;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Aggiornamento...";
  currentScope = String(guildSelect.value || currentScope || "global");
  await refreshAuth().catch(() => {});
  await Promise.allSettled([
    refreshOverview(),
    refreshControls(currentScope),
    refreshActivity(),
    refreshUsers(),
    refreshCommandsHelp(),
    refreshErrors(),
    refreshConsole(),
  ]);
  refreshBtn.disabled = false;
  refreshBtn.textContent = "Aggiorna ora";
  refreshRunning = false;
}

async function processAction(action) {
  processStatus.textContent = `Process: ${action} in corso...`;
  try {
    const data = await api("/api/dashboard/process", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    processStatus.textContent = `Process: ${data.message || "ok"}`;
  } catch (error) {
    processStatus.textContent = `Process: errore (${error.message})`;
  }
}

oauthLoginBtn.addEventListener("click", async () => {
  const data = await api("/api/auth/login");
  window.location.href = data.url;
});

oauthLogoutBtn.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  await refreshAll();
});

saveTokenBtn.addEventListener("click", async () => {
  setToken(tokenInput.value.trim());
  await refreshAll();
});

refreshBtn.addEventListener("click", () => refreshAll().catch(() => {}));
guildSelect.addEventListener("change", async () => {
  currentScope = String(guildSelect.value || "global");
  usersPage = 1;
  await refreshControls(currentScope);
  await refreshUsers().catch(() => {});
});
processStartBtn.addEventListener("click", () => processAction("start"));
processRestartBtn.addEventListener("click", () => processAction("restart"));
processStopBtn.addEventListener("click", () => processAction("stop"));
usersSearchBtn.addEventListener("click", async () => {
  usersQuery = String(usersSearchInput.value || "").trim();
  usersPage = 1;
  await refreshUsers();
});
usersPrevBtn.addEventListener("click", async () => {
  usersPage = Math.max(1, usersPage - 1);
  await refreshUsers();
});
usersNextBtn.addEventListener("click", async () => {
  usersPage = Math.min(usersTotalPages, usersPage + 1);
  await refreshUsers();
});

saveRouteBtn.addEventListener("click", async () => {
  const scope = String(guildSelect.value || "global");
  const eventName = String(routeEventSelect.value || "");
  const channelId = String(routeChannelSelect.value || "");
  await api("/api/dashboard/route", { method: "POST", body: JSON.stringify({ guildId: scope, eventName, channelId }) });
  await refreshControls();
});

saveRouteGroupBtn.addEventListener("click", async () => {
  const scope = String(guildSelect.value || "global");
  const eventGroup = String(routeGroupSelect.value || "");
  const channelId = String(routeGroupChannelSelect.value || "");
  await api("/api/dashboard/route-group", { method: "POST", body: JSON.stringify({ guildId: scope, eventGroup, channelId }) });
  await refreshControls();
});

(async function boot() {
  tokenInput.value = getToken();
  await refreshAll().catch((error) => {
    console.error(error);
    alert(`Dashboard error: ${error.message}`);
  });
  setInterval(() => refreshOverview().catch(() => {}), 3000);
  setInterval(() => refreshControls().catch(() => {}), 9000);
  setInterval(() => refreshActivity().catch(() => {}), 2500);
  setInterval(() => refreshErrors().catch(() => {}), 3500);
  setInterval(() => refreshConsole().catch(() => {}), 2500);
})();
