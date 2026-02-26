const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");

const EPHEMERAL_FLAG = 1 << 6;

function errorEmbed(description) {
  return new EmbedBuilder().setDescription(description).setColor("Red");
}

function successEmbed(description) {
  return new EmbedBuilder().setDescription(description).setColor("#6f4e37");
}

function ensureStaffDoc(staffDoc, guildId, userId) {
  if (staffDoc) return staffDoc;
  return new Staff({
    guildId,
    userId,
    rolesHistory: [],
    warnReasons: [],
    positiveReasons: [],
    negativeReasons: [],
    partnerActions: [],
    positiveCount: 0,
    negativeCount: 0,
    valutazioniCount: 0,
  });
}

function makeLogEmbed(
  interaction,
  user,
  title,
  reason,
  idValue,
  color = "#6f4e37",
) {
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle(title)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      `<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> ${user} <:pinnednew:1443670849990430750> __${reason}__ <a:loading:1443934440614264924> **ID Valutazione** __\`${idValue}\`__`,
    )
    .setColor(color);
}

function makeRemovalEmbed(
  interaction,
  user,
  title,
  description,
  reason,
  updatedLabel,
  updatedValue,
) {
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione rimossa da ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle(title)
    .setDescription(description.replace("{user}", user.toString()))
    .addFields(
      { name: "Motivazione:", value: `${reason}`, inline: false },
      { name: updatedLabel, value: updatedValue, inline: false },
    )
    .setColor("#6f4e37");
}

async function sendChannelEmbed(channel, payload) {
  if (!channel) return;
  await channel.send(payload).catch(() => null);
}

async function handlePositiveAdd(
  interaction,
  staffDoc,
  staffUser,
  reason,
  channel,
) {
  staffDoc.valutazioniCount += 1;
  staffDoc.positiveCount += 1;
  if (!Array.isArray(staffDoc.positiveReasons)) staffDoc.positiveReasons = [];
  staffDoc.positiveReasons.push(reason);
  await staffDoc.save();

  const embed = makeLogEmbed(
    interaction,
    staffUser,
    `<a:laydowntorest:1444006796661358673> **__VALUTAZIONE POSITIVA__** #${staffDoc.positiveCount}\``,
    reason,
    staffDoc.valutazioniCount,
  );

  await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione positiva registrata con successo!",
      ),
    ],
  });
}

async function handlePositiveRemove(
  interaction,
  staffDoc,
  staffUser,
  reason,
  channel,
) {
  const removeId = interaction.options.getInteger("id");
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !staffDoc.positiveReasons?.[removeId - 1]
  ) {
    return safeEditReply(interaction, {
      embeds: [errorEmbed("<:vegax:1443934876440068179> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  staffDoc.positiveReasons.splice(removeId - 1, 1);
  staffDoc.positiveCount = Math.max(0, staffDoc.positiveCount - 1);
  staffDoc.valutazioniCount = Math.max(0, staffDoc.valutazioniCount - 1);
  await staffDoc.save();

  const embed = makeRemovalEmbed(
    interaction,
    staffUser,
    "**__VALUTAZIONE POSITIVA RIMOSSA__**",
    "<:reportmessage:1443670575376765130> A __{user}__ è stata **rimossa** una _Valutazione Positiva!_",
    reason,
    "__Numero Valutazioni Positive Aggiornato__",
    `Ora sei a \`${staffDoc.positiveCount}\` valutazioni!`,
  );

  await sendChannelEmbed(channel, { embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione positiva rimossa con successo!",
      ),
    ],
  });
}

async function handleNegativeAdd(
  interaction,
  staffDoc,
  staffUser,
  reason,
  channel,
) {
  staffDoc.valutazioniCount += 1;
  staffDoc.negativeCount += 1;
  if (!Array.isArray(staffDoc.negativeReasons)) staffDoc.negativeReasons = [];
  staffDoc.negativeReasons.push(reason);
  await staffDoc.save();

  const embed = makeLogEmbed(
    interaction,
    staffUser,
    `<a:laydowntorest:1444006796661358673> **__VALUTAZIONE NEGATIVA__** #${staffDoc.negativeCount}\``,
    reason,
    staffDoc.valutazioniCount,
  );

  await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione negativa registrata con successo!",
      ),
    ],
  });
}

