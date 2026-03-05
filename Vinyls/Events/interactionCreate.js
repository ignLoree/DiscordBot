const { InteractionType } = require("discord.js");
const{handleAutocomplete,handleSlashCommand,}=require("./interaction/commandHandlers");
const { handleButtonInteraction } = require("./interaction/buttonHandlers");
const { handlePartnerModal } = require("./interaction/partnerModal");
const { handleSuggestionVote } = require("./interaction/suggestionHandlers");
const { handleTicketInteraction } = require("./interaction/ticketHandlers");
const { handleDmBroadcastModal } = require("./interaction/dmBroadcastModal");
const { handleVerifyInteraction } = require("./interaction/verifyHandlers");
const{handleCustomRoleInteraction,}=require("./interaction/customRoleHandlers");
const { handlePauseButton } = require("./interaction/pauseHandlers");
const{handleTopPaginationModal,}=require("./interaction/topPaginationHandlers");
const{handleEmbedBuilderInteraction,}=require("./interaction/embedBuilderHandlers");
const{handleCandidatureApplicationInteraction,}=require("./interaction/candidatureApplicationHandlers");
const{handleResocontoActionInteraction,}=require("./interaction/resocontoHandlers");
const{handleMinigameButton,}=require("../Services/Minigames/minigameService");
const{acquireButtonSpamGuard,runPermissionGate,}=require("../Utils/Interaction/interactionRuntimeGuards");
const{logInteractionError,}=require("../Utils/Interaction/interactionErrorHandler");

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