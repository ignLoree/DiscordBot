const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");
const PRIVATE_FLAG = 1 << 6;
const SUCCESS_COLOR = "#6f4e37";

function buildResultEmbed(interaction, description) {
  return new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setDescription(description)
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL(),
    })
    .setTimestamp();
}

function formatPartnerPointsChange(action, amount) {
  const safeAmount = Number(amount || 0);
  const isSingular = Math.abs(safeAmount) === 1;
  if (action === "add") {
    return `${isSingular ? "Aggiunto" : "Aggiunti"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
  }
  return `${isSingular ? "Rimosso" : "Rimossi"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
}

async function addPartnerPoints(guildId, userId, amount) {
  return Staff.findOneAndUpdate(
    { guildId, userId },
    {
      $inc: { partnerCount: amount },
      $setOnInsert: { guildId, userId, partnerCount: 0 },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );
}

async function removePartnerPoints(guildId, userId, amount) {
  return Staff.findOneAndUpdate(
    { guildId, userId },
    [
      {
        $set: {
          guildId,
          userId,
          partnerCount: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ["$partnerCount", 0] },
                  Number(amount || 0),
                ],
              },
            ],
          },
        },
      },
    ],
    {
      new: true,
      upsert: true,
    },
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partner")
    .setDescription("Modifica i punti partner dei PM")
    .addSubcommandGroup((subcommandGroup) =>
      subcommandGroup
        .setName("modifypoint")
        .setDescription("Modifica i punti partner")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Aggiungi punti a un PM")
            .addIntegerOption((option) =>
              option
                .setName("amount")
                .setDescription("Numero di punti da aggiungere")
                .setRequired(true),
            )
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("PM a cui aggiungerli")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Rimuovi punti a un PM")
            .addIntegerOption((option) =>
              option
                .setName("amount")
                .setDescription("Numero di punti da rimuovere")
                .setRequired(true),
            )
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("PM a cui toglierli")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("motivo")
                .setDescription("Motivo del punto rimosso")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("linkmessaggio")
                .setDescription("Aggiungi il link del messaggio")
                .setRequired(true),
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => { });

    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const reason = interaction.options.getString("motivo");
    const messageLink = interaction.options.getString("linkmessaggio");
    const removedPointsChannel = interaction.guild.channels.cache.get(IDs.channels?.puntiTolti,);

    if (amount < 0) {
      return safeEditReply(interaction, {
        content: "<:vegax:1443934876440068179> Il valore deve essere positivo.",
        flags: PRIVATE_FLAG,
      });
    }
    const MAX_AMOUNT_PER_OP = 10000;
    if (amount > MAX_AMOUNT_PER_OP) {
      return safeEditReply(interaction, {
        content: `<:vegax:1443934876440068179> Puoi aggiungere o rimuovere al massimo \`${MAX_AMOUNT_PER_OP}\` punti per operazione.`,
        flags: PRIVATE_FLAG,
      });
    }

    const guildId = interaction.guild.id;

    if (sub === "add") {
      const staffData = await addPartnerPoints(guildId, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("add", amount);
      const embed = buildResultEmbed(interaction, `<:vegacheckmark:1443666279058772028> **Successo**: ${changeLabel} a <@${targetUser.id}>. <:VC_Info:1460670816214585481> Totale Punti:\`${staffData.partnerCount}\``,);

      return safeEditReply(interaction, { embeds: [embed] });
    }

    if (sub === "remove") {
      const staffData = await removePartnerPoints(guildId, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("remove", amount);
      const embed = buildResultEmbed(interaction, `<:vegacheckmark:1443666279058772028> **Successo**: ${changeLabel} a <@${targetUser.id}>. <:VC_Info:1460670816214585481> Totale Punti:\`${staffData.partnerCount}\``,);

      if (removedPointsChannel) {
        await removedPointsChannel.send({
          content: `
<:partnermanager:1443651916838998099> ${targetUser}
<:VC_reason:1478517122929004544> ${reason}
<:VC_Link:1448688587133685895> ${messageLink}`,
        }).catch(() => null);
      }

      return safeEditReply(interaction, { embeds: [embed] });
    }
  },
};