const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  buildMeOverviewPayload,
  normalizeLookbackDays,
} = require("./me");

const USER_REFRESH_CUSTOM_ID_PREFIX = "stats_user_refresh";
const USER_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_user_period_open";
const USER_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_user_period_set";
const USER_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_user_period_back";

function parseWindowDays(rawValue) {
  const parsed = Number(
    String(rawValue || "14")
      .toLowerCase()
      .replace(/d$/i, ""),
  );
  if ([1, 7, 14, 21, 30].includes(parsed)) return parsed;
  return 14;
}

function extractUserId(rawValue) {
  const raw = String(rawValue || "").trim();
  const mentionMatch = raw.match(/^<@!?(\d{16,20})>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{16,20}$/.test(raw)) return raw;
  return null;
}

function parseUserActivityArgs(args = []) {
  const tokens = Array.isArray(args)
    ? args.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const targetId = extractUserId(tokens[0] || "");
  const wantsEmbed = tokens.some((t, idx) => idx > 0 && t.toLowerCase() === "embed");
  const dayToken = tokens.find((t, idx) => idx > 0 && /^\d+d?$/i.test(t));
  return {
    targetId,
    lookbackDays: parseWindowDays(dayToken || "14"),
    wantsEmbed,
  };
}

function buildMainControlsRow(ownerId, targetId, lookbackDays, wantsEmbed) {
  const mode = wantsEmbed ? "embed" : "image";
  const safeOwner = String(ownerId || "0");
  const safeTarget = String(targetId || "0");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${USER_REFRESH_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(
        `${USER_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildPeriodControlsRows(ownerId, targetId, lookbackDays, wantsEmbed) {
  const mode = wantsEmbed ? "embed" : "image";
  const current = normalizeLookbackDays(lookbackDays);
  const safeOwner = String(ownerId || "0");
  const safeTarget = String(targetId || "0");
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${USER_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:1:${mode}`)
      .setLabel("1d")
      .setStyle(current === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:7:${mode}`)
      .setLabel("7d")
      .setStyle(current === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:14:${mode}`)
      .setLabel("14d")
      .setStyle(current === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:21:${mode}`)
      .setLabel("21d")
      .setStyle(current === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:30:${mode}`)
      .setLabel("30d")
      .setStyle(current === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  return [topRow, bottomRow];
}

function buildUserComponents(
  ownerId,
  targetId,
  lookbackDays,
  wantsEmbed,
  controlsView = "main",
) {
  if (controlsView === "period") {
    return buildPeriodControlsRows(ownerId, targetId, lookbackDays, wantsEmbed);
  }
  return [buildMainControlsRow(ownerId, targetId, lookbackDays, wantsEmbed)];
}

async function resolveTarget(guild, targetId) {
  const safeId = String(targetId || "").trim();
  if (!safeId) return { user: null, member: null };
  const member =
    guild.members?.cache?.get(safeId) ||
    (await guild.members?.fetch(safeId).catch(() => null));
  const user =
    member?.user ||
    guild.client?.users?.cache?.get(safeId) ||
    (await guild.client?.users?.fetch(safeId).catch(() => null));
  return { user: user || null, member: member || null };
}

async function buildUserOverviewPayload(
  guild,
  targetId,
  lookbackDays = 14,
  wantsEmbed = false,
  controlsView = "main",
) {
  const { user, member } = await resolveTarget(guild, targetId);
  if (!user) {
    return {
      content:
        "<:vegax:1443934876440068179> Utente non trovato. Inserisci un ID utente valido.",
      components: [],
    };
  }
  return buildMeOverviewPayload(
    guild,
    user,
    member,
    lookbackDays,
    wantsEmbed,
    controlsView,
  );
}

module.exports = {
  name: "user",
  allowEmptyArgs: false,
  description:
    "Mostra le statistiche attività di un utente tramite ID (1d/7d/14d/21d/30d).",
  usage: "+user <userId> [1d|7d|14d|21d|30d] [embed]",
  examples: ["+user 123456789012345678", "+user 123456789012345678 30d embed"],
  USER_REFRESH_CUSTOM_ID_PREFIX,
  USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  USER_PERIOD_SET_CUSTOM_ID_PREFIX,
  USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildUserOverviewPayload,
  buildUserComponents,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { targetId, lookbackDays, wantsEmbed } = parseUserActivityArgs(args);
    if (!targetId) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Usa: `+user <userId> [1d|7d|14d|21d|30d] [embed]`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const payload = await buildUserOverviewPayload(
      message.guild,
      targetId,
      lookbackDays,
      wantsEmbed,
      "main",
    );
    if (Array.isArray(payload.components) && payload.components.length) {
      payload.components = buildUserComponents(
        message.author.id,
        targetId,
        lookbackDays,
        wantsEmbed,
        "main",
      );
    }

    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
