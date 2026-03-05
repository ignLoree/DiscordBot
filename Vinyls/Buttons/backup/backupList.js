const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { BACKUP_LIST_PREFIXES } = require("../ids/backup");
const { listAllBackupMetasPaginated, readBackupByIdGlobal } = require("../../Services/Backup/serverBackupService");
const { buildInfoButtons } = require("./backupInfo");

const name = "backupList";
const label = "Backup List";
const description = "Lista backup: paginazione e selezione backup da elenco.";
const order = 3;

const PAGE_SIZE = 10;
const CHANNEL_TYPE_LABEL = { 0: "<:channeltext:1443247596922470551>", 2: "<:voice:1467639623735054509>", 4: "<:VC_arrow_down:1478825322500853973>", 5: "<a:VC_Announce:1448687280381235443>", 13: "<:VC_Microfono:1478825679205302504>", 15: "<:VC_threads:1478515497569095760>", 16: "<:VC_file:1478515880722698300>", };

function splitCustomId(customId) {
  return String(customId || "").split(":");
}

function toUnix(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return Math.floor(Date.now() / 1000);
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
  const safe = truncateLines(lines).join("\n").slice(0, 950);
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
      out.push(`${i}.   ${CHANNEL_TYPE_LABEL[Number(ch.type)] || "#"} ${ch.name}`);
      i += 1;
    }
  }
  const uncategorized = sortChannels(byParent.get("root") || []);
  for (const ch of uncategorized) {
    out.push(`${i}. ${CHANNEL_TYPE_LABEL[Number(ch.type)] || "#"} ${ch.name}`);
    i += 1;
  }
  return out;
}

function formatRoleList(roles = []) {
  const sorted = [...roles].sort((a, b) => Number(b?.position ?? 0) - Number(a?.position ?? 0));
  return sorted.map((role, idx) => `${idx + 1}. ${role.name}`);
}

function countMessages(payload) {
  const chMap = payload?.messages?.channels || {};
  const thMap = payload?.messages?.threads || {};
  const channels = Object.values(chMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const threads = Object.values(thMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  return channels + threads;
}

function buildListSelectionInfoEmbed(backupId, payload, sizeBytes) {
  const guild = payload?.guild || {};
  const createdAtTs = Math.floor(new Date(payload?.createdAt || Date.now()).getTime() / 1000);
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
    .setTitle(`<:VC_Info:1460670816214585481> Info Backup - ${guild?.name || "Server sconosciuto"}`)
    .setDescription(`<:VC_id:1478517313618575419>Backup ID: \`${String(backupId || "").toUpperCase()}\``)
    .addFields(
      { name: "<:VC_Clock:1473359204189474886> Creato il", value: `<t:${createdAtTs}:R>`, inline: true },
      { name: "<a:VC_Timer:1462779065625739344> Conservato fino a", value: "per sempre", inline: true },
      { name: "<:VC_Chat:1448694742237053061> Messaggi", value: String(messages), inline: true },
      { name: "<:channeltext:1443247596922470551> Canali", value: String(channels), inline: true },
      { name: "<:VC_Mention:1443994358201323681> Ruoli", value: String(roles), inline: true },
      { name: "<:VC_threads:1478515497569095760> Threads", value: String(threads), inline: true },
      { name: "<:channeltext:1443247596922470551> Canali", value: toCodeBlock(channelLines), inline: true },
      { name: "<:VC_Mention:1443994358201323681>Ruoli", value: toCodeBlock(roleLines), inline: true },
      { name: "<:member_role_icon:1330530086792728618> Membri", value: String(members), inline: true },
      { name: "<:VC_BanHammer:1443933132645732362> Bans", value: String(bans), inline: true },
      {
        name: "<:VC_file:1478515880722698300> File",
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
    .setTitle("<:VC_Info:1460670816214585481> Backup List")
    .setDescription(
      [
        `<a:VC_Loading:1448687876018540695> Displaying ${(page - 1) * PAGE_SIZE + (items.length ? 1 : 0)} - ${(page - 1) * PAGE_SIZE + items.length} of ${total} total backups`,
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
    .setPlaceholder("Seleziona un backup")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      items.map((item) => {
        const backupId = String(item?.backupId || "").toUpperCase();
        const backupRef = String(item?.guildId ? `${item.guildId}:${backupId}` : backupId).slice(0, 100);
        const guildName = truncate(item?.guildName || "Server sconosciuto", 70);
        const ts = toUnix(item?.createdAt);
        return {
          label: backupId.slice(0, 100),
          value: backupRef,
          description: truncate(`${guildName}|${new Date(ts * 1000).toLocaleString("it-IT")}`, 100),
        };
      }),
    );

  const selectRow = new ActionRowBuilder().addComponents(select);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_list_prev:${ownerId}:${page}`)
      .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`backup_list_next:${ownerId}:${page}`)
      .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
  );

  return [selectRow, buttons];
}

async function renderList(interaction, ownerId, page) {
  const pageData = await listAllBackupMetasPaginated({ page, pageSize: PAGE_SIZE });

  if (!pageData.items.length) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#3498db")
          .setTitle("<:VC_Info:1460670816214585481>Backup List")
          .setDescription("<a:VC_Alert:1448670089670037675> Nessun backup disponibile."),
      ],
      components: [],
    };
  }

  return {
    embeds: [buildListEmbed({ pageData })],
    components: buildListComponents({ ownerId, pageData }),
  };
}

async function execute(interaction) {
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
    await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_list_prev:")) {
    const current = Math.max(1, Number(pageRaw || 1));
    const payload = await renderList(interaction, ownerId || interaction.user.id, current - 1);
    await interaction.update(payload).catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_list_next:")) {
    const current = Math.max(1, Number(pageRaw || 1));
    const payload = await renderList(interaction, ownerId || interaction.user.id, current + 1);
    await interaction.update(payload).catch(() => { });
    return true;
  }

  if (isSelect && customId.startsWith("backup_list_select:")) {
    const backupRef = String(interaction.values?.[0] || "").trim();
    if (!backupRef) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Backup non valido.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    try {
      const info = await readBackupByIdGlobal(backupRef);
      const backupId = String(info?.payload?.backupId || "").toUpperCase();
      await interaction
        .update({
          embeds: [buildListSelectionInfoEmbed(backupId, info.payload, info.sizeBytes)],
          components: [buildInfoButtons(backupId, interaction.user.id, info.guildId)],
        })
        .catch(() => { });
    } catch (error) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1448670089670037675> Backup non trovato o non accessibile.",
          flags: 1 << 6,
        })
        .catch(() => { });
    }
    return true;
  }

  return false;
}

function match(interaction) {
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  const id = String(interaction.customId || "");
  return BACKUP_LIST_PREFIXES.some((p) => id.startsWith(p));
}

module.exports = { name, label, description, order, match, execute, renderList, buildListEmbed, buildListComponents, buildListSelectionInfoEmbed };