const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const fs = require("fs");
const { getNextTicketId } = require("../../Utils/Ticket/ticketIdUtils");
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper, } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const { buildTicketChannelName } = require("../../Utils/Ticket/ticketNamingRuntime");
const{canUserHandleCloseRequest:runtimeCanUserHandleCloseRequest,ensureClosableTicketOrReply:runtimeEnsureClosableTicketOrReply,findOpenTicketByUser:runtimeFindOpenTicketByUser,findTicketByChannel:runtimeFindTicketByChannel,getClientGuildCached:runtimeGetClientGuildCached,getGuildChannelCached:runtimeGetGuildChannelCached,getSelectedTicketAction:runtimeGetSelectedTicketAction,hasActiveTicketClaimer:runtimeHasActiveTicketClaimer,isHandledTicketInteraction:runtimeIsHandledTicketInteraction,isSponsorGuild:runtimeIsSponsorGuild,isTicketRatingButton:runtimeIsTicketRatingButton,isTicketTranscriptButton:runtimeIsTicketTranscriptButton,loadTicketForChannelOrReply:runtimeLoadTicketForChannelOrReply,}=require("../../Utils/Ticket/ticketInteractionRuntime");
const{buildTicketClosedEmbed:runtimeBuildTicketClosedEmbed,buildTicketRatingRows:runtimeBuildTicketRatingRows,closeTicket:runtimeCloseTicket,}=require("../../Utils/Ticket/ticketCloseRuntime");
const{createTicketsCategory:runtimeCreateTicketsCategory,handleSponsorTicketOpen:runtimeHandleSponsorTicketOpen,}=require("../../Utils/Ticket/ticketOpenRuntime");

