const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits, } = require("discord.js");
const { safeReply: safeReplyHelper } = require("../../../shared/discord/replyRuntime");
const{applyDefaultFooterToEmbeds,}=require("../../Utils/Embeds/defaultFooter");
const { checkSlashPermission, getSlashRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, } = require("../../Utils/Moderation/commandPermissions");
const { getUserCommandCooldownSeconds, consumeUserCooldown, } = require("../../Utils/Moderation/commandCooldown");
const { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildInternalCommandErrorEmbed, } = require("../../Utils/Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../../../shared/discord/errorLogEmbed");
const { getCentralChannel } = require("../../Utils/Logging/commandUsageLogger");
const IDs = require("../../Utils/Config/ids");
const { shouldBlockModerationCommands } = require("../../Services/Moderation/antiNukeService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const SLASH_COOLDOWN_BYPASS_ROLE_ID = IDs.roles?.Staff || null;
const STAFF_BYPASS_PERMISSIONS=[PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ModerateMembers,];
const SLASH_EXECUTION_TIMEOUT_MS=Math.max(15_000,Number(process.env.SLASH_EXECUTION_TIMEOUT_MS||120_000),);
const getCommandKey = (name, type) => `${name}:${type || 1}`;

function sanitizeEditPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "flags")) return payload;
  const next = { ...payload };
  delete next.flags;
  return next;
}

function hasAnyStaffBypassPermission(permissions) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm) => permissions.has(perm));
}

async function handleAutocomplete(interaction, client) {
  const cmd=client.commands.get(getCommandKey(interaction.commandName,interaction.commandType),);
  if (!cmd?.autocomplete) return;
  try {
    await cmd.autocomplete(interaction, client);
  } catch (err) {
    global.logger.error(err);
  }
}

