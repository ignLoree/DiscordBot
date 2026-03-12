const Buttons = require("../../Buttons");
const { SERVER_REFRESH_CUSTOM_ID_PREFIX } = Buttons.server;
const { ME_REFRESH_CUSTOM_ID_PREFIX, ME_PERIOD_OPEN_CUSTOM_ID_PREFIX, ME_PERIOD_SET_CUSTOM_ID_PREFIX, ME_PERIOD_BACK_CUSTOM_ID_PREFIX, normalizeLookbackDays } = Buttons.me;
const { USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX } = Buttons.user;
const { CHANNEL_REFRESH_CUSTOM_ID_PREFIX, CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, normalizeLookbackDays: normalizeChannelLookback } = Buttons.channel;
const { TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, normalizeTopView, normalizeControlsView, normalizePage } = Buttons.topChannelComponents;
const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ROWS_PER_MESSAGE = 5;
const SNOWFLAKE_RE = /^\d{16,20}$/;

async function denyIfNotOwner(interaction, ownerId) {
  const safeOwnerId = String(ownerId || "");
  if (!safeOwnerId) return false;
  if (String(interaction?.user?.id || "") === safeOwnerId) return false;
  await interaction.reply({
    content: "<a:VC_Alert:1448670089670037675> Questo controllo non appartiene a te.",
    flags: 1 << 6,
  }).catch(() => { });
  return true;
}

async function sendControlErrorFallback(interaction) {
  const payload = {
    content: "<a:VC_Alert:1448670089670037675> Errore durante l'aggiornamento del controllo.",
    flags: 1 << 6,
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => { });
    return;
  }
  await interaction.reply(payload).catch(() => { });
}

