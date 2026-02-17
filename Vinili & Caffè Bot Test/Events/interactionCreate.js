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
const MONO_GUILD_DENIED =
  "Questo bot e utilizzabile solo sul server test e sui server sponsor configurati.";
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

    try {
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
    }
  },
};
