const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml,
} = require("../../Utils/Ticket/transcriptUtils");
const IDs = require("../../Utils/Config/ids");

const SUCCESS_COLOR = "#6f4e37";
const ERROR_COLOR = "Red";
const SUBCOMMAND_ALIASES = {
  add: "add",
  remove: "remove",
  close: "close",
  closerequest: "closerequest",
  claim: "claim",
  unclaim: "unclaim",
  rename: "rename",
  ticketclose: "close",
  ticketclaim: "claim",
  ticketunclaim: "unclaim",
  tadd: "add",
  tremove: "remove",
  ticketadd: "add",
  ticketremove: "remove",
  trename: "rename",
  ticketrename: "rename",
};

const CHANNEL_SEPARATORS = ["︲"];

function parseTicketArgs(args) {
  const first = (args[0] || "").toLowerCase();
  let subcommand;
  let rest;

  if (first === "ticket") {
    subcommand = (args[1] || "").toLowerCase();
    rest = args.slice(2);
  } else {
    subcommand = SUBCOMMAND_ALIASES[first] || first;
    rest = args.slice(1);
  }

  if (rest.length && String(rest[0] || "").toLowerCase() === subcommand) {
    rest = rest.slice(1);
  }

  return { subcommand, rest };
}

function errorEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setDescription(description);
  if (title) embed.setTitle(title);
  return embed;
}

function okEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setDescription(description);
  if (title) embed.setTitle(title);
  return embed;
}

async function replyWithEmbed(message, embed) {
  return safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  });
}

async function sendTranscriptWithBrowserLink(target, payload, hasHtml) {
  if (!target?.send) return null;

  const sent = await target.send(payload).catch(() => null);
  if (!sent || !hasHtml) return sent;

  const attachment = sent.attachments?.find((att) => {
    const name = String(att?.name || "").toLowerCase();
    const url = String(att?.url || "").toLowerCase();
    return name.endsWith(".html") || url.includes(".html");
  });

  if (!attachment?.url) return sent;

  const baseContent =
    typeof payload?.content === "string" ? payload.content.trim() : "";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(attachment.url)
      .setLabel("View Online Transcript"),
  );

  await sent
    .edit({ content: baseContent || undefined, components: [row] })
    .catch(() => {});
  return sent;
}

async function resolveUserFromArg(message, rawArg) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;

  if (!rawArg) return null;
  const raw = String(rawArg);
  const id =
    raw.match(/^<@!?(\d+)>$/)?.[1] || (raw.match(/^\d{17,20}$/) ? raw : null);
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

async function getTicketInChannel(channelId) {
  return Ticket.findOne({ channelId }).catch(() => null);
}

async function ensureTicketContext(message) {
  const parentChannel = message.channel?.parent || null;
  const inTicketCategory = Boolean(
    parentChannel &&
    String(parentChannel.name || "")
      .toLowerCase()
      .includes("tickets"),
  );
  const activeTicket = await Ticket.findOne({
    channelId: message.channel.id,
    open: true,
  }).catch(() => null);

  if (inTicketCategory && activeTicket) {
    return { ok: true, ticket: activeTicket };
  }

  await replyWithEmbed(
    message,
    errorEmbed(
      "<:vegax:1472992044140990526> I comandi ticket si usano solo dentro un canale ticket.",
    ),
  );
  return { ok: false, ticket: null };
}

async function handleAdd(message, rest) {
  const user = await resolveUserFromArg(message, rest[0]);
  if (!user) {
    await replyWithEmbed(
      message,
      errorEmbed("<:vegax:1472992044140990526> Specifica un utente valido."),
    );
    return true;
  }

  await message.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
  });
  await replyWithEmbed(
    message,
    okEmbed(
      `<:vegacheckmark:1472992042203349084> ${user} e stato aggiunto a ${message.channel}`,
      "Aggiungi",
    ),
  );
  return true;
}

