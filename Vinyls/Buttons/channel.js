const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getChannelOverviewStats } = require("../Services/Community/activityService");
const { renderChannelActivityCanvas } = require("../Utils/Render/activityCanvas");
const { resolveTopUserEntries } = require("../Prefix/Stats/top");

const CHANNEL_REFRESH_CUSTOM_ID_PREFIX = "channel_refresh";
const CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX = "channel_period_open";
const CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX = "channel_period_set";
const CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX = "channel_period_back";
const ALLOWED_LOOKBACK = [1, 7, 14, 21, 30];

function normalizeLookbackDays(x) {
  if (x == null || x === "") return 14;
  const n = Number.parseInt(String(x).replace(/d$/i, "").trim(), 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || "";
  const prefixes = [
    CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
    CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  ];
  return prefixes.some((p) => id === p || id.startsWith(`${p}:`));
}

async function execute(interaction) {
  const { parseChannelCustomId, denyIfNotOwner, sendControlErrorFallback } = require("../Utils/Interaction/buttonParsers");
  const parsed = parseChannelCustomId(interaction.customId);
  if (!parsed) return false;
  const denied = await denyIfNotOwner(interaction, parsed.ownerId);
  if (denied) return true;

  const guild = interaction.guild;
  if (!guild) {
    await sendControlErrorFallback(interaction);
    return true;
  }
  const channel = guild.channels?.cache?.get(parsed.channelId) || (await guild.channels.fetch(parsed.channelId).catch(() => null));
  if (!channel) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Canale non trovato.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  let view = "main";
  let lookbackDays = parsed.lookbackDays;
  if (parsed.prefix === CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX) view = "period";
  else if (parsed.prefix === CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX) {
    view = "main";
    lookbackDays = parsed.lookbackDays;
  } else if (parsed.prefix === CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX) view = "main";

  try {
    const payload = await buildChannelOverviewPayload(guild, channel, lookbackDays, view, parsed.ownerId || interaction.user?.id);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
    } else {
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => { });
      });
    }
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/channel] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

async function buildChannelOverviewPayload(guild, channel, lookbackDays, view, ownerId) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const channelId = channel?.id;
  if (!guild?.id || !channelId) return { files: [], components: [] };

  const stats = await getChannelOverviewStats(guild.id, channelId, safeLookback);
  const [topUsersTextResolved, topUsersVoiceResolved] = await Promise.all([
    resolveTopUserEntries(guild, stats.topUsersText || []),
    resolveTopUserEntries(guild, stats.topUsersVoice || []),
  ]);

  const channelName = channel?.name ? `# ${channel.name}` : "# channel";
  const channelIconUrl = channel?.isVoiceBased?.() ? guild.iconURL({ size: 256, extension: "png" }) : null;
  const createdOn = channel?.createdAt ?? new Date(0);
  const guildName = guild?.name || "Server";

  const isVoiceChannel = Boolean(channel?.isVoiceBased?.());
  const isTextChannel = isVoiceChannel ? false : Boolean(channel?.isTextBased?.());
  const buffer = await renderChannelActivityCanvas({
    channelName,
    channelIconUrl,
    createdOn,
    lookbackDays: safeLookback,
    windows: stats.windows,
    topUsersText: topUsersTextResolved,
    topUsersVoice: topUsersVoiceResolved,
    chart: stats.chart,
    isTextChannel,
    guildName,
  });

  const components = buildChannelComponents(ownerId, channelId, safeLookback, view);
  const file = new AttachmentBuilder(buffer, { name: `channel-${channelId}-${safeLookback}d.png` });
  return { files: [file], components };
}

function buildChannelComponents(ownerId, channelId, lookbackDays, view) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const o = ownerId ? `${ownerId}:` : "";
  const base = `${CHANNEL_REFRESH_CUSTOM_ID_PREFIX}:${o}${channelId}:${safeLookback}`;
  const periodOpen = `${CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${o}${channelId}:${safeLookback}`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(base).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Refresh:1473359252276904203> "),
    new ButtonBuilder().setCustomId(periodOpen).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Clock:1473359204189474886>")
  );

  if (view === "period") {
    const periodBack = `${CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX}:${o}${channelId}:${safeLookback}`;
    const rowPeriod1 = new ActionRowBuilder().addComponents(
      ...ALLOWED_LOOKBACK.map((d) =>
        new ButtonBuilder()
          .setCustomId(`${CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:${o}${channelId}:${d}`)
          .setStyle(safeLookback === d ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setLabel(`${d}d`)
      )
    );
    const rowPeriod2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(periodBack).setStyle(ButtonStyle.Secondary).setLabel("Indietro")
    );
    return [row1, rowPeriod1, rowPeriod2];
  }
  return [row1];
}

function parseChannelActivityArgs(args) {
  const raw = Array.isArray(args) && args[0] != null ? String(args[0]).trim().replace(/d$/i, "") : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { lookbackDays: normalizeLookbackDays(lookback) };
}

async function resolveChannelAndLookback(message, args = []) {
  const guild = message.guild;
  const tokens = Array.isArray(args) ? args.map((a) => String(a ?? "").trim()).filter(Boolean) : [];
  let lookbackDays = 14;
  const lookbackToken = tokens.find((t) => /^(1|7|14|21|30)d?$/i.test(t));
  if (lookbackToken) {
    lookbackDays = normalizeLookbackDays(lookbackToken.replace(/d$/i, ""));
  }
  const channelMention = message.mentions?.channels?.first?.();
  if (channelMention) {
    return { channel: channelMention, lookbackDays };
  }
  const nonLookback = tokens.filter((t) => !/^(1|7|14|21|30)d?$/i.test(t));
  const first = nonLookback[0];
  if (!first && guild) {
    return { channel: message.channel, lookbackDays };
  }
  const idFromMention = first?.match(/^<#(\d+)>$/)?.[1];
  const channelId = idFromMention || (first && /^\d{17,20}$/.test(first) ? first : null);
  if (channelId && guild) {
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (channel) return { channel, lookbackDays };
  }
  if (first && guild) {
    const nameLower = first.toLowerCase();
    const allMatch = guild.channels.cache.filter(
      (c) => String(c.name).toLowerCase() === nameLower
    );
    const voiceFirst = [...allMatch.values()].find((c) => c?.isVoiceBased?.());
    const channel = voiceFirst || allMatch.first();
    if (channel) return { channel, lookbackDays };
  }
  return { channel: message.channel, lookbackDays };
}

module.exports = {
  name: "channel",
  order: 8,
  match,
  execute,
  CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildChannelOverviewPayload,
  buildChannelComponents,
  parseChannelActivityArgs,
  resolveChannelAndLookback,
  normalizeLookbackDays,
};