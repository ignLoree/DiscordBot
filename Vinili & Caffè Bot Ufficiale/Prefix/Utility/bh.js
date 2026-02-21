const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const BirthdayProfile = require("../../Schemas/Community/birthdayProfileSchema");
const {
  inferBirthYearFromAge,
  getRomeDateParts,
} = require("../../Services/Community/birthdayService");

const PRIVATE_FLAG = 1 << 6;
const PANEL_TIMEOUT_MS = 10 * 60 * 1000;
const INPUT_TIMEOUT_MS = 90 * 1000;
const REMOVE_CONFIRM_TIMEOUT_MS = 60 * 1000;
const BRAND_COLOR = "#6f4e37";

function daysInMonth(month) {
  if (month === 2) return 29;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function parseBirthdayDate(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(month)) return null;

  return { day, month };
}

function parseAge(rawValue) {
  const value = Number(String(rawValue || "").trim());
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 120) return null;
  return value;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateLabel(day, month) {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return "Non impostata";
  return `${pad2(day)}/${pad2(month)}`;
}

function formatAgeLabel(age) {
  if (!Number.isInteger(age)) return "Non impostata";
  return `${age} anni`;
}

function computeAgeNow(day, month, birthYear) {
  const today = getRomeDateParts(new Date());
  const hasBirthdayPassed =
    today.month > month || (today.month === month && today.day >= day);
  const raw = today.year - Number(birthYear) - (hasBirthdayPassed ? 0 : 1);
  return Math.max(1, raw);
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Birthday Hub")
    .setDescription("Gestisci il tuo compleanno e la privacy dell'età con i subcommand dedicati.")
    .addFields(
      { name: "+bh set", value: "Apre il pannello per creare il tuo profilo compleanno.", inline: false },
      { name: "+bh edit", value: "Riapre il pannello con i dati già salvati.", inline: false },
      { name: "+bh remove", value: "Rimuove il tuo profilo con conferma.", inline: false },
    )
    .setFooter({ text: "Formato data supportato: gg/mm" });
}

function buildPanelEmbed(user, state, mode = "set") {
  const modeLabel = mode === "edit" ? "Modifica profilo" : "Nuovo profilo";
  const privacyLabel = state.showAge ? "Visibile" : "Nascosta";

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`Birthday Hub • ${modeLabel}`)
    .setDescription(`${user}, configura il tuo compleanno usando i pulsanti qui sotto.`)
    .addFields(
      { name: "Data di nascita", value: formatDateLabel(state.day, state.month), inline: true },
      { name: "Età", value: formatAgeLabel(state.age), inline: true },
      { name: "Privacy età", value: privacyLabel, inline: true },
      {
        name: "Come funziona",
        value:
          "Alla mezzanotte del tuo compleanno il bot invierà il messaggio in chat e assegnerà il ruolo dedicato.",
        inline: false,
      },
    )
    .setFooter({ text: "Quando hai finito premi Salva profilo." });
}

function buildSavedEmbed(state) {
  const ageSummary = state.showAge
    ? `Età visibile: **${state.age}**`
    : "Età salvata con privacy attiva.";

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Profilo compleanno salvato")
    .setDescription(
      [
        `Data: **${formatDateLabel(state.day, state.month)}**`,
        ageSummary,
      ].join("\n"),
    );
}

