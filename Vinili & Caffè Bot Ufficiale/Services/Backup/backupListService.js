const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { listAllBackupMetasPaginated, readBackupByIdGlobal } = require("./serverBackupService");

const PAGE_SIZE = 10;
const CHANNEL_TYPE_LABEL = {
  0: "#",
  2: "🔊",
  4: "▾",
  5: "📢",
  13: "🎙",
  15: "🧵",
  16: "🧵",
};

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

function truncateLines(lines, maxLines = 32) {
  if (!Array.isArray(lines)) return [];
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines), `... (+${lines.length - maxLines})`];
}

function toCodeBlock(lines) {
  const safe = truncateLines(lines)
    .join("\n")
    .slice(0, 950);
  return `\`\`\`\n${safe || "-"}\n\`\`\``;
}

function sortChannels(channels = []) {
  return [...channels].sort((a, b) => {
    const typeA = Number(a?.type ?? 0);
    const typeB = Number(b?.type ?? 0);
    if (typeA === 4 && typeB !== 4) return -1;
    if (typeA !== 4 && typeB === 4) return 1;
    const posA = Number(a?.position ?? 0);
    const posB = Number(b?.position ?? 0);
    if (posA !== posB) return posA - posB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "it");
  });
}

function formatChannelList(channels = []) {
  const sorted = sortChannels(channels);
  const categories = sorted.filter((c) => Number(c.type) === 4);
  const children = sorted.filter((c) => Number(c.type) !== 4);
  const byParent = new Map();

  for (const child of children) {
    const parentId = child.parentId ? String(child.parentId) : "root";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(child);
  }

  let i = 1;
  const out = [];

  for (const category of categories) {
    out.push(`${i}. ${CHANNEL_TYPE_LABEL[4]} ${category.name}`);
    i += 1;

    const list = sortChannels(byParent.get(String(category.id)) || []);
    for (const ch of list) {
      const icon = CHANNEL_TYPE_LABEL[Number(ch.type)] || "#";
      out.push(`${i}.   ${icon} ${ch.name}`);
      i += 1;
    }
  }

  const uncategorized = sortChannels(byParent.get("root") || []);
  for (const ch of uncategorized) {
    const icon = CHANNEL_TYPE_LABEL[Number(ch.type)] || "#";
    out.push(`${i}. ${icon} ${ch.name}`);
    i += 1;
  }

  return out;
}

function formatRoleList(roles = []) {
  const sorted = [...roles].sort(
    (a, b) => Number(b?.position ?? 0) - Number(a?.position ?? 0),
  );
  return sorted.map((role, idx) => `${idx + 1}. ${role.name}`);
}

function countMessages(payload) {
  const chMap = payload?.messages?.channels || {};
  const thMap = payload?.messages?.threads || {};
  const channels = Object.values(chMap).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  const threads = Object.values(thMap).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  return channels + threads;
}

function encodeBackupToken(backupId, sourceGuildId = null) {
  const id = String(backupId || "").trim().toUpperCase();
  const gid = String(sourceGuildId || "").trim();
  return gid ? `${id}|${gid}` : id;
}

function buildInfoButtons(backupId, ownerId, sourceGuildId = null) {
  const token = encodeBackupToken(backupId, sourceGuildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_info_load:${token}:${ownerId}`)
      .setLabel("Load this backup")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`backup_info_delete:${token}:${ownerId}`)
      .setLabel("Delete this backup")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false),
  );
}

function buildListSelectionInfoEmbed(backupId, payload, sizeBytes) {
  const guild = payload?.guild || {};
  const createdAtTs = Math.floor(
    new Date(payload?.createdAt || Date.now()).getTime() / 1000,
  );
  const roleList = Array.isArray(payload?.roles) ? payload.roles : [];
  const channelList = Array.isArray(payload?.channels) ? payload.channels : [];
  const roles = roleList.length;
  const channels = channelList.length;
  const threads = Array.isArray(payload?.threads) ? payload.threads.length : 0;
  const members = Array.isArray(payload?.members) ? payload.members.length : 0;
  const bans = Array.isArray(payload?.bans) ? payload.bans.length : 0;
  const messages = countMessages(payload);
  const sizeMb = (Number(sizeBytes || 0) / (1024 * 1024)).toFixed(2);
  const channelLines = formatChannelList(channelList);
  const roleLines = formatRoleList(roleList);

  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`Info Backup - ${guild?.name || "Server sconosciuto"}`)
    .setDescription(`Backup ID: \`${String(backupId || "").toUpperCase()}\``)
    .addFields(
      { name: "Creato il", value: `<t:${createdAtTs}:R>`, inline: true },
      { name: "Conservato fino a", value: "per sempre", inline: true },
      { name: "Messaggi", value: String(messages), inline: true },
      { name: "Canali", value: String(channels), inline: true },
      { name: "Ruoli", value: String(roles), inline: true },
      { name: "Threads", value: String(threads), inline: true },
      { name: "Canali", value: toCodeBlock(channelLines), inline: true },
      { name: "Ruoli", value: toCodeBlock(roleLines), inline: true },
      { name: "Membri", value: String(members), inline: true },
      { name: "Bans", value: String(bans), inline: true },
      {
        name: "File",
        value: `\`${String(backupId || "").toUpperCase()}.json.gz\` (${sizeMb} MB)`,
        inline: false,
      },
    );
}

function buildListEmbed({ pageData }) {
  const items = Array.isArray(pageData?.items) ? pageData.items : [];
  const total = Number(pageData?.total || 0);
  const page = Number(pageData?.page || 1);

  const lines = [];
  for (const item of items) {
    const backupId = String(item?.backupId || "").toUpperCase();
    const guildName = item?.guildName || "Server sconosciuto";
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
        const backupRef = String(
          item?.guildId ? `${item.guildId}:${backupId}` : backupId,
        ).slice(0, 100);
        const guildName = truncate(item?.guildName || "Server sconosciuto", 70);
        const ts = toUnix(item?.createdAt);
        return {
          label: backupId.slice(0, 100),
          value: backupRef,
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
  const pageData = await listAllBackupMetasPaginated({
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
    await interaction.reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => {});
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
    const backupRef = String(interaction.values?.[0] || "").trim();
    if (!backupRef) {
      await interaction.reply({ content: "Backup non valido.", flags: 1 << 6 }).catch(() => {});
      return true;
    }

    try {
      const info = await readBackupByIdGlobal(backupRef);
      const backupId = String(info?.payload?.backupId || "").toUpperCase();
      await interaction
        .update({
          embeds: [
            buildListSelectionInfoEmbed(
              backupId,
              info.payload,
              info.sizeBytes,
            ),
          ],
          components: [buildInfoButtons(backupId, interaction.user.id, info.guildId)],
        })
        .catch(() => {});
    } catch (error) {
      await interaction
        .reply({
          content: `Backup non trovato o non accessibile.`,
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