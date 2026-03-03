const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { safeEditReply } = require("../../Utils/Moderation/reply");
const { createGuildBackup, readBackupByIdGlobal, listAllBackupMetas, } = require("../../Services/Backup/serverBackupService");
const { createLoadSession, buildLoadWarningEmbed, buildLoadComponents, getGuildBackupLoadStatus, cancelGuildBackupLoad, } = require("../../Services/Backup/backupLoadService");
const { renderList } = require("../../Services/Backup/backupListService");
const EPHEMERAL_FLAG = 1 << 6;
const CHANNEL_TYPE_LABEL = { 0: "#", 2: "[VC]", 4: "[CAT]", 5: "[ANN]", 13: "[STAGE]", 15: "[FORUM]", 16: "[MEDIA]", };

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1,);
  const val = size / 1024 ** idx;
  return `${val.toFixed(val >= 100 || idx === 0 ? 0 : 2)} ${units[idx]}`;
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

function buildCreatingEmbed() {
  return new EmbedBuilder()
    .setColor("#4aa3ff")
    .setDescription("<a:VC_Loading:1448687876018540695> **Creazione backup in corso...**");
}

function buildSuccessEmbed(interaction, result) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("Completato")
    .setDescription(
      [
        `<:success:1461731530333229226> Backup creato con successo con ID \`${result.backupId}\`.`,
        "",
        "<:VC_Info:1460670816214585481> Comandi utili",
        `\`/backup info backup_id: ${result.backupId}\``,
        `\`/backup load backup_id: ${result.backupId}\``,
      ].join("\n"),
    )
    .addFields([
      {
        name: "Salvato",
        value: [
          `<:member_role_icon:1330530086792728618> Membri/Bot: **${result.stats.members}**`,
          `<:VC_Mention:1443994358201323681> Ruoli: **${result.stats.roles}**`,
          `<:discordchannelwhite:1443308552536985810> Canali: **${result.stats.channels}**`,
          `<:VC_threads:1478515497569095760> Thread: **${result.stats.threads}**`,
          `<:VC_Chat:1448694742237053061> Messaggi: **${result.stats.messages}**`,
          `<:VC_BanHammer:1443933132645732362> Bans: **${result.stats.bans}**`,
          `<:VC_Link:1448688587133685895> Invites: **${result.stats.invites}**`,
          `<:VC_webhooks:1478515450769047704> Webhooks: **${result.stats.webhooks}**`,
          `<:VC_file:1478515880722698300> File: \`${result.fileName}\` (${formatBytes(result.sizeBytes)})`,
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
  const detail = String(error?.message || error || "Errore sconosciuto").slice(0, 400,);
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
  const sorted = [...roles].sort((a, b) => Number(b?.position ?? 0) - Number(a?.position ?? 0),);
  return sorted.map((role, idx) => `${idx + 1}. ${role.name}`);
}

function countMessages(payload) {
  const chMap = payload?.messages?.channels || {};
  const thMap = payload?.messages?.threads || {};
  const channels = Object.values(chMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0,);
  const threads = Object.values(thMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0,);
  return channels + threads;
}

function buildInfoEmbed(interaction, backupId, backupData, fileSize, checksum = null) {
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

  const minimalBackup = totalMessages <= 0 || members.length <= 0 || bans.length <= 0;

  const embed = new EmbedBuilder().setColor("#3498db").setTitle(`Info Backup - ${guild.name || interaction.guild?.name || "Server sconosciuto"}`,
  )
    .setDescription(
      minimalBackup
        ? "<:vegax:1443934876440068179> Questo backup non contiene messaggi, membri o ban."
        : "Questo backup contiene uno snapshot completo del server.",
    )
    .addFields([
      {
        name: "<:VC_Clock:1473359204189474886> Creato il",
        value: `<t:${createdAt}:R>`,
        inline: true,
      },
      {
        name: "<a:VC_Timer:1462779065625739344> Conservato fino a",
        value: "per sempre",
        inline: true,
      },
      {
        name: "<:VC_id:1478517313618575419> Backup ID",
        value: `\`${backupId}\``, inline: true,
      }, { name: "Canali", value: String(channels.length), inline: true, }, { name: "Ruoli", value: String(roles.length), inline: true, }, { name: "Thread", value: String(threads.length), inline: true, }, { name: "Canali", value: toCodeBlock(channelLines), inline: true, }, { name: "Ruoli", value: toCodeBlock(roleLines), inline: true, }, { name: "Membri", value: String(members.length), inline: true, }, { name: "Ban", value: String(bans.length), inline: true, }, {
        name: "Messaggi", value: `${totalMessages}totali`,
        inline: true,
      },
      {
        name: "<:VC_file:1478515880722698300> File backup",
        value: `\`${backupId}.json.gz\` (${formatBytes(fileSize)})`,
        inline: false,
      },
      {
        name: "<:VC_Link:1448688587133685895> Integrità",
        value: checksum
          ? `\`SHA256\` payload: \`${String(checksum.payload || "").slice(0, 12)}...\`\n\`SHA256\` compressed: \`${String(checksum.compressed || "").slice(0, 12)}...\`` : "N/D", inline: false,
      },]).setFooter({ text: interaction.guild?.name || "Backup", iconURL: interaction.guild?.iconURL?.() || null, }).setTimestamp();

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
      .setLabel("Carica backup")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`backup_info_delete:${token}:${ownerId}`)
      .setLabel("Elimina backup")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false),
  );
}

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<:success:1461731530333229226> Conferma eliminazione")
    .setDescription(
      '<:PinkQuestionMark:1471892611026391306> Vuoi davvero eliminare questo backup?',
      '<a:S_News_3:1471891662786527253> **Questa azione non è reversibile.**'
    );
}

