const {
  TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX,
  buildTopPageJumpModal,
  normalizeTopView,
} = require("./topChannel/components");
const { parseTopChannelCustomId, parseTopChannelPageCustomId, parseTopChannelViewSelectCustomId } = require("../Utils/Interaction/buttonParsers");
const { buildTopChannelPayload } = require("../Prefix/Stats/top");

const TOP_CHANNEL_PREFIXES = [
  TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX,
];

function match(interaction) {
  if (!interaction?.guild) return false;
  const id = String(interaction.customId || "");
  if (interaction.isButton?.()) {
    return TOP_CHANNEL_PREFIXES.some((p) => id === p || id.startsWith(`${p}:`));
  }
  if (interaction.isStringSelectMenu?.()) {
    return id === TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX || id.startsWith(`${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:`);
  }
  return false;
}

async function execute(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  let ownerId = null;
  let lookbackDays = 14;
  let controlsView = "main";
  let selectedView = "overview";
  let page = 1;

  if (interaction.isStringSelectMenu?.()) {
    const parsed = parseTopChannelViewSelectCustomId(interaction.customId);
    if (!parsed) return false;
    ownerId = parsed.ownerId;
    lookbackDays = parsed.lookbackDays;
    const rawValue = Array.isArray(interaction.values) ? interaction.values[0] : null;
    selectedView = normalizeTopView(rawValue || "overview");
    page = 1;
    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Questo controllo non è associato al tuo comando.", flags: 1 << 6 }).catch(() => {});
      return true;
    }
  } else if (interaction.isButton?.()) {
    const pageParsed = parseTopChannelPageCustomId(interaction.customId);
    if (pageParsed) {
      if (pageParsed.action === "open_modal") {
        if (pageParsed.ownerId && String(pageParsed.ownerId) !== String(interaction.user?.id || "")) {
          await interaction.reply({ content: "<:vegax:1443934876440068179> Questo controllo non è associato al tuo comando.", flags: 1 << 6 }).catch(() => {});
          return true;
        }
        const modal = buildTopPageJumpModal(
          pageParsed.ownerId,
          pageParsed.lookbackDays,
          pageParsed.controlsView,
          pageParsed.selectedView,
          pageParsed.page,
          pageParsed.totalPages
        );
        await interaction.showModal(modal).catch(() => {});
        return true;
      }
      ownerId = pageParsed.ownerId;
      lookbackDays = pageParsed.lookbackDays;
      controlsView = pageParsed.controlsView;
      selectedView = pageParsed.selectedView;
      const totalPages = pageParsed.totalPages;
      let newPage = pageParsed.page;
      if (pageParsed.action === "first") newPage = 1;
      else if (pageParsed.action === "prev") newPage = Math.max(1, pageParsed.page - 1);
      else if (pageParsed.action === "next") newPage = Math.min(totalPages, pageParsed.page + 1);
      else if (pageParsed.action === "last") newPage = totalPages;
      page = newPage;
    } else {
      const parsed = parseTopChannelCustomId(interaction.customId);
      if (!parsed) return false;
      ownerId = parsed.ownerId;
      lookbackDays = parsed.lookbackDays;
      selectedView = parsed.selectedView;
      page = parsed.page;
      if (parsed.prefix === TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
        controlsView = "period";
      } else if (parsed.prefix === TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX || parsed.prefix === TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX) {
        controlsView = "main";
      }
      if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Questo controllo non è associato al tuo comando.", flags: 1 << 6 }).catch(() => {});
        return true;
      }
    }
  }

  try {
    await interaction.deferUpdate();
    const messageLike = { guild };
    const payload = await buildTopChannelPayload(
      messageLike,
      lookbackDays,
      controlsView,
      selectedView,
      page,
      ownerId || interaction.user?.id
    );
    await interaction.message?.edit?.({
      files: payload.files || [],
      embeds: payload.embeds || [],
      content: payload.content ?? null,
      components: payload.components || [],
    });
    return true;
  } catch (err) {
    global.logger?.error?.("[topChannelHandler] execute", err);
    await interaction.reply({ content: "<:vegax:1443934876440068179> Errore durante l'aggiornamento.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
}

module.exports = { name: "topChannelHandler", order: 25, match, execute };