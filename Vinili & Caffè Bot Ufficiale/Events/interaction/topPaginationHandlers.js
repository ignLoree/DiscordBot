const { TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID, buildTopChannelPayload, normalizeLookbackDays, normalizeTopView, normalizeControlsView, normalizePage, } = require("../../Prefix/Stats/top");
const SNOWFLAKE_RE = /^\d{16,20}$/;

function parseTopPageModalCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  if (
    raw !== TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX &&
    !raw.startsWith(`${TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX}:`)
  ) {
    return null;
  }

  const parts = raw.split(":");
  const hasOwner = SNOWFLAKE_RE.test(String(parts[1] || ""));
  const ownerId = hasOwner ? String(parts[1]) : null;
  const offset = hasOwner ? 1 : 0;
  const lookbackDays = normalizeLookbackDays(parts[1 + offset] || "14");
  const selectedView = normalizeTopView(parts[2 + offset] || "overview");
  const currentPage = normalizePage(parts[3 + offset] || "1", 1);
  const totalPages = Math.max(
    1,
    normalizePage(parts[4 + offset] || "1", 1),
  );
  const controlsView = normalizeControlsView(parts[5 + offset] || "main");

  return {
    ownerId,
    lookbackDays,
    selectedView,
    currentPage,
    totalPages,
    controlsView,
  };
}

module.exports = {
  async handleTopPaginationModal(interaction) {
    if (!interaction?.isModalSubmit?.()) return false;

    const parsed = parseTopPageModalCustomId(interaction.customId);
    if (!parsed) return false;

    try {
      const rawInput = interaction.fields?.getTextInputValue(
        TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID,
      );
      const inputPage = normalizePage(rawInput || parsed.currentPage, parsed.currentPage);
      const requestedPage = Math.min(Math.max(1, inputPage), parsed.totalPages);

      if (!interaction.message) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non trovo il messaggio da aggiornare.",
          flags: 1 << 6,
        });
        return true;
      }

      await interaction.deferUpdate();
      const payload = await buildTopChannelPayload(
        { guild: interaction.guild },
        parsed.lookbackDays,
        parsed.controlsView,
        parsed.selectedView,
        requestedPage,
        parsed.ownerId || interaction.user?.id,
      );

      await interaction.message.edit({
        ...payload,
        content: payload.content || null,
      });
    } catch (error) {
      global.logger?.error?.("[TOP CHANNEL PAGE MODAL] Failed:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Errore durante il cambio pagina.",
          flags: 1 << 6,
        }).catch(() => {});
      }
    }

    return true;
  },
};