async function handleRemove(message, rest) {
  const user = await resolveUserFromArg(message, rest[0]);
  if (!user) {
    await replyWithEmbed(
      message,
      errorEmbed("<:vegax:1472992044140990526> Specifica un utente valido."),
    );
    return true;
  }

  await message.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: false,
    SendMessages: false,
  });
  await replyWithEmbed(
    message,
    okEmbed(
      `<:vegacheckmark:1472992042203349084> ${user} e stato rimosso da ${message.channel}`,
      "Rimuovi",
    ),
  );
  return true;
}

async function handleCloseRequest(message, rest) {
  const reason = rest.join(" ").trim();
  const ticketDoc = await getTicketInChannel(message.channel.id);

  if (!ticketDoc) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Questo non e un canale ticket",
        "Errore",
      ),
    );
    return true;
  }

  if (message.author.id !== ticketDoc.claimedBy) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Solo chi ha claimato il ticket può inviare la richiesta di chiusura.",
      ),
    );
    return true;
  }

  await Ticket.updateOne(
    { channelId: message.channel.id },
    { $set: { closeReason: reason || null } },
  ).catch(() => {});

  const closeButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accetta")
      .setEmoji("<:vegacheckmark:1472992042203349084>")
      .setLabel("Accetta e chiudi")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("rifiuta")
      .setEmoji("<:vegax:1472992044140990526>")
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
        .setColor(SUCCESS_COLOR),
    ],
    components: [closeButtons],
  });

  return true;
}

async function buildTranscriptPayload(
  channel,
  transcriptTXT,
  transcriptHtmlPath,
  embed,
) {
  const files = transcriptHtmlPath
    ? [
        {
          attachment: transcriptHtmlPath,
          name: `transcript_${channel.id}.html`,
        },
      ]
    : [
        {
          attachment: Buffer.from(transcriptTXT, "utf-8"),
          name: `transcript_${channel.id}.txt`,
        },
      ];

  return { files, embeds: [embed] };
}

async function handleClose(message, rest) {
  const reasonFromArgs = rest.join(" ").trim() || null;
  const ticketDoc = await getTicketInChannel(message.channel.id);

  if (!ticketDoc) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Questo non e un canale ticket",
        "Errore",
      ),
    );
    return true;
  }

  if (ticketDoc.userId === message.author.id) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Non puoi chiudere da solo il ticket che hai aperto.",
      ),
    );
    return true;
  }

  const claimed = await Ticket.findOneAndUpdate(
    { channelId: message.channel.id, open: true },
    { $set: { open: false, closedAt: new Date() } },
    { new: true },
  );

  if (!claimed) {
    await replyWithEmbed(
      message,
      new EmbedBuilder()
        .setColor("Orange")
        .setDescription(
          "<:attentionfromvega:1472992040601260042> Ticket già chiuso o chiusura già in corso.",
        ),
    );
    return true;
  }

  const closeReason = reasonFromArgs || claimed.closeReason || null;
  const closeReasonText = closeReason || "Nessun motivo inserito";

  const transcriptTXT = await createTranscript(message.channel).catch(() => "");
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
        transcript: transcriptTXT,
        closeReason,
        claimedBy: claimed.claimedBy || null,
      },
    },
  ).catch(() => {});

  const createdAtText = claimed.createdAt
    ? `<t:${Math.floor(claimed.createdAt.getTime() / 1000)}:F>`
    : "Data non disponibile";

  const summaryEmbed = new EmbedBuilder()
    .setTitle("Ticket Chiuso")
    .setDescription(
      `<:member_role_icon:1330530086792728618> **Aperto da:** <@${claimed.userId}>\n` +
        `<:discordstaff:1443651872258003005> **Chiuso da:** ${message.author}\n` +
        `<:Clock:1330530065133338685> **Aperto il:** ${createdAtText}\n` +
        `<a:VC_Verified:1448687631109197978> **Claimato da:** ${claimed.claimedBy ? `<@${claimed.claimedBy}>` : "Non claimato"}\n` +
        `<:reportmessage:1443670575376765130> **Motivo:** ${closeReasonText}`,
    )
    .setColor(SUCCESS_COLOR);

  const payload = await buildTranscriptPayload(
    message.channel,
    transcriptTXT,
    transcriptHtmlPath,
    summaryEmbed,
  );

  const logChannelId = IDs.channels?.ticketLogs || null;
  const logChannel =
    message.guild.channels.cache.get(logChannelId) ||
    (await message.guild.channels.fetch(logChannelId).catch(() => null));

  if (logChannel?.isTextBased?.()) {
    await sendTranscriptWithBrowserLink(
      logChannel,
      payload,
      Boolean(transcriptHtmlPath),
    );
  }

  const ticketOwner = await message.guild.members
    .fetch(claimed.userId)
    .catch(() => null);
  if (ticketOwner) {
    try {
      await sendTranscriptWithBrowserLink(
        ticketOwner,
        payload,
        Boolean(transcriptHtmlPath),
      );
    } catch (err) {
      if (err?.code !== 50007) {
        global.logger?.error?.("[Ticket DM]", err);
      }
    }
  }

  await replyWithEmbed(message, okEmbed("Il ticket verra chiuso..."));
  setTimeout(() => {
    if (message.channel) message.channel.delete().catch(() => {});
  }, 2000);

  return true;
}

