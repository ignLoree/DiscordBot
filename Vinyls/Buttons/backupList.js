const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { listAllBackupMetasPaginated } = require("../Services/Backup/serverBackupService");
const PREFIX_PREV = "backup_list_prev:";
const PREFIX_NEXT = "backup_list_next:";

function match(interaction) {
  const id = interaction?.customId || "";
  return interaction.isButton() && (id.startsWith(PREFIX_PREV) || id.startsWith(PREFIX_NEXT));
}

async function execute(interaction) {
  const customId = interaction.customId || "";
  const userId = interaction.user?.id;
  if (!userId) return false;

  let page = 1;
  if (customId.startsWith(PREFIX_PREV)) {
    const rest = customId.slice(PREFIX_PREV.length).split(":");
    page = Math.max(1, Number.parseInt(rest[1] || "1", 10) - 1);
  } else if (customId.startsWith(PREFIX_NEXT)) {
    const rest = customId.slice(PREFIX_NEXT.length).split(":");
    page = Number.parseInt(rest[1] || "1", 10) + 1;
  }

  try {
    const payload = await renderList(interaction, userId, page);
    const { safeEditReply } = require("../../shared/discord/replyRuntime");
    await safeEditReply(interaction, { ...payload, flags: 1 << 6 });
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/backupList] execute", err);
    await interaction.reply({ content: "<:vegax:1443934876440068179> Errore durante l'aggiornamento della lista.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
}

async function renderList(userId, page = 1) {
  const pageSize = 10;
  const { items, total, totalPages, page: currentPage } = await listAllBackupMetasPaginated({ page, pageSize });

  const lines = items.length
    ? items.map((m, i) => `${(currentPage - 1) * pageSize + i + 1}. **${String(m?.guildName || "?").replace(/\*\*/g, "")}** — \`${m?.backupId || "?"}\` (<t:${Math.floor(Number(m?.createdAt || 0) / 1000)}:d>)`)
    : ["Nessun backup trovato."];

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_Info:1460670816214585481> Lista backup")
    .setDescription(lines.join("\n").slice(0, 3900) || "-")
    .setFooter({ text: `Pagina ${currentPage}/${totalPages} • ${total} backup totali` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX_PREV}${userId}:${currentPage}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_page5:1463196506143326261> ")
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`${PREFIX_NEXT}${userId}:${currentPage}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_page4:1463196456964980808>")
      .setDisabled(currentPage >= totalPages)
  );

  return { embeds: [embed], components: [row] };
}

function buildListSelectionInfoEmbed(selectedBackup) {
  const m = selectedBackup || {};
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_Info:1460670816214585481> Backup selezionato")
    .setDescription(
      [
        `<:VC_Mention:1443994358201323681> **Server:** ${String(m?.guildName || "?").replace(/\*\*/g, "")}`,
        `<:VC_id:1478517313618575419> **Backup ID:** \`${m?.backupId || "?"}\``,
        `<:VC_opentime:1478517163022221323> **Creato:** ${m?.createdAt ? `<t:${Math.floor(Number(m.createdAt) / 1000)}:F>` : "N/D"}`,
      ].join("\n")
    );
}

module.exports = { name: "backupList", order: 9, match, execute, renderList, buildListSelectionInfoEmbed };