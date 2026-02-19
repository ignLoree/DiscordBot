const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml,
} = require("../../Utils/Ticket/transcriptUtils");
const fs = require("fs");
const { getNextTicketId } = require("../../Utils/Ticket/ticketIdUtils");
const {
  TICKETS_CATEGORY_NAME,
} = require("../../Utils/Ticket/ticketCategoryUtils");
const {
  safeReply: safeReplyHelper,
  safeEditReply: safeEditReplyHelper,
} = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");

const HANDLED_TICKET_BUTTONS = new Set([
  "ticket_supporto",
  "ticket_open_desc_modal",
  "claim_ticket",
  "close_ticket",
  "close_ticket_motivo",
  "accetta",
  "rifiuta",
  "unclaim",
]);

function isTicketRatingButton(customId) {
  return String(customId || "").startsWith("ticket_rate:");
}

function isTicketTranscriptButton(customId) {
  return String(customId || "").startsWith("ticket_transcript:");
}

const HANDLED_TICKET_SELECT_MENUS = new Set(["ticket_open_menu"]);
const DISABLED_TICKET_OPEN_ACTIONS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
]);

function isHandledTicketModalId(id) {
  return (
    id === "modal_close_ticket" ||
    id.startsWith("modal_close_ticket:") ||
    id === "ticket_open_desc_modal_submit" ||
    id.startsWith("ticket_open_desc_modal_submit:")
  );
}

function getSelectedTicketAction(interaction) {
  if (!interaction.isStringSelectMenu || !interaction.isStringSelectMenu())
    return null;
  if (!HANDLED_TICKET_SELECT_MENUS.has(interaction.customId)) return null;
  return interaction.values?.[0] || null;
}

function isHandledTicketInteraction(interaction) {
  const isTicketButton =
    interaction.isButton &&
    interaction.isButton() &&
    (HANDLED_TICKET_BUTTONS.has(interaction.customId) ||
      isTicketRatingButton(interaction.customId) ||
      isTicketTranscriptButton(interaction.customId));
  const isTicketSelect =
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    HANDLED_TICKET_SELECT_MENUS.has(interaction.customId);
  const isTicketModal =
    interaction.isModalSubmit &&
    interaction.isModalSubmit() &&
    isHandledTicketModalId(String(interaction.customId || ""));
  return { isTicketButton, isTicketSelect, isTicketModal };
}

function getSponsorGuildIds() {
  return [
    IDs.guilds.luna,
    IDs.guilds.cash,
    IDs.guilds.porn,
    IDs.guilds[69],
    IDs.guilds.weed,
    IDs.guilds.figa,
  ].filter(Boolean);
}

function isSponsorGuild(guildId) {
  if (!guildId) return false;
  return getSponsorGuildIds().includes(guildId);
}

