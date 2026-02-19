const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeEditReply } = require("../../Utils/Moderation/reply");
const {
  createGuildBackup,
  readBackupByIdGlobal,
  listAllBackupMetas,
} = require("../../Services/Backup/serverBackupService");
const {
  createLoadSession,
  buildLoadWarningEmbed,
  buildLoadComponents,
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
} = require("../../Services/Backup/backupLoadService");
const { renderList } = require("../../Services/Backup/backupListService");

const EPHEMERAL_FLAG = 1 << 6;
const CHANNEL_TYPE_LABEL = {
  0: "#",
  2: "🔊",
  4: "▾",
  5: "📢",
  13: "🎙",
  15: "🧵",
  16: "🧵",
};

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const val = size / 1024 ** idx;
  return `${val.toFixed(val >= 100 || idx === 0 ? 0 : 2)} ${units[idx]}`;
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

function buildCreatingEmbed() {
  return new EmbedBuilder()
    .setColor("#4aa3ff")
    .setDescription("<a:loading:1443934440614264924> **Creating backup ...**");
}

function buildSuccessEmbed(interaction, result) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("Success")
    .setDescription(
      [
        `Successfully created backup with id \`${result.backupId}\`.`,
        "",
        "Usage",
        `\`/backup info backup_id: ${result.backupId}\``,
        `\`/backup load backup_id: ${result.backupId}\``,
      ].join("\n"),
    )
    .addFields([
      {
        name: "Saved",
        value: [
          `Members/Bots: **${result.stats.members}**`,
          `Roles: **${result.stats.roles}**`,
          `Channels: **${result.stats.channels}**`,
          `Threads: **${result.stats.threads}**`,
          `Messages: **${result.stats.messages}**`,
          `Bans: **${result.stats.bans}**`,
          `Invites: **${result.stats.invites}**`,
          `Webhooks: **${result.stats.webhooks}**`,
          `File: \`${result.fileName}\` (${formatBytes(result.sizeBytes)})`,
        ].join("\n"),
        inline: false,
      },
    ])
    .setFooter({
      text: interaction.guild?.name || "Backup",
      iconURL: interaction.guild?.iconURL?.() || null,
    })
    .setTimestamp();
}

