const { InteractionType } = require("discord.js");
const {
  handleAutocomplete,
  handleSlashCommand,
} = require("./interaction/commandHandlers");
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
  handleEmbedBuilderInteraction,
} = require("./interaction/embedBuilderHandlers");
const IDs = require("../Utils/Config/ids");
const { buildErrorLogEmbed } = require("../Utils/Logging/errorLogEmbed");
const {
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalNotYourControlEmbed,
} = require("../Utils/Moderation/commandPermissions");

const PRIVATE_FLAG = 1 << 6;
const MONO_GUILD_DENIED =
  "Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffe.";

function isAckError(error) {
  const code = error?.code || error?.rawError?.code;
  return (
    code === 40060 ||
    code === 10062 ||
    code === "InteractionAlreadyReplied"
  );
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

async function logInteractionError(interaction, client, err) {
  try {
    const errorChannelId =
      IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = errorChannelId
      ? client.channels.cache.get(errorChannelId)
      : null;

    if (errorChannel) {
      const contextValue =
        interaction?.commandName || interaction?.customId || "unknown";
      const staffEmbed = buildErrorLogEmbed({
        contextLabel: "Contesto",
        contextValue,
        userTag: interaction?.user?.tag || "unknown",
        error: err,
      });
      await errorChannel.send({ embeds: [staffEmbed] }).catch(() => {});
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
    if (interaction.replied || interaction.deferred) return;

    try {
      if (await handleVerifyInteraction(interaction)) return;
      if (await handleDmBroadcastModal(interaction, client)) return;

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        await handleAutocomplete(interaction, client);
        return;
      }

      if (interaction.isMessageContextMenuCommand?.()) {
        await handleSlashCommand(interaction, client);
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        await handleSlashCommand(interaction, client);
        return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      if (await handleTicketInteraction(interaction)) return;
      if (await handleEmbedBuilderInteraction(interaction, client)) return;
      if (await handlePartnerModal(interaction)) return;
      if (await handleSuggestionVote(interaction)) return;
      if (await handlePauseButton(interaction)) return;
      if (await handleCustomRoleInteraction(interaction)) return;
      if (await handleButtonInteraction(interaction, client)) return;
    } catch (err) {
      await logInteractionError(interaction, client, err);
    }
  },
};
