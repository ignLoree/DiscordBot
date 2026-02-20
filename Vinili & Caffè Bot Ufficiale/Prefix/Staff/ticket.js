const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { createTranscript, createTranscriptHtml, saveTranscriptHtml, } = require("../../Utils/Ticket/transcriptUtils");
const { getNextTicketId } = require("../../Utils/Ticket/ticketIdUtils");
const { TICKETS_CATEGORY_NAME } = require("../../Utils/Ticket/ticketCategoryUtils");
const IDs = require("../../Utils/Config/ids");
const LOG_CHANNEL_ID = IDs.channels.ticketLogs;
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ROLE_IDS = [STAFF_ROLE_ID, HIGHSTAFF_ROLE_ID].filter(Boolean);
const NO_REPLY_MENTIONS = { repliedUser: false };
const SPONSOR_GUILD_IDS = [
  IDs.guilds.luna,
  IDs.guilds.cash,
  IDs.guilds.porn,
  IDs.guilds[69],
  IDs.guilds.weed,
  IDs.guilds.figa,
].filter(Boolean);

function hasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function isSponsorGuild(guildId) {
  return Boolean(guildId && SPONSOR_GUILD_IDS.includes(guildId));
}

function canClaimTicket(member, ticketType) {
  if (!member) return false;
  const isSupport =
    ticketType === "supporto" && hasAnyRole(member, STAFF_ROLE_IDS);
  const isPartnership =
    ticketType === "partnership" &&
    (member.roles.cache.has(PARTNERMANAGER_ROLE_ID) ||
      member.roles.cache.has(HIGHSTAFF_ROLE_ID));
  const isHigh =
    ticketType === "high" && member.roles.cache.has(HIGHSTAFF_ROLE_ID);
  return isSupport || isPartnership || isHigh;
}

function canCloseTicket(member, ticketType) {
  if (!member) return false;
  const canCloseSupport =
    ticketType === "supporto" && hasAnyRole(member, STAFF_ROLE_IDS);
  const canClosePartnership =
    ticketType === "partnership" &&
    (member.roles.cache.has(PARTNERMANAGER_ROLE_ID) ||
      member.roles.cache.has(HIGHSTAFF_ROLE_ID));
  const canCloseHigh =
    ticketType === "high" && member.roles.cache.has(HIGHSTAFF_ROLE_ID);
  return canCloseSupport || canClosePartnership || canCloseHigh;
}

async function sendTranscriptWithBrowserLink(
  target,
  payload,
  hasHtml,
  extraRows = [],
) {
  if (!target?.send) return null;
  const sent = await target.send(payload).catch(() => null);
  if (!sent) return sent;
  const safeExtraRows = Array.isArray(extraRows)
    ? extraRows.filter(Boolean)
    : [];
  if (!hasHtml) {
    if (safeExtraRows.length > 0) {
      const baseContent =
        typeof payload?.content === "string" ? payload.content.trim() : "";
      await sent
        .edit({
          content: baseContent || undefined,
          components: safeExtraRows.slice(0, 5),
        })
        .catch(() => {});
    }
    return sent;
  }
  const attachment = sent.attachments?.find((att) => {
    const name = String(att?.name || "").toLowerCase();
    const url = String(att?.url || "").toLowerCase();
    return name.endsWith(".html") || url.includes(".html");
  });
  if (attachment?.url) {
    const baseContent =
      typeof payload?.content === "string" ? payload.content.trim() : "";
    const transcriptButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(attachment.url)
      .setLabel("View Transcript")
      .setEmoji("📁");
    const row = new ActionRowBuilder().addComponents(transcriptButton);
    await sent
      .edit({
        content: baseContent || undefined,
        components: [row, ...safeExtraRows].slice(0, 5),
      })
      .catch(() => {});
  } else if (safeExtraRows.length > 0) {
    const baseContent =
      typeof payload?.content === "string" ? payload.content.trim() : "";
    await sent
      .edit({
        content: baseContent || undefined,
        components: safeExtraRows.slice(0, 5),
      })
      .catch(() => {});
  }
  return sent;
}