async function handleSlashCommand(interaction, client) {
  const command=client.commands.get(getCommandKey(interaction.commandName,interaction.commandType),);
  if (!command) return;
  const isAntiNukeRecoveryCommand=["antinuke","security"].includes(String(command?.name||"").toLowerCase(),);
  const securityLockState = await getSecurityLockState(interaction.guild);
  if (
    !isAntiNukeRecoveryCommand &&
    securityLockState.commandLockActive
  ) {
    return interaction.reply({
      content:
        `<:attentionfromvega:1443651874032062505> Server in lockdown di sicurezza: comandi temporaneamente bloccati.${securityLockState.sources.length ? ` (${securityLockState.sources.join(", ")})` : ""}`,
      flags: 1 << 6,
    });
  }
  const isModerationSlashCommand=["staff","admin"].includes(String(command?.category||"").toLowerCase(),);
  if (
    isModerationSlashCommand &&
    !isAntiNukeRecoveryCommand &&
    (await shouldBlockModerationCommands(
      interaction.guild,
      String(interaction.user?.id || ""),
    ))
  ) {
    return interaction.reply({
      content:
        "<a:VC_Alert:1448670089670037675> Comandi di moderazione temporaneamente bloccati.",
      flags: 1 << 6,
    });
  }
  const expectsModal = command?.expectsModal === true;
  const isAdminCommand=String(command?.category||"").toLowerCase()==="admin";
  if (!client.interactionCommandLocks)
    client.interactionCommandLocks = new Set();
  const interactionLockId = `${interaction.guildId || "dm"}:${interaction.user.id}`;

  const slashPermission=await checkSlashPermission(interaction,{returnDetails:true,});
  if (!slashPermission?.allowed) {
    if (
      slashPermission?.reason === "channel" &&
      Array.isArray(slashPermission.channels)
    ) {
      const embed=buildGlobalChannelDeniedEmbed(slashPermission.channels,"comando",);
      return interaction.reply({
        embeds: [embed],
        flags: 1 << 6,
      });
    }
    const requiredRoles = getSlashRequiredRoles(interaction);
    const embed =
      interaction.commandName === "dmbroadcast"
        ? buildGlobalPermissionDeniedEmbed(
            [],
            "comando",
            "<:attentionfromvega:1443651874032062505> Solo i developer del bot possono usare questo comando.",
          )
        : buildGlobalPermissionDeniedEmbed(requiredRoles);
    return interaction.reply({
      embeds: [embed],
      flags: 1 << 6,
    });
  }
  const memberRoleCache = interaction.member?.roles?.cache;
  const memberRoleArray = interaction.member?.roles;
  const isGuildOwner=String(interaction.guild?.ownerId||"")===String(interaction.user?.id||"");
  const hasStaffPermissionBypass=hasAnyStaffBypassPermission(interaction.memberPermissions,);
  const hasStaffRoleBypass=Boolean((memberRoleCache&&typeof memberRoleCache.has==="function"&&memberRoleCache.has(SLASH_COOLDOWN_BYPASS_ROLE_ID))||(Array.isArray(memberRoleArray)&&memberRoleArray.includes(SLASH_COOLDOWN_BYPASS_ROLE_ID)),);
  const hasSlashCooldownBypass=Boolean(hasStaffRoleBypass||hasStaffPermissionBypass||isGuildOwner,);

  if (!hasSlashCooldownBypass && !expectsModal) {
    const cooldownSeconds=await getUserCommandCooldownSeconds({guildId:interaction.guildId,userId:interaction.user.id,member:interaction.member,});
    const cooldownResult=consumeUserCooldown({client,guildId:interaction.guildId,userId:interaction.user.id,cooldownSeconds,});
    if (!cooldownResult.ok) {
      const remaining=Math.max(1,Math.ceil(cooldownResult.remainingMs/1000),);
      return interaction.reply({
        embeds: [buildCooldownErrorEmbed(remaining)],
        flags: 1 << 6,
      });
    }
  }
  if (client.interactionCommandLocks.has(interactionLockId)) {
    return interaction.reply({
      embeds: [buildBusyCommandErrorEmbed()],
      flags: 1 << 6,
    });
  }
  client.interactionCommandLocks.add(interactionLockId);

  const originalReply = interaction.reply.bind(interaction);
  const originalFollowUp = interaction.followUp?.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalChannelSend=interaction.channel?.send?.bind(interaction.channel,);
  const wrappedInteraction = Object.create(interaction);
  wrappedInteraction.deferReply = (...args) => {
    if (isAdminCommand) return interaction.deferReply(...args);
    const first = args?.[0];
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      return interaction.deferReply({ flags: 1 << 6 });
    }
    if (!Object.prototype.hasOwnProperty.call(first, "flags")) {
      return interaction.deferReply({ ...first, flags: 1 << 6 });
    }
    return interaction.deferReply(...args);
  };
  wrappedInteraction.showModal = (...args) => interaction.showModal(...args);
  wrappedInteraction.deferUpdate = (...args) =>
    interaction.deferUpdate(...args);
  wrappedInteraction.update = (...args) => interaction.update(...args);
  wrappedInteraction.fetchReply = (...args) => interaction.fetchReply(...args);
  wrappedInteraction.deleteReply = (...args) =>
    interaction.deleteReply(...args);
  wrappedInteraction.reply = async (payload) => {
    payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
    if (interaction.deferred) {
      return interaction.editReply(sanitizeEditPayload(payload));
    }
    return originalReply(payload);
  };

  if (originalFollowUp) {
    wrappedInteraction.followUp = async (payload) => {
      payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
      if (interaction.deferred && !interaction.replied) {
        try {
          return await interaction.editReply(sanitizeEditPayload(payload));
        } catch (err) {
          global.logger?.warn?.("[commandHandlers] ", err?.message || err);
        }
      }
      try {
        return await originalFollowUp(payload);
      } catch (err) {
        if (err?.code === "InteractionNotReplied") {
          return originalReply(payload);
        }
        throw err;
      }
    };
  }

  wrappedInteraction.editReply = async (payload) => {
    const withFooter = applyDefaultFooterToEmbeds(payload, interaction.guild);
    return originalEditReply(sanitizeEditPayload(withFooter));
  };
  if (originalChannelSend) {
    const wrappedChannel = Object.create(interaction.channel);
    wrappedChannel.send = async (payload) =>
      originalChannelSend(
        applyDefaultFooterToEmbeds(payload, interaction.guild),
      );
    wrappedInteraction.channel = wrappedChannel;
  }

  const safeReply = async (payload) => safeReplyHelper(interaction, payload);

  let deferTimer;
  let commandFailed = false;
  let userErrorResponseSent = false;
  let executionTimeoutTimer;
  try {
    if (!expectsModal) {
      deferTimer = setTimeout(() => {
        if (!interaction.replied && !interaction.deferred) {
          const deferPayload = isAdminCommand ? {} : { flags: 1 << 6 };
          interaction.deferReply(deferPayload).catch(() => {});
        }
      }, 1500);
      if (typeof deferTimer?.unref === "function") deferTimer.unref();
    }
    await Promise.race([
      Promise.resolve(command.execute(wrappedInteraction, client)),
      new Promise((_, reject) => {
        executionTimeoutTimer = setTimeout(() => {
          reject(
            new Error(
              `Slash command "${String(command?.name || interaction.commandName || "unknown")}" timed out after ${SLASH_EXECUTION_TIMEOUT_MS}ms`,
            ),
          );
        }, SLASH_EXECUTION_TIMEOUT_MS);
        if (typeof executionTimeoutTimer?.unref === "function") {
          executionTimeoutTimer.unref();
        }
      }),
    ]);
  } catch (error) {
    commandFailed = true;
    const errorChannelId=IDs.channels.errorLogChannel||IDs.channels.serverBotLogs;
    const errorChannel=errorChannelId?await getCentralChannel(client,errorChannelId):null;
    const staffEmbed=buildErrorLogEmbed({contextLabel:"Comando",contextValue:interaction.commandName||"unknown",userTag:interaction.user?.tag||interaction.user?.id||"-",error,serverName:interaction.guild?`${interaction.guild.name}[${interaction.guild.id}]`
        : null,
    });
    const errorText=(error?.stack||error?.message||String(error))?.slice(0,1000)||"<:vegax:1443934876440068179> Errore sconosciuto";
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("error_pending").setEmoji("<:VC_InactiveStatus:1472011031709745307>").setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId("error_solved").setEmoji("<:VC_OnlineStatus:1472011187569950751>").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("error_unsolved").setEmoji("<:VC_OfflineStatus:1472011150081130751>").setStyle(ButtonStyle.Danger),);
    let msg;
    if (errorChannel) {
      try {
        msg = await errorChannel.send({
          embeds: [staffEmbed],
          components: [row],
        });
      } catch (sendErr) {
        global.logger?.error?.(
          "[commandHandlers] failed to send error embed",
          sendErr,
        );
      }
    }
    if (msg) {
      const collector=msg.createMessageComponentCollector({time:1000*60*60*24,filter:(i) => i.isButton(),});
      collector.on("collect", async (btn) => {
        try {
          if (!btn.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await btn.reply({
              content:
                "<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.",
              flags: 1 << 6,
            }).catch(() => null);
          }
          await btn.deferUpdate();
          const data = staffEmbed.toJSON ? staffEmbed.toJSON() : staffEmbed.data;
          const updatedEmbed = new EmbedBuilder(data);
          let statusText = "";
          if (btn.customId === "error_pending") {
            updatedEmbed.setColor(0xf1c40f);
            statusText = "In risoluzione";
          }
          if (btn.customId === "error_solved") {
            updatedEmbed.setColor(0x2ecc71);
            statusText = "Risolto";
          }
          if (btn.customId === "error_unsolved") {
            updatedEmbed.setColor(0xe74c3c);
            statusText = "Irrisolto";
          }
          if (statusText) updatedEmbed.setFooter({ text: `Stato: ${statusText}` });
          await msg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => null);
        } catch (collectorErr) {
          global.logger?.error?.(
            "[commandHandlers] error collector failure",
            collectorErr,
          );
        }
      });
      collector.on("end", async () => {
        try {
          row.components.forEach((b) => b.setDisabled(true));
          await msg.edit({ components: [row] }).catch(() => null);
        } catch (err) {
          global.logger?.warn?.("[commandHandlers] ", err?.message || err);
        }
      });
    }
    const userEmbed = buildInternalCommandErrorEmbed(errorText);
    await safeReply({
      embeds: [userEmbed],
      flags: 1 << 6,
    });
    userErrorResponseSent = true;
  } finally {
    if (!expectsModal && interaction.deferred && !interaction.replied) {
      if (commandFailed && !userErrorResponseSent) {
        await interaction
          .editReply({
            content:
              "<:vegax:1443934876440068179> Comando terminato con errore.",
          })
          .catch(() => {});
      } else {
        await interaction.deleteReply().catch(() => {});
      }
    }
    if (deferTimer) clearTimeout(deferTimer);
    if (executionTimeoutTimer) clearTimeout(executionTimeoutTimer);
    client.interactionCommandLocks.delete(interactionLockId);
  }
}

module.exports = { handleAutocomplete, handleSlashCommand };