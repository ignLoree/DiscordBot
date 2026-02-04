const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

function formatPeriodLabel(period) {
  switch (period) {
    case "7day":
      return "weekly";
    case "1month":
      return "monthly";
    case "3month":
      return "quarterly";
    case "6month":
      return "half";
    case "12month":
      return "yearly";
    case "overall":
      return "alltime";
    default:
      return "alltime";
  }
}

function pad(str, len) {
  const value = String(str || "");
  if (value.length >= len) return value.slice(0, len - 1) + "•";
  return value.padEnd(len, " ");
}

function buildTable(rows, userA, userB) {
  const header = `   ${pad("Artist", 22)} ${pad(userA, 10)} ${pad(userB, 10)}`;
  const divider = "-".repeat(header.length);
  const lines = rows.map((row, index) => {
    const left = String(index + 1).padEnd(2, " ");
    const name = pad(row.name, 22);
    const a = String(row.a).padEnd(4, " ");
    const b = String(row.b).padEnd(4, " ");
    const arrow = row.a === row.b ? "=" : (row.a > row.b ? ">" : "<");
    return `${left} ${name} ${pad(a, 10)}${arrow} ${pad(b, 6)}`;
  });
  return [header, divider, ...lines].join("\n");
}

function buildTasteEmbed({
  title,
  rows,
  userA,
  userB,
  matchLine,
  page,
  totalPages,
  period,
  category,
  numberFormat,
  mode
}) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(title);

  const periodLabel = formatPeriodLabel(period);
  const matchText = matchLine ? `${matchLine} ${periodLabel} match` : null;

  if (mode === "embed") {
    const list = rows.map((row, index) => {
      const a = formatNumber(row.a, numberFormat);
      const b = formatNumber(row.b, numberFormat);
      const arrow = row.a === row.b ? "=" : (row.a > row.b ? ">" : "<");
      return `${index + 1}. **${row.name}** • ${a} ${arrow} ${b}`;
    });
    embed.setDescription([matchText, list.join("\n")].filter(Boolean).join("\n"));
  } else {
    const table = buildTable(rows, userA, userB);
    embed.setDescription([matchText, "```", table, "```"].filter(Boolean).join("\n"));
  }

  embed.setFooter({ text: `Page ${page}/${totalPages}` });
  return embed;
}

function buildTasteComponents({ messageId, page, totalPages, category }) {
  const rowCategories = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_taste_cat:artists:${messageId}`)
      .setLabel("Artists")
      .setStyle(category === "artists" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lfm_taste_cat:genres:${messageId}`)
      .setLabel("Genres")
      .setStyle(category === "genres" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lfm_taste_cat:countries:${messageId}`)
      .setLabel("Countries")
      .setStyle(category === "countries" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  if (totalPages <= 1) return [rowCategories];

  const rowNav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_taste:prev:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\u25C0\uFE0F")
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`lfm_taste:next:${messageId}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\u25B6\uFE0F")
      .setDisabled(page >= totalPages)
  );

  return [rowCategories, rowNav];
}

module.exports = { buildTasteEmbed, buildTasteComponents, formatPeriodLabel };
