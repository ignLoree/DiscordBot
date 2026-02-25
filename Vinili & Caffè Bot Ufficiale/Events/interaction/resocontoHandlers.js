const {
  EmbedBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const StaffModel = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");

const RESOCONTO_APPLY_PREFIX = "resoconto_apply";
const RESOCONTO_REJECT_PREFIX = "resoconto_reject";
const RESOCONTO_REASON_MODAL_PREFIX = "resoconto_reason";
const RESOCONTO_REASON_INPUT_ID = "reason";

const STAFF_ACTIONS = new Set(["px", "dp", "vp", "vn", "nl"]);
const PM_ACTIONS = new Set(["dp", "rc", "nl"]);
const ROLE_UP = {
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.Coordinator),
  [String(IDs.roles.Coordinator)]: String(IDs.roles.Supervisor),
};
const ROLE_DOWN = {
  [String(IDs.roles.Supervisor)]: String(IDs.roles.Coordinator),
  [String(IDs.roles.Coordinator)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.Member || ""),
  [String(IDs.roles.Helper)]: String(IDs.roles.Member || ""),
};

const ROLE_PARTNER_MANAGER = String(IDs.roles.PartnerManager);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff);
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_COORDINATOR = String(IDs.roles.Coordinator);
const ROLE_SUPERVISOR = String(IDs.roles.Supervisor);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_MANAGER = String(IDs.roles.Manager);
const ROLE_CO_OWNER = String(IDs.roles.CoFounder);
const ROLE_OWNER = String(IDs.roles.Founder);

function parseResocontoButtonCustomId(customId) {
  const raw = String(customId || "");
  const isApply = raw.startsWith(`${RESOCONTO_APPLY_PREFIX}:`);
  const isReject = raw.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
  if (!isApply && !isReject) return null;

  const parts = raw.split(":");
  const mode = parts[0] === RESOCONTO_APPLY_PREFIX ? "apply" : "reject";
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");

  if (!/^\d{16,20}$/.test(userId)) return null;
  if (kind === "s") {
    const roleId = String(parts[3] || "");
    const actionKey = String(parts[4] || "");
    if (!/^\d{16,20}$/.test(roleId) || !STAFF_ACTIONS.has(actionKey)) {
      return null;
    }
    return { mode, kind, userId, roleId, actionKey };
  }

  if (kind === "p") {
    const actionKey = String(parts[3] || "");
    if (!PM_ACTIONS.has(actionKey)) return null;
    return { mode, kind, userId, roleId: null, actionKey };
  }

  return null;
}

function hasResocontoHighStaffAccess(interaction) {
  return Boolean(
    interaction?.member?.roles?.cache?.has?.(ROLE_HIGH_STAFF),
  );
}

function parseResocontoModalCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${RESOCONTO_REASON_MODAL_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length < 6) return null;
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");
  const roleId = String(parts[3] || "");
  const actionKey = String(parts[4] || "");
  const messageId = String(parts[5] || "");
  if (!/^\d{16,20}$/.test(userId)) return null;
  if (!/^\d{16,20}$/.test(messageId)) return null;
  if (kind !== "s" || !STAFF_ACTIONS.has(actionKey) || !/^\d{16,20}$/.test(roleId)) {
    return null;
  }
  if (!["px", "dp", "vp", "vn"].includes(actionKey)) return null;
  return { kind, userId, roleId, actionKey, messageId };
}

function disableMessageComponents(message) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  return rows.map((row) => ({
    type: 1,
    components: (Array.isArray(row?.components) ? row.components : []).map(
      (component) => {
        const json = component?.toJSON ? component.toJSON() : component;
        if (!json || typeof json !== "object") return json;
        return { ...json, disabled: true };
      },
    ),
  }));
}

async function getOrCreateStaffDoc(guildId, userId) {
  let doc = await StaffModel.findOne({ guildId, userId });
  if (!doc) doc = new StaffModel({ guildId, userId });
  return doc;
}

