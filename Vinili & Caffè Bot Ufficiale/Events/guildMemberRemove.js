const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AuditLogEvent,
  PermissionsBitField,
} = require("discord.js");
const Staff = require("../Schemas/Staff/staffSchema");
const Ticket = require("../Schemas/Ticket/ticketSchema");
const {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml,
} = require("../Utils/Ticket/transcriptUtils");
const {
  InviteTrack,
  ExpUser,
  ActivityUser,
  LevelHistory,
} = require("../Schemas/Community/communitySchemas");
const { MinigameUser } = require("../Schemas/Minigames/minigameSchema");
const IDs = require("../Utils/Config/ids");
const {
  scheduleStaffListRefresh,
} = require("../Utils/Community/staffListUtils");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  scheduleMemberCounterRefresh,
} = require("../Utils/Community/memberCounterUtils");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService");
const { consumeRecentJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

const STAFF_TRACKED_ROLE_IDS = new Set([
  IDs.roles.PartnerManager,
  IDs.roles.Staff,
  IDs.roles.Helper,
  IDs.roles.Mod,
  IDs.roles.Coordinator,
  IDs.roles.Supervisor,
  IDs.roles.Admin,
  IDs.roles.Manager,
  IDs.roles.CoFounder,
  IDs.roles.Founder,
]);

const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const ARROW = "<:VC_right_arrow:1473441155055096081>";
const JOIN_GATE_KICK_REASON_PATTERNS = [
  "account is too young to be allowed",
  "account too young to be allowed",
  "unverified bot addition",
  "bot added by unauthorized member",
  "advertising invite link in username",
  "username matches blocked pattern",
  "post-join filter",
];

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function sendLeaveLog(member) {
  const channel = await resolveGuildChannel(
    member.guild,
    JOIN_LEAVE_LOG_CHANNEL_ID,
  );
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("Member Left")
    .setDescription(
      [
        `${member.user} ${member.user.tag}.`,
        "",
      ].join("\n"),
    )
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }));

  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger.error("[guildMemberRemove] Failed to send leave log:", err);
  });
}

async function markInviteInactive(member) {
  await InviteTrack.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id, active: true },
    { $set: { active: false, leftAt: new Date() } },
  ).catch(() => { });
}

