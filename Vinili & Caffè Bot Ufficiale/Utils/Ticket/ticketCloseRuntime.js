const {EmbedBuilder,ButtonBuilder,ActionRowBuilder,ButtonStyle,}= require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {createTranscript,createTranscriptHtml,saveTranscriptHtml,}= require("./transcriptUtils");
const { getNextTicketId } = require("./ticketIdUtils");
const { sendDm } = require("../noDmList");
const IDs = require("../Config/ids");
const {getClientGuildCached,getGuildChannelCached,getGuildMemberCached,}= require("./ticketInteractionRuntime");

function buildTicketRatingRows(ticketId) {
  const stylesByScore ={1:ButtonStyle.Danger,2:ButtonStyle.Danger,3:ButtonStyle.Primary,4:ButtonStyle.Success,5:ButtonStyle.Success,};
  const row = new ActionRowBuilder().addComponents(...[1,2,3,4,5].map((score)=>new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:${score}`).setStyle(stylesByScore[score]|| ButtonStyle.Secondary).setLabel(String(score)).setEmoji("⭐"),),);
  return [row];
}

function buildTicketClosedEmbed(data) {
  const openedAt = data ?. createdAt ?`<t:${Math.floor(new Date(data.createdAt).getTime()/1000)}:F>`:"Sconosciuto";
  const closedAt = data ?. closedAt ?`<t:${Math.floor(new Date(data.closedAt).getTime()/1000)}:F>`:`<t:${Math.floor(Date.now()/1000)}:F>`;
  const reasonText = data ?. closeReason && String(data.closeReason).trim()? String(data.closeReason).trim():"No reason specified";

  const embed = new EmbedBuilder().setAuthor({name:data ?. guildName || "Ticket System",iconURL:data ?. guildIconURL || undefined,}).setTitle("Ticket Closed").setColor("#6f4e37").addFields({name:"🆔 Ticket ID",value:String(data ?. ticketNumber || "N/A"),inline:true},{name:"✅ Opened By",value:data ?. userId ?`<@${data.userId}>`:"Sconosciuto",inline:true},{name:"🛑 Closed By",value:data ?. closedBy ?`<@${data.closedBy}>`:"Sconosciuto",inline:true},{name:"🕒 Open Time",value:openedAt,inline:true},{name:"🙋 Claimed By",value:data ?. claimedBy ?`<@${data.claimedBy}>`:"Not claimed",inline:true},{name:"⏹️ Close Time",value:closedAt,inline:true},{name:"ℹ️ Reason",value:reasonText,inline:false},);

  const reordered =[embed.data.fields ?.[0],embed.data.fields ?.[1],embed.data.fields ?.[2],embed.data.fields ?.[3],embed.data.fields ?.[5],embed.data.fields ?.[4],embed.data.fields ?.[6],].filter(Boolean);
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

async function sendTranscriptWithBrowserLink(
  target,
  payload,
  hasHtml,
  extraRows = [],
  options = {},
) {
  if (!target?.send) return null;
  const { guildId, bypassNoDm } = options;
  const isUserDm = Boolean(bypassNoDm && guildId && (target.user || target.id));
  const sent = isUserDm ? await sendDm(target.user || target,payload,{guildId,bypassNoDm:true}):await target.send(payload).catch(()=>null);
  if (!sent) return sent;

  const safeExtraRows = Array.isArray(extraRows) ? extraRows.filter(Boolean) : [];
  if (!hasHtml) {
    if (safeExtraRows.length > 0) {
      const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
      await sent
        .edit({
          content: baseContent || undefined,
          components: safeExtraRows.slice(0, 5),
        })
        .catch(() => {});
    }
    return sent;
  }

  const attachment = sent.attachments ?. find((att)=>{const name = String(att ?. name || "").toLowerCase();const url = String(att ?. url || "").toLowerCase();return name.endsWith(".html")|| url.includes(".html");});

  if (attachment?.url) {
    const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
    const transcriptButton = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(attachment.url).setLabel("View Transcript").setEmoji("📁");
    const row = new ActionRowBuilder().addComponents(transcriptButton);
    await sent
      .edit({
        content: baseContent || undefined,
        components: [row, ...safeExtraRows].slice(0, 5),
      })
      .catch(() => {});
  } else if (safeExtraRows.length > 0) {
    const baseContent = typeof payload?.content === "string" ? payload.content.trim() : "";
    await sent
      .edit({
        content: baseContent || undefined,
        components: safeExtraRows.slice(0, 5),
      })
      .catch(() => {});
  }

  return sent;
}

async function closeTicket(targetInteraction, motivo, helpers) {
  const {safeReply,safeEditReply,makeErrorEmbed,LOG_CHANNEL,closedById = null,}= helpers;
  const closedByUserId = String(closedById || "").trim()|| targetInteraction.user ?. id || null;
  const closeLockKey = `${targetInteraction?.guildId || "noguild"}:${targetInteraction?.channelId || targetInteraction?.channel?.id || "nochannel"}`;
  if (!targetInteraction?.client?.ticketCloseLocks) {
    targetInteraction.client.ticketCloseLocks = new Set();
  }

  if (targetInteraction.client.ticketCloseLocks.has(closeLockKey)) {
    await safeReply(targetInteraction, {
      embeds: [
        makeErrorEmbed(
          "Attendi",
          "<:attentionfromvega:1443651874032062505> Chiusura ticket già in corso, attendi un attimo.",
        ),
      ],
      flags: 1 << 6,
    });
    return;
  }

  targetInteraction.client.ticketCloseLocks.add(closeLockKey);
  try {
    if (!targetInteraction || !targetInteraction.channel) {
      await safeReply(targetInteraction, {
        embeds: [
          makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Interazione non valida"),
        ],
        flags: 1 << 6,
      });
      return;
    }

    const ticket = await Ticket.findOneAndUpdate({channelId:targetInteraction.channel.id,open:true},{$set:{open:false,closedAt:new Date(),closedBy:closedByUserId,},},{new :true},);

    if (!ticket) {
      await safeReply(targetInteraction, {
        embeds: [
          makeErrorEmbed(
            "Info",
            "<:attentionfromvega:1443651874032062505> Ticket già chiuso o chiusura già in corso.",
          ),
        ],
        flags: 1 << 6,
      });
      return;
    }

    const transcriptTXT = await createTranscript(targetInteraction.channel).catch(() => "");
    const transcriptHTML = await createTranscriptHtml(targetInteraction.channel).catch(() => "");
    const transcriptHtmlPath = transcriptHTML ? await saveTranscriptHtml(targetInteraction.channel,transcriptHTML).catch(()=>null):null;

    let ticketNumber = Number(ticket.ticketNumber || 0);
    if (!ticketNumber) {
      ticketNumber = await getNextTicketId();
    }

    await Ticket.updateOne(
      { channelId: targetInteraction.channel.id },
      {
        $set: {
          ticketNumber,
          transcript: transcriptTXT,
          transcriptHtmlPath: transcriptHtmlPath || null,
          closeReason: motivo || null,
          claimedBy: ticket.claimedBy || null,
          closeRequestedBy: null,
          closeRequestedAt: null,
          closedBy: closedByUserId,
        },
      },
    ).catch(() => {});

    const mainGuildId = IDs?.guilds?.main || null;
    const centralTicketLogChannelId = LOG_CHANNEL || IDs?.channels?.ticketLogs || "1442569290682208296";
    const mainGuild = mainGuildId ? await getClientGuildCached(targetInteraction.client,mainGuildId):null;
    const logChannel = mainGuild ? await getGuildChannelCached(mainGuild,centralTicketLogChannelId):null;

    const closeEmbedData ={...ticket.toObject(),ticketNumber,closeReason:motivo || null,closedBy:closedByUserId,closedAt:new Date(),guildName:targetInteraction.guild ?. name || "Ticket System",guildIconURL:targetInteraction.guild ?. iconURL ?.({size:128})|| null,};
    const closeEmbed = buildTicketClosedEmbed(closeEmbedData);
    const ratingRows = buildTicketRatingRows(String(ticket._id));
    const transcriptRows = transcriptHtmlPath ?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_transcript:${ticket._id}`).setLabel("View Transcript").setStyle(ButtonStyle.Secondary).setEmoji("📁"),),]:[];

    let logSentMessage = null;
    if (logChannel?.isTextBased?.()) {
      logSentMessage = await sendTranscriptWithBrowserLink(
        logChannel,
        { embeds: [closeEmbed] },
        false,
        transcriptRows,
      );
    }

    const dmActionRows = [...transcriptRows, ...ratingRows];
    const member = await getGuildMemberCached(targetInteraction.guild, ticket.userId);
    if (member) {
      try {
        await sendTranscriptWithBrowserLink(
          member,
          { embeds: [closeEmbed] },
          false,
          dmActionRows,
          { guildId: targetInteraction.guild.id, bypassNoDm: true },
        );
      } catch (err) {
        if (![50007, 50278].includes(err?.code)) {
          global.logger.error(err);
        }
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

    await safeEditReply(targetInteraction, {
      embeds: [
        new EmbedBuilder()
          .setDescription("🔒 Il ticket verrà chiuso...")
          .setColor("#6f4e37"),
      ],
    });

    const deleteChannelTimer = setTimeout(() => {
      if (targetInteraction.channel) {
        targetInteraction.channel.delete().catch(() => {});
      }
    }, 2000);
    deleteChannelTimer.unref?.();
  } catch (err) {
    global.logger.error(err);
    await safeReply(targetInteraction, {
      embeds: [
        makeErrorEmbed(
          "Errore",
          "<:vegax:1443934876440068179> Errore durante la chiusura del ticket",
        ),
      ],
      flags: 1 << 6,
    }).catch(() => {});
  } finally {
    targetInteraction.client.ticketCloseLocks.delete(closeLockKey);
  }
}

module.exports = {
  buildTicketClosedEmbed,
  buildTicketRatingRows,
  closeTicket,
  sendTranscriptWithBrowserLink,
};
