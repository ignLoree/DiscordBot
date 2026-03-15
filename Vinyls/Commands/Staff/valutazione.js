const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { addStaffWarnFromNegatives, applyFullDepex, getHighestStaffRoleId } = require("../../Services/Staff/staffWarnService");
const EPHEMERAL_FLAG = 1 << 6;

function errorEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("Red");
}

function successEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("#6f4e37");
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

async function getStaffDoc(guildId, userId) {
  return Staff.findOne({ guildId, userId });
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
      name: `<:success:1461731530333229226> Valutazione eseguita da ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle(title)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      [
        `<:staff:1443651912179388548> <a:VC_Arrow:1448672967721615452> ${user}`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${idValue}\`__`,
      ].join("\n"),
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
      name: `<:cancel:1461730653677551691> Valutazione rimossa da ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle(title)
    .setDescription(description.replace("{user}", user.toString()))
    .addFields(
      { name: "<:VC_reason:1478517122929004544> Motivazione: ", value: `${reason}`, inline: false },
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

  const embed = makeLogEmbed(interaction, staffUser, `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${staffDoc.positiveCount}\``, reason, staffDoc.valutazioniCount,);

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
      embeds: [errorEmbed("<:attentionfromvega:1443651874032062505> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  staffDoc.positiveReasons.splice(removeId - 1, 1);
  staffDoc.positiveCount = Math.max(0, staffDoc.positiveCount - 1);
  staffDoc.valutazioniCount = Math.max(0, staffDoc.valutazioniCount - 1);
  await staffDoc.save();

  const embed = makeRemovalEmbed(interaction, staffUser, "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__**",
    "",
    `<:VC_reason:1478517122929004544> A __${staffUser.username}__ è stata **rimossa** una _Valutazione Positiva!_`, reason,
    "",
    "<:VC_update:1478721333096349817> __Valutazione Positive Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${staffDoc.positiveCount}\` valutazioni positive!`);

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

  const embed = makeLogEmbed(interaction, staffUser, `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${staffDoc.negativeCount}\``, reason, staffDoc.valutazioniCount,);

  await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });

  const guild = interaction.guild;
  const warnResult = await addStaffWarnFromNegatives(guild.id, staffUser.id, staffDoc.negativeCount, reason);
  const warnChannel = guild.channels.cache.get(IDs.channels?.warnStaff) || (await getGuildChannelCached(guild, IDs.channels?.warnStaff));
  if (warnResult.added && warnChannel?.isTextBased?.()) {
    const warnEmbed = new EmbedBuilder()
      .setAuthor({ name: `Warn automatico (3 valutazioni negative) da ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTitle(`<a:VC_Alert:1448670089670037675> • **__WARN STAFF__** \`#${warnResult.warnCount}\``)
      .setThumbnail(staffUser.displayAvatarURL())
      .setDescription(`${staffUser}\n<:VC_reason:1478517122929004544> __${String(reason).slice(0, 400)}__`)
      .setColor("#E74C3C");
    await warnChannel.send({ content: `${staffUser}`, embeds: [warnEmbed] }).catch(() => null);
    if (warnResult.shouldAskDepex) {
      const promptEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("<a:VC_Alert:1448670089670037675> 2 warn staff — Decidi azione")
        .setDescription(
          `${staffUser} ha raggiunto **2 warn staff** (da valutazioni negative).\n\n` +
          "**Depex ora** = un livello in basso (Mod → depex completo; Coord → Mod; …).\n" +
          "**No** = nessuna azione ora; al **3° warn** scatterà il **depex completo** (ruolo + staff).",
        )
        .setThumbnail(staffUser.displayAvatarURL());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:yes`).setLabel("Depex ora").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:no`).setLabel("No (al 3° warn depex completo)").setStyle(ButtonStyle.Secondary),
      );
      await warnChannel.send({ content: `${staffUser}`, embeds: [promptEmbed], components: [row] }).catch(() => null);
    }
  }
  if (warnResult.added && warnResult.shouldFullDepex) {
    const member = await getGuildMemberCached(guild, staffUser.id);
    if (member) {
      const currentRoleId = getHighestStaffRoleId(member);
      const fullResult = await applyFullDepex(guild, member, currentRoleId);
      if (fullResult.ok) {
        const pexDepexChannel = await getGuildChannelCached(guild, IDs.channels?.pexDepex);
        if (pexDepexChannel?.isTextBased?.()) {
          await pexDepexChannel.send({
            content: `**<:cancel:1461730653677551691> DEPEX** ${staffUser}\n` +
              `<:staff:1443651912179388548> \`${currentRoleId}\` <a:VC_Arrow:1448672967721615452> Nessuno\n` +
              `<:VC_reason:1478517122929004544> __Depex automatico: 3 warn staff (valutazioni negative).__`,
          }).catch(() => null);
        }
      }
    }
  }

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
      embeds: [errorEmbed("<:attentionfromvega:1443651874032062505> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  staffDoc.negativeReasons.splice(removeId - 1, 1);
  staffDoc.negativeCount = Math.max(0, staffDoc.negativeCount - 1);
  staffDoc.valutazioniCount = Math.max(0, staffDoc.valutazioniCount - 1);
  await staffDoc.save();

  const embed = makeRemovalEmbed(interaction, staffUser, "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    "",
    `<:VC_reason:1478517122929004544> A __${staffUser.username}__ è stata **rimossa** una _Valutazione Negativa!_`, reason,
    "",
    "<:VC_update:1478721333096349817> __Valutazione Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${staffDoc.negativeCount}\` valutazioni negative!`);

  await sendChannelEmbed(channel, { embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione negativa rimossa con successo!",
      ),
    ],
  });
}

async function handleMedia(interaction, staffUser, doc) {
  if (!doc) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed("<:attentionfromvega:1443651874032062505> Nessuna valutazione trovata."),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`<:VC_InactiveStatus:1472011031709745307> Valutazioni di ${staffUser.username}`)
    .setColor("#6f4e37")
    .addFields(
      {
        name: "<:thumbsup:1471292172145004768> Positive",
        value:
          (doc.positiveReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: true,
      },
      {
        name: "<:thumbsdown:1471292163957457013> Negative",
        value:
          (doc.negativeReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: true,
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
          opt.setName("staffer")
            .setDescription("Staffer")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const staffUser = interaction.options.getUser("staffer");
    const reason = interaction.options.getString("motivo");
    const guildId = interaction.guild.id;
    const channel = interaction.guild.channels.cache.get(IDs.channels?.valutazioniStaff,);

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    try {
      const existingStaffDoc = sub === "media" ? await getStaffDoc(guildId, staffUser.id) : null;
      if (sub === "media") {
        return handleMedia(interaction, staffUser, existingStaffDoc);
      }

      const staffDoc = ensureStaffDoc(existingStaffDoc || (await getStaffDoc(guildId, staffUser.id)), guildId, staffUser.id,);

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