async function closeOpenTicketsForMember(member) {
  const guild = member.guild;
  const openTickets = await Ticket.find({
    userId: member.id,
    open: true,
  }).catch(() => []);
  if (!openTickets.length) return;

  const ticketLogChannelId = IDs.channels.ticketLogs;
  const logChannel = ticketLogChannelId
    ? guild.channels.cache.get(ticketLogChannelId) ||
      (await guild.channels.fetch(ticketLogChannelId).catch(() => null))
    : null;

  for (const ticket of openTickets) {
    const channel =
      guild.channels.cache.get(ticket.channelId) ||
      (await guild.channels.fetch(ticket.channelId).catch(() => null));

    if (!channel) {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $set: {
            open: false,
            closeReason: "Utente uscito dal server",
            closedAt: new Date(),
            closedBy: member.client.user?.id || null,
          },
        },
      ).catch(() => { });
      continue;
    }

    const transcriptTXT = await createTranscript(channel).catch(() => "");
    const transcriptHTML = await createTranscriptHtml(channel).catch(() => "");
    const transcriptHtmlPath = transcriptHTML
      ? await saveTranscriptHtml(channel, transcriptHTML).catch(() => null)
      : null;
    ticket.open = false;
    ticket.transcript = transcriptTXT;
    ticket.transcriptHtmlPath = transcriptHtmlPath || null;
    ticket.closeReason = "Utente uscito dal server";
    ticket.closedAt = new Date();
    ticket.closedBy = member.client.user?.id || null;
    await ticket.save().catch(() => { });

    if (logChannel?.isTextBased?.()) {
      const openedAt = ticket.createdAt
        ? `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`
        : "Sconosciuto";
      const closedAt = ticket.closedAt
        ? `<t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:F>`
        : `<t:${Math.floor(Date.now() / 1000)}:F>`;
      const reasonText = "Utente uscito dal server";

      const closeEmbed = new EmbedBuilder()
        .setAuthor({
          name: guild?.name || "Ticket System",
          iconURL: guild?.iconURL?.({ size: 128 }) || undefined,
        })
        .setTitle("Ticket Closed")
        .setColor("#6f4e37")
        .addFields(
          {
            name: "🆔 Ticket ID",
            value: String(ticket.ticketNumber || "N/A"),
            inline: true,
          },
          {
            name: "✅ Opened By",
            value: ticket.userId ? `<@${ticket.userId}>` : "Unknown",
            inline: true,
          },
          {
            name: "🛑 Closed By",
            value: member.client.user?.id
              ? `<@${member.client.user.id}>`
              : "Unknown",
            inline: true,
          },
          { name: "🕒 Open Time", value: openedAt, inline: true },
          {
            name: "🙋 Claimed By",
            value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Not claimed",
            inline: true,
          },
          { name: "⏹️ Close Time", value: closedAt, inline: true },
          { name: "ℹ️ Reason", value: reasonText, inline: false },
        );

      const reordered = [
        closeEmbed.data.fields?.[0],
        closeEmbed.data.fields?.[1],
        closeEmbed.data.fields?.[2],
        closeEmbed.data.fields?.[3],
        closeEmbed.data.fields?.[5],
        closeEmbed.data.fields?.[4],
        closeEmbed.data.fields?.[6],
      ].filter(Boolean);
      closeEmbed.setFields(reordered);

      const htmlAttachment = transcriptHtmlPath
        ? [
            {
              attachment: transcriptHtmlPath,
              name: `transcript_ticket_${ticket.ticketNumber || ticket._id}.html`,
            },
          ]
        : [];

      let logSentMessage = null;
      await logChannel
        .send({ embeds: [closeEmbed], files: htmlAttachment })
        .then((msg) => {
          logSentMessage = msg;
          return msg;
        })
        .catch(() => { });

      if (logSentMessage && transcriptHtmlPath) {
        const attachment = logSentMessage.attachments?.find((att) => {
          const name = String(att?.name || "").toLowerCase();
          const url = String(att?.url || "").toLowerCase();
          return name.endsWith(".html") || url.includes(".html");
        });
        if (attachment?.url) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setURL(attachment.url)
              .setLabel("View Transcript")
              .setEmoji("📁"),
          );
          await logSentMessage.edit({ components: [row] }).catch(() => {});
        }
      }

      if (logSentMessage?.id && logChannel?.id) {
        await Ticket.updateOne(
          { _id: ticket._id },
          {
            $set: {
              closeLogChannelId: logChannel.id,
              closeLogMessageId: logSentMessage.id,
            },
          },
        ).catch(() => {});
      }
    }

    setTimeout(() => channel.delete().catch(() => { }), 1000);
  }
}

function getHighestTrackedRole(member) {
  return member.roles.cache
    .filter((role) => STAFF_TRACKED_ROLE_IDS.has(role.id))
    .sort((a, b) => b.position - a.position)
    .first();
}

