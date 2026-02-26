const { InteractionType } = require("discord.js");
const { handleAutocomplete, handleSlashCommand, } = require("./interaction/commandHandlers");
const { handleButtonInteraction } = require("./interaction/buttonHandlers");
const { handlePartnerModal } = require("./interaction/partnerModal");
const { handleSuggestionVote } = require("./interaction/suggestionHandlers");
const { handleTicketInteraction } = require("./interaction/ticketHandlers");
const { handleDmBroadcastModal } = require("./interaction/dmBroadcastModal");
const { handleVerifyInteraction } = require("./interaction/verifyHandlers");
const {
  handleCustomRoleInteraction,
} = require("./interaction/customRoleHandlers");
const { handlePauseButton } = require("./interaction/pauseHandlers");
const {
  handleTopPaginationModal,
} = require("./interaction/topPaginationHandlers");
const {
  handleEmbedBuilderInteraction,
} = require("./interaction/embedBuilderHandlers");
const {
  handleCandidatureApplicationInteraction,
} = require("./interaction/candidatureApplicationHandlers");
const {
  handleResocontoActionInteraction,
} = require("./interaction/resocontoHandlers");
const {
  handleMinigameButton,
} = require("../Services/Minigames/minigameService");
const IDs = require("../Utils/Config/ids");
const { buildErrorLogEmbed } = require("../Utils/Logging/errorLogEmbed");
const { getCentralChannel } = require("../Utils/Logging/commandUsageLogger");
const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, buildGlobalPermissionDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Utils/Moderation/commandPermissions");

const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED =
  "Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffè.";
const TICKET_OPEN_CONTROLS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_supporto",
  "ticket_open_menu",
]);

function isAckError(error) {
  const code = error?.code || error?.rawError?.code;
  return (
    code === 40060 ||
    code === 10062 ||
    code === "InteractionAlreadyReplied"
  );
}

function getButtonSpamState(client) {
  if (!client) {
    return {
      cooldownByUser: new Map(),
      inFlightByAction: new Map(),
    };
  }
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

  if (TICKET_OPEN_CONTROLS.has(customId)) {
    return {
      blocked: false,
      release: () => {},
    };
  }

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
  if (gate.reason === "not_owner") {
    return buildGlobalNotYourControlEmbed();
  }

  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed(
      [],
      controlLabel,
      MONO_GUILD_DENIED,
    );
  }

  return buildGlobalPermissionDeniedEmbed(
    gate.requiredRoles || [],
    controlLabel,
  );
}

async function sendPrivateInteractionResponse(interaction, payload) {
  if (!interaction?.isRepliable?.()) return;

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
      return;
    }

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload);
      return;
    }

    await interaction.followUp(payload);
  } catch (error) {
    if (isAckError(error)) return;
    throw error;
  }
}

async function runPermissionGate(interaction) {
  if (interaction.isButton?.()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      if (
        gate.reason === "missing_role" &&
        TICKET_OPEN_CONTROLS.has(String(interaction.customId || ""))
      ) {
        await sendPrivateInteractionResponse(interaction, {
          embeds: [
            buildGlobalPermissionDeniedEmbed(
              [],
              "bottone",
              "<:vegax:1443934876440068179> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
            ),
          ],
          flags: PRIVATE_FLAG,
        });
        return false;
      }
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
      if (
        gate.reason === "missing_role" &&
        TICKET_OPEN_CONTROLS.has(String(interaction.customId || ""))
      ) {
        await sendPrivateInteractionResponse(interaction, {
          embeds: [
            buildGlobalPermissionDeniedEmbed(
              [],
              "menu",
              "<:vegax:1443934876440068179> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
            ),
          ],
          flags: PRIVATE_FLAG,
        });
        return false;
      }
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

async function logInteractionError(interaction, client, err) {
  try {
    const resolvedClient = client || interaction?.client || null;
    const errorChannelId =
      IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel =
      errorChannelId && resolvedClient
        ? await getCentralChannel(resolvedClient, errorChannelId)
        : null;

    if (errorChannel?.isTextBased?.()) {
      const contextValue =
        interaction?.commandName || interaction?.customId || "unknown";
      const staffEmbed = buildErrorLogEmbed({
        contextLabel: "Contesto",
        contextValue,
        userTag: interaction?.user?.tag || "unknown",
        error: err,
        serverName: interaction?.guild
          ? `${interaction.guild.name} [${interaction.guild.id}]`
          : null,
      });
      await errorChannel.send({ embeds: [staffEmbed] }).catch(() => null);
    }

    await sendPrivateInteractionResponse(interaction, {
      content:
        "<:vegax:1443934876440068179>  C'è stato un errore nell'esecuzione del comando.",
      flags: PRIVATE_FLAG,
    });
  } catch (nestedErr) {
    if (isAckError(nestedErr)) return;
    global.logger?.error?.(
      "[interactionCreate] nested error handling failed",
      nestedErr,
    );
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (!interaction) return;
    const resolvedClient = client || interaction.client;

    let releaseButtonGuard = null;

    try {
      const buttonGuard = acquireButtonSpamGuard(interaction, resolvedClient);
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

      if (await handleVerifyInteraction(interaction)) return;
      if (await handleDmBroadcastModal(interaction, resolvedClient)) return;

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        await handleAutocomplete(interaction, resolvedClient);
        return;
      }

      if (interaction.isMessageContextMenuCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      if (await handleTicketInteraction(interaction)) return;
      if (await handleCandidatureApplicationInteraction(interaction)) return;
      if (await handleTopPaginationModal(interaction)) return;
      if (await handleEmbedBuilderInteraction(interaction, resolvedClient)) return;
      if (await handlePartnerModal(interaction)) return;
      if (await handleSuggestionVote(interaction)) return;
      if (await handlePauseButton(interaction)) return;
      if (await handleCustomRoleInteraction(interaction)) return;
      if (await handleResocontoActionInteraction(interaction)) return;
      if (await handleMinigameButton(interaction, resolvedClient)) return;
      if (await handleButtonInteraction(interaction, resolvedClient)) return;
    } catch (err) {
      await logInteractionError(interaction, resolvedClient, err);
    } finally {
      if (typeof releaseButtonGuard === "function") {
        releaseButtonGuard();
      }
    }
  },
};