async function sendValutazioneLogEmbed(guild, actor, targetUser, reason, positive) {
  const channel =
    guild.channels.cache.get(IDs.channels.valutazioniStaff) ||
    (await guild.channels.fetch(IDs.channels.valutazioniStaff).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const title = positive
    ? "<a:laydowntorest:1444006796661358673> **__VALUTAZIONE POSITIVA__**"
    : "<a:laydowntorest:1444006796661358673> **__VALUTAZIONE NEGATIVA__**";
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${actor.username}`,
      iconURL: actor.displayAvatarURL(),
    })
    .setTitle(title)
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(
      `<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> <@${targetUser.id}> <:pinnednew:1443670849990430750> __${reason}__`,
    )
    .setColor("#6f4e37");

  await channel.send({ content: `<@${targetUser.id}>`, embeds: [embed] }).catch(() => null);
}

async function applyPexSideEffects(member, roleId) {
  if (roleId === ROLE_HELPER) {
    await member.roles.add(ROLE_STAFF).catch(() => null);
  }
  if (roleId === ROLE_MODERATOR) await member.roles.remove(ROLE_HELPER).catch(() => null);
  if (roleId === ROLE_COORDINATOR) await member.roles.remove(ROLE_MODERATOR).catch(() => null);
  if (roleId === ROLE_SUPERVISOR) await member.roles.remove(ROLE_COORDINATOR).catch(() => null);
  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_SUPERVISOR).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
  }
  if (roleId === ROLE_MANAGER) await member.roles.remove(ROLE_ADMIN).catch(() => null);
  if (roleId === ROLE_CO_OWNER) await member.roles.remove(ROLE_MANAGER).catch(() => null);
  if (roleId === ROLE_OWNER) await member.roles.remove(ROLE_CO_OWNER).catch(() => null);
}

async function applyDepexSideEffects(member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    await member.roles.remove(roleId).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
  }
  if (roleId === ROLE_HELPER || roleId === ROLE_MODERATOR) {
    await member.roles.remove(roleId).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
  }
  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(ROLE_COORDINATOR).catch(() => null);
    await member.roles.add(ROLE_MODERATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
  }
  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(ROLE_SUPERVISOR).catch(() => null);
    await member.roles.add(ROLE_COORDINATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
  }
  if (roleId === ROLE_ADMIN || roleId === ROLE_MANAGER || roleId === ROLE_CO_OWNER) {
    await member.roles.remove(roleId).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
  }
}

async function sendPexDepexLog(guild, type, targetUser, oldRoleId, newRoleId, reason) {
  const channel =
    guild.channels.cache.get(IDs.channels.pexDepex) ||
    (await guild.channels.fetch(IDs.channels.pexDepex).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const oldRole = guild.roles.cache.get(String(oldRoleId || ""));
  const newRole = guild.roles.cache.get(String(newRoleId || ""));
  const typeLabel = type === "pex"
    ? "**<a:everythingisstable:1444006799643508778> PEX**"
    : "**<a:laydowntorest:1444006796661358673> DEPEX**";
  await channel
    .send({
      content: `${typeLabel} <@${targetUser.id}>
<:member_role_icon:1330530086792728618> \`${oldRole?.name || oldRoleId}\` <a:vegarightarrow:1443673039156936837> \`${newRole?.name || newRoleId || "Nessuno"}\`
<:discordstaff:1443651872258003005> __${reason}__`,
    })
    .catch(() => null);
}

