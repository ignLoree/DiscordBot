const { SERVER_REFRESH_CUSTOM_ID_PREFIX, buildServerOverviewPayload, } = require("../../Prefix/Stats/server");
const { ME_REFRESH_CUSTOM_ID_PREFIX, ME_PERIOD_OPEN_CUSTOM_ID_PREFIX, ME_PERIOD_SET_CUSTOM_ID_PREFIX, ME_PERIOD_BACK_CUSTOM_ID_PREFIX, buildMeOverviewPayload, buildMeComponents, normalizeLookbackDays, } = require("../../Prefix/Stats/me");
const { USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX, buildUserOverviewPayload, buildUserComponents, } = require("../../Prefix/Stats/user");
const { TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX, TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX, TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX, TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX, buildTopChannelPayload, normalizeTopView, normalizeControlsView, normalizePage, resolveRequestedPage, buildTopPageJumpModal, } = require("../../Prefix/Stats/top");
const {
  handleBackupLoadInteraction,
} = require("../../Services/Backup/backupLoadService");
const {
  handleBackupInfoInteraction,
} = require("../../Services/Backup/backupInfoService");
const {
  handleBackupListInteraction,
} = require("../../Services/Backup/backupListService");
const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ROWS_PER_MESSAGE = 5;
const SNOWFLAKE_RE = /^\d{16,20}$/;

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
  const prefixes = [
    USER_REFRESH_CUSTOM_ID_PREFIX,
    USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    USER_PERIOD_SET_CUSTOM_ID_PREFIX,
    USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  const prefix = prefixes.find(
    (item) => raw === item || raw.startsWith(`${item}:`),
  );
  if (!prefix) return null;
  const parts = raw.split(":");
  const ownerId = SNOWFLAKE_RE.test(String(parts[1] || ""))
    ? String(parts[1])
    : null;
  const targetUserId = SNOWFLAKE_RE.test(String(parts[2] || ""))
    ? String(parts[2])
    : null;
  const lookbackDays = normalizeLookbackDays(parts[3] || "14");
  const wantsEmbed = String(parts[4] || "embed").toLowerCase() !== "image";
  return { prefix, ownerId, targetUserId, lookbackDays, wantsEmbed };
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
  const item = map.find(
    (entry) => raw === entry.prefix || raw.startsWith(`${entry.prefix}:`),
  );
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
  return {
    action: item.action,
    ownerId,
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

function disableComponentsForLoading(components) {
  if (!Array.isArray(components) || components.length === 0) return [];
  const out = [];
  for (const row of components) {
    const asJson = row?.toJSON ? row.toJSON() : row;
    const rowType = Number(asJson?.type || 1);
    const rowComponents = Array.isArray(asJson?.components)
      ? asJson.components
      : [];
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

module.exports = {
  async handleButtonInteraction(interaction) {
    if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) {
      return false;
    }

    if (await handleBackupLoadInteraction(interaction)) {
      return true;
    }
    if (await handleBackupInfoInteraction(interaction)) {
      return true;
    }
    if (await handleBackupListInteraction(interaction)) {
      return true;
    }

    if (interaction.isStringSelectMenu?.()) {
      const parsedSelect = parseTopChannelViewSelectCustomId(interaction.customId);
      if (!parsedSelect) return false;

      try {
        await interaction.deferUpdate();
        await interaction.message
          .edit({
            components: disableComponentsForLoading(interaction.message?.components),
          })
          .catch(() => {});
        const selectedValue = normalizeTopView(interaction.values?.[0] || "overview");
        const payload = await buildTopChannelPayload(
          { guild: interaction.guild },
          parsedSelect.lookbackDays,
          "main",
          selectedValue,
          1,
          parsedSelect.ownerId || interaction.user?.id,
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
                parsedMe.ownerId || interaction.user?.id,
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
                parsedMe.ownerId || interaction.user?.id,
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
        payload.components = buildMeComponents(
          parsedMe.ownerId || interaction.user?.id,
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

    const parsedUser = parseUserCustomId(interaction.customId);
    if (parsedUser) {
      try {
        await interaction.deferUpdate();

        if (!parsedUser.targetUserId) {
          await interaction.message.edit({
            content:
              "<:vegax:1443934876440068179> Utente non valido per il refresh delle statistiche.",
            components: [],
          });
          return true;
        }

        if (parsedUser.prefix === USER_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildUserComponents(
                parsedUser.ownerId || interaction.user?.id,
                parsedUser.targetUserId,
                parsedUser.lookbackDays,
                parsedUser.wantsEmbed,
                "period",
              ),
            ),
          });
          return true;
        }

        if (parsedUser.prefix === USER_PERIOD_BACK_CUSTOM_ID_PREFIX) {
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildUserComponents(
                parsedUser.ownerId || interaction.user?.id,
                parsedUser.targetUserId,
                parsedUser.lookbackDays,
                parsedUser.wantsEmbed,
                "main",
              ),
            ),
          });
          return true;
        }

        const controlsView =
          parsedUser.prefix === USER_PERIOD_SET_CUSTOM_ID_PREFIX
            ? "period"
            : "main";
        const payload = await buildUserOverviewPayload(
          interaction.guild,
          parsedUser.targetUserId,
          parsedUser.lookbackDays,
          parsedUser.wantsEmbed,
          controlsView,
        );
        payload.components = buildUserComponents(
          parsedUser.ownerId || interaction.user?.id,
          parsedUser.targetUserId,
          parsedUser.lookbackDays,
          parsedUser.wantsEmbed,
          controlsView,
        );
        await interaction.message.edit({
          ...payload,
          components: normalizeComponentsForDiscord(payload?.components),
          content: payload.content || null,
        });
      } catch (error) {
        global.logger?.error?.("[USER BUTTON] Failed:", error);
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
          parsedTopChannel.ownerId || interaction.user?.id,
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
          parsedTopChannel.ownerId || interaction.user?.id,
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
          parsedTopChannel.ownerId || interaction.user?.id,
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
            parsedTopChannelPage.ownerId || interaction.user?.id,
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
          parsedTopChannelPage.ownerId || interaction.user?.id,
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
        parsed.ownerId || interaction.user?.id,
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