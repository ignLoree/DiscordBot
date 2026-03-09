const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, buildGlobalPermissionDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Moderation/commandPermissions");
const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED = "Questo bot è utilizzabile solo nei server autorizzati.";
const TICKET_OPEN_CONTROLS = new Set(["ticket_partnership", "ticket_highstaff", "ticket_supporto", "ticket_open_menu",]);
/** Pulsanti verifica: non applicare cooldown/inFlight per evitare di bloccare il primo click o click dopo altro bottone. */
const VERIFY_CONTROLS = new Set(["verify_start", "verify_enter"]);

function isAckError(error) {
  const code = error?.code || error?.rawError?.code;
  return (
    code === 40060 ||
    code === 10062 ||
    code === "InteractionAlreadyReplied"
  );
}

function isTransientDiscordError(error) {
  const status = error?.status ?? error?.statusCode;
  return Number(status) >= 500 && Number(status) < 600;
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
  // Cooldown disabilitato: tutti i bottoni e select menu passano senza rate limit.
  return {
    blocked: false,
    release: () => { },
  };
}

function buildDeniedEmbed(gate, controlLabel) {
  if (gate.reason === "not_owner") {
    return buildGlobalNotYourControlEmbed();
  }

  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, MONO_GUILD_DENIED);
  }

  return buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], controlLabel);
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
    if (isAckError(error) || isTransientDiscordError(error)) return;
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
              "<a:VC_Alert:1448670089670037675> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
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
              "<a:VC_Alert:1448670089670037675> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
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

module.exports = { acquireButtonSpamGuard, isAckError, isTransientDiscordError, runPermissionGate, sendPrivateInteractionResponse };