async function handleTicketInteraction(interaction) {
  const selectedTicketAction = getSelectedTicketAction(interaction);
  const ticketActionId = selectedTicketAction || interaction.customId;

  const { isTicketButton, isTicketSelect, isTicketModal } =
    isHandledTicketInteraction(interaction);
  if (!isTicketButton && !isTicketModal && !isTicketSelect) return false;

  if (DISABLED_TICKET_OPEN_ACTIONS.has(ticketActionId)) {
    await interaction
      .reply({
        content:
          "<:vegax:1472992044140990526> Sul bot test è attiva solo la categoria **supporto**.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (interaction.guild && isSponsorGuild(interaction.guild.id)) {
    return false;
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
  const TICKET_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
  ];

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

  function buildTicketTranscriptRows(ticketId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_transcript:${ticketId}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel("View Transcript")
          .setEmoji("📁"),
      ),
    ];
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

    // Keep temporal fields grouped in the same row after actor fields.
    const reordered = [
      embed.data.fields?.[0], // Ticket ID
      embed.data.fields?.[1], // Opened By
      embed.data.fields?.[2], // Closed By
      embed.data.fields?.[3], // Open Time
      embed.data.fields?.[5], // Close Time
      embed.data.fields?.[4], // Claimed By
      embed.data.fields?.[6], // Reason
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

  function normalizeCategoryName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[・`'".,;:!?\-_=+()[\]{}|/\\]/g, "");
  }

  function isTicketCategoryName(name) {
    const normalized = normalizeCategoryName(name);
    return normalized.includes("tickets");
  }

  function sanitizeTicketDescriptionInput(value) {
    let text = String(value || "");
    text = text
      .replace(/^```(?:[a-zA-Z0-9_-]+)?\n?/i, "")
      .replace(/```$/i, "")
      .replace(/<@!?\d+>/g, "")
      .replace(/<@&\d+>/g, "")
      .replace(/<#\d+>/g, "")
      .replace(/@everyone|@here/gi, "")
      .replace(
        /https?:\/\/(?!discord(?:app)?\.com\/invite\/|discord\.gg\/)\S+/gi,
        "",
      );

    const normalizedLines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(
        (line, index, arr) =>
          line.length > 0 || (index > 0 && arr[index - 1]?.length > 0),
      );

    return normalizedLines.join("\n").trim();
  }

  async function createTicketsCategory(guild) {
    if (!guild) return null;
    if (!interaction.client.ticketCategoryCache) {
      interaction.client.ticketCategoryCache = new Map();
    }
    const getTopCategoryPosition = () => 0;
    const moveCategoryToTop = async (category) => {
      if (!category || category.type !== 4) return;
      const topPos = getTopCategoryPosition();
      await category.setPosition(topPos).catch(() => {});
    };
    const getChildrenCount = (categoryId) =>
      guild.channels.cache.filter((ch) => ch.parentId === categoryId).size;

    const cachedCategoryId = interaction.client.ticketCategoryCache.get(
      guild.id,
    );
    if (cachedCategoryId) {
      const cachedCategory =
        guild.channels.cache.get(cachedCategoryId) ||
        (await guild.channels.fetch(cachedCategoryId).catch(() => null));
      if (cachedCategory && cachedCategory.type === 4) {
        if (isTicketCategoryName(cachedCategory.name)) {
          const isFull = getChildrenCount(cachedCategory.id) >= 50;
          if (!isFull) {
            await moveCategoryToTop(cachedCategory);
            return cachedCategory;
          }
        }
      }
    }

    await guild.channels.fetch().catch(() => null);
      const ticketCategories = guild.channels.cache
      .filter((ch) => ch.type === 4 && isTicketCategoryName(ch.name))
      .sort(
        (a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id),
      );

    const exactCategory = ticketCategories.find(
      (ch) => ch.name === TICKETS_CATEGORY_NAME,
    );
    if (exactCategory) {
      if (getChildrenCount(exactCategory.id) < 50) {
        await moveCategoryToTop(exactCategory);
        interaction.client.ticketCategoryCache.set(guild.id, exactCategory.id);
        return exactCategory;
      }
    } else if (ticketCategories.length > 0) {
      const firstTicketCategory = ticketCategories[0];
      if (firstTicketCategory.name !== TICKETS_CATEGORY_NAME) {
        const nameAlreadyUsed = guild.channels.cache.some(
          (ch) =>
            ch.type === 4 &&
            ch.id !== firstTicketCategory.id &&
            ch.name === TICKETS_CATEGORY_NAME,
        );
        if (!nameAlreadyUsed) {
          await firstTicketCategory
            .setName(TICKETS_CATEGORY_NAME)
            .catch(() => {});
        }
      }
      if (getChildrenCount(firstTicketCategory.id) < 50) {
        await moveCategoryToTop(firstTicketCategory);
        interaction.client.ticketCategoryCache.set(
          guild.id,
          firstTicketCategory.id,
        );
        return firstTicketCategory;
      }
      return null;
    }

    const existingWithExactName = guild.channels.cache.find(
      (ch) => ch.type === 4 && ch.name === TICKETS_CATEGORY_NAME,
    );
    if (
      existingWithExactName &&
      getChildrenCount(existingWithExactName.id) < 50
    ) {
      await moveCategoryToTop(existingWithExactName);
      interaction.client.ticketCategoryCache.set(
        guild.id,
        existingWithExactName.id,
      );
      return existingWithExactName;
    }
    const category = await guild.channels
      .create({
        name: TICKETS_CATEGORY_NAME,
        position: getTopCategoryPosition(),
        type: 4,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      })
      .catch(() => null);
    if (!category) return null;
    await moveCategoryToTop(category);
    interaction.client.ticketCategoryCache.set(guild.id, category.id);
    return category;
  }

  try {
    if (isTicketButton || isTicketSelect) {
      if (!interaction.guild || !interaction.member) {
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
      const ticketOpenButtons = [
        "ticket_partnership",
        "ticket_supporto",
        "ticket_highstaff",
      ];
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
      const userOnlyTickets = [
        "ticket_partnership",
        "ticket_highstaff",
        "ticket_supporto",
      ];
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
      const ticketConfig = {
        ticket_supporto: {
          type: "supporto",
          emoji: "⭐",
          name: "supporto",
          role: ROLE_STAFF,
          requiredRoles: ROLE_USER ? [ROLE_USER] : [],
          embed: new EmbedBuilder()
            .setTitle(
              "<:vsl_ticket:1329520261053022208> • **__TICKET SUPPORTO__**",
            )
            .setDescription(
              `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`,
            )
            .setColor("#6f4e37"),
        },
        ticket_partnership: {
          type: "partnership",
          emoji: "🤝",
          name: "partnership",
          role: ROLE_PARTNERMANAGER,
          requiredRoles: [ROLE_USER],
          embed: new EmbedBuilder()
            .setTitle(
              "<:vsl_ticket:1329520261053022208> • **__TICKET PARTNERSHIP__**",
            )
            .setDescription(
              `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Manda la tua descrizione tramite il bottone nel messaggio qui sotto.`,
            )
            .setColor("#6f4e37"),
        },
        ticket_highstaff: {
          type: "high",
          emoji: "✨",
          name: "highstaff",
          role: ROLE_HIGHSTAFF,
          requiredRoles: [ROLE_USER],
          embed: new EmbedBuilder()
            .setTitle(
              "<:vsl_ticket:1329520261053022208> • **__TICKET HIGH STAFF__**",
            )
            .setDescription(
              `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Verifica Selfie, Donazioni, Sponsor o HighStaff.`,
            )
            .setColor("#6f4e37"),
        },
      };
      const config = ticketConfig[ticketActionId];
      if (
        !config &&
        ![
          "claim_ticket",
          "close_ticket",
          "close_ticket_motivo",
          "accetta",
          "rifiuta",
          "unclaim",
          "ticket_open_desc_modal",
        ].includes(interaction.customId) &&
        !isTicketTranscriptButton(interaction.customId) &&
        !isTicketRatingButton(interaction.customId)
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
            const hasRole = config.requiredRoles.some((r) =>
              interaction.member?.roles?.cache?.has(r),
            );
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
          const existing = await Ticket.findOne({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            open: true,
          });
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
          const ticketsCategory = await createTicketsCategory(
            interaction.guild,
          );
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
          const existingBeforeCreate = await Ticket.findOne({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            open: true,
          }).catch(() => null);
          if (existingBeforeCreate) {
            await safeEditReply(interaction, {
              embeds: [
                new EmbedBuilder()
                  .setTitle("Ticket Aperto")
                  .setDescription(
                    `<:vegax:1443934876440068179> Hai già un ticket aperto: <#${existingBeforeCreate.channelId}>`,
                  )
                  .setColor("#6f4e37"),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const channel = await interaction.guild.channels
            .create({
              name: `༄${config.emoji}︲${config.name}᲼${interaction.user.username}`,
              type: 0,
              parent: ticketsCategory.id,
              permissionOverwrites: [
                {
                  id: interaction.guild.roles.everyone,
                  deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                  id: interaction.user.id,
                  allow: TICKET_PERMISSIONS,
                },
                ...(config.type === "supporto"
                  ? [
                      {
                        id: ROLE_STAFF,
                        allow: TICKET_PERMISSIONS,
                      },
                      {
                        id: ROLE_HIGHSTAFF,
                        allow: TICKET_PERMISSIONS,
                      },
                      {
                        id: ROLE_PARTNERMANAGER,
                        deny: [PermissionFlagsBits.ViewChannel],
                      },
                    ]
                  : []),
                ...(config.type === "partnership"
                  ? [
                      {
                        id: ROLE_PARTNERMANAGER,
                        allow: TICKET_PERMISSIONS,
                      },
                      {
                        id: ROLE_HIGHSTAFF,
                        allow: [
                          PermissionFlagsBits.ViewChannel,
                          PermissionFlagsBits.SendMessages,
                          PermissionFlagsBits.ReadMessageHistory,
                        ],
                        deny: [],
                      },
                      {
                        id: ROLE_STAFF,
                        deny: [PermissionFlagsBits.ViewChannel],
                      },
                    ]
                  : []),
                ...(config.type === "high"
                  ? [
                      {
                        id: ROLE_HIGHSTAFF,
                        allow: TICKET_PERMISSIONS,
                      },
                      {
                        id: ROLE_STAFF,
                        deny: [PermissionFlagsBits.ViewChannel],
                      },
                      {
                        id: ROLE_PARTNERMANAGER,
                        deny: [PermissionFlagsBits.ViewChannel],
                      },
                    ]
                  : []),
              ],
            })
            .catch((err) => {
              global.logger.error(err);
              return null;
            });
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
            .catch((err) => {
              global.logger.error(err);
              return null;
            });
          if (mainMsg) {
            await pinFirstTicketMessage(channel, mainMsg);
          }
          const existingAgain = await Ticket.findOne({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            open: true,
          });
          if (existingAgain) {
            await channel.delete().catch(() => {});
            await safeEditReply(interaction, {
              embeds: [
                new EmbedBuilder()
                  .setTitle("Ticket Aperto")
                  .setDescription(
                    `<:vegax:1443934876440068179> Hai già un ticket aperto: <#${existingAgain.channelId}>`,
                  )
                  .setColor("#6f4e37"),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          let descriptionPrompt = null;
          if (config.type === "partnership") {
            const descriptionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("ticket_open_desc_modal")
                .setLabel("📝 Invia Descrizione")
                .setStyle(ButtonStyle.Primary),
            );
            descriptionPrompt = await channel
              .send({
                content: `<@${interaction.user.id}> usa il pulsante qui sotto per inviare la descrizione.`,
                components: [descriptionRow],
              })
              .catch(() => null);
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
              descriptionPromptMessageId: descriptionPrompt?.id || null,
              descriptionSubmitted: false,
            });
            ticketCreated = true;
          } catch (err) {
            const isDuplicate =
              err?.code === 11000 ||
              (err?.message && String(err.message).includes("E11000"));
            if (isDuplicate) {
              await channel.delete().catch(() => {});
              const other = await Ticket.findOne({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                open: true,
              }).catch(() => null);
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
          const mentionMsg = await channel
            .send(
              `<@${interaction.user.id}> ${tagRole ? `<@&${tagRole}>` : ""}`,
            )
            .catch(() => null);
          if (mentionMsg) {
            setTimeout(() => {
              mentionMsg.delete().catch(() => {});
            }, 100);
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
      if (isTicketRatingButton(interaction.customId)) {
        const [, ticketDbId, scoreRaw] = String(interaction.customId).split(":");
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

        const ratedTicket = await Ticket.findOneAndUpdate(
          { _id: ticketDbId, ratingScore: null },
          {
            $set: {
              ratingScore: score,
              ratingBy: interaction.user.id,
              ratingAt: new Date(),
            },
          },
          { new: true },
        ).catch(() => null);

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
          const logChannel = await interaction.client.channels
            .fetch(ratedTicket.closeLogChannelId)
            .catch(() => null);
          if (logChannel?.isTextBased?.()) {
            const logMessage = await logChannel.messages
              .fetch(ratedTicket.closeLogMessageId)
              .catch(() => null);
            if (logMessage) {
              const updatedEmbed = buildTicketClosedEmbed({
                ...ratedTicket.toObject(),
                guildName:
                  interaction.guild?.name ||
                  interaction.client.guilds.cache.get(ratedTicket.guildId)?.name ||
                  "Ticket System",
                guildIconURL:
                  interaction.guild?.iconURL?.({ size: 128 }) || null,
              });
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
      if (isTicketTranscriptButton(interaction.customId)) {
        const [, ticketDbId] = String(interaction.customId).split(":");
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

        const isOwner =
          String(ticketDoc.userId || "") === String(interaction.user?.id || "");
        const hasStaffRole =
          Boolean(interaction.member?.roles?.cache?.has(ROLE_STAFF)) ||
          Boolean(interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF)) ||
          Boolean(interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER));
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
        const ticket = await Ticket.findOne({
          channelId: interaction.channel.id,
        });
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
        const canClaimSupport =
          ticket.ticketType === "supporto" &&
          STAFF_ROLES.some((r) => interaction.member?.roles?.cache?.has(r));
        const canClaimPartnership =
          ticket.ticketType === "partnership" &&
          (interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER) ||
            interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF));
        const canClaimHigh =
          ticket.ticketType === "high" &&
          interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
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
        const claimedByVal =
          ticket.claimedBy != null ? String(ticket.claimedBy).trim() : "";
        if (claimedByVal !== "") {
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
          {
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
          claimedTicket = await Ticket.findOne({
            channelId: interaction.channel.id,
          }).catch(() => null);
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
          const nowClaimed =
            claimedTicket.claimedBy != null
              ? String(claimedTicket.claimedBy).trim()
              : "";
          if (nowClaimed !== "") {
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
          const updated = await Ticket.updateOne(
            {
              channelId: interaction.channel.id,
              $or: [
                { claimedBy: null },
                { claimedBy: "" },
                { claimedBy: { $exists: false } },
              ],
            },
            { $set: { claimedBy: interaction.user.id } },
          ).catch(() => null);
          if (!updated?.modifiedCount) {
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
          claimedTicket = await Ticket.findOne({
            channelId: interaction.channel.id,
          }).catch(() => null);
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
        const claimedButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("🔒 Chiudi")
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
        try {
          if (interaction.channel && claimedTicket.messageId) {
            const msg = await interaction.channel.messages
              .fetch(claimedTicket.messageId)
              .catch(() => null);
            if (!msg) {
              const fallback = new EmbedBuilder()
                .setTitle("Ticket")
                .setDescription(`Ticket claimato da <@${interaction.user.id}>`)
                .setColor("#6f4e37");
              await interaction.channel
                .send({ embeds: [fallback], components: [claimedButtons] })
                .catch(() => {});
            } else {
              const embedDaUsare =
                msg.embeds && msg.embeds[0]
                  ? EmbedBuilder.from(msg.embeds[0])
                  : new EmbedBuilder()
                      .setTitle("Ticket")
                      .setDescription(
                        `Ticket claimato da <@${interaction.user.id}>`,
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
      }
      if (interaction.customId === "ticket_open_desc_modal") {
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel.id,
        });
        if (!ticketDoc) {
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
        if (interaction.user.id !== ticketDoc.userId) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo chi ha aperto il ticket può inviare la descrizione.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        if (ticketDoc.descriptionSubmitted) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Hai già inviato la descrizione iniziale.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const modal = new ModalBuilder()
          .setCustomId(`ticket_open_desc_modal_submit:${interaction.user.id}`)
          .setTitle("Descrizione Ticket");
        const input = new TextInputBuilder()
          .setCustomId("ticket_description")
          .setLabel("Inserisci la descrizione")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(8)
          .setMaxLength(4000);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        const shown = await interaction
          .showModal(modal)
          .then(() => true)
          .catch((err) => {
            global.logger.error(err);
            return false;
          });
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
        const ticketButtonsOriginal = new ActionRowBuilder().addComponents(
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel.id,
        });
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
        if (!ticketDoc.claimedBy) {
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
        if (interaction.user.id !== ticketDoc.claimedBy) {
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
        const unclaimedTicket = await Ticket.findOneAndUpdate(
          { channelId: interaction.channel.id, claimedBy: interaction.user.id },
          { $set: { claimedBy: null } },
          { new: true },
        ).catch(() => null);
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
            const msg = await interaction.channel.messages
              .fetch(unclaimedTicket.messageId)
              .catch(() => null);
            if (!msg) {
              const fallback = new EmbedBuilder()
                .setTitle("Ticket")
                .setDescription("Ticket non claimato")
                .setColor("#6f4e37");
              await interaction.channel
                .send({
                  embeds: [fallback],
                  components: [ticketButtonsOriginal],
                })
                .catch(() => {});
            } else {
              const embedUsato =
                msg.embeds && msg.embeds[0]
                  ? EmbedBuilder.from(msg.embeds[0])
                  : new EmbedBuilder()
                      .setTitle("Ticket")
                      .setDescription("Ticket non claimato")
                      .setColor("#6f4e37");
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel?.id,
        });
        if (!ticketDoc) {
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
        if (ticketDoc && ticketDoc.userId === interaction.user.id) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        if (!ticketDoc.claimedBy) {
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
        if (ticketDoc.claimedBy !== interaction.user.id) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const modal = new ModalBuilder()
          .setCustomId(`modal_close_ticket:${interaction.user.id}`)
          .setTitle("Chiudi Ticket con Motivo");
        const input = new TextInputBuilder()
          .setCustomId("motivo")
          .setLabel("Motivo della chiusura")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        const shown = await interaction
          .showModal(modal)
          .then(() => true)
          .catch((err) => {
            global.logger.error(err);
            return false;
          });
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel?.id,
        });
        if (!ticketDoc) {
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
        if (ticketDoc && ticketDoc.userId === interaction.user.id) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        if (!ticketDoc.claimedBy) {
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
        if (ticketDoc.claimedBy !== interaction.user.id) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.",
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
        await closeTicket(interaction, null, {
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel.id,
        });
        if (!ticketDoc) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Non puoi chiudere questo ticket",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const canHandleCloseRequest =
          interaction.user.id === ticketDoc.userId ||
          interaction.user.id === ticketDoc.claimedBy;
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
        await closeTicket(interaction, motivo, {
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
        const ticketDoc = await Ticket.findOne({
          channelId: interaction.channel.id,
        });
        if (!ticketDoc) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Non puoi chiudere questo ticket",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const canHandleCloseRequest =
          interaction.user.id === ticketDoc.userId ||
          interaction.user.id === ticketDoc.claimedBy;
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
    }
    if (
      isTicketModal &&
      String(interaction.customId || "").startsWith(
        "ticket_open_desc_modal_submit",
      )
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
      try {
        await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
      } catch {}
      const rawDescription = interaction.fields
        .getTextInputValue("ticket_description")
        ?.trim();
      const description = sanitizeTicketDescriptionInput(rawDescription);
      const ticketDoc = await Ticket.findOne({
        channelId: interaction.channel.id,
      });
      if (!ticketDoc) {
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
      if (interaction.user.id !== ticketDoc.userId) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Solo chi ha aperto il ticket può inviare la descrizione.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (!description) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Dopo il filtro non c'è testo valido da inviare.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const updatedTicket = await Ticket.findOneAndUpdate(
        {
          channelId: interaction.channel.id,
          descriptionSubmitted: { $ne: true },
        },
        {
          $set: {
            descriptionSubmitted: true,
            descriptionText: description,
            descriptionSubmittedAt: new Date(),
          },
        },
        { new: true },
      ).catch(() => null);
      if (!updatedTicket) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> La descrizione è già stata inviata.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }

      const chunks = [];
      const managerFooter = `\n\nManager: <@${interaction.user.id}>`;
      const maxChunkLen = 1900;
      for (let i = 0; i < description.length; i += maxChunkLen) {
        chunks.push(description.slice(i, i + maxChunkLen));
      }
      if (chunks.length === 0) chunks.push(description);
      if (chunks.length > 0) {
        for (let i = 0; i < chunks.length; i += 1) {
          const isLast = i === chunks.length - 1;
          const content = isLast ? `${chunks[i]}${managerFooter}` : chunks[i];
          await interaction.channel.send({ content }).catch(() => {});
        }
      }

      const promptId =
        updatedTicket.descriptionPromptMessageId ||
        ticketDoc.descriptionPromptMessageId ||
        null;
      if (promptId) {
        const promptMessage = await interaction.channel.messages
          .fetch(promptId)
          .catch(() => null);
        if (promptMessage) {
          await promptMessage.delete().catch(() => {});
        }
      }
      await interaction.deleteReply().catch(() => {});
      return true;
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
      const ticketDoc = await Ticket.findOne({
        channelId: interaction.channel?.id,
      });
      if (!ticketDoc) {
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
      if (ticketDoc.userId === interaction.user.id) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (!ticketDoc.claimedBy) {
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
      if (ticketDoc.claimedBy !== interaction.user.id) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      let motivo = null;
      try {
        motivo = interaction.fields.getTextInputValue("motivo")?.trim() || null;
      } catch (_) {}
      if (!motivo && interaction.fields?.fields) {
        const first = interaction.fields.fields.first();
        if (first?.value) motivo = String(first.value).trim() || null;
      }
      await closeTicket(interaction, motivo, {
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
  async function closeTicket(targetInteraction, motivo, helpers) {
    const {
      safeReply,
      safeEditReply,
      makeErrorEmbed,
      LOG_CHANNEL,
      closedById = null,
    } = helpers;
    const closedByUserId =
      String(closedById || "").trim() || targetInteraction.user?.id || null;
    const closeLockKey = `${targetInteraction?.guildId || "noguild"}:${targetInteraction?.channelId || targetInteraction?.channel?.id || "nochannel"}`;
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
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Interazione non valida",
            ),
          ],
          flags: 1 << 6,
        });
        return;
      }

      const ticket = await Ticket.findOneAndUpdate(
        { channelId: targetInteraction.channel.id, open: true },
        {
          $set: {
            open: false,
            closedAt: new Date(),
            closedBy: closedByUserId,
          },
        },
        { new: true },
      );
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
      const transcriptTXT = await createTranscript(
        targetInteraction.channel,
      ).catch(() => "");
      const transcriptHTML = await createTranscriptHtml(
        targetInteraction.channel,
      ).catch(() => "");
      const transcriptHtmlPath = transcriptHTML
        ? await saveTranscriptHtml(
            targetInteraction.channel,
            transcriptHTML,
          ).catch(() => null)
        : null;
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
      const mainLogChannelId = IDs?.channels?.ticketLogs || LOG_CHANNEL;

      const mainGuild = mainGuildId
        ? targetInteraction.client.guilds.cache.get(mainGuildId) ||
          (await targetInteraction.client.guilds
            .fetch(mainGuildId)
            .catch(() => null))
        : null;

      const logChannel =
        mainGuild?.channels?.cache?.get(mainLogChannelId) ||
        (mainGuild
          ? await mainGuild.channels.fetch(mainLogChannelId).catch(() => null)
          : null) ||
        targetInteraction.guild?.channels?.cache?.get(LOG_CHANNEL) ||
        (await targetInteraction.guild?.channels
          ?.fetch(LOG_CHANNEL)
          .catch(() => null));

      const closeEmbedData = {
        ...ticket.toObject(),
        ticketNumber,
        closeReason: motivo || null,
        closedBy: closedByUserId,
        closedAt: new Date(),
        guildName: targetInteraction.guild?.name || "Ticket System",
        guildIconURL: targetInteraction.guild?.iconURL?.({ size: 128 }) || null,
      };
      const closeEmbed = buildTicketClosedEmbed(closeEmbedData);
      const ratingRows = buildTicketRatingRows(String(ticket._id));
      const htmlAttachment = transcriptHtmlPath
        ? [
            {
              attachment: transcriptHtmlPath,
              name: `transcript_ticket_${ticketNumber || ticket._id}.html`,
            },
          ]
        : [];

      let logSentMessage = null;
      if (logChannel?.isTextBased?.()) {
        logSentMessage = await sendTranscriptWithBrowserLink(
          logChannel,
          {
            embeds: [closeEmbed],
            files: htmlAttachment,
          },
          Boolean(transcriptHtmlPath),
          [],
        );
      }
      const dmActionRows = [...ratingRows];
      const member = await targetInteraction.guild.members
        .fetch(ticket.userId)
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
          if (err.code !== 50007) {
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
      setTimeout(() => {
        if (targetInteraction.channel)
          targetInteraction.channel.delete().catch(() => {});
      }, 2000);
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
}

module.exports = { handleTicketInteraction };


