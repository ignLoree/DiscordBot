const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { deleteBackupByIdGlobal, readBackupByIdGlobal } = require("./serverBackupService");
const { createLoadSession, buildLoadWarningEmbed, buildLoadComponents, } = require("./backupLoadService");

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

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("Warning")
    .setDescription(
      "Are you sure that you want to delete this backup? **This can not be undone.**",
    );
}

function buildDeleteDoneEmbed(backupId) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("Success")
    .setDescription("Successfully deleted backup.");
}

function buildDeleteCancelledEmbed() {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Info")
    .setDescription(
      [
        "The backup has not been deleted.",
        "",
        "Use `/backup delete` to try again.",
      ].join("\n"),
    );
}

function buildDeleteErrorEmbed(error) {
  const detail = String(error?.message || error || "Errore sconosciuto").slice(0, 700);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("Delete failed")
    .setDescription(`<:vegax:1443934876440068179> ${detail}`);
}

function buildDeleteConfirmButtons(backupId, ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_info_delete_confirm:${backupId}:${ownerId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_info_delete_cancel:${backupId}:${ownerId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

async function handleBackupInfoInteraction(interaction) {
  const customId = String(interaction?.customId || "");
  if (!interaction?.isButton?.()) return false;

  const isBackupDeleteFromCommand =
    customId.startsWith("backup_delete_confirm:") ||
    customId.startsWith("backup_delete_cancel:");

  if (customId.startsWith("backup_info_load:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);
    const backupId = parsed.backupId;

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction
        .reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 })
        .catch(() => {});
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
        .catch(() => {});
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
        .catch(() => {});
    }
    return true;
  }

  if (customId.startsWith("backup_info_delete:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);
    const backupId = parsed.backupId;

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction
        .reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }

    await interaction
      .update({
        embeds: [buildDeleteWarningEmbed()],
        components: [
          buildDeleteConfirmButtons(
            String(backupToken || "").trim(),
            ownerId || interaction.user.id,
          ),
        ],
      })
      .catch(() => {});
    return true;
  }

  if (customId.startsWith("backup_info_delete_cancel:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction
        .reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }

    await interaction
      .update({
        embeds: [buildDeleteCancelledEmbed()],
        components: [],
      })
      .catch(() => {});
    return true;
  }

  if (customId.startsWith("backup_delete_cancel:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction
        .reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }

    await interaction
      .update({
        embeds: [buildDeleteCancelledEmbed()],
        components: [],
      })
      .catch(() => {});
    return true;
  }

  if (customId.startsWith("backup_info_delete_confirm:") || customId.startsWith("backup_delete_confirm:")) {
    const [, backupToken, ownerId] = splitCustomId(customId);
    const parsed = parseBackupToken(backupToken);
    const backupId = parsed.backupId;

    if (ownerId && String(ownerId) !== String(interaction.user?.id || "")) {
      await interaction
        .reply({ content: "Questo pannello non è tuo.", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }

    try {
      await deleteBackupByIdGlobal(
        parsed.sourceGuildId ? `${parsed.sourceGuildId}:${backupId}` : backupId,
      );
      await interaction
        .update({
          embeds: [buildDeleteDoneEmbed(backupId)],
          components: [],
        })
        .catch(() => {});
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
        .catch(() => {});
    }

    return true;
  }

  if (isBackupDeleteFromCommand) {
    return true;
  }

  return false;
}

module.exports = {
  handleBackupInfoInteraction,
};