function buildClaimButtons(claimed) {
  if (claimed) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("close_ticket_motivo")
        .setLabel("Chiudi con motivo")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("unclaim")
        .setLabel("Unclaim")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Chiudi")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("close_ticket_motivo")
      .setLabel("Chiudi Con Motivo")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success),
  );
}

async function handleClaim(message) {
  const ticketDoc = await getTicketInChannel(message.channel.id);
  if (!ticketDoc) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Questo non e un canale ticket",
        "Errore",
      ),
    );
    return true;
  }

  if (ticketDoc.claimedBy) {
    await replyWithEmbed(
      message,
      errorEmbed(
        `<:attentionfromvega:1472992040601260042> Questo ticket e già stato claimato da <@${ticketDoc.claimedBy}>`,
        "Errore",
      ),
    );
    return true;
  }

  if (ticketDoc.userId === message.author.id) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Non puoi claimare il ticket che hai aperto tu.",
        "Errore",
      ),
    );
    return true;
  }

  ticketDoc.claimedBy = message.author.id;
  await ticketDoc.save();

  await message.channel.permissionOverwrites.edit(message.author.id, {
    ViewChannel: true,
    SendMessages: true,
  });

  const ticketMessage = await fetchTicketMessage(
    message.channel,
    ticketDoc.messageId,
  );
  if (!ticketMessage) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Non riesco a trovare il messaggio del ticket.",
        "Errore",
      ),
    );
    return true;
  }

  const updatedEmbed = ticketMessage.embeds?.[0]
    ? EmbedBuilder.from(ticketMessage.embeds[0])
    : new EmbedBuilder().setColor(SUCCESS_COLOR);

  await ticketMessage.edit({
    embeds: [updatedEmbed],
    components: [buildClaimButtons(true)],
  });

  await replyWithEmbed(
    message,
    okEmbed(
      `Il ticket e stato preso in carico da <@${ticketDoc.claimedBy}>`,
      "Ticket Claimato",
    ),
  );
  return true;
}

async function handleUnclaim(message) {
  const ticketDoc = await getTicketInChannel(message.channel.id);
  if (!ticketDoc) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Questo non e un canale ticket",
        "Errore",
      ),
    );
    return true;
  }

  if (!ticketDoc.claimedBy) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Questo ticket non e claimato.",
        "Errore",
      ),
    );
    return true;
  }

  const oldClaimer = ticketDoc.claimedBy;
  if (message.author.id !== oldClaimer) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Solo chi ha claimato può unclaimare il ticket.",
        "Errore",
      ),
    );
    return true;
  }

  ticketDoc.claimedBy = null;
  await ticketDoc.save();
  await message.channel.permissionOverwrites.delete(oldClaimer).catch(() => {});

  const ticketMessage = await fetchTicketMessage(
    message.channel,
    ticketDoc.messageId,
  );
  if (!ticketMessage) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Non riesco a trovare il messaggio principale del ticket.",
        "Errore",
      ),
    );
    return true;
  }

  const originalEmbed = ticketMessage.embeds?.[0]
    ? EmbedBuilder.from(ticketMessage.embeds[0])
    : new EmbedBuilder().setColor(SUCCESS_COLOR);

  await ticketMessage.edit({
    embeds: [originalEmbed],
    components: [buildClaimButtons(false)],
  });

  await replyWithEmbed(
    message,
    okEmbed(`<@${oldClaimer}> non gestisce piu il ticket`, "Ticket Unclaimato"),
  );
  return true;
}

