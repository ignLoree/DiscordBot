const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const CHANNEL_WARM_TTL_MS = 5 * 60_000;
const guildChannelWarmCache = new Map();
const HANDLED_TICKET_BUTTONS = new Set(["ticket_partnership","ticket_highstaff","ticket_supporto","claim_ticket","close_ticket","close_ticket_motivo","accetta","rifiuta","ticket_autoclose_accept","ticket_autoclose_reject","unclaim",]);
const HANDLED_TICKET_SELECT_MENUS = new Set(["ticket_open_menu"]);

function getCachedEntity(cache, key) {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  return null;
}

function setCachedEntity(cache, key, value, ttlMs, promise = null) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (ttlMs || 15_000),
    promise,
  });
}

async function warmGuildChannels(guild) {
  const key = String(guild?.id || "");
  if (!guild || !key) return null;
  const cached = getCachedEntity(guildChannelWarmCache, key);
  if (cached) return cached;
  const promise = guild.channels.fetch().catch(() => null);
  guildChannelWarmCache.set(key, { value: null, expiresAt: 0, promise });
  const resolved = await promise;
  setCachedEntity(guildChannelWarmCache, key, resolved, CHANNEL_WARM_TTL_MS);
  return resolved;
}

async function findOpenTicketByUser(guildId, userId) {
  return Ticket.findOne({ guildId, userId, open: true }).catch(() => null);
}

async function findTicketByChannel(channelId) {
  return Ticket.findOne({ channelId }).catch(() => null);
}

function isTicketOwnedByUser(ticketDoc, userId) {
  return String(ticketDoc?.userId || "") === String(userId || "");
}

function isTicketClaimedByUser(ticketDoc, userId) {
  return String(ticketDoc?.claimedBy || "") === String(userId || "");
}

function hasActiveTicketClaimer(ticketDoc) {
  return String(ticketDoc?.claimedBy || "").trim() !== "";
}

function canUserHandleCloseRequest(ticketDoc, userId, highStaff) {
  return (
    isTicketOwnedByUser(ticketDoc, userId) ||
    isTicketClaimedByUser(ticketDoc, userId) ||
    highStaff
  );
}

async function loadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId, missingDescription = "<:VC_alert:1448670089670037675> Ticket non trovato" }) {
  const ticketDoc = await findTicketByChannel(channelId);
  if (ticketDoc) return ticketDoc;
  await safeReply(interaction, {
    embeds: [makeErrorEmbed("<:VC_alert:1448670089670037675> Errore", missingDescription)],
    flags: 1 << 6,
  });
  return null;
}

async function ensureClosableTicketOrReply({ interaction, safeReply, makeErrorEmbed, ticketDoc, highStaff, requireClaimed = true }) {
  if (!ticketDoc) return false;
  if (isTicketOwnedByUser(ticketDoc, interaction.user.id) && !highStaff) {
    await safeReply(interaction, {
      embeds: [
        makeErrorEmbed(
          "<:VC_alert:1448670089670037675> Errore",
          "<:VC_close:1478517239136256020> Non puoi chiudere da solo il ticket che hai aperto.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  if (requireClaimed && !hasActiveTicketClaimer(ticketDoc)) {
    await safeReply(interaction, {
      embeds: [
        makeErrorEmbed(
          "<:VC_alert:1448670089670037675> Errore",
          "<:VC_claim:1478517202016669887> Questo ticket non è claimato.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  if (
    requireClaimed &&
    !isTicketClaimedByUser(ticketDoc, interaction.user.id) &&
    !highStaff
  ) {
    await safeReply(interaction, {
      embeds: [
        makeErrorEmbed(
          "<:VC_alert:1448670089670037675> Errore",
          "<:VC_claim:1478517202016669887> Solo chi ha claimato il ticket può chiuderlo.",
        ),
      ],
      flags: 1 << 6,
    });
    return false;
  }
  return true;
}

function isTicketRatingButton(customId) {
  return String(customId || "").startsWith("ticket_rate:");
}

function isTicketTranscriptButton(customId) {
  return String(customId || "").startsWith("ticket_transcript:");
}

function isHandledTicketModalId(id) {
  return id === "modal_close_ticket" || id.startsWith("modal_close_ticket:");
}

function getSelectedTicketAction(interaction) {
  if (!interaction.isStringSelectMenu || !interaction.isStringSelectMenu()) {
    return null;
  }
  if (!HANDLED_TICKET_SELECT_MENUS.has(interaction.customId)) return null;
  return interaction.values?.[0] || null;
}

function isHandledTicketInteraction(interaction) {
  const isTicketButton = interaction.isButton && interaction.isButton()&&(HANDLED_TICKET_BUTTONS.has(interaction.customId)|| isTicketRatingButton(interaction.customId)|| isTicketTranscriptButton(interaction.customId));
  const isTicketSelect = interaction.isStringSelectMenu && interaction.isStringSelectMenu()&& HANDLED_TICKET_SELECT_MENUS.has(interaction.customId);
  const isTicketModal = interaction.isModalSubmit && interaction.isModalSubmit()&& isHandledTicketModalId(String(interaction.customId || ""));
  return { isTicketButton, isTicketSelect, isTicketModal };
}

function getSponsorGuildIds() {
  const fromConfig = Array.isArray(IDs.guilds?.sponsorGuildIds)
    ? IDs.guilds.sponsorGuildIds
    : [];
  if (fromConfig.length) {
    return fromConfig.map((id) => String(id)).filter(Boolean);
  }
  return [
    IDs.guilds.luna,
    IDs.guilds.cash,
    IDs.guilds.porn,
    IDs.guilds[69],
    IDs.guilds.weed,
    IDs.guilds.figa,
  ]
    .filter(Boolean)
    .map((id) => String(id));
}

function isSponsorGuild(guildId) {
  if (!guildId) return false;
  const gid = String(guildId);
  return getSponsorGuildIds().some((id) => String(id) === gid);
}

module.exports = { canUserHandleCloseRequest, ensureClosableTicketOrReply, findOpenTicketByUser, findTicketByChannel, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getSelectedTicketAction, hasActiveTicketClaimer, isHandledTicketInteraction, isSponsorGuild, isTicketClaimedByUser, isTicketOwnedByUser, isTicketRatingButton, isTicketTranscriptButton, loadTicketForChannelOrReply, warmGuildChannels };