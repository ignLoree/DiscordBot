const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildMeOverviewPayload, normalizeLookbackDays } = require("./me");

const name = "user";
const label = "Statistiche Utente";
const description = "Controlli periodo e vista statistiche di un utente (+user).";
const order = 6;

const USER_REFRESH_CUSTOM_ID_PREFIX = "stats_user_refresh";
const USER_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_user_period_open";
const USER_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_user_period_set";
const USER_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_user_period_back";

function extractUserId(rawValue) {
  const raw = String(rawValue || "").trim();
  const mentionMatch = raw.match(/^<@!?(\d{16,20})>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{16,20}$/.test(raw)) return raw;
  return null;
}

function parseUserActivityArgs(args = []) {
  const tokens = Array.isArray(args) ? args.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const targetId = extractUserId(tokens[0] || "");
  const dayToken = tokens.find((t, idx) => idx > 0 && /^\d+d?$/i.test(t));
  return {
    targetId,
    lookbackDays: normalizeLookbackDays(dayToken || "14"),
  };
}

const IMAGE_MODE = "image";

function buildMainControlsRow(ownerId, targetId, lookbackDays) {
  const safeOwner = String(ownerId || "0");
  const safeTarget = String(targetId || "0");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${USER_REFRESH_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildPeriodControlsRows(ownerId, targetId, lookbackDays) {
  const current = normalizeLookbackDays(lookbackDays);
  const safeOwner = String(ownerId || "0");
  const safeTarget = String(targetId || "0");
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:1:${IMAGE_MODE}`)
      .setLabel("1d")
      .setStyle(current === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:7:${IMAGE_MODE}`)
      .setLabel("7d")
      .setStyle(current === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:14:${IMAGE_MODE}`)
      .setLabel("14d")
      .setStyle(current === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:21:${IMAGE_MODE}`)
      .setLabel("21d")
      .setStyle(current === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:${safeTarget}:30:${IMAGE_MODE}`)
      .setLabel("30d")
      .setStyle(current === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  return [topRow, bottomRow];
}

function buildUserComponents(ownerId, targetId, lookbackDays, controlsView = "main") {
  if (controlsView === "period") return buildPeriodControlsRows(ownerId, targetId, lookbackDays);
  return [buildMainControlsRow(ownerId, targetId, lookbackDays)];
}

async function resolveTarget(guild, targetId) {
  const safeId = String(targetId || "").trim();
  if (!safeId) return { user: null, member: null };
  const member = guild.members?.cache?.get(safeId) || (await guild.members?.fetch(safeId).catch(() => null));
  const user = member?.user || guild.client?.users?.cache?.get(safeId) || (await guild.client?.users?.fetch(safeId).catch(() => null));
  return { user: user || null, member: member || null };
}

async function buildUserOverviewPayload(guild, targetId, lookbackDays = 14, controlsView = "main") {
  const { user, member } = await resolveTarget(guild, targetId);
  if (!user) {
    return {
      content: "<:vegax:1443934876440068179> Utente non trovato. Inserisci un ID utente valido.",
      components: [],
    };
  }
  return buildMeOverviewPayload(guild, user, member, lookbackDays, controlsView);
}

function match(interaction) {
  const { parseUserCustomId } = require("../../Utils/Interaction/buttonParsers");
  return !!parseUserCustomId(interaction?.customId);
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseUserCustomId, normalizeComponentsForDiscord } = require("../../Utils/Interaction/buttonParsers");
  const parsedUser = parseUserCustomId(interaction.customId);
  if (!parsedUser) return false;
  if (await denyIfNotOwner(interaction, parsedUser.ownerId)) return true;
  try {
    await interaction.deferUpdate();
    if (!parsedUser.targetUserId) {
      await interaction.message.edit({
        content: "<:vegax:1443934876440068179> Utente non valido per il refresh delle statistiche.",
        components: [],
      });
      return true;
    }
    if (parsedUser.prefix === USER_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
      await interaction.message.edit({
        components: normalizeComponentsForDiscord(buildUserComponents(parsedUser.ownerId || interaction.user?.id, parsedUser.targetUserId, parsedUser.lookbackDays, "period")),
      });
      return true;
    }
    if (parsedUser.prefix === USER_PERIOD_BACK_CUSTOM_ID_PREFIX) {
      await interaction.message.edit({
        components: normalizeComponentsForDiscord(buildUserComponents(parsedUser.ownerId || interaction.user?.id, parsedUser.targetUserId, parsedUser.lookbackDays, "main")),
      });
      return true;
    }
    const controlsView = parsedUser.prefix === USER_PERIOD_SET_CUSTOM_ID_PREFIX ? "period" : "main";
    const payload = await buildUserOverviewPayload(interaction.guild, parsedUser.targetUserId, parsedUser.lookbackDays, controlsView);
    payload.components = buildUserComponents(parsedUser.ownerId || interaction.user?.id, parsedUser.targetUserId, parsedUser.lookbackDays, controlsView);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[USER BUTTON] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute, buildUserOverviewPayload, buildUserComponents, USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX, parseUserActivityArgs };
