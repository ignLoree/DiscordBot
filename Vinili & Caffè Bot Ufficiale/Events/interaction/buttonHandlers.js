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
  buildTopChannelPayload,
  buildTopChannelComponents,
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
  return { prefix, lookbackDays };
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
    if (!interaction?.isButton?.()) return false;

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
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildTopChannelComponents(parsedTopChannel.lookbackDays, "period"),
            ),
          });
          return true;
        }

        if (parsedTopChannel.prefix === TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX) {
          await interaction.message.edit({
            components: normalizeComponentsForDiscord(
              buildTopChannelComponents(parsedTopChannel.lookbackDays, "main"),
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