function extractTicketPrefix(channelName) {
  for (const separator of CHANNEL_SEPARATORS) {
    const idx = channelName.indexOf(separator);
    if (idx !== -1) {
      return {
        separator,
        prefix: channelName.slice(0, idx + separator.length),
      };
    }
  }
  return null;
}

function normalizeTicketTail(rawName, separator) {
  const words = rawName
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[\/\\#@:`*?"<>|]/g, "").trim())
    .filter(Boolean);

  return words.join(separator);
}

async function handleRename(message, rest) {
  const rawNewName = rest.join(" ").trim();
  if (!rawNewName) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Uso: `-ticket rename <nuovo nome>`",
      ),
    );
    return true;
  }

  const currentName = String(message.channel.name || "");
  const prefixInfo = extractTicketPrefix(currentName);
  if (!prefixInfo) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Nome canale ticket non valido.",
        "Errore",
      ),
    );
    return true;
  }

  const normalizedTail = normalizeTicketTail(rawNewName, prefixInfo.separator);
  if (!normalizedTail) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Il nuovo nome non e valido.",
        "Errore",
      ),
    );
    return true;
  }

  const newName = `${prefixInfo.prefix}${normalizedTail}`.slice(0, 100);
  const renamed = await message.channel.setName(newName).catch(() => null);
  if (!renamed) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Non riesco a rinominare il canale.",
        "Errore",
      ),
    );
    return true;
  }

  await replyWithEmbed(
    message,
    okEmbed(
      `<:vegacheckmark:1472992042203349084> Canale rinominato in \`${newName}\``,
      "Rinomina Ticket",
    ),
  );
  return true;
}

async function runTicketCommand(message, args) {
  if (!message?.inGuild?.() || !message.guild || !message.member) return false;

  const guildId = message.guild.id;
  const staffRoleId = (IDs.roles?.sponsorStaffRoleIds || {})[guildId];
  if (!staffRoleId) return false;

  const { subcommand, rest } = parseTicketArgs(args);
  if (!subcommand) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Uso: `-ticket <add|remove|closerequest|close|claim|unclaim|rename>`",
      ),
    );
    return true;
  }

  const context = await ensureTicketContext(message);
  if (!context.ok) return true;

  const hasStaffRole = message.member.roles?.cache?.has(staffRoleId);
  if (!hasStaffRole) {
    await replyWithEmbed(
      message,
      errorEmbed(
        "<:vegax:1472992044140990526> Solo lo **staff** può usare i comandi ticket su questo server.",
      ),
    );
    return true;
  }

  if (subcommand === "add") return handleAdd(message, rest);
  if (subcommand === "remove") return handleRemove(message, rest);
  if (subcommand === "closerequest") return handleCloseRequest(message, rest);
  if (subcommand === "close") return handleClose(message, rest);
  if (subcommand === "claim") return handleClaim(message);
  if (subcommand === "unclaim") return handleUnclaim(message);
  if (subcommand === "rename") return handleRename(message, rest);

  await replyWithEmbed(
    message,
    errorEmbed(
      "<:vegax:1472992044140990526> Subcomando non valido. Usa: `add`, `remove`, `closerequest`, `close`, `claim`, `unclaim`, `rename`.",
    ),
  );
  return true;
}

module.exports = {
  name: "ticket",
  aliases: [
    "ticketclose",
    "ticketclaim",
    "ticketunclaim",
    "ticketadd",
    "ticketremove",
    "trename",
    "ticketrename",
    "tadd",
    "tremove",
    "add",
    "remove",
    "close",
    "closerequest",
    "claim",
    "unclaim",
    "rename",
  ],
  async execute(message, args, client, context = {}) {
    const invoked = String(context?.invokedName || "ticket").toLowerCase();
    return runTicketCommand(
      message,
      [invoked, ...(Array.isArray(args) ? args : [])],
      client,
    );
  },
};
