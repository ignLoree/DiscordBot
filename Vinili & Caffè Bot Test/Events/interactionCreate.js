const { InteractionType, EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { buildErrorLogEmbed } = require("../Utils/Logging/errorLogEmbed");
const {
  checkSlashPermission,
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  getSlashRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalNotYourControlEmbed,
} = require("../Utils/Moderation/commandPermissions");

const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED =
  "Questo bot è utilizzabile solo sul server test e sui server sponsor configurati.";
const INTERACTION_DEDUPE_TTL_MS = 30 * 1000;

const getCommandKey = (name, type) => `${name}:${type || 1}`;

function markInteractionSeen(client, interactionId) {
  if (!interactionId) return false;
  if (!client._interactionSeenAt) client._interactionSeenAt = new Map();
  const seenAtMap = client._interactionSeenAt;
  const now = Date.now();
  const lastSeen = seenAtMap.get(interactionId) || 0;
  if (lastSeen && now - lastSeen < INTERACTION_DEDUPE_TTL_MS) return true;

  seenAtMap.set(interactionId, now);
  for (const [id, ts] of seenAtMap.entries()) {
    if (now - ts > INTERACTION_DEDUPE_TTL_MS) seenAtMap.delete(id);
  }
  return false;
}

function getButtonSpamState(client) {
  if (!client._buttonSpamState) {
    client._buttonSpamState = {
      cooldownByUser: new Map(),
      inFlightByAction: new Map(),
    };
  }
  return client._buttonSpamState;
}

function pruneExpiredMap(map, nowTs) {
  if (!map || map.size === 0) return;
  for (const [key, expiresAt] of map.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= nowTs) {
      map.delete(key);
    }
  }
}

function acquireButtonSpamGuard(interaction, client) {
  const isButton = Boolean(interaction?.isButton?.());
  const isSelect = Boolean(interaction?.isStringSelectMenu?.());
  if (!isButton && !isSelect) {
    return {
      blocked: false,
      release: () => {},
    };
  }

  const state = getButtonSpamState(client);
  const nowTs = Date.now();
  pruneExpiredMap(state.cooldownByUser, nowTs);
  pruneExpiredMap(state.inFlightByAction, nowTs);

  const guildId = String(interaction.guildId || "dm");
  const userId = String(interaction.user?.id || "unknown");
  const messageId = String(interaction.message?.id || "no-message");
  const customId = String(interaction.customId || "no-custom-id");

  const userKey = `${guildId}:${userId}`;
  const actionKey = `${guildId}:${userId}:${messageId}:${customId}`;

  const userCooldownUntil = Number(state.cooldownByUser.get(userKey) || 0);
  const inFlightUntil = Number(state.inFlightByAction.get(actionKey) || 0);

  if (userCooldownUntil > nowTs || inFlightUntil > nowTs) {
    return {
      blocked: true,
      release: () => {},
    };
  }

  state.cooldownByUser.set(userKey, nowTs + BUTTON_SPAM_COOLDOWN_MS);
  state.inFlightByAction.set(actionKey, nowTs + BUTTON_INFLIGHT_TTL_MS);

  return {
    blocked: false,
    release: () => {
      state.inFlightByAction.delete(actionKey);
    },
  };
}

function buildDeniedEmbed(gate, controlLabel) {
  if (gate.reason === "not_owner") return buildGlobalNotYourControlEmbed();
  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, MONO_GUILD_DENIED);
  }
  return buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], controlLabel);
}

async function sendPrivateInteractionResponse(interaction, payload) {
  if (!interaction?.isRepliable?.()) return;
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply(payload).catch(() => {});
    return;
  }
  await interaction.followUp(payload).catch(() => {});
}

async function runPermissionGate(interaction) {
  if (interaction.isButton?.()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "bottone")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isStringSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const gate = await checkModalPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "modulo")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  return true;
}

async function handleAutocomplete(interaction, client) {
  const command = client.commands.get(
    getCommandKey(interaction.commandName, interaction.commandType),
  );
  if (!command?.autocomplete) return;
  await command.autocomplete(interaction, client);
}

async function handleSlashCommand(interaction, client) {
  const command = client.commands.get(
    getCommandKey(interaction.commandName, interaction.commandType),
  );
  if (!command) return false;

  const allowed = await checkSlashPermission(interaction);
  if (!allowed) {
    const requiredRoles = getSlashRequiredRoles(interaction);
    await interaction
      .reply({
        embeds: [buildGlobalPermissionDeniedEmbed(requiredRoles || [], "comando")],
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  await Promise.resolve(command.execute(interaction, client));
  return true;
}

async function logInteractionError(interaction, client, err) {
  try {
    const errorChannelId =
      IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = errorChannelId
      ? client.channels.cache.get(errorChannelId) ||
        (await client.channels.fetch(errorChannelId).catch(() => null))
      : null;

    if (errorChannel?.isTextBased?.()) {
      const contextValue =
        interaction?.commandName || interaction?.customId || "unknown";
      const embed = buildErrorLogEmbed({
        contextLabel: "Contesto",
        contextValue,
        userTag: interaction?.user?.tag || "unknown",
        error: err,
      });
      await errorChannel.send({ embeds: [embed] }).catch(() => {});
    }

    await sendPrivateInteractionResponse(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1472992044140990526> Errore durante l'esecuzione dell'interazione.",
          ),
      ],
      flags: PRIVATE_FLAG,
    });
  } catch (nestedErr) {
    global.logger.error("[Bot Test] interactionCreate error-log", nestedErr);
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (!interaction || interaction.replied || interaction.deferred) return;
    if (markInteractionSeen(client, interaction.id)) return;

    let releaseButtonGuard = null;

    try {
      const buttonGuard = acquireButtonSpamGuard(interaction, client);
      releaseButtonGuard = buttonGuard.release;
      if (buttonGuard.blocked) {
        if (
          !interaction.replied &&
          !interaction.deferred &&
          (interaction.isButton?.() || interaction.isStringSelectMenu?.())
        ) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }

      const { handleVerifyInteraction } = require("./interaction/verifyHandlers");
      const { handleTicketInteraction } = require("./interaction/ticketHandlers");

      if (await handleVerifyInteraction(interaction)) return;

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        await handleAutocomplete(interaction, client);
        return;
      }

      if (interaction.isMessageContextMenuCommand?.()) {
        if (await handleSlashCommand(interaction, client)) return;
      }

      if (interaction.isChatInputCommand?.()) {
        if (await handleSlashCommand(interaction, client)) return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      if (await handleTicketInteraction(interaction)) return;
    } catch (err) {
      global.logger.error("[Bot Test] interactionCreate", err);
      await logInteractionError(interaction, client, err);
    } finally {
      if (typeof releaseButtonGuard === "function") {
        releaseButtonGuard();
      }
    }
  },
};
