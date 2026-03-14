const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { readBackupByIdGlobal, deleteBackupByIdGlobal } = require("../Services/Backup/serverBackupService");
const { createLoadSession, buildLoadWarningEmbed, buildLoadComponents } = require("../Services/Backup/backupLoadService");
const { safeEditReply } = require("../../shared/discord/replyRuntime");
const PREFIX_LOAD = "backup_info_load:";
const PREFIX_DELETE = "backup_info_delete:";
const PREFIX_CONFIRM = "backup_delete_confirm:";
const PREFIX_CANCEL = "backup_delete_cancel:";

function match(interaction) {
  const id = interaction?.customId || "";
  return (
    interaction.isButton() &&
    (id.startsWith(PREFIX_LOAD) || id.startsWith(PREFIX_DELETE) || id.startsWith(PREFIX_CONFIRM) || id.startsWith(PREFIX_CANCEL))
  );
}

async function execute(interaction) {
  const customId = interaction.customId || "";
  const EPHEMERAL = 1 << 6;

  if (customId.startsWith(PREFIX_LOAD)) {
    const parts = customId.slice(PREFIX_LOAD.length).split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Non autorizzato.", flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    try {
      const globalRef = await readBackupByIdGlobal(guildId ? `${guildId}:${backupId}` : backupId);
      const bid = String(globalRef?.payload?.backupId || backupId).toUpperCase();
      const sessionId = createLoadSession({
        guildId: interaction.guild?.id,
        userId: interaction.user?.id,
        backupId: bid,
        sourceGuildId: globalRef?.guildId ?? null,
        messagesLimit: null,
      });
      await safeEditReply(interaction, {
        embeds: [buildLoadWarningEmbed(bid, null)],
        components: buildLoadComponents(sessionId, null, null),
        flags: EPHEMERAL,
      });
    } catch (err) {
      global.logger?.error?.("[Buttons/backupInfo] load", err);
      await safeEditReply(interaction, {
        content: `<:vegax:1443934876440068179> ${String(err?.message || err).slice(0, 300)}`,
        flags: EPHEMERAL,
      });
    }
    return true;
  }

  if (customId.startsWith(PREFIX_DELETE)) {
    const parts = customId.slice(PREFIX_DELETE.length).split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Non autorizzato.", flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    await safeEditReply(interaction, {
      embeds: [buildDeleteWarningEmbed()],
      components: [buildDeleteConfirmButtons(backupId, userId, guildId)],
      flags: EPHEMERAL,
    });
    return true;
  }

  if (customId.startsWith(PREFIX_CANCEL)) {
    const rest = customId.slice(PREFIX_CANCEL.length);
    const parts = rest.split(":");
    const [backupId, userId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Non autorizzato.", flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    await safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor("#3498db").setDescription("<:VC_Info:1460670816214585481> Eliminazione annullata.")],
      components: [],
      flags: EPHEMERAL,
    });
    return true;
  }

  if (customId.startsWith(PREFIX_CONFIRM)) {
    const rest = customId.slice(PREFIX_CONFIRM.length);
    const parts = rest.split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Non autorizzato.", flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    try {
      const backupRef = guildId ? `${guildId}:${backupId}` : backupId;
      await deleteBackupByIdGlobal(backupRef);
      await safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:success:1461731530333229226> Backup eliminato")
            .setDescription(`<:success:1461731530333229226> Il backup \`${backupId}\` è stato eliminato.`),
        ],
        components: [],
        flags: EPHEMERAL,
      });
    } catch (err) {
      global.logger?.error?.("[Buttons/backupInfo] delete", err);
      await safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${String(err?.message || err).slice(0, 300)}`),
        ],
        components: [],
        flags: EPHEMERAL,
      });
    }
    return true;
  }

  return false;
}

function buildInfoButtons(backupId, userId, guildId) {
  const loadId = `${PREFIX_LOAD}${backupId}:${userId}:${guildId || ""}`;
  const deleteId = `${PREFIX_DELETE}${backupId}:${userId}:${guildId || ""}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(loadId)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<a:VC_Loading:1462504528774430962>"),
    new ButtonBuilder()
      .setCustomId(deleteId)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("<:VC_purge:1478861828271636561>")
  );
}

function buildDeleteConfirmButtons(backupId, userId, guildId) {
  const confirmId = `${PREFIX_CONFIRM}${backupId}:${userId}:${guildId || ""}`;
  const cancelId = `${PREFIX_CANCEL}${backupId}:${userId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("<:success:1461731530333229226>"),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:cancel:1461730653677551691>")
  );
}

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#e74c3c")
    .setTitle("<:VC_Alert:1448670089670037675> Conferma eliminazione")
    .setDescription(
      "<:VC_PinkQuestionMark:1471892611026391306> Sei sicuro di voler **eliminare** questo backup? L'operazione è **irreversibile** e non potrai recuperare i dati."
    );
}

module.exports = { name: "backupInfo", order: 8, match, execute, buildInfoButtons, buildDeleteConfirmButtons, buildDeleteWarningEmbed };