function buildDeleteConfirmButtons(backupId, ownerId, sourceGuildId = null) {
  const token = encodeBackupToken(backupId, sourceGuildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_delete_confirm:${token}:${ownerId}`)
      .setLabel("Conferma")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_delete_cancel:${token}:${ownerId}`)
      .setLabel("Annulla")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildLoadStatusEmbed(status) {
  if (!status) {
    return new EmbedBuilder()
      .setColor("#3498db")
      .setTitle("<a:VC_Loading:1462504528774430962> Stato caricamento backup")
      .setDescription("<:cancel:1461730653677551691> Nessun backup load in corso in questo server.");
  }
  const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
  const actions = Array.isArray(status.actions) ? status.actions : [];
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_Info:1460670816214585481> Stato caricamento backup")
    .setDescription(
      [
        `<:VC_id:1478517313618575419> Backup ID: \`${String(status.backupId || "").toUpperCase()}\``,
        `<:VC_Clock:1473359204189474886> Avviato: <t:${startedAt}:R>`,
        `<a:VC_Loading:1448687876018540695> Fase: \`${String(status.phase || "avvio")}\``,
        `<a:VC_Loading:1462504528774430962> Elementi processati: **${Number(status.processed || 0)}**`,
        `<:cancel:1461730653677551691> Annullamento richiesto: **${status.cancelRequested ? "sì" : "no"}**`,
        `<:VC_Link:1448688587133685895> Limite messaggi: \`${status.messagesLimit == null ? "TUTTI" : Number(status.messagesLimit || 0)}\``,
        `<:VC_BanHammer:1443933132645732362> Azioni: ${actions.length ? `\`${actions.join("`, `")}\`` : "nessuna"}`,
      ].join("\n"),
    );
}

function buildLoadCancelResultEmbed(cancelled) {
  return new EmbedBuilder()
    .setColor(cancelled ? "#2ecc71" : "#3498db")
    .setTitle(cancelled ? "<:success:1461731530333229226> Completato" : " <:VC_Info:1460670816214585481> Info")
    .setDescription(
      cancelled
        ? "<:success:1461731530333229226> Richiesta di annullamento inviata. Il processo verrà fermato appena possibile."
        : "<:cancel:1461730653677551691> Nessun backup load attivo da annullare.",
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
        )
        .addIntegerOption((option) =>
          option
            .setName("messages_limit")
            .setDescription("Quanti messaggi ripristinare (0 = tutti, max 50000)")
            .setMinValue(0)
            .setMaxValue(50000)
            .setRequired(false),
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
      const metas = await listAllBackupMetas({ search: query, limit: 25, });

      const choices = metas.slice(0, 25).map((meta) => {
        const name = String(meta.label || meta.backupId).slice(0, 100); const value = String(meta.guildId ? `${meta.guildId}:${meta.backupId}` : meta.backupId || "",
        ).slice(0, 100);
        return { name, value };
      });

      return interaction.respond(choices);
    } catch (error) {
      global.logger?.error?.("[backup.autocomplete] failed:", error);
      return interaction.respond([]).catch(() => { });
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

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
          embeds: [buildErrorEmbed("backup_id non valido.", "<:VC_Info:1460670816214585481> Backup info")],
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
              result.checksum,
            ),
          ],
          components: [buildInfoButtons(backupId, interaction.user.id, result.guildId)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.info] failed:", error);
        const notFound = error?.code === "ENOENT" ? `Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup info non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "load") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      const messagesLimit = interaction.options.getInteger("messages_limit");
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "<a:VC_Loading:1462504528774430962> Backup load")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const globalRef = await readBackupByIdGlobal(backupRef);
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        const sessionId = createLoadSession({ guildId: interaction.guild.id, userId: interaction.user.id, backupId, sourceGuildId: globalRef.guildId, messagesLimit, });
        await safeEditReply(interaction, {
          embeds: [buildLoadWarningEmbed(backupId, messagesLimit)],
          components: buildLoadComponents(sessionId, null, messagesLimit),
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        const notFound = error?.code === "ENOENT" ? `Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup load non riuscito")],
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
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup list non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "delete") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "<:cancel:1461730653677551691> Backup delete")],
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
        const notFound = error?.code === "ENOENT" ? `Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup delete non riuscito")],
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
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup status non riuscito")],
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
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup cancel non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }
  },
};