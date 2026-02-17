const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { safeReply } = require("../Utils/Moderation/reply");
const { buildErrorLogEmbed } = require("../Utils/Logging/errorLogEmbed");

const MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || "1462458562507964584";
const PRIVATE_FLAG = 1 << 6;

function isSponsorGuild(guildId) {
  const sponsorGuildIds = IDs.guilds?.sponsorGuildIds || [];
  return Array.isArray(sponsorGuildIds) && sponsorGuildIds.includes(guildId);
}

function isAllowedGuildTest(guildId) {
  if (!guildId) return false;
  if (guildId === MAIN_GUILD_ID) return false;
  return guildId === TEST_GUILD_ID || isSponsorGuild(guildId);
}

function isComponentOrModal(interaction) {
  return (
    interaction.isButton?.() ||
    interaction.isStringSelectMenu?.() ||
    interaction.isModalSubmit?.()
  );
}

async function replyServerOnly(interaction) {
  if (!interaction.isRepliable?.()) return;
  await interaction
    .reply({
      content: "Questo comando va usato in un server.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
}

async function checkUiPermission(interaction) {
  if (!(interaction.isButton?.() || interaction.isStringSelectMenu?.())) {
    return { allowed: true };
  }

  const {
    checkButtonPermission,
    checkStringSelectPermission,
    buildGlobalPermissionDeniedEmbed,
  } = require("../Utils/Moderation/commandPermissions");

  const gate = interaction.isButton()
    ? await checkButtonPermission(interaction)
    : await checkStringSelectPermission(interaction);

  if (gate.allowed) return gate;

  const embed = buildGlobalPermissionDeniedEmbed(
    gate.requiredRoles || [],
    interaction.isButton() ? "bottone" : "menu",
  );
  if (interaction.isRepliable?.()) {
    await interaction
      .reply({ embeds: [embed], flags: PRIVATE_FLAG })
      .catch(() => {});
  }
  return gate;
}

async function logInteractionError(interaction, client, err) {
  try {
    const errorChannelId =
      IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = errorChannelId
      ? client.channels.cache.get(errorChannelId) ||
        (await client.channels.fetch(errorChannelId).catch(() => null))
      : null;

    if (!errorChannel?.isTextBased?.()) return;

    const contextValue =
      interaction?.commandName || interaction?.customId || "unknown";
    const embed = buildErrorLogEmbed({
      contextLabel: "Contesto",
      contextValue,
      userTag: interaction?.user?.tag || "unknown",
      error: err,
    });
    await errorChannel.send({ embeds: [embed] }).catch(() => {});
  } catch (logErr) {
    global.logger.error("[Bot Test] interactionCreate error-log", logErr);
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (!interaction || interaction.replied || interaction.deferred) return;
    if (interaction.guildId && !isAllowedGuildTest(interaction.guildId)) return;

    if (!interaction.guildId && isComponentOrModal(interaction)) {
      await replyServerOnly(interaction);
      return;
    }

    try {
      const handleVerify = require("./interaction/verifyHandlers");
      const handleTicket = require("./interaction/ticketHandlers");

      if (await handleVerify.handleVerifyInteraction(interaction)) return;

      const gate = await checkUiPermission(interaction);
      if (!gate.allowed) return;

      if (await handleTicket.handleTicketInteraction(interaction)) return;
    } catch (err) {
      global.logger.error("[Bot Test] interactionCreate", err);
      await logInteractionError(interaction, client, err);

      if (interaction?.isRepliable?.()) {
        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1472992044140990526> Errore durante l'esecuzione dell'interazione.",
              ),
          ],
          flags: PRIVATE_FLAG,
        });
      }
    }
  },
};
