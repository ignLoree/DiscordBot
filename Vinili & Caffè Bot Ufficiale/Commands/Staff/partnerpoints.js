const { safeEditReply } = require("../../Utils/Moderation/reply");
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

async function getOrCreateStaffData(guildId, userId) {
  let staffData = await Staff.findOne({ guildId, userId });

  if (!staffData) {
    staffData = new Staff({ guildId, userId, partnerCount: 0 });
  }

  if (typeof staffData.partnerCount !== "number") {
    staffData.partnerCount = 0;
  }

  return staffData;
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
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const reason = interaction.options.getString("motivo");
    const messageLink = interaction.options.getString("linkmessaggio");
    const removedPointsChannel = interaction.guild.channels.cache.get(
      IDs.channels.puntiTolti,
    );

    if (amount < 0) {
      return safeEditReply(interaction, {
        content: "<:vegax:1443934876440068179> Il valore deve essere positivo.",
        flags: PRIVATE_FLAG,
      });
    }

    const staffData = await getOrCreateStaffData(
      interaction.guild.id,
      targetUser.id,
    );

    if (sub === "add") {
      staffData.partnerCount += amount;
      await staffData.save();

      const embed = buildResultEmbed(
        interaction,
        `<:vegacheckmark:1443666279058772028> **Successo**: Aggiunti \`${amount}\` punti a <@${targetUser.id}>. Totale Punti: \`${staffData.partnerCount}\``,
      );

      return safeEditReply(interaction, { embeds: [embed] });
    }

    if (sub === "remove") {
      staffData.partnerCount = Math.max(0, staffData.partnerCount - amount);
      await staffData.save();

      const embed = buildResultEmbed(
        interaction,
        `<:vegacheckmark:1443666279058772028> **Successo**: Rimossi \`${amount}\` punti a <@${targetUser.id}>. Totale Punti: \`${staffData.partnerCount}\``,
      );

      if (removedPointsChannel) {
        await removedPointsChannel.send({
          content: `
<:Discord_Mention:1329524304790028328> ${targetUser}
<:discordchannelwhite:1443308552536985810> ${reason}
<:partneredserverowner:1443651871125409812> ${messageLink}`,
        });
      }

      return safeEditReply(interaction, { embeds: [embed] });
    }
  },
};
