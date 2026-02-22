const {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const IDs = require("../Config/ids");
const { ModCase } = require("../../Schemas/Moderation/moderationSchemas");
const { appendCaseEdit, closeCase, createModCase, getModConfig, logModCase, parseDuration, formatDuration } = require("./moderation");
const { resolveTarget } = require("./prefixModeration");
const { grantTemporaryRole, revokeTemporaryRole, listTemporaryRolesForUser } = require("../../Services/Community/temporaryRoleService");

function embed(client, title, description, color = null) {
  return new EmbedBuilder()
    .setColor(color || client?.config?.embedModLight || "#6f4e37")
    .setTitle(title)
    .setDescription(description || "");
}

function reasonFrom(args, start = 0, fallback = "Nessun motivo fornito") {
  const value = String(args.slice(start).join(" ") || "").trim();
  return value ? value.slice(0, 512) : fallback;
}

async function reply(message, client, title, description, color = null) {
  return message.channel
    .send({ embeds: [embed(client, title, description, color)] })
    .catch(() => null);
}

function successText(subject, verb, reason) {
  const left = `<:success:1461731530333229226> **_${subject}_** ${verb}.`;
  if (!reason) return left;
  return `${left} Motivo: ${reason}`;
}

function formatTargetLabel(target) {
  const id = String(target?.id || target || "").trim();
  const username = String(target?.username || "").trim();
  if (username) return username.toLowerCase();
  if (/^\d{17,20}$/.test(id)) return id;
  return id || "sconosciuto";
}

function isServerOwner(member, guild) {
  return Boolean(member && guild && String(member.id) === String(guild.ownerId));
}

async function validateModerationTarget(message, member, actionLabel, targetUserId = "") {
  let targetMember = member || null;
  const fallbackId = String(targetUserId || targetMember?.id || "").trim();
  if (!targetMember && /^\d{17,20}$/.test(fallbackId)) {
    targetMember = await message.guild.members.fetch(fallbackId).catch(() => null);
  }
  if (!targetMember) return { ok: true };
  if (String(targetMember.id) === String(message.author.id)) {
    return { ok: false, error: `Non puoi usare \`${actionLabel}\` su te stesso.` };
  }
  if (String(targetMember.id) === String(message.client.user.id)) {
    return { ok: false, error: "Non puoi moderare il bot." };
  }
  if (isServerOwner(targetMember, message.guild)) {
    return { ok: false, error: "Non puoi moderare il proprietario del server." };
  }
  const protectedRoleIds = [
    IDs?.roles?.Staff,
    IDs?.roles?.Helper,
    IDs?.roles?.Mod,
    IDs?.roles?.Coordinator,
    IDs?.roles?.Supervisor,
    IDs?.roles?.HighStaff,
    IDs?.roles?.Admin,
    IDs?.roles?.Manager,
    IDs?.roles?.CoFounder,
    IDs?.roles?.Founder,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const actorHighStaffBypass = [
    IDs?.roles?.HighStaff,
    IDs?.roles?.Admin,
    IDs?.roles?.Manager,
    IDs?.roles?.CoFounder,
    IDs?.roles?.Founder,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .some((roleId) => message.member?.roles?.cache?.has(roleId));
  const targetHasStaffRole = String(IDs?.roles?.Staff || "").trim() &&
    targetMember.roles?.cache?.has(String(IDs?.roles?.Staff || "").trim());
  const targetHasCoreProtectedRole = [
    IDs?.roles?.HighStaff,
    IDs?.roles?.Admin,
    IDs?.roles?.Manager,
    IDs?.roles?.CoFounder,
    IDs?.roles?.Founder,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .some((roleId) => targetMember.roles?.cache?.has(roleId));

  // HighStaff (or above) can moderate Staff, but not governance roles.
  if (
    actorHighStaffBypass &&
    targetHasStaffRole &&
    !targetHasCoreProtectedRole
  ) {
    return { ok: true };
  }

  if (protectedRoleIds.some((roleId) => targetMember.roles?.cache?.has(roleId))) {
    return {
      ok: false,
      error: "Non puoi moderare un utente con ruolo Staff o superiore.",
    };
  }
  return { ok: true };
}

async function successReply(message, subject, verb, reason = "") {
  const description = successText(subject, verb, String(reason || "").trim());
  return message.channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#57F287")
          .setDescription(description),
      ],
    })
    .catch(() => null);
}

async function sendModerationDm({
  user,
  guildName,
  action,
  reason = "",
  durationText = "",
  includeAppeal = false,
}) {
  if (!user) return false;
  const safeReason = String(reason || "").trim();
  const safeDuration = String(durationText || "").trim();
  const actionKey = String(action || "").toLowerCase();
  let baseText = "";
  if (actionKey === "warn") {
    baseText = `Hai ricevuto un avviso in ${guildName}${safeReason ? `.\nMotivo: ${safeReason}` : "."}`;
  } else if (actionKey === "ban") {
    baseText = `Sei stato bannato da ${guildName}${safeReason ? `.\nMotivo: ${safeReason}` : "."}`;
  } else if (actionKey === "kick") {
    baseText = `Sei stato espulso da ${guildName}${safeReason ? `.\nMotivo: ${safeReason}` : "."}`;
  } else if (actionKey === "mute") {
    baseText = `Sei stato silenziato in ${guildName}${safeDuration ? ` per ${safeDuration}` : ""}${safeReason ? `.\nMotivo: ${safeReason}` : "."}`;
  } else if (actionKey === "unban") {
    baseText = `Il tuo ban in ${guildName} è stato revocato.`;
  } else if (actionKey === "unmute") {
    baseText = `Il tuo mute in ${guildName} è stato revocato.`;
  } else {
    return false;
  }

  const embed = new EmbedBuilder().setColor("#ED4245").setDescription(baseText);
  const payload = { embeds: [embed] };
  const appealUrl =
    IDs?.links?.appeal ||
    IDs?.raw?.links?.appeal ||
    IDs?.links?.invite ||
    null;
  if (includeAppeal && appealUrl) {
    embed.setDescription(
      `${baseText}\n\nPuoi inviare un appello tra 1 giorno.`,
    );
    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Appello")
          .setURL(String(appealUrl)),
      ),
    ];
  }
  try {
    await user.send(payload);
    return true;
  } catch {
    return false;
  }
}