function buildErrorEmbed(error, title = "Backup non riuscito") {
  const detail = String(error?.message || error || "Errore sconosciuto").slice(
    0,
    400,
  );
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle(title)
    .setDescription(`<:vegax:1443934876440068179> ${detail}`);
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

function buildInfoEmbed(interaction, backupId, backupData, fileSize) {
  const payload = backupData || {};
  const guild = payload.guild || {};
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  const members = Array.isArray(payload.members) ? payload.members : [];
  const bans = Array.isArray(payload.bans) ? payload.bans : [];
  const totalMessages = countMessages(payload);
  const channelLines = formatChannelList(channels);
  const roleLines = formatRoleList(roles);
  const createdAt = Math.floor(new Date(payload.createdAt || Date.now()).getTime() / 1000);

  const minimalBackup =
    totalMessages <= 0 || members.length <= 0 || bans.length <= 0;

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(
      `Backup Info - ${guild.name || interaction.guild?.name || "Unknown Guild"}`,
    )
    .setDescription(
      minimalBackup
        ? "This backup doesn't contain any messages, members, or bans."
        : "This backup contains a full server snapshot.",
    )
    .addFields([
      {
        name: "Created At",
        value: `<t:${createdAt}:R>`,
        inline: true,
      },
      {
        name: "Stored Until",
        value: "forever",
        inline: true,
      },
      {
        name: "Backup ID",
        value: `\`${backupId}\``,
        inline: true,
      },
      {
        name: "Channels",
        value: String(channels.length),
        inline: true,
      },
      {
        name: "Roles",
        value: String(roles.length),
        inline: true,
      },
      {
        name: "Threads",
        value: String(threads.length),
        inline: true,
      },
      {
        name: "Members",
        value: String(members.length),
        inline: true,
      },
      {
        name: "Bans",
        value: String(bans.length),
        inline: true,
      },
      {
        name: "Messages",
        value: `${totalMessages} total`,
        inline: true,
      },
      {
        name: "Channels",
        value: toCodeBlock(channelLines),
        inline: true,
      },
      {
        name: "Roles",
        value: toCodeBlock(roleLines),
        inline: true,
      },
      {
        name: "File",
        value: `\`${backupId}.json.gz\` (${formatBytes(fileSize)})`,
        inline: false,
      },
    ])
    .setFooter({
      text: interaction.guild?.name || "Backup",
      iconURL: interaction.guild?.iconURL?.() || null,
    })
    .setTimestamp();

  return embed;
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

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("Warning")
    .setDescription(
      "Are you sure that you want to delete this backup? **This can not be undone.**",
    );
}

function buildDeleteConfirmButtons(backupId, ownerId, sourceGuildId = null) {
  const token = encodeBackupToken(backupId, sourceGuildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_delete_confirm:${token}:${ownerId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_delete_cancel:${token}:${ownerId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildLoadStatusEmbed(status) {
  if (!status) {
    return new EmbedBuilder()
      .setColor("#3498db")
      .setTitle("Backup Load Status")
      .setDescription("Nessun backup load in corso in questo server.");
  }
  const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
  const actions = Array.isArray(status.actions) ? status.actions : [];
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Backup Load Status")
    .setDescription(
      [
        `Backup ID: \`${String(status.backupId || "").toUpperCase()}\``,
        `Started: <t:${startedAt}:R>`,
        `Phase: \`${String(status.phase || "starting")}\``,
        `Processed items: **${Number(status.processed || 0)}**`,
        `Cancel requested: **${status.cancelRequested ? "yes" : "no"}**`,
        `Actions: ${actions.length ? `\`${actions.join("`, `")}\`` : "none"}`,
      ].join("\n"),
    );
}

function buildLoadCancelResultEmbed(cancelled) {
  return new EmbedBuilder()
    .setColor(cancelled ? "#2ecc71" : "#3498db")
    .setTitle(cancelled ? "Success" : "Info")
    .setDescription(
      cancelled
        ? "Richiesta di annullamento inviata. Il processo verra fermato appena possibile."
        : "Nessun backup load attivo da annullare.",
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Gestione backup server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Salva una snapshot completa del server"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Mostra i dettagli di un backup")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da visualizzare")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("load")
        .setDescription("Carica un backup nel server")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da caricare")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Mostra tutti i backup disponibili"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Elimina un backup salvato")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da eliminare")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Mostra lo stato del backup load in corso"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Annulla il backup load attualmente in corso"),
    ),

  helpDescription: "Gestisce backup completi del server (create, info, load, list, delete, status, cancel).",

  async autocomplete(interaction) {
    try {
      if (String(interaction.commandName || "").toLowerCase() !== "backup") {
        return;
      }
      const focused = interaction.options.getFocused(true);
      if (!focused || focused.name !== "backup_id") {
        return interaction.respond([]);
      }

      const query = String(focused.value || "").trim();
      const metas = await listAllBackupMetas({
        search: query,
        limit: 25,
      });

      const choices = metas.slice(0, 25).map((meta) => {
        const name = String(meta.label || meta.backupId).slice(0, 100);
        const value = String(
          meta.guildId ? `${meta.guildId}:${meta.backupId}` : meta.backupId || "",
        ).slice(0, 100);
        return { name, value };
      });

      return interaction.respond(choices);
    } catch (error) {
      global.logger?.error?.("[backup.autocomplete] failed:", error);
      return interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    if (sub === "create") {
      await safeEditReply(interaction, {
        embeds: [buildCreatingEmbed()],
        flags: EPHEMERAL_FLAG,
      });

      void (async () => {
        try {
          const result = await createGuildBackup(interaction.guild);
          await safeEditReply(interaction, {
            embeds: [buildSuccessEmbed(interaction, result)],
            flags: EPHEMERAL_FLAG,
          });
        } catch (error) {
          global.logger?.error?.("[backup.create] failed:", error);
          await safeEditReply(interaction, {
            embeds: [buildErrorEmbed(error)],
            flags: EPHEMERAL_FLAG,
          });
        }
      })();
      return;
    }

    if (sub === "info") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "Backup info")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const result = await readBackupByIdGlobal(backupRef);
        const backupId = String(result?.payload?.backupId || "").toUpperCase();
        await safeEditReply(interaction, {
          embeds: [
            buildInfoEmbed(
              interaction,
              backupId,
              result.payload,
              result.sizeBytes,
            ),
          ],
          components: [buildInfoButtons(backupId, interaction.user.id, result.guildId)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.info] failed:", error);
        const notFound =
          error?.code === "ENOENT"
            ? `Backup \`${backupRef}\` non trovato.`
            : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "Backup info non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "load") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "Backup load")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const globalRef = await readBackupByIdGlobal(backupRef);
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        const sessionId = createLoadSession({
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          backupId,
          sourceGuildId: globalRef.guildId,
        });
        await safeEditReply(interaction, {
          embeds: [buildLoadWarningEmbed(backupId)],
          components: buildLoadComponents(sessionId),
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        const notFound =
          error?.code === "ENOENT"
            ? `Backup \`${backupRef}\` non trovato.`
            : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "Backup load non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "list") {
      try {
        const payload = await renderList(interaction, interaction.user.id, 1);
        await safeEditReply(interaction, {
          ...payload,
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.list] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "Backup list non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "delete") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "Backup delete")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const globalRef = await readBackupByIdGlobal(backupRef);
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        await safeEditReply(interaction, {
          embeds: [buildDeleteWarningEmbed()],
          components: [
            buildDeleteConfirmButtons(
              backupId,
              interaction.user.id,
              globalRef.guildId,
            ),
          ],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.delete] failed:", error);
        const notFound =
          error?.code === "ENOENT"
            ? `Backup \`${backupRef}\` non trovato.`
            : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "Backup delete non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "status") {
      try {
        const status = getGuildBackupLoadStatus(interaction.guild.id);
        await safeEditReply(interaction, {
          embeds: [buildLoadStatusEmbed(status)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.status] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "Backup status non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "cancel") {
      try {
        const cancelled = cancelGuildBackupLoad(interaction.guild.id);
        await safeEditReply(interaction, {
          embeds: [buildLoadCancelResultEmbed(cancelled)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.cancel] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "Backup cancel non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }
  },
};
