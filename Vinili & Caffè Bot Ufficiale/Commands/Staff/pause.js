const { safeEditReply } = require("../../Utils/Moderation/reply");
const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");

const EPHEMERAL_FLAG = 1 << 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const IT_MONTHS = {
  gennaio: 1,
  feb: 2,
  febbraio: 2,
  mar: 3,
  marzo: 3,
  apr: 4,
  aprile: 4,
  mag: 5,
  maggio: 5,
  giu: 6,
  giugno: 6,
  lug: 7,
  luglio: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  sett: 9,
  settembre: 9,
  ott: 10,
  ottobre: 10,
  nov: 11,
  novembre: 11,
  dic: 12,
  dicembre: 12,
};

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function parseUserDateInput(raw) {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();

  if (value === "oggi" || value === "today") {
    const today = getTodayUtc();
    return {
      day: today.getUTCDate(),
      month: today.getUTCMonth() + 1,
      year: today.getUTCFullYear(),
      hasYear: true,
    };
  }

  if (value === "domani" || value === "tomorrow") {
    const today = getTodayUtc();
    const tomorrow = new Date(today.getTime() + MS_PER_DAY);
    return {
      day: tomorrow.getUTCDate(),
      month: tomorrow.getUTCMonth() + 1,
      year: tomorrow.getUTCFullYear(),
      hasYear: true,
    };
  }

  const slash = value.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : null;
    if (year !== null && year < 100) year += 2000;
    return { day, month, year, hasYear: year !== null };
  }

  const words = value.match(/^(\d{1,2})\s+([a-zàèéìòù]+)(?:\s+(\d{2,4}))?$/i);
  if (words) {
    const day = Number(words[1]);
    const monthName = words[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = IT_MONTHS[monthName];
    if (!month) return null;

    let year = words[3] ? Number(words[3]) : null;
    if (year !== null && year < 100) year += 2000;
    return { day, month, year, hasYear: year !== null };
  }

  return null;
}

function buildUtcDate(day, month, year) {
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateDDMMYYYY(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizePauseDates(startRaw, endRaw) {
  const startParsed = parseUserDateInput(startRaw);
  const endParsed = parseUserDateInput(endRaw);
  if (!startParsed || !endParsed) return null;

  const currentYear = getTodayUtc().getUTCFullYear();

  let startYear = startParsed.hasYear ? startParsed.year : currentYear;
  let endYear;

  if (endParsed.hasYear) {
    endYear = endParsed.year;
  } else if (startParsed.hasYear) {
    endYear = startYear;
  } else {
    endYear = currentYear;
  }

  let startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
  let endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
  if (!startDate || !endDate) return null;

  if (!endParsed.hasYear && endDate < startDate) {
    endYear += 1;
    endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
    if (!endDate) return null;
  }

  if (!startParsed.hasYear && endParsed.hasYear && startDate > endDate) {
    startYear = endYear - 1;
    startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
    if (!startDate) return null;
  }

  if (endDate < startDate) return null;

  return {
    start: startDate,
    end: endDate,
    dataRichiesta: formatDateDDMMYYYY(startDate),
    dataRitorno: formatDateDDMMYYYY(endDate),
  };
}

function getCurrentYearBoundsUtc() {
  const today = getTodayUtc();
  const year = today.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

function countOverlapDays(start, end, windowStart, windowEnd) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function computeConsumedPauseDays(pauses) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();

  return pauses.reduce((total, pause) => {
    if (!pause) return total;

    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);

    if (pause.status === "accepted") {
      return total + countOverlapDays(start, plannedEnd, yearStart, yearEnd);
    }

    if (pause.status === "cancelled") {
      let effectiveEnd = null;
      if (pause.cancelledAt) {
        const cancelled = new Date(pause.cancelledAt);
        effectiveEnd = new Date(
          Date.UTC(
            cancelled.getUTCFullYear(),
            cancelled.getUTCMonth(),
            cancelled.getUTCDate(),
          ),
        );
      } else if (start) {
        const consumed = Number(pause.giorniUsati);
        if (Number.isFinite(consumed) && consumed > 0) {
          effectiveEnd = new Date(
            start.getTime() + (consumed - 1) * MS_PER_DAY,
          );
        }
      }

      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) {
        effectiveEnd = plannedEnd;
      }

      return total + countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
    }

    return total;
  }, 0);
}

function getCancelledPauseEffectiveEnd(pause, start, plannedEnd) {
  let effectiveEnd = null;
  if (pause.cancelledAt) {
    const cancelled = new Date(pause.cancelledAt);
    effectiveEnd = new Date(
      Date.UTC(
        cancelled.getUTCFullYear(),
        cancelled.getUTCMonth(),
        cancelled.getUTCDate(),
      ),
    );
  } else if (start) {
    const consumed = Number(pause.giorniUsati);
    if (Number.isFinite(consumed) && consumed > 0) {
      effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
    }
  }

  if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) {
    effectiveEnd = plannedEnd;
  }

  return effectiveEnd;
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;

  if (pause.status === "cancelled") {
    const effectiveEnd = getCancelledPauseEffectiveEnd(
      pause,
      start,
      plannedEnd,
    );
    return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
    return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  return 0;
}

function getPauseStatusLabel(pause, todayUtc) {
  if (!pause) return "Sconosciuta";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status !== "accepted") return pause.status;

  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function splitRowsForEmbeds(rows, limit = 3500) {
  const chunks = [];
  let current = "";

  for (const row of rows) {
    if ((current + "\n" + row).length > limit) {
      chunks.push(current);
      current = row;
      continue;
    }
    current = current ? `${current}\n${row}` : row;
  }

  if (current) chunks.push(current);
  return chunks;
}