async function handleTicketInteraction(interaction) {
  const selectedTicketAction = runtimeGetSelectedTicketAction(interaction);
  const ticketActionId = selectedTicketAction || interaction.customId;
  const sponsorGuild = Boolean(interaction.guild && runtimeIsSponsorGuild(interaction.guild.id));

  const{isTicketButton,isTicketSelect,isTicketModal}=runtimeIsHandledTicketInteraction(interaction);
  if (!isTicketButton && !isTicketModal && !isTicketSelect) return false;
  if (sponsorGuild) {
    if (
      isTicketSelect &&
      interaction.customId === "ticket_open_menu" &&
      interaction.values?.[0] === "ticket_supporto"
    ) {
      return await runtimeHandleSponsorTicketOpen(interaction);
    }
    if (
      isTicketSelect ||
      ticketActionId === "ticket_partnership" ||
      ticketActionId === "ticket_highstaff" ||
      ticketActionId === "ticket_supporto"
    ) {
      return false;
    }
  }
  const LOG_CHANNEL = IDs.channels.ticketLogs;
  const ROLE_STAFF = IDs.roles.Staff;
  const ROLE_HIGHSTAFF = IDs.roles.HighStaff;
  const ROLE_PARTNERMANAGER = IDs.roles.PartnerManager;
  const ROLE_USER = IDs.roles?.Member || null;
  const ROLE_TICKETPARTNER_BLACKLIST = IDs.roles.blackilistPartner;
  const ROLE_TICKET_BLACKLIST = IDs.roles.blacklistTicket;
  const STAFF_ROLES = [ROLE_STAFF, ROLE_HIGHSTAFF];
  if (!interaction.client.ticketCloseLocks) {
    interaction.client.ticketCloseLocks = new Set();
  }
  if (!interaction.client.ticketActionLocks) {
    interaction.client.ticketActionLocks = new Set();
  }
  const TICKET_PERMISSIONS=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AddReactions,];

  async function safeReply(target, payload) {
    return safeReplyHelper(target, payload);
  }

  function safeEditReply(target, payload) {
    return safeEditReplyHelper(target, payload);
  }

  function makeErrorEmbed(title, description) {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor("#6f4e37");
  }

  function isHighStaffActor() {
    return Boolean(
      ROLE_HIGHSTAFF && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF),
    );
  }

  function getTicketActionLockKey(actionGroup, channelId = interaction.channel?.id) {
    return `${interaction.guildId || "noguild"}:${channelId || "nochannel"}:${actionGroup}`;
  }

  async function acquireTicketActionLock(actionGroup, channelId = interaction.channel?.id) {
    const lockKey = getTicketActionLockKey(actionGroup, channelId);
    if (interaction.client.ticketActionLocks.has(lockKey)) {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "Attendi",
            "<:attentionfromvega:1443651874032062505> Azione già in corso su questo ticket, attendi un attimo.",
          ),
        ],
        flags: 1 << 6,
      });
      return null;
    }
    interaction.client.ticketActionLocks.add(lockKey);
    return lockKey;
  }

  function releaseTicketActionLock(lockKey) {
    if (!lockKey) return;
    interaction.client.ticketActionLocks.delete(lockKey);
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

  try {
    if (isTicketButton || isTicketSelect) {
      const isDmSafeTicketAction = runtimeIsTicketRatingButton(interaction.customId) || runtimeIsTicketTranscriptButton(interaction.customId);
      if ((!interaction.guild || !interaction.member) && !isDmSafeTicketAction) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Interazione non valida (fuori dal server).",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const partnerOpenButtons = ["ticket_partnership"];
      if (
        partnerOpenButtons.includes(ticketActionId) &&
        interaction.member?.roles?.cache?.has(ROLE_TICKETPARTNER_BLACKLIST)
      ) {
        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setDescription(
                `<:vegax:1443934876440068179> Non puoi usare questo bottone poiché sei blacklistato dalle partner. Se pensi sia un errore apri un <#1442569095068254219> \`Terza Categoria\``,
              ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const ticketOpenButtons=["ticket_partnership","ticket_supporto","ticket_highstaff",];
      if (
        ticketOpenButtons.includes(ticketActionId) &&
        interaction.member?.roles?.cache?.has(ROLE_TICKET_BLACKLIST)
      ) {
        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setDescription(
                `<:vegax:1443934876440068179> Non puoi usare questo bottone poiché sei blacklistato dai ticket.`,
              ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const userOnlyTickets=["ticket_partnership","ticket_highstaff","ticket_supporto",];
      if (userOnlyTickets.includes(ticketActionId)) {
        if (!ROLE_USER) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Ruolo verifica (Member) non configurato. Contatta lo staff.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        if (!interaction.member?.roles?.cache?.has(ROLE_USER)) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Devi aver completato la **verifica** per aprire un ticket.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
      }
      const ticketConfig={ticket_supporto:{type:"supporto",emoji:"⭐",name:"supporto",role:ROLE_STAFF,requiredRoles:ROLE_USER?[ROLE_USER]:[],embed:new EmbedBuilder().setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET SUPPORTO__**",).setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`,).setColor("#6f4e37"),},ticket_partnership:{type:"partnership",emoji:"🤝",name:"partnership",role:ROLE_PARTNERMANAGER,requiredRoles:[ROLE_USER],embed:new EmbedBuilder().setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET PARTNERSHIP__**",).setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Invia direttamente qui la tua descrizione.`,).setColor("#6f4e37"),},ticket_highstaff:{type:"high",emoji:"✨",name:"highstaff",role:ROLE_HIGHSTAFF,requiredRoles:[ROLE_USER],embed:new EmbedBuilder().setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET HIGH STAFF__**",).setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Verifica Selfie, Donazioni, Sponsor o High Staff.`,).setColor("#6f4e37"),},};
      const config = ticketConfig[ticketActionId];
      if (
        !config &&
        ![
          "claim_ticket",
          "close_ticket",
          "close_ticket_motivo",
          "accetta",
          "rifiuta",
          "ticket_autoclose_accept",
          "ticket_autoclose_reject",
          "unclaim",
        ].includes(interaction.customId) &&
        !runtimeIsTicketTranscriptButton(interaction.customId) &&
        !runtimeIsTicketRatingButton(interaction.customId)
      ) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Categoria ticket non valida. Riprova dal pannello.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (config) {
        if (!interaction.deferred && !interaction.replied) {
          try {
            await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
          } catch {}
        }
        if (!interaction.client.ticketOpenLocks) {
          interaction.client.ticketOpenLocks = new Set();
        }
        const ticketLockKey = `${interaction.guild.id}:${interaction.user.id}`;
        if (interaction.client.ticketOpenLocks.has(ticketLockKey)) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Attendi",
                "<:attentionfromvega:1443651874032062505> Sto già aprendo un ticket per te, aspetta un attimo.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        interaction.client.ticketOpenLocks.add(ticketLockKey);
        try {
          if (
            [
              "ticket_partnership",
              "ticket_highstaff",
              "ticket_supporto",
            ].includes(ticketActionId)
          ) {
            if (
              !ROLE_USER ||
              !interaction.member?.roles?.cache?.has(ROLE_USER)
            ) {
              await safeReply(interaction, {
                embeds: [
                  makeErrorEmbed(
                    "Errore",
                    "<:vegax:1443934876440068179> Devi aver completato la **verifica** per aprire questo ticket.",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
          if (config.requiredRoles?.length > 0) {
            const hasRole=config.requiredRoles.some((r) => interaction.member?.roles?.cache?.has(r),);
            if (!hasRole) {
              await safeReply(interaction, {
                embeds: [
                  makeErrorEmbed(
                    "Errore",
                    "<:vegax:1443934876440068179> Non hai i requisiti per aprire questo ticket",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
          const existing=await runtimeFindOpenTicketByUser(interaction.guild.id,interaction.user.id,);
          if (existing) {
            await safeReply(interaction, {
              embeds: [
                new EmbedBuilder()
                  .setTitle("Ticket Aperto")
                  .setDescription(
                    `<:vegax:1443934876440068179> Hai già un ticket aperto: <#${existing.channelId}>`,
                  )
                  .setColor("#6f4e37"),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const ticketsCategory=await runtimeCreateTicketsCategory(interaction,interaction.guild,);
          if (!ticketsCategory) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Impossibile creare o trovare la categoria ticket",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const channel=await interaction.guild.channels.create({name:buildTicketChannelName(config,interaction.user?.username,interaction.user?.id||"utente"),type:0,parent:ticketsCategory.id,permissionOverwrites:[{id:interaction.guild.roles.everyone,deny:[PermissionFlagsBits.ViewChannel],},{id:interaction.user.id,allow:TICKET_PERMISSIONS,},...(config.type==="supporto"?[{id:ROLE_STAFF,allow:TICKET_PERMISSIONS,},{id:ROLE_HIGHSTAFF,allow:TICKET_PERMISSIONS,},{id:ROLE_PARTNERMANAGER,deny:[PermissionFlagsBits.ViewChannel],},]:[]),...(config.type==="partnership"?[{id:ROLE_PARTNERMANAGER,allow:TICKET_PERMISSIONS,},{id:ROLE_HIGHSTAFF,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,],deny:[],},{id:ROLE_STAFF,deny:[PermissionFlagsBits.ViewChannel],},]:[]),...(config.type==="high"?[{id:ROLE_HIGHSTAFF,allow:TICKET_PERMISSIONS,},{id:ROLE_STAFF,deny:[PermissionFlagsBits.ViewChannel],},{id:ROLE_PARTNERMANAGER,deny:[PermissionFlagsBits.ViewChannel],},]:[]),],}).catch((err) => {global.logger.error(err);return null;});
          if (!channel) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Impossibile creare il canale ticket",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi Con Motivo").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim").setStyle(ButtonStyle.Success),);
          const mainMsg=await channel.send({embeds:[config.embed],components:[row]}).catch((err) => {global.logger.error(err);return null;});
          if (mainMsg) {
            await pinFirstTicketMessage(channel, mainMsg);
          }
          let ticketCreated = false;
          try {
            const ticketNumber = await getNextTicketId();
            await Ticket.create({
              ticketNumber,
              guildId: interaction.guild.id,
              userId: interaction.user.id,
              channelId: channel.id,
              ticketType: config.type,
              open: true,
              messageId: mainMsg?.id || null,
              descriptionPromptMessageId: null,
              descriptionSubmitted: false,
            });
            ticketCreated = true;
          } catch (err) {
            const isDuplicate=err?.code===11000||(err?.message&&String(err.message).includes("E11000"));
            if (isDuplicate) {
              await channel.delete().catch(() => {});
              const other=await runtimeFindOpenTicketByUser(interaction.guild.id,interaction.user.id,);
              await safeEditReply(interaction, {
                embeds: [
                  new EmbedBuilder()
                    .setTitle("Ticket Aperto")
                    .setDescription(
                      `<:vegax:1443934876440068179> Hai già un ticket aperto${other?.channelId ? ": <#" + other.channelId + ">" : "."}`,
                    )
                    .setColor("#6f4e37"),
                ],
                flags: 1 << 6,
              });
              return true;
            }
            global.logger.error(err);
          }
          if (!ticketCreated) {
            await channel.delete().catch(() => {});
            await safeEditReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Impossibile creare il ticket, riprova.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          let tagRole =
            config.type === "partnership" ? ROLE_PARTNERMANAGER : config.role;
          const mentionMsg=await channel.send(`<@${interaction.user.id}>${tagRole?`<@&${tagRole}>` : ""}`,).catch(() => null);
          if (mentionMsg) {
            const mentionCleanupTimer = setTimeout(() => {
              mentionMsg.delete().catch(() => {});
            }, 100);
            mentionCleanupTimer.unref?.();
          }
          await safeEditReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle("<:vegacheckmark:1443666279058772028> Ticket Creato")
                .setDescription(`Aperto un nuovo ticket: ${channel}`)
                .setColor("#6f4e37"),
            ],
            flags: 1 << 6,
          });
          return true;
        } finally {
          interaction.client.ticketOpenLocks.delete(ticketLockKey);
        }
      }
      if (runtimeIsTicketRatingButton(interaction.customId)) {
        const ratingParts = String(interaction.customId).split(":");
        if (ratingParts.length !== 3) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Valutazione non valida.")],
            flags: 1 << 6,
          });
          return true;
        }
        const [, ticketDbId, scoreRaw] = ratingParts;
        const score = Number(scoreRaw);
        if (!ticketDbId || !Number.isInteger(score) || score < 1 || score > 5) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Valutazione non valida.")],
            flags: 1 << 6,
          });
          return true;
        }

        const currentTicket = await Ticket.findById(ticketDbId).catch(() => null);
        if (!currentTicket) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Ticket non trovato.")],
            flags: 1 << 6,
          });
          return true;
        }

        if (String(currentTicket.userId || "") !== String(interaction.user?.id || "")) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo chi ha aperto il ticket può votare.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        const ratedTicket=await Ticket.findOneAndUpdate({_id:ticketDbId,ratingScore:null},{$set:{ratingScore:score,ratingBy:interaction.user.id,ratingAt:new Date(),},},{new:true},).catch(() => null);

        if (!ratedTicket) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Info",
                "<:attentionfromvega:1443651874032062505> Hai già inviato una valutazione per questo ticket.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        if (ratedTicket.closeLogChannelId && ratedTicket.closeLogMessageId) {
          const ticketGuild = interaction.guild || await runtimeGetClientGuildCached(interaction.client, ratedTicket.guildId);
          const logChannel=await runtimeGetGuildChannelCached(ticketGuild,ratedTicket.closeLogChannelId,)||await runtimeGetGuildChannelCached(interaction.client.guilds.cache.get(ratedTicket.guildId),ratedTicket.closeLogChannelId,);
          if (logChannel?.isTextBased?.()) {
            const logMessage=await logChannel.messages.fetch(ratedTicket.closeLogMessageId).catch(() => null);
            if (logMessage) {
              const updatedEmbed=runtimeBuildTicketClosedEmbed({...ratedTicket.toObject(),guildName:ticketGuild?.name||interaction.client.guilds.cache.get(ratedTicket.guildId)?.name||"Ticket System",guildIconURL:ticketGuild?.iconURL?.({size:128})||null,});
              await logMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
            }
          }
        }

        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setDescription(`Grazie per il feedback: **${score}/5** ⭐`),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (runtimeIsTicketTranscriptButton(interaction.customId)) {
        const transcriptParts = String(interaction.customId).split(":");
        if (transcriptParts.length < 2) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Transcript non valido.")],
            flags: 1 << 6,
          });
          return true;
        }
        const [, ticketDbId] = transcriptParts;
        if (!ticketDbId) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Transcript non valido.")],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await Ticket.findById(ticketDbId).catch(() => null);
        if (!ticketDoc) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Errore", "Ticket non trovato.")],
            flags: 1 << 6,
          });
          return true;
        }

        const isOwner=String(ticketDoc.userId||"")===String(interaction.user?.id||"");
        const hasStaffRole=Boolean(interaction.member?.roles?.cache?.has(ROLE_STAFF))||Boolean(interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF))||Boolean(interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER));
        if (!isOwner && !hasStaffRole) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Non puoi visualizzare questo transcript.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        const transcriptHtmlPath = String(ticketDoc.transcriptHtmlPath || "");
        if (!transcriptHtmlPath || !fs.existsSync(transcriptHtmlPath)) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Info", "Transcript HTML non disponibile.")],
            flags: 1 << 6,
          });
          return true;
        }

        await safeReply(interaction, {
          content: "Transcript HTML del ticket:",
          files: [
            {
              attachment: transcriptHtmlPath,
              name: `transcript_ticket_${ticketDoc.ticketNumber || ticketDoc._id}.html`,
            },
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (interaction.customId === "claim_ticket") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const claimLockKey = await acquireTicketActionLock("claim_state");
        if (!claimLockKey) return true;
        try {
          const ticket = await runtimeFindTicketByChannel(interaction.channel.id);
          if (!ticket) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Ticket non trovato",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const canClaimSupport=ticket.ticketType==="supporto"&&STAFF_ROLES.some((r) => interaction.member?.roles?.cache?.has(r));
          const canClaimPartnership=ticket.ticketType==="partnership"&&(interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER)||interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF));
          const canClaimHigh=ticket.ticketType==="high"&&interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
          if (!canClaimSupport && !canClaimPartnership && !canClaimHigh) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo lo staff può claimare i ticket",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (ticket.userId === interaction.user.id) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const claimedByVal=ticket.claimedBy!=null?String(ticket.claimedBy).trim():"";
          if (claimedByVal !== "" && !isHighStaffActor()) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Ticket già claimato",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          let claimedTicket = await Ticket.findOneAndUpdate(
            isHighStaffActor()
              ? { channelId: interaction.channel.id }
              : {
                  channelId: interaction.channel.id,
                  $or: [
                    { claimedBy: null },
                    { claimedBy: { $exists: false } },
                    { claimedBy: "" },
                  ],
                },
            { $set: { claimedBy: interaction.user.id } },
            { new: true },
          ).catch(() => null);
          if (!claimedTicket) {
            claimedTicket = await runtimeFindTicketByChannel(interaction.channel.id);
            if (!claimedTicket) {
              await safeReply(interaction, {
                embeds: [
                  makeErrorEmbed(
                    "Errore",
                    "<:vegax:1443934876440068179> Ticket già claimato",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
            const nowClaimed=claimedTicket.claimedBy!=null?String(claimedTicket.claimedBy).trim():"";
            if (nowClaimed !== "" && !isHighStaffActor()) {
              await safeReply(interaction, {
                embeds: [
                  makeErrorEmbed(
                    "Errore",
                    "<:vegax:1443934876440068179> Ticket già claimato da un altro staff.",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Ticket già claimato.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (interaction.channel) {
            try {
              if (ticket.userId) {
                await interaction.channel.permissionOverwrites.edit(
                  ticket.userId,
                  {
                    ViewChannel: true,
                    SendMessages: true,
                    EmbedLinks: true,
                    AttachFiles: true,
                    ReadMessageHistory: true,
                    AddReactions: true,
                  },
                );
              }
              await interaction.channel.permissionOverwrites.edit(
                interaction.user.id,
                {
                  ViewChannel: true,
                  SendMessages: true,
                  EmbedLinks: true,
                  AttachFiles: true,
                  ReadMessageHistory: true,
                  AddReactions: true,
                },
              );
              if (ticket.ticketType === "supporto") {
                for (const r of STAFF_ROLES) {
                  if (r) {
                    await interaction.channel.permissionOverwrites.edit(r, {
                      ViewChannel: true,
                      SendMessages: false,
                      ReadMessageHistory: true,
                    });
                  }
                }
              }
              if (ticket.ticketType === "partnership") {
                if (ROLE_PARTNERMANAGER) {
                  await interaction.channel.permissionOverwrites.edit(
                    ROLE_PARTNERMANAGER,
                    {
                      ViewChannel: true,
                      SendMessages: false,
                      ReadMessageHistory: true,
                    },
                  );
                }
                if (ROLE_HIGHSTAFF) {
                  await interaction.channel.permissionOverwrites.edit(
                    ROLE_HIGHSTAFF,
                    {
                      ViewChannel: true,
                      SendMessages: false,
                      ReadMessageHistory: true,
                    },
                  );
                }
              } else if (ticket.ticketType === "high") {
                if (ROLE_HIGHSTAFF) {
                  await interaction.channel.permissionOverwrites.edit(
                    ROLE_HIGHSTAFF,
                    {
                      ViewChannel: true,
                      SendMessages: false,
                      ReadMessageHistory: true,
                    },
                  );
                }
              } else if (ROLE_PARTNERMANAGER) {
                await interaction.channel.permissionOverwrites.edit(
                  ROLE_PARTNERMANAGER,
                  {
                    ViewChannel: false,
                  },
                );
              }
            } catch (err) {
              global.logger.error(err);
            }
          }
          const claimedButtons=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi con motivo").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("unclaim").setLabel("🔓 Unclaim").setStyle(ButtonStyle.Secondary),);
          try {
            if (interaction.channel && claimedTicket.messageId) {
              const msg=await interaction.channel.messages.fetch(claimedTicket.messageId).catch(() => null);
              if (!msg) {
                const fallback=new EmbedBuilder().setTitle("Ticket").setDescription(`Ticket claimato da <@${interaction.user.id}>`)
                  .setColor("#6f4e37");
                await interaction.channel
                  .send({ embeds: [fallback], components: [claimedButtons] })
                  .catch(() => {});
              } else {
                const embedDaUsare=msg.embeds&&msg.embeds[0]?EmbedBuilder.from(msg.embeds[0]):new EmbedBuilder().setTitle("Ticket").setDescription(`Ticket claimato da <@${interaction.user.id}>`,
                        )
                        .setColor("#6f4e37");
                await msg
                  .edit({ embeds: [embedDaUsare], components: [claimedButtons] })
                  .catch((err) => global.logger.error(err));
              }
            }
          } catch (err) {
            global.logger.error(err);
          }
          await safeReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Ticket Claimato")
                .setDescription(
                  `Ticket preso in carico da <@${claimedTicket.claimedBy}>`,
                )
                .setColor("#6f4e37"),
            ],
          });
          return true;
        } finally {
          releaseTicketActionLock(claimLockKey);
        }
      }
      if (interaction.customId === "unclaim") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const unclaimLockKey = await acquireTicketActionLock("claim_state");
        if (!unclaimLockKey) return true;
        try {
          const ticketButtonsOriginal=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi Con Motivo").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim").setStyle(ButtonStyle.Success),);
          const ticketDoc = await runtimeFindTicketByChannel(interaction.channel.id);
          if (!ticketDoc) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Questo non è un ticket valido.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (!runtimeHasActiveTicketClaimer(ticketDoc)) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Questo ticket non è claimato.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (ticketDoc.userId === interaction.user.id) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Chi ha aperto il ticket non può usare questo pulsante.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (interaction.user.id !== ticketDoc.claimedBy && !isHighStaffActor()) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const unclaimQuery=isHighStaffActor()?{channelId:interaction.channel.id}:{channelId:interaction.channel.id,claimedBy:interaction.user.id};
          const unclaimedTicket=await Ticket.findOneAndUpdate(unclaimQuery,{$set:{claimedBy:null}},{new:true},).catch(() => null);
          if (!unclaimedTicket) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          try {
            if (interaction.channel && unclaimedTicket.messageId) {
              const msg=await interaction.channel.messages.fetch(unclaimedTicket.messageId).catch(() => null);
              if (!msg) {
                const fallback=new EmbedBuilder().setTitle("Ticket").setDescription("Ticket non claimato").setColor("#6f4e37");
                await interaction.channel
                  .send({
                    embeds: [fallback],
                    components: [ticketButtonsOriginal],
                  })
                  .catch(() => {});
              } else {
                const embedUsato=msg.embeds&&msg.embeds[0]?EmbedBuilder.from(msg.embeds[0]):new EmbedBuilder().setTitle("Ticket").setDescription("Ticket non claimato").setColor("#6f4e37");
                await msg
                  .edit({
                    embeds: [embedUsato],
                    components: [ticketButtonsOriginal],
                  })
                  .catch(() => {});
              }
            }
          } catch (err) {
            global.logger.error(err);
          }
          await safeReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Ticket Unclaimato")
                .setDescription(
                  `Il ticket non è più gestito da <@${interaction.user.id}>`,
                )
                .setColor("#6f4e37"),
            ],
          });
          return true;
        } finally {
          releaseTicketActionLock(unclaimLockKey);
        }
      }
      if (interaction.customId === "close_ticket_motivo") {
        if (!interaction.member) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione non valida",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel?.id,missingDescription:"<:vegax:1443934876440068179> Ticket non trovato",});
        if (!ticketDoc) return true;
        const canClose=await runtimeEnsureClosableTicketOrReply({interaction,safeReply,makeErrorEmbed,ticketDoc,highStaff:isHighStaffActor(),});
        if (!canClose) return true;
        const modal=new ModalBuilder().setCustomId(`modal_close_ticket:${interaction.user.id}`)
          .setTitle("Chiudi Ticket con Motivo");
        const input=new TextInputBuilder().setCustomId("motivo").setLabel("Motivo della chiusura").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        const shown=await interaction.showModal(modal).then(() => true).catch((err) => {global.logger.error(err);return false;});
        if (!shown) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
              ),
            ],
            flags: 1 << 6,
          });
        }
        return true;
      }
      if (interaction.customId === "close_ticket") {
        if (!interaction.member) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione non valida",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel?.id,missingDescription:"<:vegax:1443934876440068179> Ticket non trovato",});
        if (!ticketDoc) return true;
        const canClose=await runtimeEnsureClosableTicketOrReply({interaction,safeReply,makeErrorEmbed,ticketDoc,highStaff:isHighStaffActor(),});
        if (!canClose) return true;
        try {
          await interaction
            .deferReply({ flags: 1 << 6 })
            .catch(() => {})
            .catch(() => {});
        } catch {}
        await runtimeCloseTicket(interaction, null, {
          safeReply,
          safeEditReply,
          makeErrorEmbed,
          LOG_CHANNEL,
        });
        return true;
      }
      if (interaction.customId === "accetta") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel.id,missingDescription:"<:vegax:1443934876440068179> Non puoi chiudere questo ticket",});
        if (!ticketDoc) return true;
        const canHandleCloseRequest=runtimeCanUserHandleCloseRequest(ticketDoc,interaction.user.id,isHighStaffActor(),);
        if (!canHandleCloseRequest) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo opener o claimer possono gestire questa richiesta.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        try {
          await interaction
            .deferReply({ flags: 1 << 6 })
            .catch(() => {})
            .catch(() => {});
        } catch {}
        const motivo = ticketDoc.closeReason || "Nessun motivo inserito";
        await runtimeCloseTicket(interaction, motivo, {
          safeReply,
          safeEditReply,
          makeErrorEmbed,
          LOG_CHANNEL,
          closedById: ticketDoc.closeRequestedBy || interaction.user.id,
        });
        return true;
      }
      if (interaction.customId === "rifiuta") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel.id,missingDescription:"<:vegax:1443934876440068179> Non puoi chiudere questo ticket",});
        if (!ticketDoc) return true;
        const canHandleCloseRequest=runtimeCanUserHandleCloseRequest(ticketDoc,interaction.user.id,isHighStaffActor(),);
        if (!canHandleCloseRequest) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo opener o claimer possono gestire questa richiesta.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        await interaction
          .update({
            embeds: [
              new EmbedBuilder()
                .setTitle("Richiesta di chiusura")
                .setDescription(
                  `<:vegax:1443934876440068179> ${interaction.user} ha rifiutato la richiesta di chiusura`,
                )
                .setColor("Red"),
            ],
            components: [],
          })
          .catch(() => {});
        await Ticket.updateOne(
          { _id: ticketDoc._id },
          {
            $set: {
              closeReason: null,
              closeRequestedBy: null,
              closeRequestedAt: null,
            },
          },
        ).catch(() => {});
        return true;
      }
      if (
        interaction.customId === "ticket_autoclose_accept" ||
        interaction.customId === "ticket_autoclose_reject"
      ) {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const autoCloseLockKey = await acquireTicketActionLock("auto_close_prompt");
        if (!autoCloseLockKey) return true;
        try {
          const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel.id,missingDescription:"<:vegax:1443934876440068179> Non puoi gestire questo ticket",});
          if (!ticketDoc) return true;
          const canHandleAutoClosePrompt=runtimeCanUserHandleCloseRequest(ticketDoc,interaction.user.id,isHighStaffActor(),);
          if (!canHandleAutoClosePrompt) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo opener o claimer possono gestire questa richiesta automatica.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }

          if (interaction.customId === "ticket_autoclose_accept") {
            try {
              await interaction
                .deferReply({ flags: 1 << 6 })
                .catch(() => {})
                .catch(() => {});
            } catch {}
            const motivo=ticketDoc.closeReason||"Chiusura proposta automaticamente dopo 24h.";
            await runtimeCloseTicket(interaction, motivo, {
              safeReply,
              safeEditReply,
              makeErrorEmbed,
              LOG_CHANNEL,
              closedById: interaction.user.id,
            });
            return true;
          }

          await interaction
            .update({
              embeds: [
                new EmbedBuilder()
                  .setTitle("Richiesta di chiusura")
                  .setDescription(
                    `<:vegax:1443934876440068179> ${interaction.user} ha rifiutato la richiesta automatica di chiusura`,
                  )
                  .setColor("Red"),
              ],
              components: [],
            })
            .catch(() => {});
          await Ticket.updateOne(
            { _id: ticketDoc._id },
            {
              $set: {
                closeReason: null,
                closeRequestedBy: null,
                closeRequestedAt: null,
              },
            },
          ).catch(() => {});
          return true;
        } finally {
          releaseTicketActionLock(autoCloseLockKey);
        }
      }
    }
    if (
      isTicketModal &&
      String(interaction.customId || "").startsWith("modal_close_ticket")
    ) {
      try {
        await interaction
          .deferReply({ flags: 1 << 6 })
          .catch(() => {})
          .catch(() => {});
      } catch {}
      const ticketDoc=await runtimeLoadTicketForChannelOrReply({interaction,safeReply,makeErrorEmbed,channelId:interaction.channel?.id,missingDescription:"<:vegax:1443934876440068179> Ticket non trovato",});
      if (!ticketDoc) return true;
      const canClose=await runtimeEnsureClosableTicketOrReply({interaction,safeReply,makeErrorEmbed,ticketDoc,highStaff:isHighStaffActor(),});
      if (!canClose) return true;
      let motivo = null;
      try {
        motivo = interaction.fields.getTextInputValue("motivo")?.trim() || null;
      } catch (_) {}
      if (!motivo && interaction.fields?.fields) {
        const first = interaction.fields.fields.first();
        if (first?.value) motivo = String(first.value).trim() || null;
      }
      await runtimeCloseTicket(interaction, motivo, {
        safeReply,
        safeEditReply,
        makeErrorEmbed,
        LOG_CHANNEL,
      });
      return true;
    }
  } catch (err) {
    global.logger.error(err);
    try {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "Errore Interno",
            "<:vegax:1443934876440068179> Si è verificato un errore durante l'elaborazione.",
          ),
        ],
        flags: 1 << 6,
      }).catch(() => {});
    } catch (e) {
      global.logger.info(e);
    }
  }
  return true;
}

module.exports = { handleTicketInteraction };