async function handleTrackedStaffLeave(member) {
  const hadTrackedStaffRole = member.roles?.cache
    ? [...STAFF_TRACKED_ROLE_IDS].some((roleId) =>
      member.roles.cache.has(roleId),
    )
    : false;
  if (!hadTrackedStaffRole) return;

  const guild = member.guild;
  const resignChannel = guild.channels.cache.get(IDs.channels.pexDepex);
  if (resignChannel) {
    const highestTrackedRole = getHighestTrackedRole(member);
    const roleLabel = highestTrackedRole?.name || "Staff/PM";
    const userRole = guild.roles.cache.get(IDs.roles.Member);
    const userRoleLabel = userRole?.name || "? User";
    const content = `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}
<:member_role_icon:1330530086792728618> \`${roleLabel}\` <a:vegarightarrow:1443673039156936837> \`${userRoleLabel}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
    await resignChannel.send({ content }).catch(() => { });
  }

  await Staff.deleteOne({
    guildId: guild.id,
    userId: member.id,
  }).catch(() => { });
}

function collectManagerActions(partnerships, managerId) {
  const all = [];
  for (const doc of partnerships) {
    const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
    for (const action of actions) {
      if (action?.managerId === managerId) {
        const dateMs = action?.date ? new Date(action.date).getTime() : 0;
        all.push({ doc, action, dateMs });
      }
    }
  }
  all.sort((a, b) => b.dateMs - a.dateMs);
  return all;
}

async function logManagerLeave(mainGuild, member, partnerships) {
  const partnerLogChannel =
    mainGuild.channels.cache.get(IDs.channels.partnerLogs) ||
    (await mainGuild.channels
      .fetch(IDs.channels.partnerLogs)
      .catch(() => null));
  if (!partnerLogChannel) return;

  const allWithThisManager = collectManagerActions(partnerships, member.id);
  const mostRecent = allWithThisManager[0];
  if (!mostRecent) return;

  const { action: lastPartner, doc: ownerDoc } = mostRecent;
  const partnerName = lastPartner?.partner || "Partner sconosciuta";
  const inviteLink = lastPartner?.invite || "Link non disponibile";
  const lastPartnerDate = lastPartner?.date ? new Date(lastPartner.date) : null;
  const hasValidDate =
    lastPartnerDate && !Number.isNaN(lastPartnerDate.getTime());
  const lastPartnerTimestamp = hasValidDate
    ? Math.floor(lastPartnerDate.getTime() / 1000)
    : null;
  const lastPartnerWhenText = lastPartnerTimestamp
    ? `<t:${lastPartnerTimestamp}:F> (<t:${lastPartnerTimestamp}:R>)`
    : "Non disponibile";

  const totalCount = allWithThisManager.length;
  const extraLine =
    totalCount > 1
      ? `\n**Partnership totali con questo manager:** ${totalCount} (mostrata la più recente)`
      : "";

  await partnerLogChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `**<:vegax:1443934876440068179> Manager uscito dal server**\n` +
          `**Utente:** ${member.user}\n` +
          `**PM:** <@${ownerDoc.userId}>\n` +
          `**Partner:** ${partnerName}\n` +
          `**Invito:** ${inviteLink}\n` +
          `**Ultima partner:** ${lastPartnerWhenText}${extraLine}`,
        ),
    ],
  });
}

async function sendRejoinDm(member) {
  const dmChannel = await member.user.createDM().catch(() => null);
  if (!dmChannel) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Rientra nel server")
      .setStyle(ButtonStyle.Link)
      .setURL(IDs.links.invite),
  );

  await dmChannel
    .send({
      content:
        "<:vegax:1443934876440068179> Sei uscito dal server! Rientra entro 5 minuti per non perdere la tua partnership.",
      components: [row],
    })
    .catch((error) => {
      if (error?.code !== 50007) {
        global.logger.error(error);
      }
    });
}

function schedulePartnershipRollback(member, partnerships) {
  const guild = member.guild;
  setTimeout(
    async () => {
      const stillInGuild = await guild.members
        .fetch(member.id)
        .catch(() => null);
      if (stillInGuild) return;

      for (const doc of partnerships) {
        const actions = Array.isArray(doc.partnerActions)
          ? doc.partnerActions
          : [];
        const toRollback = actions.filter(
          (action) => action?.managerId === member.id,
        );

        for (const action of toRollback) {
          const channelId =
            action?.partnershipChannelId || IDs.channels.partnerships;
          const channel =
            guild.channels.cache.get(channelId) ||
            (await guild.channels.fetch(channelId).catch(() => null));
          if (!channel?.isTextBased?.()) continue;

          const messageIds = Array.isArray(action?.partnerMessageIds)
            ? action.partnerMessageIds
            : [];
          for (const messageId of messageIds) {
            if (!messageId) continue;
            const msg = await channel.messages
              .fetch(messageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => { });
          }
        }

        if (toRollback.length > 0) {
          doc.partnerActions = actions.filter(
            (action) => action?.managerId !== member.id,
          );
        }
        doc.managerId = null;
        await doc.save().catch(() => { });
      }
    },
    5 * 60 * 1000,
  );
}

async function handlePartnershipOnLeave(member, client) {
  const mainGuildId = IDs.guilds.main;
  const partnerships = await Staff.find({
    guildId: mainGuildId,
    $or: [{ managerId: member.id }, { "partnerActions.managerId": member.id }],
  }).catch(() => []);

  if (!partnerships.length) return;

  try {
    const mainGuild =
      client.guilds.cache.get(mainGuildId) ||
      (await client.guilds.fetch(mainGuildId).catch(() => null));
    if (!mainGuild) return;

    await logManagerLeave(mainGuild, member, partnerships);
    await sendRejoinDm(member);
    schedulePartnershipRollback(member, partnerships);
  } catch (err) {
    global.logger.error(err);
  }
}

async function sendMemberKickLog(member) {
  const guild = member?.guild;
  const targetId = String(member?.user?.id || "");
  if (!guild || !targetId) return;
  const recentJoinGateKick = consumeRecentJoinGateKick(guild.id, targetId);
  if (recentJoinGateKick) return;

  if (
    !guild.members.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return;
  }

  let entry = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: AUDIT_FETCH_LIMIT,
      })
      .catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      entry =
        logs.entries.find((item) => {
          const created = Number(item?.createdTimestamp || 0);
          return (
            created > 0 &&
            now - created <= AUDIT_LOOKBACK_MS &&
            String(item?.target?.id || "") === targetId
          );
        }) || null;
    }
    if (entry) break;
    if (attempt < 2) await sleep(700);
  }
  if (!entry) return;
  const executorId = String(entry?.executor?.id || "");
  const botUserId = String(guild?.members?.me?.id || guild?.client?.user?.id || "");
  const reasonText = String(entry?.reason || "").trim().toLowerCase();
  const isJoinGateKickByBot =
    botUserId &&
    executorId &&
    executorId === botUserId &&
    JOIN_GATE_KICK_REASON_PATTERNS.some((value) => reasonText.includes(value));
  if (isJoinGateKickByBot) return;

  const logChannel =
    guild.channels.cache.get(IDs.channels.modLogs) ||
    (await guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (!logChannel?.isTextBased?.()) return;

  const responsible = formatActor(entry.executor);
  const nowTs = Math.floor(Date.now() / 1000);
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("Member Kick")
    .setDescription(
      [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${member.user} \`${member.user.id}\``,
        `${ARROW} <t:${nowTs}:F>`,
        entry.reason ? `${ARROW} **Reason:** ${entry.reason}` : null,
        ...buildAuditExtraLines(entry, ["reason"]),
      ]
        .filter(Boolean)
        .join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => { });
  await antiNukeHandleKickBanAction({
    guild,
    executorId,
    action: "kick",
    targetId,
  });
}
async function cleanupUserData(guildId, userId) {
  await Promise.allSettled([
    ExpUser.deleteOne({ guildId, userId }),
    ActivityUser.deleteOne({ guildId, userId }),
    LevelHistory.deleteMany({ guildId, userId }),
    MinigameUser.deleteOne({ guildId, userId }),
  ]);
}

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    try {
      if (!member?.guild || !member?.user) return;
      if (member?.user?.bot && member?.guild?.id) {
        if (client) queueIdsCatalogSync(client, member.guild.id, "botLeave");
      }
      if (member?.guild?.id === IDs.guilds.main) {
        if (client) scheduleStaffListRefresh(client, member.guild.id);
      }

      await sendLeaveLog(member);
      await sendMemberKickLog(member);
      await markInviteInactive(member);

      const guild = member.guild;
      scheduleMemberCounterRefresh(guild, { delayMs: 300, secondPassMs: 2200 });

      await closeOpenTicketsForMember(member);
      await handleTrackedStaffLeave(member);
      await handlePartnershipOnLeave(member, client);
      await cleanupUserData(guild.id, member.id);
    } catch (err) {
      global.logger?.error?.("[guildMemberRemove] failed:", err);
    }
  },
};



