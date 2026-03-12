const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX = "top_channel_refresh";
const TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX = "top_channel_period_open";
const TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX = "top_channel_period_set";
const TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX = "top_channel_period_back";
const TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX = "top_channel_view_select";
const TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX = "top_channel_page_first";
const TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX = "top_channel_page_prev";
const TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX = "top_channel_page_modal_open";
const TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX = "top_channel_page_next";
const TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX = "top_channel_page_last";
const TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX = "top_page_modal";
const TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID = "top_page_input";
const ALLOWED_LOOKBACK = [1, 7, 14, 21, 30];
const ALLOWED_VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "message_users", label: "Top messaggi utenti" },
  { value: "voice_users", label: "Top vocale utenti" },
  { value: "message_channels", label: "Top canali messaggi" },
  { value: "voice_channels", label: "Top canali vocali" },
  { value: "invites_users", label: "Inviti utenti" },
  { value: "exp_users", label: "Top EXP" },
  { value: "level_users", label: "Top livelli" },
];

function normalizeLookbackDays(x) {
  if (x == null || x === "") return 14;
  const n = Number.parseInt(String(x).replace(/d$/i, "").trim(), 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function normalizeTopView(x) {
  const v = String(x || "").trim().toLowerCase();
  if (ALLOWED_VIEWS.some((o) => o.value === v)) return v;
  return "overview";
}

function normalizeControlsView(x) {
  const v = String(x || "").trim().toLowerCase();
  return v === "main" || v === "period" ? v : "main";
}

function normalizePage(x, def) {
  const n = Number.parseInt(String(x || "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return def != null ? def : 1;
  return n;
}

function pageCustomIdSuffix(ownerId, lookbackDays, selectedView, page, totalPages, controlsView) {
  const parts = [lookbackDays, selectedView, page, totalPages, controlsView];
  if (ownerId) return [ownerId, ...parts].join(":");
  return parts.join(":");
}

function buildTopChannelComponents(ownerId, lookbackDays, controlsView, selectedView, page, totalPages) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);
  const safePage = normalizePage(page, 1);
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const suffix = pageCustomIdSuffix(ownerId, safeLookback, safeView, safePage, safeTotal, safeControls);

  const refreshId = ownerId ? `${TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:${safeView}:${safePage}` : `${TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`;
  const periodOpenId = ownerId ? `${TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:${safeView}:${safePage}` : `${TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`;
  const viewSelectId = ownerId ? `${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}` : `${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:${safeLookback}`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(refreshId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Refresh:1473359252276904203> "),
    new ButtonBuilder().setCustomId(periodOpenId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Clock:1473359204189474886>")
  );

  const periodSetId = (days) => (ownerId ? `${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${ownerId}:${days}:${safeView}:${safePage}` : `${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${days}:${safeView}:${safePage}`);
  const periodBackId = ownerId ? `${TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:${safeView}:${safePage}` : `${TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`;
  const rowPeriod1 = new ActionRowBuilder().addComponents(
    ...ALLOWED_LOOKBACK.map((d) =>
      new ButtonBuilder().setCustomId(periodSetId(d)).setStyle(safeLookback === d ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(`${d}d`)
    )
  );
  const rowPeriod2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(periodBackId).setStyle(ButtonStyle.Secondary).setLabel("Indietro")
  );

  const rowViewSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(viewSelectId)
      .setPlaceholder("📊 Overview")
      .addOptions(
        ALLOWED_VIEWS.map((o) => ({
          label: o.label,
          value: o.value,
          default: o.value === safeView,
        }))
      )
  );

  const firstId = `${TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX}:${suffix}`;
  const prevId = `${TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX}:${suffix}`;
  const modalOpenId = `${TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX}:${suffix}`;
  const nextId = `${TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX}:${suffix}`;
  const lastId = `${TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX}:${suffix}`;

  const rows = safeControls === "period" ? [row1, rowPeriod1, rowPeriod2, rowViewSelect] : [row1, rowViewSelect];
  if (safeView !== "overview") {
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(firstId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_page1:1463196324156674289>").setDisabled(safePage <= 1),
      new ButtonBuilder().setCustomId(prevId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_page5:1463196506143326261>").setDisabled(safePage <= 1),
      new ButtonBuilder().setCustomId(modalOpenId).setStyle(ButtonStyle.Primary).setEmoji("<:VC_page2:1463196369123676414> "),
      new ButtonBuilder().setCustomId(nextId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_page4:1463196456964980808>").setDisabled(safePage >= safeTotal),
      new ButtonBuilder().setCustomId(lastId).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_page3:1463196404120813766>").setDisabled(safePage >= safeTotal)
    );
    rows.push(row2);
  }
  return rows;
}

function buildTopPageJumpModal(ownerId, lookbackDays, controlsView, selectedView, currentPage, totalPages) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);
  const safePage = normalizePage(currentPage, 1);
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const suffix = pageCustomIdSuffix(ownerId, safeLookback, safeView, safePage, safeTotal, safeControls);

  const modal = new ModalBuilder()
    .setCustomId(`${TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX}:${suffix}`)
    .setTitle("Vai a pagina");

  const input = new TextInputBuilder()
    .setCustomId(TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID)
    .setLabel("Numero pagina")
    .setPlaceholder(`1 - ${safeTotal}`)
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(4)
    .setValue(String(safePage))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

module.exports = { TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID, normalizeLookbackDays, normalizeTopView, normalizeControlsView, normalizePage, buildTopChannelComponents, buildTopPageJumpModal };