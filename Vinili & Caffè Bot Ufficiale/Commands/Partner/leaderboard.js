const { safeEditReply } = require("../../Utils/Moderation/reply");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const PartnershipCount = require("../../Schemas/Staff/staffSchema");

const PARTNERS_PER_PAGE = 10;
const EPHEMERAL_FLAG = 1 << 6;

function isActionInLastWeek(action, weekAgo) {
  if (!action || action.action !== "create" || !action.date) return false;
  return new Date(action.date) >= weekAgo;
}

function buildNoDataEmbed(isWeekly) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      isWeekly
        ? "<:attentionfromvega:1443651874032062505> Nessuno ha effettuato partner negli ultimi 7 giorni!"
        : "<:attentionfromvega:1443651874032062505> Nessuno ha ancora effettuato partner!",
    );
}

async function buildLeaderboardEmbed(
  interaction,
  partners,
  currentPage,
  totalPages,
  isWeekly,
) {
  const startIndex = (currentPage - 1) * PARTNERS_PER_PAGE;
  const currentPartners = partners.slice(
    startIndex,
    startIndex + PARTNERS_PER_PAGE,
  );

  const rows = [];
  for (let i = 0; i < currentPartners.length; i += 1) {
    const partner = currentPartners[i];
    let username = "Utente sconosciuto";
    try {
      const user = await interaction.client.users.fetch(partner.userId);
      username = user.username;
    } catch {}
    rows.push(
      `**${startIndex + i + 1}.** ${username} - <:VC_Partner:1443933014835986473> ${partner.score} partnership`,
    );
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(
      `<a:VC_Winner:1448687700235256009> Classifica Partnership (${isWeekly ? "Settimanale" : "Totale"})`,
    )
    .setDescription(rows.join("\n"))
    .setFooter({ text: `Pagina ${currentPage} di ${totalPages}` })
    .setTimestamp();
}

function buildPaginationRow(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prev")
      .setEmoji("<a:vegaleftarrow:1462914743416131816>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId("next")
      .setEmoji("<a:vegarightarrow:1443673039156936837>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Guarda la classifica delle partnership")
    .addStringOption((option) =>
      option
        .setName("tipo")
        .setDescription("Scegli quale classifica visualizzare")
        .addChoices(
          { name: "Totale", value: "totale" },
          { name: "Settimanale", value: "settimanale" },
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply().catch(() => {});

    const tipo = interaction.options.getString("tipo") || "totale";
    const isWeekly = tipo === "settimanale";
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const allStaff = await PartnershipCount.find({
      guildId: interaction.guild.id,
    }).lean();
    const partners = allStaff
      .map((staff) => {
        if (!isWeekly) {
          return { userId: staff.userId, score: staff.partnerCount || 0 };
        }

        const actions = Array.isArray(staff.partnerActions)
          ? staff.partnerActions
          : [];
        const weeklyCount = actions.reduce(
          (total, action) =>
            isActionInLastWeek(action, weekAgo) ? total + 1 : total,
          0,
        );
        return { userId: staff.userId, score: weeklyCount };
      })
      .filter((staff) => staff.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!partners.length) {
      return safeEditReply(interaction, {
        embeds: [buildNoDataEmbed(isWeekly)],
      });
    }

    const totalPages = Math.ceil(partners.length / PARTNERS_PER_PAGE);
    let currentPage = 1;
    let row = buildPaginationRow(currentPage, totalPages);

    const firstEmbed = await buildLeaderboardEmbed(
      interaction,
      partners,
      currentPage,
      totalPages,
      isWeekly,
    );
    const message = await safeEditReply(interaction, {
      embeds: [firstEmbed],
      components: [row],
    });
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi usare questi pulsanti.",
          flags: EPHEMERAL_FLAG,
        });
      }

      if (buttonInteraction.customId === "prev" && currentPage > 1) {
        currentPage -= 1;
      } else if (
        buttonInteraction.customId === "next" &&
        currentPage < totalPages
      ) {
        currentPage += 1;
      }

      const embed = await buildLeaderboardEmbed(
        interaction,
        partners,
        currentPage,
        totalPages,
        isWeekly,
      );
      row = buildPaginationRow(currentPage, totalPages);
      await buttonInteraction.update({ embeds: [embed], components: [row] });
    });

    collector.on("end", () => {
      row.components.forEach((button) => button.setDisabled(true));
      message.edit({ components: [row] }).catch(() => {});
    });
  },
};