async function makeCase(client, message, action, userId, reason, durationMs = null) {
  const config = await getModConfig(message.guild.id);
  const { doc } = await createModCase({
    guildId: message.guild.id,
    action,
    userId: String(userId),
    modId: message.author.id,
    reason,
    durationMs,
    context: { channelId: message.channel.id, messageId: message.id },
  });
  await logModCase({ client, guild: message.guild, modCase: doc, config });
  return doc;
}

async function pickUser(message, args, index = 0) {
  const target = await resolveTarget(message, args, index);
  return {
    user: target?.user || null,
    member: target?.member || null,
    userId: target?.userId || null,
  };
}

function parseMaybeDuration(raw) {
  const ms = parseDuration(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function parseDynoMuteDuration(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const minutes = Number.parseInt(token, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return minutes * 60 * 1000;
  }
  if (/^\d+s$/.test(token)) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

function formatRemainingWords(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} giorno${days === 1 ? "" : "i"}`);
  if (hours > 0) parts.push(`${hours} ora${hours === 1 ? "" : "e"}`);
  if (minutes > 0) parts.push(`${minutes} minuto${minutes === 1 ? "" : "i"}`);
  if (seconds > 0 || !parts.length) parts.push(`${seconds} secondo${seconds === 1 ? "" : "i"}`);
  return parts.join(", ");
}

function formatDurationWords(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (!total) return null;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} giorno${days === 1 ? "" : "i"}`);
  if (hours > 0) parts.push(`${hours} ora${hours === 1 ? "" : "e"}`);
  if (minutes > 0) parts.push(`${minutes} minuto${minutes === 1 ? "" : "i"}`);
  if (seconds > 0 && !parts.length) parts.push(`${seconds} secondo${seconds === 1 ? "" : "i"}`);
  return parts.join(", ");
}

function formatDynoDate(value) {
  if (!value) return "Data sconosciuta";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Data sconosciuta";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt);
  return formatted.replace(",", "").replace(",", "");
}

function buildTemproleHelpEmbed(mode = "default") {
  const key = String(mode || "default").toLowerCase();
  if (key === "toggle") {
    return new EmbedBuilder().setColor("#3498DB").setDescription(
      [
        "**Comando: +temprole toggle**",
        "",
        "**Descrizione:** Attiva/disattiva un temprole su un utente.",
        "**Cooldown:** 5 secondi",
        "**Uso:**",
        "+temprole toggle [utente] [durata] [ruolo], [motivo opzionale]",
        "**Esempio:**",
        "+temprole toggle @LoreeXO 1d Birthday, Buon compleanno",
      ].join("\n"),
    );
  }
  if (key === "add") {
    return new EmbedBuilder().setColor("#3498DB").setDescription(
      [
        "**Comando: +temprole add**",
        "",
        "**Descrizione:** Assegna un temprole a un utente.",
        "**Cooldown:** 5 secondi",
        "**Uso:**",
        "+temprole add [utente] [durata] [ruolo], [motivo opzionale]",
        "**Esempio:**",
        "+temprole add @LoreeXO 1d Birthday, Buon compleanno",
      ].join("\n"),
    );
  }
  if (key === "remove") {
    return new EmbedBuilder().setColor("#3498DB").setDescription(
      [
        "**Comando: +temprole remove**",
        "",
        "**Descrizione:** Rimuove un temprole da un utente.",
        "**Cooldown:** 5 secondi",
        "**Uso:**",
        "+temprole remove [utente] [ruolo], (motivo)",
        "**Esempio:**",
        "+temprole remove @LoreeXO Birthday, Data errata",
      ].join("\n"),
    );
  }
  return new EmbedBuilder().setColor("#3498DB").setDescription(
    [
      "**Comando: +temprole**",
      "",
      "**Alias:** +trole",
      "**Descrizione:** Assegna o rimuove un ruolo con durata limitata.",
      "**Cooldown:** 5 secondi",
      "**Uso:**",
      "+temprole [utente] [durata] [ruolo], [motivo opzionale]",
      "**Esempio:**",
      "+temprole @LoreeXO 1d Birthday, Buon compleanno",
    ].join("\n"),
  );
}

function buildTemproleHelpRow(ownerId, currentValue = "default") {
  const customId = `dyno_temprole_help:${ownerId}`;
  const hidden = String(currentValue || "default").toLowerCase();
  const options = [
    {
      label: "toggle",
      description: "Attiva o disattiva un temprole su un utente.",
      value: "toggle",
    },
    {
      label: "add",
      description: "Assegna un temprole a un utente.",
      value: "add",
    },
    {
      label: "remove",
      description: "Rimuove un temprole da un utente.",
      value: "remove",
    },
  ];
  const filtered = hidden === "default"
    ? options
    : options.filter((item) => String(item.value).toLowerCase() !== hidden);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Vedi sotto-comandi")
    .addOptions(
      ...filtered,
      {
        label: "Comando principale",
        description: "Torna all'aiuto principale",
        value: "default",
      },
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function sendTemproleHelpWithMenu(message) {
  let currentValue = "default";
  let row = buildTemproleHelpRow(message.author.id, currentValue);
  const sent = await message.channel
    .send({
      embeds: [buildTemproleHelpEmbed("default")],
      components: [row],
    })
    .catch(() => null);
  if (!sent) return null;

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 10 * 60 * 1000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      await interaction
        .reply({
          content: "Puoi usare questo menu solo sul tuo comando.",
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }
    const picked = String(interaction.values?.[0] || "default").toLowerCase();
    currentValue = picked;
    row = buildTemproleHelpRow(message.author.id, currentValue);
    await interaction
      .update({
        embeds: [buildTemproleHelpEmbed(picked)],
        components: [row],
      })
      .catch(() => {});
  });

  return sent;
}

function parseTemproleDuration(raw) {
  return parseDynoMuteDuration(raw) || parseMaybeDuration(raw);
}

async function resolveRoleFlexible(message, raw) {
  const mentionRole = message.mentions?.roles?.first();
  if (mentionRole) return mentionRole;
  const token = String(raw || "").replace(/[<@&>]/g, "").trim();
  if (/^\d{17,20}$/.test(token)) {
    return (
      message.guild.roles.cache.get(token) ||
      (await message.guild.roles.fetch(token).catch(() => null))
    );
  }
  const byName = message.guild.roles.cache.find(
    (role) => String(role.name || "").toLowerCase() === String(raw || "").toLowerCase(),
  );
  if (byName) return byName;
  return null;
}

function successTemprole(message, text) {
  return message.channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#57F287")
          .setDescription(`<:success:1461731530333229226> ${text}`),
      ],
    })
    .catch(() => null);
}

