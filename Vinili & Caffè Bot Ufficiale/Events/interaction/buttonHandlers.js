const {
  SERVER_REFRESH_CUSTOM_ID_PREFIX,
  buildServerOverviewPayload,
} = require("../../Prefix/Stats/server");
const {
  ME_REFRESH_CUSTOM_ID_PREFIX,
  ME_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  ME_PERIOD_SET_CUSTOM_ID_PREFIX,
  ME_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildMeOverviewPayload,
  buildMeComponents,
  normalizeLookbackDays,
} = require("../../Prefix/Stats/me");
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
  buildTopChannelPayload,
  normalizeTopView,
  normalizeControlsView,
  normalizePage,
  resolveRequestedPage,
  buildTopPageJumpModal,
} = require("../../Prefix/Stats/top");
const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ROWS_PER_MESSAGE = 5;

function parseServerRefreshCustomId(customId) {
  const raw = String(customId || "");
  if (
    raw !== SERVER_REFRESH_CUSTOM_ID_PREFIX &&
    !raw.startsWith(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:`)
  ) {
    return null;
  }
  const parts = raw.split(":");
  const lookbackRaw = parts[1] || "14";
  const modeRaw = parts[2] || "image";
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const safeLookback = [7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const wantsEmbed = String(modeRaw || "embed").toLowerCase() !== "image";
  return { lookbackDays: safeLookback, wantsEmbed };
}

function parseMeCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [
    ME_REFRESH_CUSTOM_ID_PREFIX,
    ME_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    ME_PERIOD_SET_CUSTOM_ID_PREFIX,
    ME_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  const prefix = prefixes.find(
    (item) => raw === item || raw.startsWith(`${item}:`),
  );
  if (!prefix) return null;

  const parts = raw.split(":");
  const lookbackRaw = parts[1] || "14";
  const modeRaw = parts[2] || "image";
  const lookbackDays = normalizeLookbackDays(lookbackRaw || "14");
  const wantsEmbed = String(modeRaw || "embed").toLowerCase() !== "image";
  return { prefix, lookbackDays, wantsEmbed };
}

function parseTopChannelCustomId(rawCustomId) {
  const raw = String(rawCustomId || "");
  const prefixes = [
    TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
    TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  const prefix = prefixes.find(
    (item) => raw === item || raw.startsWith(`${item}:`),
  );
  if (!prefix) return null;
  const parts = raw.split(":");
  const lookbackRaw = parts[1] || "14";
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const lookbackDays = [1, 7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const selectedView = normalizeTopView(parts[2] || "overview");
  const page = normalizePage(parts[3] || "1", 1);
  return { prefix, lookbackDays, selectedView, page };
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
  const item = map.find(
    (entry) => raw === entry.prefix || raw.startsWith(`${entry.prefix}:`),
  );
  if (!item) return null;

  const parts = raw.split(":");
  const lookbackDays = normalizeLookbackDays(parts[1] || "14");
  const selectedView = normalizeTopView(parts[2] || "overview");
  const page = normalizePage(parts[3] || "1", 1);
  const totalPages = Math.max(1, normalizePage(parts[4] || "1", 1));
  const controlsView = normalizeControlsView(parts[5] || "main");
  return {
    action: item.action,
    lookbackDays,
    selectedView,
    page,
    totalPages,
    controlsView,
  };
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
  const lookbackRaw = parts[1] || "14";
  const lookback = Number.parseInt(String(lookbackRaw || "14"), 10);
  const lookbackDays = [1, 7, 14, 21, 30].includes(lookback) ? lookback : 14;
  const selectedView = normalizeTopView(parts[2] || "overview");
  return { lookbackDays, selectedView };
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
    const rowComponents = Array.isArray(asJson?.components)
      ? asJson.components
      : [];
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

module.exports = {
  async handleButtonInteraction(interaction) {
    if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) {
      return false;
    }

    if (interaction.isStringSelectMenu?.()) {
      const parsedSelect = parseTopChannelViewSelectCustomId(interaction.customId);
      if (!parsedSelect) return false;

      try {
        await interaction.deferUpdate();
        const selectedValue = normalizeTopView(interaction.values?.[0] || "overview");
        const payload = await buildTopChannelPayload(
          { guild: interaction.guild },
          parsedSelect.lookbackDays,
          "main",
          selectedValue,
          1,
        );
        await interaction.message.edit({
          ...payload,
          components: normalizeComponentsForDiscord(payload?.components),
          content: payload.content || null,
        });
      } catch (error) {
        global.logger?.error?.("[TOP CHANNEL SELECT] Failed:", error);
      }

      return true;
    }

    const parsedMe = parseMeCustomId(interaction.customId);
    if (parsedMe) {
      try {
        await interaction.deferUpdate();

        if (parsedMe.prefix === ME_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildMeComponents(
                parsedMe.lookbackDays,
                parsedMe.wantsEmbed,
                "period",
              ),
            ),
          });
          return true;
        }

        if (parsedMe.prefix === ME_PERIOD_BACK_CUSTOM_ID_PREFIX) {
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildMeComponents(
                parsedMe.lookbackDays,
                parsedMe.wantsEmbed,
                "main",
              ),
            ),
          });
          return true;
        }

        const controlsView =
          parsedMe.prefix === ME_PERIOD_SET_CUSTOM_ID_PREFIX ? "period" : "main";
        const payload = await buildMeOverviewPayload(
          interaction.guild,
          interaction.user,
          interaction.member,
          parsedMe.lookbackDays,
          parsedMe.wantsEmbed,
          controlsView,
        );
        await interaction.message.edit({
          ...payload,
          components: normalizeComponentsForDiscord(payload?.components),
          content: payload.content || null,
        });
      } catch (error) {
        global.logger?.error?.("[ME BUTTON] Failed:", error);
      }

      return true;
    }

    const parsedTopChannel = parseTopChannelCustomId(interaction.customId);
    if (parsedTopChannel) {
      try {
        await interaction.deferUpdate();

        if (parsedTopChannel.prefix === TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
          const payload = await buildTopChannelPayload(
            { guild: interaction.guild },
          parsedTopChannel.lookbackDays,
          "period",
          parsedTopChannel.selectedView,
          parsedTopChannel.page,
        );
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              payload?.components,
            ),
          });
          return true;
        }

        if (parsedTopChannel.prefix === TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX) {
          const payload = await buildTopChannelPayload(
            { guild: interaction.guild },
          parsedTopChannel.lookbackDays,
          "main",
          parsedTopChannel.selectedView,
          parsedTopChannel.page,
        );
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              payload?.components,
            ),
          });
          return true;
        }

        const controlsView =
          parsedTopChannel.prefix === TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX
            ? "period"
            : "main";
        const payload = await buildTopChannelPayload(
          {
            guild: interaction.guild,
          },
          parsedTopChannel.lookbackDays,
          controlsView,
          parsedTopChannel.selectedView,
          parsedTopChannel.page,
        );
        await interaction.message.edit({
          ...payload,
          components: normalizeComponentsForDiscord(payload?.components),
          content: payload.content || null,
        });
      } catch (error) {
        global.logger?.error?.("[TOP CHANNEL BUTTON] Failed:", error);
      }

      return true;
    }

    const parsedTopChannelPage = parseTopChannelPageCustomId(interaction.customId);
    if (parsedTopChannelPage) {
      try {
        if (parsedTopChannelPage.action === "open_modal") {
          const modal = buildTopPageJumpModal(
            parsedTopChannelPage.lookbackDays,
            parsedTopChannelPage.selectedView,
            parsedTopChannelPage.page,
            parsedTopChannelPage.totalPages,
            parsedTopChannelPage.controlsView,
          );
          await interaction.showModal(modal);
          return true;
        }

        await interaction.deferUpdate();
        const requestedPage = resolveRequestedPage(
          parsedTopChannelPage.action,
          parsedTopChannelPage.page,
          parsedTopChannelPage.totalPages,
        );
        const payload = await buildTopChannelPayload(
          { guild: interaction.guild },
          parsedTopChannelPage.lookbackDays,
          parsedTopChannelPage.controlsView,
          parsedTopChannelPage.selectedView,
          requestedPage,
        );
        await interaction.message.edit({
          ...payload,
          components: normalizeComponentsForDiscord(payload?.components),
          content: payload.content || null,
        });
      } catch (error) {
        global.logger?.error?.("[TOP CHANNEL PAGE BUTTON] Failed:", error);
      }
      return true;
    }

    const parsed = parseServerRefreshCustomId(interaction.customId);
    if (!parsed) return false;

    try {
      await interaction.deferUpdate();
      const payload = await buildServerOverviewPayload(
        interaction.guild,
        parsed.lookbackDays,
        parsed.wantsEmbed,
      );
      await interaction.message.edit({
        ...payload,
        components: normalizeComponentsForDiscord(payload?.components),
        content: payload.content || null,
      });
    } catch (error) {
      global.logger?.error?.("[SERVER REFRESH BUTTON] Failed:", error);
    }

    return true;
  },
};