async function handleNegativeRemove(
  interaction,
  staffDoc,
  staffUser,
  reason,
  channel,
) {
  const removeId = interaction.options.getInteger("id");
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !staffDoc.negativeReasons?.[removeId - 1]
  ) {
    return safeEditReply(interaction, {
      embeds: [errorEmbed("<:vegax:1443934876440068179> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  staffDoc.negativeReasons.splice(removeId - 1, 1);
  staffDoc.negativeCount = Math.max(0, staffDoc.negativeCount - 1);
  staffDoc.valutazioniCount = Math.max(0, staffDoc.valutazioniCount - 1);
  await staffDoc.save();

  const embed = makeRemovalEmbed(
    interaction,
    staffUser,
    "**__VALUTAZIONE NEGATIVA RIMOSSA__**",
    "<:reportmessage:1443670575376765130> A __{user}__ è stata **rimossa** una _Valutazione Negativa!_",
    reason,
    "__Numero Valutazioni Negativa Aggiornato__",
    `Ora sei a \`${staffDoc.negativeCount}\` valutazioni!`,
  );

  await sendChannelEmbed(channel, { embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione negativa rimossa con successo!",
      ),
    ],
  });
}

async function handleMedia(interaction, guildId, staffUser) {
  const doc = await Staff.findOne({ guildId, userId: staffUser.id });
  if (!doc) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed("<:vegax:1443934876440068179> Nessuna valutazione trovata."),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Valutazioni di ${staffUser.username}`)
    .setColor("#6f4e37")
    .addFields(
      {
        name: "Positive",
        value:
          (doc.positiveReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: false,
      },
      {
        name: "Negative",
        value:
          (doc.negativeReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: false,
      },
      {
        name: "Totale",
        value: `Totali: ${doc.valutazioniCount}`,
        inline: false,
      },
    );

  return safeEditReply(interaction, { embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("valutazione")
    .setDescription("Gestisci le valutazioni degli staffer")
    .addSubcommandGroup((group) =>
      group
        .setName("positiva")
        .setDescription("Gestisci valutazioni positive")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Aggiungi una valutazione positiva a uno staffer")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Rimuovi una valutazione positiva")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("id")
                .setDescription("ID valutazione")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione rimozione")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("negativa")
        .setDescription("Gestisci valutazioni negative")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Aggiungi una valutazione negativa a uno staffer")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Rimuovi una valutazione negativa")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("id")
                .setDescription("ID valutazione")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione rimozione")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("media")
        .setDescription("Vedi le valutazioni di uno staffer")
        .addUserOption((opt) =>
          opt.setName("staffer").setDescription("Staffer").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const staffUser = interaction.options.getUser("staffer");
    const reason = interaction.options.getString("motivo");
    const guildId = interaction.guild.id;
    const channel = interaction.guild.channels.cache.get(
      IDs.channels?.valutazioniStaff,
    );

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    try {
      if (sub === "media") {
        return handleMedia(interaction, guildId, staffUser);
      }

      let staffDoc = await Staff.findOne({ guildId, userId: staffUser.id });
      staffDoc = ensureStaffDoc(staffDoc, guildId, staffUser.id);

      if (group === "positiva" && sub === "add") {
        return handlePositiveAdd(
          interaction,
          staffDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "positiva" && sub === "remove") {
        return handlePositiveRemove(
          interaction,
          staffDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "negativa" && sub === "add") {
        return handleNegativeAdd(
          interaction,
          staffDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "negativa" && sub === "remove") {
        return handleNegativeRemove(
          interaction,
          staffDoc,
          staffUser,
          reason,
          channel,
        );
      }
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};