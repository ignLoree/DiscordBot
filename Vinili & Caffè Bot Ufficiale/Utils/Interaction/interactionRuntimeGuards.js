const{checkButtonPermission,checkStringSelectPermission,checkModalPermission,buildGlobalPermissionDeniedEmbed,buildGlobalNotYourControlEmbed,}=require("../Moderation/commandPermissions");

const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED="Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffè.";
const TICKET_OPEN_CONTROLS=new Set(["ticket_partnership","ticket_highstaff","ticket_supporto","ticket_open_menu",]);

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

module.exports = {
  acquireButtonSpamGuard,
  isAckError,
  isTransientDiscordError,
  runPermissionGate,
  sendPrivateInteractionResponse,
};