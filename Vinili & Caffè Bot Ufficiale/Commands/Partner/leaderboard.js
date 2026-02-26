const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const PartnershipCount = require("../../Schemas/Staff/staffSchema");

const PARTNERS_PER_PAGE = 10;
const EPHEMERAL_FLAG = 1 << 6;
const TIME_ZONE = "Europe/Rome";

function getRomeDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const timeZoneName = formatter
    .formatToParts(utcDate)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(
    /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,
  );
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) {
    utcMs = baseUtcMs - secondOffsetMs;
  }
  return new Date(utcMs);
}

function getCurrentWeekWindow(now = new Date()) {
  const romeToday = getRomeDateParts(now);
  const romeTodayNoonUtc = new Date(
    Date.UTC(romeToday.year, romeToday.month - 1, romeToday.day, 12, 0, 0),
  );
  const dayFromMonday = (romeTodayNoonUtc.getUTCDay() + 6) % 7;

  const mondayNoonUtc = new Date(
    romeTodayNoonUtc.getTime() - dayFromMonday * 24 * 60 * 60 * 1000,
  );
  const mondayY = mondayNoonUtc.getUTCFullYear();
  const mondayM = mondayNoonUtc.getUTCMonth() + 1;
  const mondayD = mondayNoonUtc.getUTCDate();

  const sundayNoonUtc = new Date(
    mondayNoonUtc.getTime() + 6 * 24 * 60 * 60 * 1000,
  );
  const sundayY = sundayNoonUtc.getUTCFullYear();
  const sundayM = sundayNoonUtc.getUTCMonth() + 1;
  const sundayD = sundayNoonUtc.getUTCDate();

  const weekStart = createUtcFromRomeLocal(
    mondayY,
    mondayM,
    mondayD,
    0,
    0,
    0,
  );
  const scheduledWeekEnd = createUtcFromRomeLocal(
    sundayY,
    sundayM,
    sundayD,
    23,
    59,
    59,
  );
  const weekEnd = now.getTime() < scheduledWeekEnd.getTime() ? now : scheduledWeekEnd;

  return { weekStart, weekEnd };
}

function isActionInWeeklyWindow(action, weekStart, weekEnd) {
  if (!action || action.action !== "create" || !action.date) return false;
  if (Array.isArray(action?.auditPenaltyDates) && action.auditPenaltyDates.length > 0)
    return false;
  const when = new Date(action.date);
  if (Number.isNaN(when.getTime())) return false;
  return when >= weekStart && when <= weekEnd;
}

function countValidAllTimePartners(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, action) => {
    if (String(action?.action || "").toLowerCase() !== "create") return total;
    if (Array.isArray(action?.auditPenaltyDates) && action.auditPenaltyDates.length > 0)
      return total;
    return total + 1;
  }, 0);
}

function buildNoDataEmbed(isWeekly) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      isWeekly
        ? "<:attentionfromvega:1443651874032062505> Nessuno ha effettuato partner in questa settimana!"
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
    const weekWindow = getCurrentWeekWindow(new Date());

    const allStaff = await PartnershipCount.find({
      guildId: interaction.guild.id,
    }).lean();
    const partners = allStaff
      .map((staff) => {
        if (!isWeekly) {
          const actions = Array.isArray(staff.partnerActions)
            ? staff.partnerActions
            : [];
          return { userId: staff.userId, score: countValidAllTimePartners(actions) };
        }

        const actions = Array.isArray(staff.partnerActions)
          ? staff.partnerActions
          : [];
        const weeklyCount = actions.reduce(
          (total, action) =>
            isActionInWeeklyWindow(
              action,
              weekWindow.weekStart,
              weekWindow.weekEnd,
            )
              ? total + 1
              : total,
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