async function deleteThreadForMessage(guild, messageId) {
  const thread = await guild.channels.fetch(String(messageId || "")).catch(() => null);
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

async function appendOutcomeToMessage(guild, channelId, messageId, actorId, accepted, statusText) {
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;
  const existingContent = String(message.content || "");
  const line = accepted
    ? `\n\n✅ Azione confermata da <@${actorId}>: ${statusText}`
    : `\n\n❌ Azione negata da <@${actorId}>`;
  const content = `${existingContent}${line}`.slice(0, 1900);
  await message.edit({ content, components: [] }).catch(() => null);
  await deleteThreadForMessage(guild, messageId);
}

async function applyStaffAction(guild, actor, payload, reasonOverride = null) {
  const member =
    guild.members.cache.get(payload.userId) ||
    (await guild.members.fetch(payload.userId).catch(() => null));
  if (!member) return "Utente non trovato nel server.";

  if (payload.actionKey === "nl") return "Nessuna azione applicata (Nulla).";

  const targetUser = member.user;
  if (payload.actionKey === "vp") {
    const staffDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const reason = String(reasonOverride || "").trim() || "Limiti settimanali rispettati";
    staffDoc.valutazioniCount = Math.max(0, Number(staffDoc.valutazioniCount || 0)) + 1;
    staffDoc.positiveCount = Math.max(0, Number(staffDoc.positiveCount || 0)) + 1;
    if (!Array.isArray(staffDoc.positiveReasons)) staffDoc.positiveReasons = [];
    staffDoc.positiveReasons.push(reason);
    await staffDoc.save();
    await sendValutazioneLogEmbed(guild, actor, targetUser, reason, true);
    return "Registrata Valutazione Positiva.";
  }

  if (payload.actionKey === "vn") {
    const staffDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const reason = String(reasonOverride || "").trim() || "Limiti settimanali non rispettati";
    staffDoc.valutazioniCount = Math.max(0, Number(staffDoc.valutazioniCount || 0)) + 1;
    staffDoc.negativeCount = Math.max(0, Number(staffDoc.negativeCount || 0)) + 1;
    if (!Array.isArray(staffDoc.negativeReasons)) staffDoc.negativeReasons = [];
    staffDoc.negativeReasons.push(reason);
    await staffDoc.save();
    await sendValutazioneLogEmbed(guild, actor, targetUser, reason, false);
    return "Registrata Valutazione Negativa.";
  }

  const roleBeforeId = String(payload.roleId || "");
  const reason = String(reasonOverride || "").trim();
  if (!reason) return "Motivazione mancante.";

  if (payload.actionKey === "px") {
    const roleAfterId = ROLE_UP[roleBeforeId] || null;
    if (!roleAfterId) return "Pex non applicato: nessun ruolo successivo configurato.";
    if (member.roles.cache.has(roleAfterId)) return "Pex non applicato: utente ha gia il ruolo successivo.";

    await member.roles.add(roleAfterId).catch(() => null);
    await applyPexSideEffects(member, roleAfterId);
    const staffDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    if (!Array.isArray(staffDoc.rolesHistory)) staffDoc.rolesHistory = [];
    staffDoc.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: roleAfterId,
      reason,
      date: new Date(),
    });
    await staffDoc.save();
    await sendPexDepexLog(guild, "pex", targetUser, roleBeforeId, roleAfterId, reason);
    return "Pex applicato.";
  }

  if (payload.actionKey === "dp") {
    const roleAfterId = ROLE_DOWN[roleBeforeId];
    if (!member.roles.cache.has(roleBeforeId)) return "Depex non applicato: ruolo corrente non presente.";

    await member.roles.remove(roleBeforeId).catch(() => null);
    await applyDepexSideEffects(member, roleBeforeId);
    await StaffModel.deleteOne({ guildId: guild.id, userId: payload.userId }).catch(() => null);
    await sendPexDepexLog(guild, "depex", targetUser, roleBeforeId, roleAfterId, reason);
    return "Depex applicato.";
  }

  return "Nessuna operazione eseguita.";
}

async function applyPmAction(guild, payload) {
  const member =
    guild.members.cache.get(payload.userId) ||
    (await guild.members.fetch(payload.userId).catch(() => null));
  if (!member) return "Utente non trovato nel server.";

  if (payload.actionKey === "nl") return "Nessuna azione applicata (Nulla).";
  if (payload.actionKey === "rc") return "Richiamo non applica modifiche automatiche.";
  if (payload.actionKey !== "dp") return "Nessuna operazione eseguita.";

  await member.roles.remove(ROLE_PARTNER_MANAGER).catch(() => null);
  await member.roles.remove(ROLE_HELPER).catch(() => null);
  await member.roles.remove(ROLE_MODERATOR).catch(() => null);
  await member.roles.remove(ROLE_COORDINATOR).catch(() => null);
  await member.roles.remove(ROLE_SUPERVISOR).catch(() => null);
  await member.roles.remove(ROLE_STAFF).catch(() => null);
  await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
  if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
  const staffDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
  staffDoc.partnerCount = 0;
  staffDoc.managerId = null;
  staffDoc.partnerActions = [];
  await staffDoc.save();
  return "Depex PM applicato e dati partner rimossi.";
}