function buildTicketRatingRows(ticketId) {
  const stylesByScore = {
    1: ButtonStyle.Danger,
    2: ButtonStyle.Danger,
    3: ButtonStyle.Primary,
    4: ButtonStyle.Success,
    5: ButtonStyle.Success,
  };
  const row = new ActionRowBuilder().addComponents(
    ...[1, 2, 3, 4, 5].map((score) =>
      new ButtonBuilder()
        .setCustomId(`ticket_rate:${ticketId}:${score}`)
        .setStyle(stylesByScore[score] || ButtonStyle.Secondary)
        .setLabel(String(score))
        .setEmoji("⭐"),
    ),
  );
  return [row];
}

function buildTicketClosedEmbed(data) {
  const openedAt = data?.createdAt
    ? `<t:${Math.floor(new Date(data.createdAt).getTime() / 1000)}:F>`
    : "Sconosciuto";
  const closedAt = data?.closedAt
    ? `<t:${Math.floor(new Date(data.closedAt).getTime() / 1000)}:F>`
    : `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const reasonText =
    data?.closeReason && String(data.closeReason).trim()
      ? String(data.closeReason).trim()
      : "No reason specified";

  const embed = new EmbedBuilder()
    .setAuthor({
      name: data?.guildName || "Ticket System",
      iconURL: data?.guildIconURL || undefined,
    })
    .setTitle("Ticket Closed")
    .setColor("#6f4e37")
    .addFields(
      {
        name: "🆔 Ticket ID",
        value: String(data?.ticketNumber || "N/A"),
        inline: true,
      },
      {
        name: "✅ Opened By",
        value: data?.userId ? `<@${data.userId}>` : "Unknown",
        inline: true,
      },
      {
        name: "🛑 Closed By",
        value: data?.closedBy ? `<@${data.closedBy}>` : "Unknown",
        inline: true,
      },
      { name: "🕒 Open Time", value: openedAt, inline: true },
      {
        name: "🙋 Claimed By",
        value: data?.claimedBy ? `<@${data.claimedBy}>` : "Not claimed",
        inline: true,
      },
      { name: "⏹️ Close Time", value: closedAt, inline: true },
      { name: "ℹ️ Reason", value: reasonText, inline: false },
    );

  const reordered = [
    embed.data.fields?.[0],
    embed.data.fields?.[1],
    embed.data.fields?.[2],
    embed.data.fields?.[3],
    embed.data.fields?.[5],
    embed.data.fields?.[4],
    embed.data.fields?.[6],
  ].filter(Boolean);
  embed.setFields(reordered);

  if (Number.isFinite(data?.ratingScore) && data.ratingScore >= 1) {
    embed.addFields({
      name: "⭐ Rating",
      value: `${data.ratingScore}/5${data?.ratingBy ? ` - da <@${data.ratingBy}>` : ""}`,
      inline: false,
    });
  }

  return embed;
}

function makeErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor("#6f4e37");
}

async function pinFirstTicketMessage(channel, message) {
  if (!channel || !message?.pin) return;
  await message.pin().catch(() => {});
  const recent = await channel.messages.fetch({ limit: 6 }).catch(() => null);
  if (!recent) return;
  const pinSystem = recent.find((m) => Number(m.type) === 6);
  if (pinSystem) {
    await pinSystem.delete().catch(() => {});
  }
}

async function resolveUserFromArg(message, rawArg) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  if (!rawArg) return null;

  const id =
    String(rawArg).match(/^<@!?(\d+)>$/)?.[1] ||
    (String(rawArg).match(/^\d{17,20}$/) ? String(rawArg) : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

async function fetchTicketMessage(channel, messageId) {
  if (messageId) {
    const found = await channel.messages.fetch(messageId).catch(() => null);
    if (found) return found;
  }
  const fallback = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  return fallback?.first() || null;
}

function getTicketPanelConfig(raw) {
  const key = String(raw || "").toLowerCase();
  const configs = {
    supporto: {
      type: "supporto",
      emoji: "⭐",
      name: "supporto",
      label: "Supporto",
      embed: new EmbedBuilder()
        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET SUPPORTO__**")
        .setDescription(
          `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`,
        )
        .setColor("#6f4e37"),
    },
    partnership: {
      type: "partnership",
      emoji: "🤝",
      name: "partnership",
      label: "Partnership",
      embed: new EmbedBuilder()
        .setTitle(
          "<:vsl_ticket:1329520261053022208> • **__TICKET PARTNERSHIP__**",
        )
        .setDescription(
          `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Manda la descrizione del tuo server/catena tramite il bottone qui in basso.`,
        )
        .setColor("#6f4e37"),
    },
    highstaff: {
      type: "high",
      emoji: "✨",
      name: "highstaff",
      label: "High Staff",
      embed: new EmbedBuilder()
        .setTitle(
          "<:vsl_ticket:1329520261053022208> • **__TICKET HIGH STAFF__**",
        )
        .setDescription(
          `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Verifica Selfie, Donazioni, Sponsor o HighStaff.`,
        )
        .setColor("#6f4e37"),
    },
  };
  const aliases = {
    supporto: "supporto",
    prima: "supporto",
    1: "supporto",
    first: "supporto",
    partnership: "partnership",
    partner: "partnership",
    seconda: "partnership",
    2: "partnership",
    second: "partnership",
    highstaff: "highstaff",
    high: "highstaff",
    terza: "highstaff",
    3: "highstaff",
    third: "highstaff",
  };
  const resolved = aliases[key] || key;
  return configs[resolved] || null;
}

function getTicketChannelPermissionOverwrites(guild, userId, ticketType) {
  const base = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ],
    },
  ];

  if (ticketType === "supporto") {
    base.push(
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: HIGHSTAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: PARTNERMANAGER_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  } else if (ticketType === "partnership") {
    base.push(
      {
        id: PARTNERMANAGER_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: HIGHSTAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  } else if (ticketType === "high") {
    base.push(
      {
        id: HIGHSTAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: PARTNERMANAGER_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  }

  return base.filter((entry) => Boolean(entry?.id));
}

async function ensureTicketsCategory(guild) {
  await guild.channels.fetch().catch(() => null);
  const categories = guild.channels.cache
    .filter((ch) => ch.type === 4 && String(ch.name || "").toLowerCase().includes("tickets"))
    .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

  if (categories.size > 0) {
    const exact = categories.find((c) => c.name === TICKETS_CATEGORY_NAME);
    return exact || categories.first();
  }

  const created = await guild.channels
    .create({
      name: TICKETS_CATEGORY_NAME,
      type: 4,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages],
        },
      ],
    })
    .catch(() => null);

  if (created) {
    await created.setPosition(0).catch(() => {});
  }
  return created;
}

module.exports = {
  name: "ticket",
  aliases: [
    "add",
    "remove",
    "close",
    "closerequest",
    "claim",
    "unclaim",
    "switchpanel",
    "rename",
    "reopen",
    "ticketclose",
    "ticketclaim",
    "ticketunclaim",
    "ticketswitchpanel",
    "ticketrename",
    "ticketreopen",
    "trename",
    "tadd",
    "tremove",
    "ticketadd",
    "ticketremove",
  ],
  description: "Gestione ticket.",
  subcommands: [
    "add",
    "remove",
    "closerequest",
    "close",
    "claim",
    "unclaim",
    "switchpanel",
    "rename",
    "reopen",
  ],
  subcommandAliases: {
    add: "add",
    remove: "remove",
    close: "close",
    closerequest: "closerequest",
    claim: "claim",
    unclaim: "unclaim",
    switchpanel: "switchpanel",
    rename: "rename",
    reopen: "reopen",
    ticketswitchpanel: "switchpanel",
    ticketrename: "rename",
    ticketreopen: "reopen",
    trename: "rename",
    ticketclose: "close",
    ticketclaim: "claim",
    ticketunclaim: "unclaim",
    tadd: "add",
    tremove: "remove",
    ticketadd: "add",
    ticketremove: "remove",
  },

  async execute(message, args = [], client) {
    if (!message.inGuild?.() || !message.guild || !message.member) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    if (isSponsorGuild(message.guild.id)) {
      return;
    }

    const defaultPrefix = "+";
    const rawContent = String(message.content || "").trim();
    const invokedToken = rawContent.startsWith(defaultPrefix)
      ? rawContent
          .slice(defaultPrefix.length)
          .trim()
          .split(/\s+/)[0]
          ?.toLowerCase()
      : "";
    const directAliasSub =
      invokedToken && this.subcommandAliases
        ? this.subcommandAliases[invokedToken]
        : null;

    const subcommand = String(directAliasSub || args[0] || "").toLowerCase();
    const rest = directAliasSub ? args : args.slice(1);
    const normalizedRest = Array.isArray(rest)
      ? (() => {
          if (!rest.length) return rest;
          const first = String(rest[0] || "").toLowerCase();
          if (first === subcommand) return rest.slice(1);
          return rest;
        })()
      : [];
    const parentChannel = message.channel?.parent || null;
    const inTicketCategory = Boolean(
      parentChannel &&
      String(parentChannel.name || "")
        .toLowerCase()
        .includes("tickets"),
    );
    const activeTicketInChannel = await Ticket.findOne({
      channelId: message.channel.id,
      open: true,
    }).catch(() => null);

    if (!subcommand) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Uso corretto: `+ticket <add|remove|closerequest|close|claim|unclaim|switchpanel|rename|reopen>`",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (subcommand !== "reopen" && (!inTicketCategory || !activeTicketInChannel)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> I comandi ticket possono essere usati solo dentro un canale ticket.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const isHighStaffBypass = message.member.roles.cache.has(HIGHSTAFF_ROLE_ID);
    const isTicketHighStaff = message.member.roles.cache.has(HIGHSTAFF_ROLE_ID);

    if (subcommand === "reopen") {
      if (!isTicketHighStaff) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Solo l'**High Staff** può riaprire ticket.",
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const ticketNumber = Number(normalizedRest[0]);
      if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Uso corretto: `+ticket reopen <id_ticket>` oppure `+reopen <id_ticket>`.",
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const ticketDoc = await Ticket.findOne({
        guildId: message.guild.id,
        ticketNumber,
      }).catch(() => null);

      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              `<:vegax:1443934876440068179> Ticket #${ticketNumber} non trovato.`,
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      if (ticketDoc.open && ticketDoc.channelId) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Info",
              `<:attentionfromvega:1443651874032062505> Ticket #${ticketNumber} è già aperto: <#${ticketDoc.channelId}>`,
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const existingOpen = await Ticket.findOne({
        guildId: message.guild.id,
        userId: ticketDoc.userId,
        open: true,
      }).catch(() => null);

      if (existingOpen) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              `<:vegax:1443934876440068179> L'utente ha già un ticket aperto: <#${existingOpen.channelId}>`,
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const ticketMember = await message.guild.members
        .fetch(ticketDoc.userId)
        .catch(() => null);
      if (!ticketMember) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Utente del ticket non presente nel server, impossibile riaprire.",
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const config =
        getTicketPanelConfig(ticketDoc.ticketType) ||
        getTicketPanelConfig("supporto");
      if (!config) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed("Errore", "Configurazione ticket non valida.")],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const category = await ensureTicketsCategory(message.guild);
      if (!category) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Impossibile trovare o creare la categoria ticket.",
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const usernamePart = String(ticketMember.user.username || "utente")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32);
      const channelName = `ticket-${config.name}-${usernamePart || ticketMember.id}`;

      const channel = await message.guild.channels
        .create({
          name: channelName,
          type: 0,
          parent: category.id,
          permissionOverwrites: getTicketChannelPermissionOverwrites(
            message.guild,
            ticketDoc.userId,
            config.type,
          ),
        })
        .catch(() => null);

      if (!channel) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Impossibile creare il canale ticket.",
            ),
          ],
          allowedMentions: NO_REPLY_MENTIONS,
        });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("🔒 Chiudi")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close_ticket_motivo")
          .setLabel("📝 Chiudi Con Motivo")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("✅ Claim")
          .setStyle(ButtonStyle.Success),
      );

      const mainMsg = await channel
        .send({ embeds: [config.embed], components: [row] })
        .catch(() => null);
      if (mainMsg) {
        await pinFirstTicketMessage(channel, mainMsg);
      }

      await Ticket.updateOne(
        { _id: ticketDoc._id },
        {
          $set: {
            open: true,
            channelId: channel.id,
            messageId: mainMsg?.id || null,
            descriptionPromptMessageId: null,
            transcript: "",
            transcriptHtmlPath: null,
            closeReason: null,
            closeRequestedBy: null,
            closeRequestedAt: null,
            closedBy: null,
            closedAt: null,
            claimedBy: null,
            closeLogChannelId: null,
            closeLogMessageId: null,
            ratingScore: null,
            ratingBy: null,
            ratingAt: null,
          },
        },
      ).catch(() => {});

      const tagRole =
        config.type === "partnership" ? PARTNERMANAGER_ROLE_ID : STAFF_ROLE_ID;
      const mentionMsg = await channel
        .send(`<@${ticketDoc.userId}> ${tagRole ? `<@&${tagRole}>` : ""}`)
        .catch(() => null);
      if (mentionMsg) {
        setTimeout(() => mentionMsg.delete().catch(() => {}), 150);
      }

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Ticket Riaperto")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> Ticket #${ticketNumber} riaperto in ${channel}.`,
            ),
        ],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    if (subcommand === "add") {
      const user = await resolveUserFromArg(message, normalizedRest[0]);
      if (!user) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Specifica un utente valido.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
      });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle("Aggiungi")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> ${user} è stato aggiunto a ${message.channel}`,
            )
            .setColor("#6f4e37"),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (subcommand === "remove") {
      const user = await resolveUserFromArg(message, normalizedRest[0]);
      if (!user) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Specifica un utente valido.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: false,
        SendMessages: false,
      });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle("Rimuovi")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> ${user} è stato rimosso da ${message.channel}`,
            )
            .setColor("#6f4e37"),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (subcommand === "closerequest") {
      const reason = normalizedRest.join(" ").trim();
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Questo non è un canale ticket",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const canRequestClose =
        message.author.id === ticketDoc.claimedBy || isHighStaffBypass;
      if (!canRequestClose) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Solo chi ha claimato il ticket può inviare la richiesta di chiusura.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await Ticket.updateOne(
        { channelId: message.channel.id },
        {
          $set: {
            closeReason: reason || null,
            closeRequestedBy: message.author.id,
            closeRequestedAt: new Date(),
          },
        },
      ).catch(() => {});
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("accetta")
          .setEmoji("<:vegacheckmark:1443666279058772028>")
          .setLabel("Accetta e chiudi")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("rifiuta")
          .setEmoji("<:vegax:1443934876440068179>")
          .setLabel("Rifiuta e mantieni aperto")
          .setStyle(ButtonStyle.Secondary),
      );

      await message.channel.send({
        content: `<@${ticketDoc.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle("Richiesta di chiusura")
            .setDescription(
              `${message.author} ha richiesto di chiudere questo ticket.\nMotivo:\n\`\`\`${reason || "Nessun motivo inserito"}\`\`\``,
            )
            .setColor("#6f4e37"),
        ],
        components: [closeButton],
      });
      return;
    }

    if (subcommand === "close") {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Questo non è un canale ticket",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (ticketDoc.userId === message.author.id) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!canCloseTicket(message.member, ticketDoc.ticketType)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Non puoi chiudere questo ticket.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const claimed = await Ticket.findOneAndUpdate(
        { channelId: message.channel.id, open: true },
        {
          $set: {
            open: false,
            closedAt: new Date(),
            closedBy: message.author.id,
          },
        },
        { new: true },
      );
      if (!claimed) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Orange")
              .setDescription(
                "<:attentionfromvega:1443651874032062505> Ticket già chiuso o chiusura già in corso.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const closeReason = null;
      let ticketNumber = Number(claimed.ticketNumber || 0);
      if (!ticketNumber) ticketNumber = await getNextTicketId();
      const transcriptTXT = await createTranscript(message.channel).catch(
        () => "",
      );
      const transcriptHTML = await createTranscriptHtml(message.channel).catch(
        () => "",
      );
      const transcriptHtmlPath = transcriptHTML
        ? await saveTranscriptHtml(message.channel, transcriptHTML).catch(
            () => null,
          )
        : null;
      await Ticket.updateOne(
        { channelId: message.channel.id },
        {
          $set: {
            ticketNumber,
            transcript: transcriptTXT,
            transcriptHtmlPath: transcriptHtmlPath || null,
            closeReason,
            claimedBy: claimed.claimedBy || null,
            closeRequestedBy: null,
            closeRequestedAt: null,
            closedBy: message.author.id,
          },
        },
      ).catch(() => {});

      const mainGuildId = IDs?.guilds?.main || null;
      const mainLogChannelId = IDs?.channels?.ticketLogs || LOG_CHANNEL_ID;

      const mainGuild = mainGuildId
        ? client.guilds.cache.get(mainGuildId) ||
          (await client.guilds.fetch(mainGuildId).catch(() => null))
        : null;

      const logChannel =
        mainGuild?.channels?.cache?.get(mainLogChannelId) ||
        (mainGuild
          ? await mainGuild.channels.fetch(mainLogChannelId).catch(() => null)
          : null) ||
        message.guild.channels.cache.get(LOG_CHANNEL_ID) ||
        (await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));

      const closeEmbed = buildTicketClosedEmbed({
        ...claimed.toObject(),
        ticketNumber,
        closeReason,
        closedBy: message.author.id,
        closedAt: new Date(),
        guildName: message.guild?.name || "Ticket System",
        guildIconURL: message.guild?.iconURL?.({ size: 128 }) || null,
      });
      const ratingRows = buildTicketRatingRows(String(claimed._id));
      const transcriptRows = transcriptHtmlPath
        ? [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_transcript:${claimed._id}`)
                .setLabel("View Transcript")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📁"),
            ),
          ]
        : [];
      const dmActionRows = [...ratingRows];
      const htmlAttachment = transcriptHtmlPath
        ? [
            {
              attachment: transcriptHtmlPath,
              name: `transcript_ticket_${ticketNumber || claimed._id}.html`,
            },
          ]
        : [];

      let logSentMessage = null;
      if (logChannel?.isTextBased?.()) {
        logSentMessage = await sendTranscriptWithBrowserLink(
          logChannel,
          {
            embeds: [closeEmbed],
          },
          false,
          transcriptRows,
        );
      }

      const member = await message.guild.members
        .fetch(claimed.userId)
        .catch(() => null);
      if (member) {
        try {
          await sendTranscriptWithBrowserLink(
            member,
            {
              embeds: [closeEmbed],
              files: htmlAttachment,
            },
            Boolean(transcriptHtmlPath),
            dmActionRows,
          );
        } catch (err) {
          if (err?.code !== 50007) global.logger.error("[DM ERROR]", err);
        }
      }

      if (logSentMessage?.id && logChannel?.id) {
        await Ticket.updateOne(
          { _id: claimed._id },
          {
            $set: {
              closeLogChannelId: logChannel.id,
              closeLogMessageId: logSentMessage.id,
            },
          },
        ).catch(() => {});
      }

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setDescription("🔒 Il ticket verrà chiuso...")
            .setColor("#6f4e37"),
        ],
        allowedMentions: { repliedUser: false },
      });

      setTimeout(() => {
        if (message.channel) message.channel.delete().catch(() => {});
      }, 2000);
      return;
    }

    if (subcommand === "claim") {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Questo non è un canale ticket",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!canClaimTicket(message.member, ticketDoc.ticketType)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Solo il personale autorizzato può claimare questo ticket.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (ticketDoc.claimedBy) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                `<:attentionfromvega:1443651874032062505> Questo ticket è già stato claimato da <@${ticketDoc.claimedBy}>`,
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (ticketDoc.userId === message.author.id) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      ticketDoc.claimedBy = message.author.id;
      await ticketDoc.save();
      await message.channel.permissionOverwrites.edit(message.author.id, {
        ViewChannel: true,
        SendMessages: true,
      });

      const msg = await fetchTicketMessage(
        message.channel,
        ticketDoc.messageId,
      );
      if (!msg) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Non riesco a trovare il messaggio del ticket.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const updatedEmbed = msg.embeds?.[0]
        ? EmbedBuilder.from(msg.embeds[0])
        : new EmbedBuilder().setColor("#6f4e37");
      const updatedButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("🔒Chiudi")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close_ticket_motivo")
          .setLabel("📝 Chiudi con motivo")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("unclaim")
          .setLabel("🔓 Unclaim")
          .setStyle(ButtonStyle.Secondary),
      );

      await msg.edit({ embeds: [updatedEmbed], components: [updatedButtons] });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle("Ticket Claimato")
            .setDescription(
              `Il ticket è stato preso in carico da <@${ticketDoc.claimedBy}>`,
            )
            .setColor("#6f4e37"),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (subcommand === "unclaim") {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Questo non è un canale ticket",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (!ticketDoc.claimedBy) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Questo ticket non è claimato.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const oldClaimer = ticketDoc.claimedBy;
      if (message.author.id !== oldClaimer) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      ticketDoc.claimedBy = null;
      await ticketDoc.save();
      await message.channel.permissionOverwrites
        .delete(oldClaimer)
        .catch(() => {});

      const msg = await fetchTicketMessage(
        message.channel,
        ticketDoc.messageId,
      );
      if (!msg) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle("Errore")
              .setDescription(
                "<:vegax:1443934876440068179> Non riesco a trovare il messaggio principale del ticket.",
              )
              .setColor("Red"),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const originalEmbed = msg.embeds?.[0]
        ? EmbedBuilder.from(msg.embeds[0])
        : new EmbedBuilder().setColor("#6f4e37");
      const originalButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("🔒 Chiudi")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close_ticket_motivo")
          .setLabel("📝 Chiudi Con Motivo")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("✅ Claim")
          .setStyle(ButtonStyle.Success),
      );

      await msg.edit({
        embeds: [originalEmbed],
        components: [originalButtons],
      });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle("Ticket Unclaimato")
            .setDescription(`<@${oldClaimer}> non gestisce più il ticket`)
            .setColor("#6f4e37"),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (subcommand === "switchpanel") {
      if (!message.member.roles.cache.has(HIGHSTAFF_ROLE_ID)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Solo l'**High Staff** può usare `switchpanel`.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const targetChannel = message.channel;
      const categoryToken = String(normalizedRest[0] || "").toLowerCase();
      const panelConfig = getTicketPanelConfig(categoryToken);

      if (!targetChannel || !targetChannel.isTextBased?.()) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Specifica un canale valido.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (!panelConfig) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Categoria non valida. Usa: `supporto`, `partnership`, `highstaff`.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (!message.client.ticketSwitchLocks)
        message.client.ticketSwitchLocks = new Set();
      if (!message.client.ticketSwitchCooldowns)
        message.client.ticketSwitchCooldowns = new Map();
      const switchKey = `${message.guild.id}:${targetChannel.id}`;
      const lastSwitchAt = Number(
        message.client.ticketSwitchCooldowns.get(switchKey) || 0,
      );

      if (message.client.ticketSwitchLocks.has(switchKey)) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Attendi",
              "<:attentionfromvega:1443651874032062505> C'è già uno switchpanel in esecuzione su questo ticket.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      if (Date.now() - lastSwitchAt < 2000) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Attendi",
              "<:attentionfromvega:1443651874032062505> Aspetta un attimo prima di rifare switchpanel.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      message.client.ticketSwitchLocks.add(switchKey);
      try {
        const ticketDoc = activeTicketInChannel;
        if (!ticketDoc) {
          await safeMessageReply(message, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Nel canale indicato non c'è un ticket aperto.",
              ),
            ],
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const previousTicketType = String(ticketDoc.ticketType || "");

        if (previousTicketType === panelConfig.type) {
          await safeMessageReply(message, {
            embeds: [
              makeErrorEmbed(
                "Info",
                `<:attentionfromvega:1443651874032062505> Questo ticket è già impostato su **${panelConfig.label}**.`,
              ),
            ],
            allowedMentions: { repliedUser: false },
          });
          return;
        }

        const openerMember = await message.guild.members
          .fetch(ticketDoc.userId)
          .catch(() => null);
        const openerName = openerMember?.user?.username || "utente";
        const safeOpenerName =
          String(openerName)
            .replace(/[^\w.-]/g, "")
            .slice(0, 20) || "utente";
        const newChannelName = `༄${panelConfig.emoji}︲${panelConfig.name}᲼${safeOpenerName}`;
        if (targetChannel.name !== newChannelName) {
          await targetChannel.setName(newChannelName).catch(() => {});
        }

        await targetChannel.permissionOverwrites
          .edit(message.guild.roles.everyone.id, { ViewChannel: false })
          .catch(() => {});
        await targetChannel.permissionOverwrites
          .edit(ticketDoc.userId, {
            ViewChannel: true,
            SendMessages: true,
            EmbedLinks: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            AddReactions: true,
          })
          .catch(() => {});

        const applyReadOnly = {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true,
        };
        const applyFull = {
          ViewChannel: true,
          SendMessages: true,
          EmbedLinks: true,
          AttachFiles: true,
          ReadMessageHistory: true,
          AddReactions: true,
        };
        const denyView = { ViewChannel: false };

        if (panelConfig.type === "supporto") {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites
              .edit(STAFF_ROLE_ID, applyReadOnly)
              .catch(() => {});
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => {});
          } else {
            await targetChannel.permissionOverwrites
              .edit(STAFF_ROLE_ID, applyFull)
              .catch(() => {});
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyFull)
              .catch(() => {});
          }
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, denyView)
            .catch(() => {});
        }

        if (panelConfig.type === "partnership") {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites
              .edit(PARTNERMANAGER_ROLE_ID, applyReadOnly)
              .catch(() => {});
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => {});
          } else {
            await targetChannel.permissionOverwrites
              .edit(PARTNERMANAGER_ROLE_ID, applyFull)
              .catch(() => {});
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => {});
          }
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, denyView)
            .catch(() => {});
        }

        if (panelConfig.type === "high") {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => {});
          } else {
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyFull)
              .catch(() => {});
          }
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, denyView)
            .catch(() => {});
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, denyView)
            .catch(() => {});
        }

        if (ticketDoc.claimedBy) {
          await targetChannel.permissionOverwrites
            .edit(ticketDoc.claimedBy, {
              ViewChannel: true,
              SendMessages: true,
              EmbedLinks: true,
              AttachFiles: true,
              ReadMessageHistory: true,
              AddReactions: true,
            })
            .catch(() => {});
        }

        ticketDoc.ticketType = panelConfig.type;

        if (
          previousTicketType === "partnership" &&
          panelConfig.type !== "partnership"
        ) {
          if (ticketDoc.descriptionPromptMessageId) {
            const oldPrompt = await targetChannel.messages
              .fetch(ticketDoc.descriptionPromptMessageId)
              .catch(() => null);
            if (oldPrompt) await oldPrompt.delete().catch(() => {});
          }
          ticketDoc.descriptionPromptMessageId = null;
        }

        await ticketDoc.save().catch(() => {});

        const msg = await fetchTicketMessage(
          targetChannel,
          ticketDoc.messageId,
        );
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("🔒 Chiudi")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("close_ticket_motivo")
              .setLabel("📝 Chiudi Con Motivo")
              .setStyle(ButtonStyle.Danger),
            ticketDoc.claimedBy
              ? new ButtonBuilder()
                  .setCustomId("unclaim")
                  .setLabel("🔓 Unclaim")
                  .setStyle(ButtonStyle.Secondary)
              : new ButtonBuilder()
                  .setCustomId("claim_ticket")
                  .setLabel("✅ Claim")
                  .setStyle(ButtonStyle.Success),
          );
          await msg
            .edit({ embeds: [panelConfig.embed], components: [row] })
            .catch(() => {});
        }

        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Switch Panel")
              .setDescription(
                `<:vegacheckmark:1443666279058772028> Ticket aggiornato in **${panelConfig.label || panelConfig.name || panelConfig.type}** nel canale ${targetChannel}.`,
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      } finally {
        message.client.ticketSwitchLocks.delete(switchKey);
        message.client.ticketSwitchCooldowns.set(switchKey, Date.now());
      }
    }

    if (subcommand === "rename") {
      if (!message.member.roles.cache.has(HIGHSTAFF_ROLE_ID)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Solo l'**High Staff** può usare `rename`.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const rawNewName = normalizedRest.join(" ").trim();
      if (!rawNewName) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Uso corretto: `+ticket rename <nuovo nome>`",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const currentName = String(message.channel.name || "");
      const firstSeparatorIndex = currentName.indexOf("︲");
      if (firstSeparatorIndex === -1) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Nome canale ticket non valido: manca il separatore `︲`.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const ticketPrefix = currentName.slice(0, firstSeparatorIndex + 1);
      const words = rawNewName
        .replace(/-/g, " ")
        .split(/\s+/)
        .map((word) => word.replace(/[\/\\#@:`*?"<>|]/g, "").trim())
        .filter(Boolean);
      const normalizedTail = words.join("᲼");

      if (!normalizedTail) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Il nuovo nome non è valido.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const newName = `${ticketPrefix}${normalizedTail}`.slice(0, 100);
      if (newName === currentName) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Info",
              "<:attentionfromvega:1443651874032062505> Il canale ha già questo nome.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const renamed = await message.channel.setName(newName).catch(() => null);
      if (!renamed) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Non riesco a rinominare il canale con questo nome.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Rinomina Ticket")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> Canale rinominato in \`${newName}\``,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Subcomando non valido. Usa: `add`, `remove`, `closerequest`, `close`, `claim`, `unclaim`, `switchpanel`, `rename`, `reopen`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
