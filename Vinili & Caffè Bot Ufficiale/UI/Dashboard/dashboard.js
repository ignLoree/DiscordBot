const tokenInput = document.getElementById("tokenInput");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const guildSelect = document.getElementById("guildSelect");
const refreshBtn = document.getElementById("refreshBtn");
const oauthLoginBtn = document.getElementById("oauthLoginBtn");
const oauthLogoutBtn = document.getElementById("oauthLogoutBtn");
const authState = document.getElementById("authState");

const overviewCards = document.getElementById("overviewCards");
const modulesTable = document.getElementById("modulesTable");
const eventsTable = document.getElementById("eventsTable");
const prefixCommandsTable = document.getElementById("prefixCommandsTable");
const slashCommandsTable = document.getElementById("slashCommandsTable");
const activityTable = document.getElementById("activityTable");

const routeEventSelect = document.getElementById("routeEventSelect");
const routeChannelSelect = document.getElementById("routeChannelSelect");
const saveRouteBtn = document.getElementById("saveRouteBtn");

const routeGroupSelect = document.getElementById("routeGroupSelect");
const routeGroupChannelSelect = document.getElementById("routeGroupChannelSelect");
const saveRouteGroupBtn = document.getElementById("saveRouteGroupBtn");

const rowTemplate = document.getElementById("rowTemplate");

let cachedSnapshot = null;
let currentAuth = null;

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
  const current = String(guildSelect.value || "global");
  guildSelect.innerHTML = '<option value="global">Globale (tutti i server)</option>';
  for (const guild of guilds) {
    const opt = document.createElement("option");
    opt.value = guild.id;
    opt.textContent = `${guild.name} (${guild.id})`;
    guildSelect.appendChild(opt);
  }
  guildSelect.value = guilds.some((g) => g.id === current) ? current : "global";
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

async function refreshControls() {
  const scope = String(guildSelect.value || "global");
  const guildQuery = scope === "global" ? "" : `?guildId=${encodeURIComponent(scope)}`;
  const data = await api(`/api/dashboard/controls${guildQuery}`);
  cachedSnapshot = data.snapshot;

  fillGuildSelect(cachedSnapshot.catalog.guilds || []);
  await updateRouteChannels();

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
  await refreshAuth();
  await Promise.all([refreshOverview(), refreshControls(), refreshActivity()]);
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

refreshBtn.addEventListener("click", refreshAll);
guildSelect.addEventListener("change", refreshControls);

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
})();