function makeNeutralEmbed(description) {
  return new EmbedBuilder().setDescription(description).setColor("#6f4e37");
}

async function handlePauseRequest(interaction, guildId) {
  const userId = interaction.user.id;
  const rawStart = interaction.options.getString("data_richiesta");
  const rawEnd = interaction.options.getString("data_ritorno");
  const reason = interaction.options.getString("motivazione");

  const pauseChannel = interaction.guild.channels.cache.get(IDs.channels.pause);
  const normalized = normalizePauseDates(rawStart, rawEnd);
  if (!normalized) {
    return safeEditReply(interaction, {
      content:
        "<:vegax:1443934876440068179> Date non valide. Formati supportati: `oggi`, `domani`, `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `1 agosto 2027`.",
      flags: EPHEMERAL_FLAG,
    });
  }

  let stafferDoc = await Staff.findOne({ guildId, userId });
  if (!stafferDoc) stafferDoc = new Staff({ guildId, userId });

  stafferDoc.pauses.push({
    dataRichiesta: normalized.dataRichiesta,
    dataRitorno: normalized.dataRitorno,
    motivazione: reason,
    status: "pending",
  });

  await stafferDoc.save();

  const createdPause = stafferDoc.pauses[stafferDoc.pauses.length - 1];
  const pauseId = String(createdPause?._id || "");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pause_accept:${userId}:${pauseId}`)
      .setLabel("Accetta")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pause_reject:${userId}:${pauseId}`)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );

  await safeEditReply(interaction, {
    embeds: [
      makeNeutralEmbed(
        "<:vegacheckmark:1443666279058772028> La tua richiesta di pausa è stata inviata all'High Staff",
      ),
    ],
    flags: EPHEMERAL_FLAG,
  });

  await pauseChannel.send({
    content: `<@&${IDs.roles.HighStaff}> ${interaction.user} ha richiesto una pausa.\nData richiesta: ${normalized.dataRichiesta}\nData ritorno: ${normalized.dataRitorno}\nMotivo: ${reason}`,
    components: pauseId ? [row] : [],
  });
}

async function handlePauseList(interaction, guildId) {
  const targetUser = interaction.options.getUser("staffer") || interaction.user;
  const isHighStaff = interaction.member?.roles?.cache?.has(
    IDs.roles.HighStaff,
  );

  if (!isHighStaff && targetUser.id !== interaction.user.id) {
    return safeEditReply(interaction, {
      content: "<:vegax:1443934876440068179> Puoi vedere solo le tue pause.",
      flags: EPHEMERAL_FLAG,
    });
  }

  const stafferRecord = await Staff.findOne({ guildId, userId: targetUser.id });
  const pauses = Array.isArray(stafferRecord?.pauses)
    ? stafferRecord.pauses
    : [];

  const todayUtc = getTodayUtc();
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  const currentYear = yearStart.getUTCFullYear();

  const rows = pauses
    .map((pause) => {
      const start = parseItalianDate(pause?.dataRichiesta);
      const end = parseItalianDate(pause?.dataRitorno);
      if (!start || !end) return null;

      const overlapsYear = countOverlapDays(start, end, yearStart, yearEnd) > 0;
      if (!overlapsYear) return null;

      const scaledDays = computePauseScaledDaysThisYear(
        pause,
        todayUtc,
        yearStart,
        yearEnd,
      );
      const statusLabel = getPauseStatusLabel(pause, todayUtc);
      return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}** | Giorni scalati: \`${scaledDays}\``;
    })
    .filter(Boolean);

  if (!rows.length) {
    return safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            `<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nell'anno **${currentYear}**.`,
          ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const totalScaledDays = computeConsumedPauseDays(pauses);
  const chunks = splitRowsForEmbeds(rows);

  const embeds = chunks.map((chunk, index) =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(
        `Pause ${currentYear} - ${targetUser.username}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`,
      )
      .setDescription(
        `${chunk}\n\nTotale giorni scalati anno corrente: \`${totalScaledDays}\``,
      ),
  );

  return safeEditReply(interaction, {
    embeds,
    flags: EPHEMERAL_FLAG,
  });
}

module.exports = {
  staffRoleIdsBySubcommand: {
    request: [IDs.roles.PartnerManager, IDs.roles.Staff],
    list: [IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.HighStaff],
  },
  data: new SlashCommandBuilder()
    .setName("pausa")
    .setDescription("Gestione pause staffer")
    .addSubcommand((command) =>
      command
        .setName("request")
        .setDescription("Richiedi una pausa")
        .addStringOption((option) =>
          option
            .setName("data_richiesta")
            .setDescription(
              "Data richiesta (es: oggi, domani, GG/MM, GG/MM/AAAA)",
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("data_ritorno")
            .setDescription(
              "Data ritorno (es: oggi, domani, GG/MM, GG/MM/AAAA)",
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("motivazione")
            .setDescription("Motivo della pausa")
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("list")
        .setDescription("Lista pause dell'anno corrente")
        .addUserOption((option) =>
          option
            .setName("staffer")
            .setDescription("Staffer da controllare")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    if (subcommand === "request") {
      return handlePauseRequest(interaction, guildId);
    }

    if (subcommand === "list") {
      return handlePauseList(interaction, guildId);
    }
  },
};
