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

function computeAgeNow(day, month, birthYear) {
  const today = getRomeDateParts(new Date());
  const hasBirthdayPassed =
    today.month > month || (today.month === month && today.day >= day);
  const raw = today.year - Number(birthYear) - (hasBirthdayPassed ? 0 : 1);
  return Math.max(1, raw);
}

function buildPanelEmbed(user, state) {
  const dateValue =
    Number.isInteger(state.day) && Number.isInteger(state.month)
      ? `${pad2(state.day)}/${pad2(state.month)}`
      : "`non impostata`";
  const ageValue = Number.isInteger(state.age)
    ? `**${state.age}**`
    : "`non impostata`";
  const privacyValue = state.showAge ? "`visibile`" : "`nascosta`";

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Configurazione compleanno")
    .setDescription(
      [
        `${user}, usa i pulsanti qui sotto per configurare il tuo profilo compleanno.`,
        "",
        `Data: ${dateValue}`,
        `Età: ${ageValue}`,
        `Privacy età: ${privacyValue}`,
      ].join("\n"),
    )
    .setFooter({ text: "Quando hai finito, premi Salva." });
}

function buildPanelRows(ownerId, nonce, showAge, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bh_date:${ownerId}:${nonce}`)
        .setLabel("Imposta data")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_age:${ownerId}:${nonce}`)
        .setLabel("Imposta età")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_privacy:${ownerId}:${nonce}`)
        .setLabel(showAge ? "Età visibile: SI" : "Età visibile: NO")
        .setStyle(showAge ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bh_save:${ownerId}:${nonce}`)
        .setLabel("Salva")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bh_cancel:${ownerId}:${nonce}`)
        .setLabel("Annulla")
        .setStyle(ButtonStyle.Danger)
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

  const agePart =
    state.showAge && Number.isInteger(state.age)
      ? ` con la tua età (**${state.age}**)`
      : "";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(`${user} hai impostato la tua data di nascita${agePart}.`);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function openBirthdayPanel(message, client, initialState = null) {
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
    embeds: [buildPanelEmbed(message.author, state)],
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
            content:
              "<:vegax:1443934876440068179> Non puoi usare questi pulsanti.",
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
        await interaction.showModal(modal).catch(() => {});

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
            embeds: [buildPanelEmbed(message.author, state)],
            components: buildPanelRows(ownerId, nonce, state.showAge, false),
          })
          .catch(() => {});
        await modalSubmit
          .reply({
            content: `Data impostata: \`${pad2(state.day)}/${pad2(state.month)}\`.`,
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
        await interaction.showModal(modal).catch(() => {});

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
            embeds: [buildPanelEmbed(message.author, state)],
            components: buildPanelRows(ownerId, nonce, state.showAge, false),
          })
          .catch(() => {});
        await modalSubmit
          .reply({
            content: `Età impostata: **${state.age}**.`,
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === `bh_privacy:${ownerId}:${nonce}`) {
        state.showAge = !state.showAge;
        await interaction
          .update({
            embeds: [buildPanelEmbed(message.author, state)],
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
                .setColor("#6f4e37")
                .setDescription("Configurazione compleanno annullata."),
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
              content: "Prima imposta la tua data di nascita.",
              flags: PRIVATE_FLAG,
            })
            .catch(() => {});
          return;
        }
        if (!Number.isInteger(state.age)) {
          await interaction
            .reply({
              content: "Prima imposta la tua età.",
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
        const ageSummary = state.showAge
          ? `Età visibile: **${state.age}**`
          : "Età salvata con privacy attiva.";

        await interaction
          .update({
            embeds: [
              new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("Compleanno salvato")
                .setDescription(
                  [
                    `Data: **${pad2(state.day)}/${pad2(state.month)}**`,
                    ageSummary,
                  ].join("\n"),
                ),
            ],
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
      .setLabel("Conferma")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel("Rifiuta")
      .setStyle(ButtonStyle.Secondary),
  );

  const prompt = await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Rimuovi compleanno")
        .setDescription(
          "Vuoi davvero rimuovere completamente il tuo compleanno dal database?",
        ),
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
              .setColor("#6f4e37")
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
              .setColor("#6f4e37")
              .setDescription("Operazione annullata. Nessuna modifica applicata."),
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
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "Usa `+bh set`, `+bh edit` o `+bh remove` per gestire il tuo compleanno.",
            ),
        ],
      });
      return;
    }

    if (sub === "set") {
      await openBirthdayPanel(message, client, null);
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
              .setColor("#6f4e37")
              .setDescription(
                "Non hai ancora un compleanno salvato. Usa prima `+bh set`.",
              ),
          ],
        });
        return;
      }

      await openBirthdayPanel(message, client, {
        day: Number(existing.day || 0),
        month: Number(existing.month || 0),
        age: computeAgeNow(
          Number(existing.day || 1),
          Number(existing.month || 1),
          Number(existing.birthYear || 2000),
        ),
        showAge: Boolean(existing.showAge),
      });
      return;
    }

    if (!existing) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "Non hai un compleanno salvato da rimuovere. Usa `+bh set`.",
            ),
        ],
      });
      return;
    }

    await handleRemoveBirthday(message);
  },
};