function errorTemprole(message, text) {
  return message.channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(`<:cancel:1461730653677551691> ${text}`),
      ],
    })
    .catch(() => null);
}

function parseLockDuration(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

async function runNamed(name, message, args, client) {
  const cmd = String(name || "").toLowerCase();

  if (cmd === "ban") {
    const mode = String(args[0] || "").toLowerCase();
    const hasMode = mode === "save" || mode === "noappeal";
    const targetIndex = hasMode ? 1 : 0;
    const { user, member, userId } = await pickUser(message, args, targetIndex);
    if (!userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +ban**",
            "",
            "**Descrizione:** Banna un utente, con durata opzionale.",
            "**Cooldown:** 3 secondi",
            "**Uso:**",
            "+ban [utente] [durata] [motivo]",
            "+ban save [utente] [durata] [motivo]",
            "+ban noappeal [utente] [durata] [motivo]",
            "**Esempio:**",
            "+ban @utente 2d Spam",
            "",
            "",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "ban", userId);
    if (!guard.ok) return reply(message, client, "Ban", guard.error, "Red");
    const duration = parseMaybeDuration(args[targetIndex + 1]);
    const reason = reasonFrom(args, duration ? targetIndex + 2 : targetIndex + 1);
    const deleteSeconds = mode === "save" ? 0 : 604800;
    const ok = await message.guild.members
      .ban(userId, { reason, deleteMessageSeconds: deleteSeconds })
      .then(() => true)
      .catch(() => false);
    if (!ok) return reply(message, client, "Ban", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildName: message.guild.name,
      action: "ban",
      reason,
      includeAppeal: mode !== "noappeal",
    });
    await makeCase(client, message, "BAN", userId, reason, duration);
    return successReply(message, formatTargetLabel(user || { id: userId }), "è stato bannato", reason);
  }

  if (cmd === "kick") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +kick**",
            "",
            "**Descrizione:** Espelle un utente dal server.",
            "**Cooldown:** 3 secondi",
            "**Uso:**",
            "+kick [utente] [motivo]",
            "**Esempio:**",
            "+kick @utente Regolamento non rispettato",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "kick", userId);
    if (!guard.ok) return reply(message, client, "Kick", guard.error, "Red");
    const reason = reasonFrom(args, 1);
    const ok = await member.kick(reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Kick", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildName: message.guild.name,
      action: "kick",
      reason,
    });
    await makeCase(client, message, "KICK", userId, reason);
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`<:success:1461731530333229226> **_${formatTargetLabel(member.user || { id: userId })}_** è stato espulso.`),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "mute") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +mute**",
            "",
            "**Descrizione:** Silenzia un utente per un tempo definito.",
            "**Cooldown:** 3 secondi",
            "**Uso:**",
            "+mute [utente] [durata] [motivo]",
            "**Esempio:**",
            "+mute @utente 10m Spam",
            "+mute @utente 1d Flood",
            "",
            "",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const guard = await validateModerationTarget(message, member, "mute", userId);
    if (!guard.ok) return reply(message, client, "Mute", guard.error, "Red");
    const durationRaw = String(args[1] || "").trim();
    if (!durationRaw) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Devi specificare una durata per il mute."),
          ],
        })
        .catch(() => null);
    }
    const duration = parseDynoMuteDuration(durationRaw);
    const maxMuteMs = 14 * 24 * 60 * 60 * 1000;
    if (!duration || duration > maxMuteMs) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(
                "<:cancel:1461730653677551691> Usa una durata valida inferiore a 14 giorni (esempio: 3m, 2h, 1d).",
              ),
          ],
        })
        .catch(() => null);
    }
    const reason = reasonFrom(args, 2);
    const ok = await member.timeout(duration, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Mute", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildName: message.guild.name,
      action: "mute",
      reason,
      durationText: formatDuration(duration),
      includeAppeal: true,
    });
    await makeCase(client, message, "MUTE", userId, reason, duration);
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`<:success:1461731530333229226> **_${formatTargetLabel(member.user || { id: userId })}_** è stato silenziato.`),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "unmute") {
    const { user, member, userId } = await pickUser(message, args, 0);
    if (!member || !userId) return reply(message, client, "Unmute", "Uso: `+unmute @utente [motivo]`.", "Red");
    const reason = reasonFrom(args, 1);
    const ok = await member.timeout(null, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Unmute", "Operazione fallita.", "Red");
    await sendModerationDm({
      user,
      guildName: message.guild.name,
      action: "unmute",
    });
    const openMutes = await ModCase.find({
      guildId: message.guild.id,
      userId,
      action: "MUTE",
      active: true,
    }).catch(() => []);
    for (const item of openMutes) {
      closeCase(item, `Unmute manuale da ${message.author.id}`);
      await item.save().catch(() => null);
    }
    await makeCase(client, message, "UNMUTE", userId, reason);
    return successReply(message, formatTargetLabel(member.user || { id: userId }), "è stato smutato", reason);
  }

  if (cmd === "unban") {
    const raw = String(args[0] || "").trim();
    if (!raw) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +unban**",
            "",
            "**Descrizione:** Revoca il ban di un utente.",
            "**Cooldown:** 5 secondi",
            "**Uso:**",
            "+unban [id_utente] (motivo opzionale)",
            "**Esempio:**",
            "+unban 155037590859284481 Appello accettato",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const id = raw.replace(/[<@!>]/g, "").trim();
    if (!/^\d{17,20}$/.test(id)) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Il comando unban accetta solo ID utente."),
          ],
        })
        .catch(() => null);
    }
    const reason = reasonFrom(args, 1);
    const banInfo = await message.guild.bans.fetch(id).catch(() => null);
    const ok = await message.guild.bans.remove(id, reason).then(() => true).catch(() => false);
    if (!ok) return reply(message, client, "Unban", "Operazione fallita.", "Red");
    const targetUser = banInfo?.user || (await message.client.users.fetch(id).catch(() => null));
    await sendModerationDm({
      user: targetUser,
      guildName: message.guild.name,
      action: "unban",
    });
    const openBans = await ModCase.find({
      guildId: message.guild.id,
      userId: id,
      action: "BAN",
      active: true,
    }).catch(() => []);
    for (const item of openBans) {
      closeCase(item, `Unban manuale da ${message.author.id}`);
      await item.save().catch(() => null);
    }
    await makeCase(client, message, "UNBAN", id, reason);
    const subject = formatTargetLabel(banInfo?.user || { id });
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`<:success:1461731530333229226> **_${subject}_** è stato sbannato.`),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "warn") {
    const { user, userId } = await pickUser(message, args, 0);
    if (!userId) return reply(message, client, "Warn", "Uso: `+warn @utente [testo]`.", "Red");
    if (String(userId) === String(message.author.id)) {
      return reply(message, client, "Warn", "Non puoi usare `warn` su te stesso.", "Red");
    }
    const warnMember =
      message.guild.members.cache.get(String(userId)) ||
      (await message.guild.members.fetch(String(userId)).catch(() => null));
    const guard = await validateModerationTarget(message, warnMember, "warn", userId);
    if (!guard.ok) return reply(message, client, "Warn", guard.error, "Red");
    if (!String(args.slice(1).join(" ") || "").trim()) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +warn**",
            "",
            "**Descrizione:** Assegna un avviso a un utente.",
            "**Cooldown:** 3 secondi",
            "**Uso:**",
            "+warn [utente] (motivo)",
            "**Esempio:**",
            "+warn @utente Linguaggio non appropriato",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const content = reasonFrom(args, 1);
    await makeCase(client, message, "WARN", userId, content);
    await sendModerationDm({
      user,
      guildName: message.guild.name,
      action: "warn",
      reason: content,
    });
    const targetUser = await message.client.users.fetch(userId).catch(() => null);
    const label = formatTargetLabel(targetUser || { id: userId });
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`<:success:1461731530333229226> **_${label}_** ha ricevuto un warn.`),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "warnings") {
    const { userId } = await pickUser(message, args, 0);
    if (!userId) return reply(message, client, cmd, `Uso: \`+${cmd} @utente\`.`, "Red");
    const rows = await ModCase.find({ guildId: message.guild.id, userId, action: "WARN", active: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .catch(() => []);
    if (!rows.length) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#3498DB")
              .setDescription("Nessun warning attivo trovato."),
          ],
        })
        .catch(() => null);
    }
    const targetUser =
      (await message.client.users.fetch(userId).catch(() => null)) || null;
    const titleCount = rows.length === 1 ? "1 warning" : `${rows.length} warning`;
    const lines = [];
    for (const row of rows.slice(0, 10)) {
      let moderator = row.modId;
      if (/^\d{17,20}$/.test(String(row.modId || ""))) {
        const modUser = await message.client.users.fetch(String(row.modId)).catch(() => null);
        if (modUser?.username) moderator = modUser.username;
      }
      const when = row.createdAt
        ? `<t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>`
        : "data sconosciuta";
      lines.push(`**Moderatore:** ${moderator}\n${row.reason || "Nessun motivo"} - ${when}`);
    }
    const warningEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle(`${titleCount} per ${targetUser?.username || userId} (${userId})`)
      .setDescription(lines.join("\n\n"))
      .setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null);
    return message.channel.send({ embeds: [warningEmbed] }).catch(() => null);
  }

  if (cmd === "delwarn") {
    const target = await pickUser(message, args, 0);
    const warningText = String(args.slice(1).join(" ") || "").trim();
    if (!target.userId || !warningText) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +delwarn**",
            "",
            "**Alias:** +nwarn",
            "**Descrizione:** Rimuove un warning.",
            "**Cooldown:** 3 secondi",
            "**Uso:**",
            "+delwarn [utente] [testo warning]",
            "**Esempio:**",
            "+delwarn @utente Flood in chat generale",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    const rows = await ModCase.find({
      guildId: message.guild.id,
      userId: target.userId,
      action: "WARN",
      active: true,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .catch(() => []);
    const needle = warningText.toLowerCase();
    const row =
      rows.find((r) => String(r.reason || "").toLowerCase() === needle) ||
      rows.find((r) => String(r.reason || "").toLowerCase().includes(needle)) ||
      null;
    if (!row) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> Nessun warning trovato con quel testo."),
          ],
        })
        .catch(() => null);
    }
    closeCase(row, `Avviso rimosso da ${message.author.id}`);
    await row.save().catch(() => null);
    const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(
              `<:success:1461731530333229226> Avviso \`${warningText}\` rimosso per ${targetUser?.username || target.userId}.`,
            ),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "case" || cmd === "reason" || cmd === "duration") {
    const caseId = Number.parseInt(args[0], 10);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      if (cmd === "case") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            [
              "**Comando: +case**",
              "",
              "**Descrizione:** Mostra un caso moderazione specifico.",
              "**Cooldown:** 3 secondi",
              "**Uso:**",
              "+case [id caso]",
              "**Esempio:**",
              "+case 1234",
            ].join("\n"),
        );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      if (cmd === "reason") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            [
              "**Comando: +reason**",
              "",
              "**Descrizione:** Imposta o aggiorna il motivo di un caso moderazione.",
              "**Cooldown:** 3 secondi",
              "**Uso:**",
              "+reason [case num] [reason]",
              "**Esempio:**",
              "+reason 5 Spam in immagini non appropriate",
            ].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      if (cmd === "duration") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            [
              "**Comando: +duration**",
              "",
              "**Descrizione:** Modifica la durata di un mute/ban.",
              "**Cooldown:** 60 secondi",
              "**Uso:**",
              "+duration [modlog ID] [limit]",
              "**Esempio:**",
              "+duration 69 420m",
            ].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      return reply(message, client, cmd, `Uso: \`+${cmd} <case> [...]\`.`, "Red");
    }
    const row = await ModCase.findOne({ guildId: message.guild.id, caseId }).catch(() => null);
    if (!row) return reply(message, client, cmd, "Caso non trovato.", "Red");
    if (cmd === "case") {
      const targetUser = await message.client.users.fetch(String(row.userId || "")).catch(() => null);
      const modUser = await message.client.users.fetch(String(row.modId || "")).catch(() => null);
      const action = String(row.action || "Sconosciuto")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
      const hh = new Date(row.createdAt || Date.now()).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const caseEmbed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle(`Case ${caseId} | ${action} | ${targetUser?.username || row.userId}`)
        .addFields(
          { name: "Utente", value: targetUser?.username || String(row.userId || "Sconosciuto"), inline: true },
          { name: "Moderatore", value: modUser ? `<@${modUser.id}>` : String(row.modId || "Sconosciuto"), inline: true },
          { name: "Motivo", value: row.reason || "Nessun motivo fornito", inline: true },
        )
        .setFooter({
          text: `ID: ${row.userId} - Oggi alle ${hh}${Array.isArray(row.edits) && row.edits.length ? ` | Modificato ${row.edits.length} volta/e` : ""}`,
        });
      return message.channel.send({ embeds: [caseEmbed] }).catch(() => null);
    }
    if (cmd === "reason") {
      const rawReason = String(args.slice(1).join(" ") || "").trim();
      if (!rawReason) {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            [
              "**Comando: +reason**",
              "",
              "**Descrizione:** Imposta o aggiorna il motivo di un caso moderazione.",
              "**Cooldown:** 3 secondi",
              "**Uso:**",
              "+reason [case num] [reason]",
              "**Esempio:**",
              "+reason 5 Spam in immagini non appropriate",
            ].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      const nextReason = reasonFrom(args, 1);
      appendCaseEdit(row, "reason", row.reason, nextReason, message.author.id);
      row.reason = nextReason;
      await row.save().catch(() => null);
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#57F287")
              .setDescription(`<:success:1461731530333229226> Motivo aggiornato per il caso #${caseId}.`),
          ],
        })
        .catch(() => null);
    }
    if (!String(args[1] || "").trim()) {
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +duration**",
            "",
            "**Descrizione:** Modifica la durata di un mute/ban.",
            "**Cooldown:** 60 secondi",
            "**Uso:**",
            "+duration [modlog ID] [limit]",
            "**Esempio:**",
            "+duration 69 420m",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }
    if (!["MUTE", "BAN"].includes(String(row.action || "").toUpperCase())) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription("<:cancel:1461730653677551691> La durata può essere modificata solo per casi mute/ban."),
          ],
        })
        .catch(() => null);
    }
    const duration = parseDynoMuteDuration(args[1]) || parseMaybeDuration(args[1]);
    if (!duration) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setDescription(
                "<:cancel:1461730653677551691> Usa una durata valida inferiore a 14 giorni (esempio: 3m, 2h, 1d).",
              ),
          ],
        })
        .catch(() => null);
    }
    appendCaseEdit(
      row,
      "durationMs",
      row.durationMs == null ? "" : row.durationMs,
      duration,
      message.author.id,
    );
    row.durationMs = duration;
    row.expiresAt = new Date(Date.now() + duration);
    row.active = true;
    await row.save().catch(() => null);
    if (String(row.action || "").toUpperCase() === "MUTE") {
      const member = await message.guild.members.fetch(String(row.userId || "")).catch(() => null);
      if (member) {
        await member.timeout(duration, `Caso #${caseId} aggiornato`).catch(() => null);
      }
    }
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(`<:success:1461731530333229226> Caso #${caseId} aggiornato.`),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "modlogs" || cmd === "moderations") {
    const target = await pickUser(message, args, 0);
    const query = { guildId: message.guild.id };
    if (target.userId) query.userId = target.userId;
    if (cmd === "moderations") {
      if (!target.userId) {
        return message.channel
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor("#3498DB")
                .setDescription(
                  [
                    "**Comando: +moderations**",
                    "",
                    "**Descrizione:** Mostra moderazioni temporanee attive e tempo rimanente.",
                    "**Uso:**",
                    "+moderations [utente] (pagina)",
                    "**Esempio:**",
                    "+moderations @LoreeXO",
                  ].join("\n"),
                ),
            ],
          })
          .catch(() => null);
      }
      query.active = true;
      query.expiresAt = { $gt: new Date() };
      query.action = { $in: ["MUTE", "BAN"] };
      const rows = await ModCase.find(query)
        .sort({ expiresAt: 1 })
        .limit(10)
        .lean()
        .catch(() => []);
      if (!rows.length) {
        return message.channel
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor("#ED4245")
                .setDescription("<:cancel:1461730653677551691> Nessuna moderazione attiva trovata per quell'utente."),
            ],
          })
          .catch(() => null);
      }
      const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
      const username = (targetUser?.username || target.userId).toLowerCase();
      const now = Date.now();
      const lines = rows.map((row, index) => {
        const type = String(row.action || "").toUpperCase() === "MUTE" ? "Mute" : "Ban";
        const expiresAt = new Date(row.expiresAt || Date.now()).getTime();
        const remaining = formatRemainingWords(expiresAt - now);
        return `${index + 1}. ${username}\n${type} | Tempo rimanente: ${remaining}`;
      });
      const activeEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle(`Moderazioni attive per ${username}`)
        .setDescription(lines.join("\n\n"))
        .setFooter({
          text: rows.length === 1 ? "1 moderazione attiva" : `${rows.length} moderazioni attive`,
        });
      return message.channel.send({ embeds: [activeEmbed] }).catch(() => null);
    }

    if (!target.userId) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }

    const rawPage = Number.parseInt(args[1], 10);
    const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const perPage = 6;
    const total = await ModCase.countDocuments(query).catch(() => 0);
    if (total <= 0) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }

    const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(requestedPage, totalPages);
    const skip = (safePage - 1) * perPage;
    const rows = await ModCase.find(query)
      .sort({ caseId: -1 })
      .skip(skip)
      .limit(perPage)
      .lean()
      .catch(() => []);
    if (!rows.length) {
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder().setColor("#ED4245").setDescription("<:cancel:1461730653677551691> Nessun log trovato per quell'utente."),
          ],
        })
        .catch(() => null);
    }
    const lines = [];
    for (const row of rows) {
      const modUser = await message.client.users.fetch(String(row.modId || "")).catch(() => null);
      const type = String(row.action || "Sconosciuto")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
      const createdAt = formatDynoDate(row.createdAt);
      const length = formatDurationWords(row.durationMs);
      const blockLines = [
        `**Case ${row.caseId}**`,
        `**Tipo:** ${type}`,
        `**Utente:** (${target.userId}) ${targetUser?.username || "Sconosciuto"}`,
        `**Moderatore:** ${modUser?.username || row.modId || "Sconosciuto"}`,
      ];
      if (length) blockLines.push(`**Durata:** ${length}`);
      blockLines.push(`**Motivo:** ${row.reason || "Nessun motivo fornito."} - ${createdAt}`);
      lines.push(blockLines.join("\n"));
    }

    const logsEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle(`Modlog di ${targetUser?.username || target.userId} (Pagina ${safePage} di ${totalPages})`)
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `${total} log totali | Usa +modlogs [utente] [pagina] per vedere un'altra pagina` });

    return message.channel.send({ embeds: [logsEmbed] }).catch(() => null);
  }

  if (cmd === "modstats") {
    const target = await pickUser(message, args, 0);
    const modId = target.userId || message.author.id;
    const modUser = await message.client.users.fetch(modId).catch(() => null);
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const guildId = message.guild.id;
    const countAction = (action, since = null) => {
      const q = { guildId, modId, action };
      if (since) q.createdAt = { $gte: since };
      return ModCase.countDocuments(q).catch(() => 0);
    };
    const [m7, m30, mall, b7, b30, ball, k7, k30, kall, w7, w30, wall] =
      await Promise.all([
        countAction("MUTE", d7),
        countAction("MUTE", d30),
        countAction("MUTE"),
        countAction("BAN", d7),
        countAction("BAN", d30),
        countAction("BAN"),
        countAction("KICK", d7),
        countAction("KICK", d30),
        countAction("KICK"),
        countAction("WARN", d7),
        countAction("WARN", d30),
        countAction("WARN"),
      ]);
    const t7 = Number(m7) + Number(b7) + Number(k7) + Number(w7);
    const t30 = Number(m30) + Number(b30) + Number(k30) + Number(w30);
    const tall = Number(mall) + Number(ball) + Number(kall) + Number(wall);
    const description = [
      "**Statistiche Moderazione**",
      "",
      `**Mute (ultimi 7 giorni):** ${m7}    **Mute (ultimi 30 giorni):** ${m30}    **Mute (totale):** ${mall}`,
      "",
      `**Ban (ultimi 7 giorni):** ${b7}    **Ban (ultimi 30 giorni):** ${b30}    **Ban (totale):** ${ball}`,
      "",
      `**Kick (ultimi 7 giorni):** ${k7}    **Kick (ultimi 30 giorni):** ${k30}    **Kick (totale):** ${kall}`,
      "",
      `**Warn (ultimi 7 giorni):** ${w7}    **Warn (ultimi 30 giorni):** ${w30}    **Warn (totale):** ${wall}`,
      "",
      `**Totale (ultimi 7 giorni):** ${t7}    **Totale (ultimi 30 giorni):** ${t30}    **Totale (complessivo):** ${tall}`,
    ].join("\n");
    const hh = new Date().toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const statsEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setAuthor({
        name: modUser?.username || modId,
        iconURL: modUser?.displayAvatarURL?.({ size: 128 }) || null,
      })
      .setDescription(description)
      .setFooter({ text: `ID: ${modId} - Oggi alle ${hh}` });
    return message.channel.send({ embeds: [statsEmbed] }).catch(() => null);
  }

  if (cmd === "lock" || cmd === "unlock") {
    if (!args.length) {
      if (cmd === "lock") {
        const helpEmbed = new EmbedBuilder()
          .setColor("#3498DB")
          .setDescription(
            [
              "**Comando: +lock**",
              "",
              "**Descrizione:** Blocca un canale con timer e messaggio opzionali.",
              "**Cooldown:** 5 secondi",
              "**Uso:**",
              "+lock [canale] (durata) (messaggio)",
              "**Esempio:**",
              "+lock #general Torniamo subito",
              "+lock #support 2h Questo canale restera bloccato per due ore.",
              "+lock #help 4h",
            ].join("\n"),
          );
        return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
      }
      const helpEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(
          [
            "**Comando: +unlock**",
            "",
            "**Descrizione:** Sblocca un canale bloccato in precedenza.",
            "**Cooldown:** 5 secondi",
            "**Uso:**",
            "+unlock [canale] (messaggio)",
            "**Esempio:**",
            "+unlock #general",
            "+unlock #support Siamo tornati!",
          ].join("\n"),
        );
      return message.channel.send({ embeds: [helpEmbed] }).catch(() => null);
    }

    const channel =
      message.mentions?.channels?.first() ||
      message.guild.channels.cache.get(String(args[0] || "").replace(/[<#>]/g, "")) ||
      message.channel;
    const start = message.mentions?.channels?.size ? 1 : 0;
    const duration = cmd === "lock" ? parseLockDuration(args[start]) : null;
    const reasonStart = cmd === "lock" && duration ? start + 1 : start;
    const reason = reasonFrom(args, reasonStart, cmd === "lock" ? "Canale bloccato." : "Canale sbloccato.");
    const me = message.guild.members.me;
    const perms = channel?.permissionsFor?.(me);
    if (!perms?.has(PermissionsBitField.Flags.ManageChannels)) return reply(message, client, cmd, "Non posso gestire quel canale.", "Red");
    await channel.permissionOverwrites
      .edit(
        message.guild.roles.everyone,
        cmd === "lock"
          ? { SendMessages: false, SendMessagesInThreads: false }
          : { SendMessages: null, SendMessagesInThreads: null },
        { reason },
      )
      .catch(() => null);

    if (cmd === "lock") {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ED4245")
              .setTitle("Canale bloccato")
              .setDescription(`Lock: ${reason}`),
          ],
        })
        .catch(() => null);
      if (duration) {
        setTimeout(() => {
          channel.permissionOverwrites
            .edit(
              message.guild.roles.everyone,
              { SendMessages: null, SendMessagesInThreads: null },
              { reason: "Sblocco automatico (timer scaduto)." },
            )
            .catch(() => null);
        }, duration);
      }
    }

    await makeCase(client, message, cmd.toUpperCase(), `CHANNEL:${channel.id}`, reason, duration || null);
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#57F287")
            .setDescription(
              `<:success:1461731530333229226> Canale <#${channel.id}> ${cmd === "lock" ? "bloccato" : "sbloccato"}.`,
            ),
        ],
      })
      .catch(() => null);
  }

  if (cmd === "temprole") {
    const first = String(args[0] || "").toLowerCase();
    const knownSub = new Set(["add", "remove", "toggle"]);
    const sub = knownSub.has(first) ? first : "add";
    const base = sub === "add" ? 0 : 1;
    const target = await pickUser(message, args, base);
    if (!target.userId) {
      return sendTemproleHelpWithMenu(message);
    }

    if (sub === "remove") {
      const roleArg = args[base + 1];
      const role = await resolveRoleFlexible(message, roleArg);
      if (!role) return errorTemprole(message, "Non riesco a trovare quel ruolo.");
      await revokeTemporaryRole({
        guild: message.guild,
        userId: target.userId,
        roleId: role.id,
      }).catch(() => null);
      const member = await message.guild.members.fetch(target.userId).catch(() => null);
      if (member?.roles?.cache?.has(role.id)) {
        await member.roles.remove(role.id, "Temprole remove").catch(() => null);
      }
      await makeCase(
        client,
        message,
        "TEMPROLE_REMOVE",
        target.userId,
        reasonFrom(args, base + 2, "Temprole remove"),
      );
      return successTemprole(
        message,
        `Ruolo ${role.name} rimosso da ${(target.user?.username || target.userId).toLowerCase()}.`,
      );
    }

    const durationArg = args[base + 1];
    const duration = parseTemproleDuration(durationArg);
    if (!duration) return sendTemproleHelpWithMenu(message);
    const roleArg = args[base + 2];
    const role = await resolveRoleFlexible(message, roleArg);
    if (!role) return errorTemprole(message, "Non riesco a trovare quel ruolo.");

    if (sub === "toggle") {
      const existing = await listTemporaryRolesForUser({
        guildId: message.guild.id,
        userId: target.userId,
      });
      const hasActive = existing.some((row) => String(row.roleId) === String(role.id));
      if (hasActive) {
        await revokeTemporaryRole({
          guild: message.guild,
          userId: target.userId,
          roleId: role.id,
        }).catch(() => null);
        const member = await message.guild.members.fetch(target.userId).catch(() => null);
        if (member?.roles?.cache?.has(role.id)) {
          await member.roles.remove(role.id, "Temprole toggle remove").catch(() => null);
        }
        await makeCase(
          client,
          message,
          "TEMPROLE_TOGGLE_REMOVE",
          target.userId,
          reasonFrom(args, base + 3, "Temprole toggle remove"),
        );
        return successTemprole(
          message,
          `Ruolo ${role.name} rimosso da ${(target.user?.username || target.userId).toLowerCase()}.`,
        );
      }
    }

    const out = await grantTemporaryRole({
      guild: message.guild,
      userId: target.userId,
      roleId: role.id,
      grantedBy: message.author.id,
      durationMs: duration,
    });
    if (!out?.ok) return errorTemprole(message, "Non riesco a trovare quel ruolo.");
    await makeCase(
      client,
      message,
      sub === "toggle" ? "TEMPROLE_TOGGLE_ADD" : "TEMPROLE",
      target.userId,
      reasonFrom(args, base + 3, "Temprole add"),
      duration,
    );
    return successTemprole(
      message,
      `Ruolo ${role.name} aggiunto a ${(target.user?.username || target.userId).toLowerCase()}.`,
    );
  }

  return reply(message, client, "Moderazione", `Comando non supportato: ${cmd}`, "Red");
}

async function executeDynoModerationCommand(commandName, message, args, client) {
  await message.channel.sendTyping().catch(() => {});
  return runNamed(commandName, message, Array.isArray(args) ? args : [], client);
}

module.exports = { executeDynoModerationCommand };

