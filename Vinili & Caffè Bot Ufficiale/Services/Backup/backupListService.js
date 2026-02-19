const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { listGuildBackupMetasPaginated, readGuildBackup } = require("./serverBackupService");
const {
  createLoadSession,
  buildLoadWarningEmbed,
  buildLoadComponents,
} = require("./backupLoadService");

const PAGE_SIZE = 10;

function splitCustomId(customId) {
  return String(customId || "").split(":");
}

function toUnix(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return Math.floor(Date.now() / 1000);
  }
  return Math.floor(date.getTime() / 1000);
}

function truncate(value, max) {
  const raw = String(value || "");
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 3))}...`;
}

function buildListEmbed({ pageData }) {
  const items = Array.isArray(pageData?.items) ? pageData.items : [];
  const total = Number(pageData?.total || 0);
  const page = Number(pageData?.page || 1);

  const lines = [];
  for (const item of items) {
    const backupId = String(item?.backupId || "").toUpperCase();
    const guildName = item?.guildName || "Unknown Guild";
    const ts = toUnix(item?.createdAt);
    lines.push(`**${backupId}**`);
    lines.push(`${guildName} (<t:${ts}:R>)`);
  }

  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Backup List")
    .setDescription(
      [
        `Displaying ${(page - 1) * PAGE_SIZE + (items.length ? 1 : 0)} - ${(page - 1) * PAGE_SIZE + items.length} of ${total} total backups`,
        "",
        lines.join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    );
}

function buildListComponents({ ownerId, pageData }) {
  const items = Array.isArray(pageData?.items) ? pageData.items : [];
  const page = Number(pageData?.page || 1);
  const totalPages = Number(pageData?.totalPages || 1);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`backup_list_select:${ownerId}:${page}`)
    .setPlaceholder("Select a backup")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      items.map((item) => {
        const backupId = String(item?.backupId || "").toUpperCase();
        const guildName = truncate(item?.guildName || "Unknown Guild", 70);
        const ts = toUnix(item?.createdAt);
        return {
          label: backupId.slice(0, 100),
          value: backupId.slice(0, 100),
          description: truncate(`${guildName} | ${new Date(ts * 1000).toLocaleString("it-IT")}`, 100),
        };
      }),
    );

  const selectRow = new ActionRowBuilder().addComponents(select);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_list_prev:${ownerId}:${page}`)
      .setLabel("Previous Page")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`backup_list_next:${ownerId}:${page}`)
      .setLabel("Next Page")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
  );

  return [selectRow, buttons];
}

async function renderList(interaction, ownerId, page) {
  const pageData = await listGuildBackupMetasPaginated(interaction.guildId, {
    page,
    pageSize: PAGE_SIZE,
  });

  if (!pageData.items.length) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#3498db")
          .setTitle("Backup List")
          .setDescription("No backups available yet."),
      ],
      components: [],
    };
  }

  return {
    embeds: [buildListEmbed({ pageData })],
    components: buildListComponents({ ownerId, pageData }),
  };
}

async function handleBackupListInteraction(interaction) {
  const customId = String(interaction?.customId || "");
  const isButton = interaction?.isButton?.();
  const isSelect = interaction?.isStringSelectMenu?.();

  const isTarget =
    customId.startsWith("backup_list_prev:") ||
    customId.startsWith("backup_list_next:") ||
    customId.startsWith("backup_list_select:");
  if (!isTarget) return false;

  const [, ownerId, pageRaw] = splitCustomId(customId);
  if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
    await interaction.reply({ content: "Questo pannello non e tuo.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (isButton && customId.startsWith("backup_list_prev:")) {
    const current = Math.max(1, Number(pageRaw || 1));
    const payload = await renderList(interaction, ownerId || interaction.user.id, current - 1);
    await interaction.update(payload).catch(() => {});
    return true;
  }

  if (isButton && customId.startsWith("backup_list_next:")) {
    const current = Math.max(1, Number(pageRaw || 1));
    const payload = await renderList(interaction, ownerId || interaction.user.id, current + 1);
    await interaction.update(payload).catch(() => {});
    return true;
  }

  if (isSelect && customId.startsWith("backup_list_select:")) {
    const backupId = String(interaction.values?.[0] || "").trim().toUpperCase();
    if (!backupId) {
      await interaction.reply({ content: "Backup non valido.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    try {
      await readGuildBackup(interaction.guildId, backupId);
      const sessionId = createLoadSession({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        backupId,
      });
      await interaction
        .update({
          embeds: [buildLoadWarningEmbed(backupId)],
          components: buildLoadComponents(sessionId),
        })
        .catch(() => {});
    } catch (error) {
      await interaction
        .reply({
          content: `Backup \`${backupId}\` non trovato.`,
          flags: 1 << 6,
        })
        .catch(() => {});
    }
    return true;
  }

  return false;
}

module.exports = {
  renderList,
  handleBackupListInteraction,
};