function buildPanelRows(ownerId, nonce, showAge, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bh_date:${ownerId}:${nonce}`)
        .setLabel("Data")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_age:${ownerId}:${nonce}`)
        .setLabel("Età")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_privacy:${ownerId}:${nonce}`)
        .setLabel(showAge ? "Età visibile" : "Età nascosta")
        .setStyle(showAge ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bh_save:${ownerId}:${nonce}`)
        .setLabel("Salva profilo")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_cancel:${ownerId}:${nonce}`)
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

async function sendBirthSaveEmbed(client, guild, user, state) {
  const channelId = IDs.channels.birthday;
  if (!guild || !channelId) return;

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const ageLine =
    state.showAge && Number.isInteger(state.age)
      ? `Età impostata: **${state.age} anni**`
      : "Età impostata con privacy nascosta";

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Compleanno registrato")
    .setDescription(
      [
        `${user} hai impostato la tua data di nascita.`,
        "Ricorderò a tutti il giorno del tuo compleanno.",
      ].join("\n"),
    )
    .addFields(
      { name: "Data", value: formatDateLabel(state.day, state.month), inline: true },
      { name: "Privacy", value: state.showAge ? "Età visibile" : "Età nascosta", inline: true },
      { name: "Dettaglio", value: ageLine, inline: false },
    );

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function openBirthdayPanel(message, client, initialState = null, mode = "set") {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 9999)}`;
  const ownerId = message.author.id;
  const state = {
    day: Number.isInteger(initialState?.day) ? initialState.day : null,
    month: Number.isInteger(initialState?.month) ? initialState.month : null,
    age: Number.isInteger(initialState?.age) ? initialState.age : null,
    showAge:
      typeof initialState?.showAge === "boolean" ? initialState.showAge : true,
  };

  const panelMessage = await safeMessageReply(message, {
    embeds: [buildPanelEmbed(message.author, state, mode)],
    components: buildPanelRows(ownerId, nonce, state.showAge, false),
    allowedMentions: { repliedUser: false },
  });
  if (!panelMessage) return;

  let finished = false;
  const collector = panelMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PANEL_TIMEOUT_MS,
  });

  collector.on("collect", async (interaction) => {
    try {
      if (String(interaction.user?.id || "") !== ownerId) {
        await interaction
          .reply({
            content: "<:vegax:1443934876440068179> Non puoi usare questi pulsanti.",
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === `bh_date:${ownerId}:${nonce}`) {
        const modalId = `bh_modal_date:${ownerId}:${nonce}:${Date.now()}`;
        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle("Imposta data compleanno")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("bh_date_input")
                .setLabel("Data (gg/mm)")
                .setPlaceholder("21/02")
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );

        await interaction.showModal(modal).catch(async () => {
          await interaction
            .reply({
              content: "Non sono riuscito ad aprire il modulo per la data.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
        });

        const modalSubmit = await interaction
          .awaitModalSubmit({
            time: INPUT_TIMEOUT_MS,
            filter: (i) =>
              i.customId === modalId &&
              String(i.user?.id || "") === String(ownerId),
          })
          .catch(() => null);
        if (!modalSubmit) return;

        const rawDate = modalSubmit.fields.getTextInputValue("bh_date_input");
        const parsed = parseBirthdayDate(rawDate);
        if (!parsed) {
          await modalSubmit
            .reply({
              content: "Data non valida. Usa il formato `gg/mm` con un giorno reale.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
          return;
        }

        state.day = parsed.day;
        state.month = parsed.month;

        await panelMessage
          .edit({
            embeds: [buildPanelEmbed(message.author, state, mode)],
            components: buildPanelRows(ownerId, nonce, state.showAge, false),
          })
          .catch(() => {});

        await modalSubmit
          .reply({
            content: `Data impostata su **${formatDateLabel(state.day, state.month)}**.`,
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === `bh_age:${ownerId}:${nonce}`) {
        const modalId = `bh_modal_age:${ownerId}:${nonce}:${Date.now()}`;
        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle("Imposta età")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("bh_age_input")
                .setLabel("Età attuale (1-120)")
                .setPlaceholder("18")
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );

        await interaction.showModal(modal).catch(async () => {
          await interaction
            .reply({
              content: "Non sono riuscito ad aprire il modulo per l'età.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
        });

        const modalSubmit = await interaction
          .awaitModalSubmit({
            time: INPUT_TIMEOUT_MS,
            filter: (i) =>
              i.customId === modalId &&
              String(i.user?.id || "") === String(ownerId),
          })
          .catch(() => null);
        if (!modalSubmit) return;

        const rawAge = modalSubmit.fields.getTextInputValue("bh_age_input");
        const age = parseAge(rawAge);
        if (!Number.isInteger(age)) {
          await modalSubmit
            .reply({
              content: "Età non valida. Inserisci un numero tra 1 e 120.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
          return;
        }

        state.age = age;

        await panelMessage
          .edit({
            embeds: [buildPanelEmbed(message.author, state, mode)],
            components: buildPanelRows(ownerId, nonce, state.showAge, false),
          })
          .catch(() => {});

        await modalSubmit
          .reply({
            content: `Età impostata su **${state.age} anni**.`,
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === `bh_privacy:${ownerId}:${nonce}`) {
        state.showAge = !state.showAge;
        await interaction
          .update({
            embeds: [buildPanelEmbed(message.author, state, mode)],
            components: buildPanelRows(ownerId, nonce, state.showAge, false),
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === `bh_cancel:${ownerId}:${nonce}`) {
        finished = true;
        await interaction
          .update({
            embeds: [
              new EmbedBuilder()
                .setColor(BRAND_COLOR)
                .setTitle("Pannello chiuso")
                .setDescription("Nessuna modifica è stata salvata."),
            ],
            components: buildPanelRows(ownerId, nonce, state.showAge, true),
          })
          .catch(() => {});
        collector.stop("cancelled");
        return;
      }

      if (interaction.customId === `bh_save:${ownerId}:${nonce}`) {
        if (!Number.isInteger(state.day) || !Number.isInteger(state.month)) {
          await interaction
            .reply({
              content: "Prima imposta la data di nascita.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
          return;
        }
        if (!Number.isInteger(state.age)) {
          await interaction
            .reply({
              content: "Prima imposta l'età.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
          return;
        }

        const birthYear = inferBirthYearFromAge(state.day, state.month, state.age);

        await BirthdayProfile.findOneAndUpdate(
          { guildId: message.guild.id, userId: ownerId },
          {
            $set: {
              day: state.day,
              month: state.month,
              birthYear,
              showAge: state.showAge,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        await sendBirthSaveEmbed(
          client || message.client,
          message.guild,
          message.author,
          state,
        );

        finished = true;
        await interaction
          .update({
            embeds: [buildSavedEmbed(state)],
            components: buildPanelRows(ownerId, nonce, state.showAge, true),
          })
          .catch(() => {});
        collector.stop("saved");
      }
    } catch (error) {
      global.logger?.error?.("[BH] collector error:", error);
    }
  });

  collector.on("end", async () => {
    if (finished) return;
    await panelMessage
      .edit({ components: buildPanelRows(ownerId, nonce, state.showAge, true) })
      .catch(() => {});
  });
}

async function handleRemoveBirthday(message) {
  const ownerId = message.author.id;
  const nonce = `${Date.now()}${Math.floor(Math.random() * 9999)}`;
  const yesId = `bh_remove_yes:${ownerId}:${nonce}`;
  const noId = `bh_remove_no:${ownerId}:${nonce}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setLabel("Conferma rimozione")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel("Annulla")
      .setStyle(ButtonStyle.Secondary),
  );

  const prompt = await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle("Rimuovi profilo compleanno")
        .setDescription(
          "Confermando, il tuo compleanno verrà rimosso dal database e non sarà più annunciato in chat.",
        )
        .setFooter({ text: "Questa azione è reversibile solo impostando di nuovo il profilo con +bh set." }),
    ],
    components: [row],
    allowedMentions: { repliedUser: false },
  });
  if (!prompt) return;

  let decided = false;
  const collector = prompt.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: REMOVE_CONFIRM_TIMEOUT_MS,
  });

  collector.on("collect", async (interaction) => {
    if (String(interaction.user?.id || "") !== ownerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Non puoi usare questi pulsanti.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return;
    }

    if (interaction.customId === yesId) {
      decided = true;
      await BirthdayProfile.deleteOne({
        guildId: message.guild.id,
        userId: ownerId,
      }).catch(() => {});

      await interaction
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_COLOR)
              .setTitle("Profilo rimosso")
              .setDescription("Il tuo compleanno è stato rimosso dal database."),
          ],
          components: [],
        })
        .catch(() => {});

      collector.stop("confirmed");
      return;
    }

    if (interaction.customId === noId) {
      decided = true;
      await interaction
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_COLOR)
              .setTitle("Operazione annullata")
              .setDescription("Nessuna modifica è stata applicata."),
          ],
          components: [],
        })
        .catch(() => {});
      collector.stop("cancelled");
    }
  });

  collector.on("end", async () => {
    if (decided) return;
    const disabled = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(row.components[0]).setDisabled(true),
      ButtonBuilder.from(row.components[1]).setDisabled(true),
    );
    await prompt.edit({ components: [disabled] }).catch(() => {});
  });
}

module.exports = {
  name: "bh",
  aliases: ["birthday", "compleanno"],

  async execute(message, args = [], client) {
    if (!message?.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa questo comando in un server.",
      });
      return;
    }

    const sub = String(args?.[0] || "").trim().toLowerCase();
    if (!["set", "edit", "remove"].includes(sub)) {
      await safeMessageReply(message, {
        embeds: [buildHelpEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "set") {
      await openBirthdayPanel(message, client, null, "set");
      return;
    }

    const existing = await BirthdayProfile.findOne({
      guildId: message.guild.id,
      userId: message.author.id,
    })
      .lean()
      .catch(() => null);

    if (sub === "edit") {
      if (!existing) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_COLOR)
              .setDescription("Non hai ancora un compleanno salvato. Usa prima `+bh set`."),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await openBirthdayPanel(
        message,
        client,
        {
          day: Number(existing.day || 0),
          month: Number(existing.month || 0),
          age: computeAgeNow(
            Number(existing.day || 1),
            Number(existing.month || 1),
            Number(existing.birthYear || 2000),
          ),
          showAge: Boolean(existing.showAge),
        },
        "edit",
      );
      return;
    }

    if (!existing) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setDescription("Non hai un compleanno salvato da rimuovere. Usa `+bh set`."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await handleRemoveBirthday(message);
  },
};