async function showReasonModal(interaction, payload) {
  const modalId = [
    RESOCONTO_REASON_MODAL_PREFIX,
    payload.kind,
    payload.userId,
    payload.roleId,
    payload.actionKey,
    interaction.message.id,
  ].join(":");

  const titleByAction = {
    px: "Motivo Pex",
    dp: "Motivo Depex",
    vp: "Motivo Valutazione Positiva",
    vn: "Motivo Valutazione Negativa",
  };
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(titleByAction[payload.actionKey] || "Motivo Azione");
  const input = new TextInputBuilder()
    .setCustomId(RESOCONTO_REASON_INPUT_ID)
    .setLabel("Inserisci il motivo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  if (payload.actionKey === "vp") {
    input.setPlaceholder("Es: Limiti settimanali rispettati");
  }
  if (payload.actionKey === "vn") {
    input.setPlaceholder("Es: Limiti settimanali non rispettati");
  }
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal).catch(() => null);
}

async function handleResocontoButton(interaction) {
  const parsed = parseResocontoButtonCustomId(interaction.customId);
  if (!parsed) return false;
  if (!interaction.guild) return true;
  if (!hasResocontoHighStaffAccess(interaction)) {
    await interaction
      .reply({
        content: "Questo controllo è riservato all'High Staff.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }

  if (parsed.mode === "reject") {
    await appendOutcomeToMessage(
      interaction.guild,
      interaction.channelId,
      interaction.message.id,
      interaction.user.id,
      false,
      "Negato",
    );
    await interaction.deferUpdate().catch(() => null);
    return true;
  }

  if (parsed.kind === "s" && ["px", "dp", "vp", "vn"].includes(parsed.actionKey)) {
    await showReasonModal(interaction, parsed);
    return true;
  }

  const statusText =
    parsed.kind === "s"
      ? await applyStaffAction(interaction.guild, interaction.user, parsed, null)
      : await applyPmAction(interaction.guild, parsed);

  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    interaction.message.id,
    interaction.user.id,
    true,
    statusText,
  );
  await interaction.deferUpdate().catch(() => null);
  return true;
}

async function handleResocontoModal(interaction) {
  const parsed = parseResocontoModalCustomId(interaction.customId);
  if (!parsed) return false;
  if (!interaction.guild) return true;
  if (!hasResocontoHighStaffAccess(interaction)) {
    await interaction
      .reply({
        content: "Questo modulo è riservato all'High Staff.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }
  const reason = String(
    interaction.fields?.getTextInputValue(RESOCONTO_REASON_INPUT_ID) || "",
  )
    .trim()
    .slice(0, 500);
  if (!reason) {
    await interaction
      .reply({
        content: "Motivazione non valida.",
        flags: 1 << 6,
      })
      .catch(() => null);
    return true;
  }

  const statusText = await applyStaffAction(interaction.guild, interaction.user, parsed, reason);
  await appendOutcomeToMessage(
    interaction.guild,
    interaction.channelId,
    parsed.messageId,
    interaction.user.id,
    true,
    statusText,
  );
  await interaction
    .reply({
      content: `Azione eseguita: ${statusText}`,
      flags: 1 << 6,
    })
    .catch(() => null);
  return true;
}

async function handleResocontoActionInteraction(interaction) {
  if (interaction?.isButton?.()) {
    return handleResocontoButton(interaction);
  }
  if (interaction?.isModalSubmit?.()) {
    return handleResocontoModal(interaction);
  }
  return false;
}

module.exports = {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
  handleResocontoActionInteraction,
};