function parseServerRefreshCustomId(customId) {
  const raw = String(customId || "");
  if (
    raw !== SERVER_REFRESH_CUSTOM_ID_PREFIX &&
    !raw.startsWith(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:`)
  ) {
    return null;
  }
  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const lookbackRaw = hasOwner ? parts[2] : parts[1];
  const modeRaw = hasOwner ? parts[3] : parts[2];
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const safeLookback = [7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const wantsEmbed = String(modeRaw || "embed").toLowerCase() !== "image";
  return { ownerId, lookbackDays: safeLookback, wantsEmbed };
}

function parseMeCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [ME_REFRESH_CUSTOM_ID_PREFIX, ME_PERIOD_OPEN_CUSTOM_ID_PREFIX, ME_PERIOD_SET_CUSTOM_ID_PREFIX, ME_PERIOD_BACK_CUSTOM_ID_PREFIX];
  const prefix = prefixes.find((item) => raw === item || raw.startsWith(`${item}:`));
  if (!prefix) return null;

  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const lookbackRaw = hasOwner ? parts[2] : parts[1];
  const modeRaw = hasOwner ? parts[3] : parts[2];
  const lookbackDays = normalizeLookbackDays(lookbackRaw || "14");
  const wantsEmbed = String(modeRaw || "embed").toLowerCase() !== "image";
  return { prefix, ownerId, lookbackDays, wantsEmbed };
}

function parseUserCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX];
  const prefix = prefixes.find((item) => raw === item || raw.startsWith(`${item}:`));
  if (!prefix) return null;
  const parts = raw.split(":");
  const ownerId = SNOWFLAKE_RE.test(String(parts[1] || "")) ? String(parts[1]) : null;
  const targetUserId = SNOWFLAKE_RE.test(String(parts[2] || "")) ? String(parts[2]) : null;
  const lookbackDays = normalizeLookbackDays(parts[3] || "14");
  const wantsEmbed = String(parts[4] || "embed").toLowerCase() !== "image";
  return { prefix, ownerId, targetUserId, lookbackDays, wantsEmbed };
}

function parseChannelCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [
    CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  const prefix = prefixes.find((item) => raw === item || raw.startsWith(`${item}:`));
  if (!prefix) return null;
  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const channelId = hasOwner ? String(parts[2] || "") : String(parts[1] || "");
  const lookbackRaw = hasOwner ? parts[3] : parts[2];
  const lookbackDays = normalizeChannelLookback(lookbackRaw || "14");
  return { prefix, ownerId, channelId, lookbackDays };
}

function parseTopChannelCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [
    TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  const prefix = prefixes.find((item) => raw === item || raw.startsWith(`${item}:`));
  if (!prefix) return null;
  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const lookbackRaw = hasOwner ? parts[2] : parts[1];
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const lookbackDays = [1, 7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const selectedView = normalizeTopView(hasOwner ? parts[3] : parts[2] || "overview");
  const page = normalizePage(hasOwner ? parts[4] : parts[3] || "1", 1);
  return { prefix, ownerId, lookbackDays, selectedView, page };
}

function parseTopChannelPageCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const map = [
    { prefix: TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, action: "first" },
    { prefix: TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, action: "prev" },
    { prefix: TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, action: "next" },
    { prefix: TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, action: "last" },
    { prefix: TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, action: "open_modal" },
  ];
  const item = map.find((entry) => raw === entry.prefix || raw.startsWith(`${entry.prefix}:`));
  if (!item) return null;

  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const offset = hasOwner ? 1 : 0;
  const lookbackDays = normalizeLookbackDays(parts[1 + offset] || "14");
  const selectedView = normalizeTopView(parts[2 + offset] || "overview");
  const page = normalizePage(parts[3 + offset] || "1", 1);
  const totalPages = Math.max(1, normalizePage(parts[4 + offset] || "1", 1));
  const controlsView = normalizeControlsView(parts[5 + offset] || "main");
  return { action: item.action, ownerId, lookbackDays, selectedView, page, totalPages, controlsView };
}

function parseTopChannelViewSelectCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  if (
    raw !== TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX &&
    !raw.startsWith(`${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:`)
  ) {
    return null;
  }
  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const lookbackRaw = hasOwner ? parts[2] : parts[1];
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const lookbackDays = [1, 7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const selectedView = normalizeTopView(hasOwner ? parts[3] : parts[2] || "overview");
  return { ownerId, lookbackDays, selectedView };
}

function chunk(items = [], size = MAX_COMPONENTS_PER_ROW) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function normalizeComponentsForDiscord(components) {
  if (!Array.isArray(components) || components.length === 0) return components;

  const normalized = [];
  for (const row of components) {
    const asJson = row?.toJSON ? row.toJSON() : row;
    const rowComponents = Array.isArray(asJson?.components) ? asJson.components : [];
    if (!rowComponents.length) continue;

    const chunks = chunk(rowComponents, MAX_COMPONENTS_PER_ROW);
    for (const piece of chunks) {
      normalized.push({ type: 1, components: piece });
      if (normalized.length >= MAX_ROWS_PER_MESSAGE) {
        return normalized;
      }
    }
  }

  return normalized;
}

function disableComponentsForLoading(components) {
  if (!Array.isArray(components) || components.length === 0) return [];
  const out = [];
  for (const row of components) {
    const asJson = row?.toJSON ? row.toJSON() : row;
    const rowType = Number(asJson?.type || 1);
    const rowComponents = Array.isArray(asJson?.components) ? asJson.components : [];
    if (!rowComponents.length) continue;

    out.push({
      type: rowType,
      components: rowComponents.map((component) => {
        if (!component || typeof component !== "object") return component;
        const type = Number(component.type || 0);
        if (type === 2 || type === 3 || type === 5 || type === 6 || type === 7 || type === 8) {
          return { ...component, disabled: true };
        }
        return component;
      }),
    });
  }
  return out;
}

module.exports = { MAX_COMPONENTS_PER_ROW, MAX_ROWS_PER_MESSAGE, SNOWFLAKE_RE, denyIfNotOwner, sendControlErrorFallback, parseServerRefreshCustomId, parseMeCustomId, parseUserCustomId, parseChannelCustomId, parseTopChannelCustomId, parseTopChannelPageCustomId, parseTopChannelViewSelectCustomId, chunk, normalizeComponentsForDiscord, disableComponentsForLoading };