const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } = require("discord.js");
const TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX = "stats_top_channel_refresh";
const TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_top_channel_period_open";
const TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_top_channel_period_set";
const TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_top_channel_period_back";
const TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX = "stats_top_channel_view_select";
const TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX = "stats_top_channel_page_first";
const TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX = "stats_top_channel_page_prev";
const TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX = "stats_top_channel_page_modal_open";
const TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX = "stats_top_channel_page_next";
const TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX = "stats_top_channel_page_last";
const TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX = "stats_top_channel_page_modal";
const TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID = "stats_top_channel_page_modal_input";
const TOP_VIEWS = ["overview", "message_users", "voice_users", "message_channels", "voice_channels", "invites_users", "exp_users", "level_users"];

function normalizeLookbackDays(raw) {
  const parsed = Number(String(raw || "14").toLowerCase().replace(/d$/i, ""));
  return [1, 7, 14, 21, 30].includes(parsed) ? parsed : 14;
}

function normalizeTopView(raw) {
  const value = String(raw || "overview").trim().toLowerCase();
  return TOP_VIEWS.includes(value) ? value : "overview";
}

function normalizeControlsView(raw) {
  return String(raw || "main").toLowerCase() === "period" ? "period" : "main";
}

function normalizeOwnerId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : "0";
}

function normalizePage(value, fallback = 1) {
  const n = Number.parseInt(String(value || fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildTopChannelSelectRow(ownerId, lookbackDays, selectedView = "overview") {
  const safeOwner = normalizeOwnerId(ownerId);
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}`)
      .setPlaceholder("📊 Overview")
      .addOptions(
        { label: "📊 Overview", value: "overview", default: safeView === "overview" },
        { label: "✍️ Top Message Users", value: "message_users", default: safeView === "message_users" },
        { label: "🎙️ Top Voice Users", value: "voice_users", default: safeView === "voice_users" },
        { label: "💭 Top canali messaggi", value: "message_channels", default: safeView === "message_channels" },
        { label: "🔊 Top canali vocali", value: "voice_channels", default: safeView === "voice_channels" },
        { label: "🔗 Invites User", value: "invites_users", default: safeView === "invites_users" },
        { label: "📈 Top EXP", value: "exp_users", default: safeView === "exp_users" },
        { label: "🏆 Top Livelli", value: "level_users", default: safeView === "level_users" },
      ),
  );
}

function buildTopChannelMainControlsRow(ownerId, lookbackDays, selectedView = "overview", page = 1) {
  const safeOwner = normalizeOwnerId(ownerId);
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = normalizePage(page, 1);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}`)
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}`)
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildTopChannelPeriodControlsRows(ownerId, lookbackDays, selectedView = "overview", page = 1) {
  const safeOwner = normalizeOwnerId(ownerId);
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = normalizePage(page, 1);
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}`)
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:1:${safeView}:${safePage}`)
      .setLabel("1d")
      .setStyle(safeLookback === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:7:${safeView}:${safePage}`)
      .setLabel("7d")
      .setStyle(safeLookback === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:14:${safeView}:${safePage}`)
      .setLabel("14d")
      .setStyle(safeLookback === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:21:${safeView}:${safePage}`)
      .setLabel("21d")
      .setStyle(safeLookback === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:30:${safeView}:${safePage}`)
      .setLabel("30d")
      .setStyle(safeLookback === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  return [topRow, bottomRow];
}

function buildTopChannelPaginationRow(ownerId, lookbackDays, selectedView, page, totalPages, controlsView = "main") {
  const safeOwner = normalizeOwnerId(ownerId);
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = Math.min(Math.max(1, normalizePage(page, 1)), Math.max(1, normalizePage(totalPages, 1)));
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const controls = normalizeControlsView(controlsView);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`)
      .setEmoji('<:VC_page1:1463196324156674289>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`)
      .setEmoji('<:VC_page5:1463196506143326261>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`)
      .setLabel(`${safePage}/${safeTotal}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`)
      .setEmoji('<:VC_page4:1463196456964980808>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage >= safeTotal),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`)
      .setEmoji('<:VC_page3:1463196404120813766>')
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage >= safeTotal),
  );
}

function buildTopChannelComponents(ownerId, lookbackDays, controlsView = "main", selectedView = "overview", page = 1, totalPages = 1) {
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);
  const rows = [buildTopChannelSelectRow(ownerId, lookbackDays, safeView)];
  if (safeView !== "overview") {
    rows.push(buildTopChannelPaginationRow(ownerId, lookbackDays, safeView, page, totalPages, safeControls));
  }
  rows.push(buildTopChannelMainControlsRow(ownerId, lookbackDays, safeView, page));
  if (safeControls === "period") {
    rows.push(...buildTopChannelPeriodControlsRows(ownerId, lookbackDays, safeView, page));
  }
  return rows;
}

function buildTopPageJumpModal(ownerId, lookbackDays, selectedView, currentPage, totalPages, controlsView = "main") {
  const safeOwner = normalizeOwnerId(ownerId);
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeCurrent = normalizePage(currentPage, 1);
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const controls = normalizeControlsView(controlsView);
  const input = new TextInputBuilder()
    .setCustomId(TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID)
    .setLabel(`Pagina (1-${safeTotal})`)
    .setPlaceholder(String(safeCurrent))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  const row = new ActionRowBuilder().addComponents(input);
  return new ModalBuilder()
    .setCustomId(`${TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX}:${safeOwner}:${safeLookback}:${safeView}:${safeCurrent}:${safeTotal}:${controls}`)
    .setTitle("Vai a una pagina")
    .addComponents(row);
}

module.exports = { TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID, normalizeLookbackDays, normalizeTopView, normalizeControlsView, normalizeOwnerId, normalizePage, buildTopChannelSelectRow, buildTopChannelMainControlsRow, buildTopChannelPeriodControlsRows, buildTopChannelPaginationRow, buildTopChannelComponents, buildTopPageJumpModal };