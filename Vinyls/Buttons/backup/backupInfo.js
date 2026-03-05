const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { BACKUP_INFO_PREFIXES } = require("../ids/backup");
const { deleteBackupByIdGlobal, readBackupByIdGlobal } = require("../../Services/Backup/serverBackupService");
const { createLoadSession, buildLoadWarningEmbed, buildLoadComponents } = require("../../Services/Backup/backupLoadService");

const name = "backupInfo";
const label = "Backup Info";
const description = "Info e azioni su un backup: carica, elimina, annulla.";
const order = 2;

function splitCustomId(customId) {
  return String(customId || "").split(":");
}

function parseBackupToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return { backupId: "", sourceGuildId: null };
  const [backupIdRaw, sourceGuildIdRaw] = raw.split("|");
  return {
    backupId: String(backupIdRaw || "").trim().toUpperCase(),
    sourceGuildId: sourceGuildIdRaw ? String(sourceGuildIdRaw).trim() : null,
  };
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
      .setEmoji("<:VC_download:1478825280436175009>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`backup_info_delete:${token}:${ownerId}`)
      .setEmoji("<:VC_Trash:1460645075242451025>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false),
  );
}

function buildDeleteConfirmButtons(backupId, ownerId, sourceGuildId = null) {
  const token = encodeBackupToken(backupId, sourceGuildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_info_delete_confirm:${token}:${ownerId}`)
      .setEmoji('<:success:1461731530333229226>')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_info_delete_cancel:${token}:${ownerId}`)
      .setEmoji('<:cancel:1461730653677551691>')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildDeleteConfirmButtonsFromCommand(backupId, ownerId, sourceGuildId = null) {
  const token = encodeBackupToken(backupId, sourceGuildId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_delete_confirm:${token}:${ownerId}`)
      .setEmoji('<:success:1461731530333229226>')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_delete_cancel:${token}:${ownerId}`)
      .setEmoji('<:cancel:1461730653677551691>')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<:success:1461731530333229226> Conferma eliminazione")
    .setDescription(
      [
        "<:PinkQuestionMark:1471892611026391306> Vuoi davvero eliminare questo backup?",
        "<a:VC_Alert:1448670089670037675> **Questa azione non è reversibile.**",
      ].join("\n"),
    );
}

function buildDeleteDoneEmbed(backupId) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setDescription("<:success:1461731530333229226> Backup eliminato con successo.");
}

function buildDeleteCancelledEmbed() {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setDescription(
      [
        "<:cancel:1461730653677551691> **Il backup non è stato eliminato.**",
        "",
        "<:VC_Info:1460670816214585481> **Usa `/backup delete` per riprovare.**",
      ].join("\n"),
    );
}

function buildDeleteErrorEmbed(error) {
  const detail = String(error?.message || error || "Errore sconosciuto").slice(0, 700);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Eliminazione fallita")
    .setDescription(`<:vegax:1443934876440068179> ${detail}`);
}

async function execute(interaction) {
  const customId = String(interaction?.customId || "");
  if (!interaction?.isButton?.()) return false;

  const isBackupDeleteFromCommand =
    customId.startsWith("backup_delete_confirm:") || customId.startsWith("backup_delete_cancel:");

  if (customId.startsWith("backup_info_load:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);
    const backupId = parsed.backupId;

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }

    try {
      const source = await readBackupByIdGlobal(
        parsed.sourceGuildId ? `${parsed.sourceGuildId}:${backupId}` : backupId,
      );
      const sessionId = createLoadSession({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        backupId: String(source?.payload?.backupId || backupId).toUpperCase(),
        sourceGuildId: source.guildId,
      });
      await interaction
        .update({
          embeds: [buildLoadWarningEmbed(backupId)],
          components: buildLoadComponents(sessionId),
        })
        .catch(() => { });
    } catch (error) {
      const notFound =
        error?.code === "ENOENT"
          ? `Backup \`${String(backupId || "").toUpperCase()}\` non trovato.`
          : error;
      await interaction
        .update({
          embeds: [buildDeleteErrorEmbed(notFound)],
          components: [],
        })
        .catch(() => { });
    }
    return true;
  }

  if (customId.startsWith("backup_info_delete:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }

    await interaction
      .update({
        embeds: [buildDeleteWarningEmbed()],
        components: [
          buildDeleteConfirmButtons(parsed.backupId, ownerId || interaction.user.id, parsed.sourceGuildId),
        ],
      })
      .catch(() => { });
    return true;
  }

  if (customId.startsWith("backup_info_delete_cancel:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await interaction
      .update({ embeds: [buildDeleteCancelledEmbed()], components: [] })
      .catch(() => { });
    return true;
  }

  if (customId.startsWith("backup_delete_cancel:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await interaction
      .update({ embeds: [buildDeleteCancelledEmbed()], components: [] })
      .catch(() => { });
    return true;
  }

  if (
    customId.startsWith("backup_info_delete_confirm:") ||
    customId.startsWith("backup_delete_confirm:")
  ) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);
    const backupId = parsed.backupId;

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Questo pannello non è tuo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }

    try {
      await deleteBackupByIdGlobal(
        parsed.sourceGuildId ? `${parsed.sourceGuildId}:${backupId}` : backupId,
      );
      await interaction
        .update({ embeds: [buildDeleteDoneEmbed(backupId)], components: [] })
        .catch(() => { });
    } catch (error) {
      const notFound =
        error?.code === "ENOENT"
          ? `<:cancel:1461730653677551691> Backup \`${String(backupId || "").toUpperCase()}\` non trovato.`
          : error;
      await interaction
        .update({
          embeds: [buildDeleteErrorEmbed(notFound)],
          components: [],
        })
        .catch(() => { });
    }
    return true;
  }

  if (isBackupDeleteFromCommand) return true;
  return false;
}

function match(interaction) {
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  const id = String(interaction.customId || "");
  return BACKUP_INFO_PREFIXES.some((p) => id.startsWith(p));
}

module.exports = { name, label, description, order, match, execute, buildInfoButtons, buildDeleteConfirmButtons: buildDeleteConfirmButtonsFromCommand, buildDeleteWarningEmbed, buildDeleteDoneEmbed, buildDeleteCancelledEmbed, buildDeleteErrorEmbed, encodeBackupToken };