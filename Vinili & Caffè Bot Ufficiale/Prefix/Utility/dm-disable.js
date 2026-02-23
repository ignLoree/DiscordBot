const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getNoDmSet, addNoDm } = require("../../Utils/noDmList");

module.exports = {
  name: "dm-disable",
  aliases: ["no-dm"],
  allowEmptyArgs: true,
  async execute(message) {
    if (!message.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa il comando in un server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const set = await getNoDmSet(guildId);

    if (set.has(userId)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "Hai già disattivato i DM automatici. Usa `+dm-enable` per riattivarli.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const uniqueKey = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const confirmId = `nodm_confirm_${userId}_${uniqueKey}`;
    const cancelId = `nodm_cancel_${userId}_${uniqueKey}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel("Conferma")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel("Rifiuta")
        .setStyle(ButtonStyle.Secondary),
    );

    const warningEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Conferma blocco DM")
      .setDescription(
        [
          "Se confermi, non riceverai **nessun tipo di DM automatico** dal bot.",
          "Questo include anche eventuali avvisi più importanti.",
          "",
          "Vuoi continuare?",
        ].join("\n"),
      )
      .setFooter({ text: "Potrai riattivarli con +dm-enable." });

    const promptMessage = await safeMessageReply(message, {
      embeds: [warningEmbed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
    if (!promptMessage) return;

    let decided = false;
    const collector = promptMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== userId) {
        await interaction
          .reply({
            content:
              "<:vegax:1443934876440068179> Non puoi usare questi pulsanti.",
            flags: 1 << 6,
          })
          .catch(() => {});
        return;
      }

      if (interaction.customId === confirmId) {
        decided = true;
        await addNoDm(guildId, userId);
        await interaction
          .update({
            embeds: [
              new EmbedBuilder()
                .setColor("#6f4e37")
                .setDescription(
                  "Ok! **Non riceverai più** DM automatici dal bot.\nPer riattivarli usa `+dm-enable`.",
                ),
            ],
            components: [],
          })
          .catch(() => {});
        collector.stop("confirmed");
        return;
      }

      if (interaction.customId === cancelId) {
        decided = true;
        await interaction
          .update({
            embeds: [
              new EmbedBuilder()
                .setColor("#6f4e37")
                .setDescription(
                  "Operazione annullata. Continuerai a ricevere DM automatici dal bot.",
                ),
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
      await promptMessage.edit({ components: [disabled] }).catch(() => {});
    });
  },
};
