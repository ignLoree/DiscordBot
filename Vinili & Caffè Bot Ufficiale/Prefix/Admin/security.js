const {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  getAntiNukeStatusSnapshot,
  stopAntiNukePanic,
  triggerAntiNukePanicExternal,
  setAntiNukeConfigSnapshot,
} = require("../../Services/Moderation/antiNukeService");
const {
  getJoinRaidStatusSnapshot,
  setJoinRaidConfigSnapshot,
} = require("../../Services/Moderation/joinRaidService");
const {
  getJoinGateConfigSnapshot,
  updateJoinGateConfig,
} = require("../../Services/Moderation/joinGateService");
const {
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  updateAutoModConfig,
} = require("../../Services/Moderation/automodService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const { sendSecurityAuditLog } = require("../../Utils/Logging/securityAuditLog");

const STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
].filter(Boolean);

const PANIC_CONTROL_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
].filter(Boolean);

function toTs(ms, style = "R") {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `<t:${Math.floor(n / 1000)}:${style}>`;
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((id) => member?.roles?.cache?.has?.(id));
}

function hasStaffAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  return hasAnyRole(member, STAFF_ROLE_IDS);
}

function hasPanicControlAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  return hasAnyRole(member, PANIC_CONTROL_ROLE_IDS);
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Command")
    .setDescription(
      [
        "`+security status`",
        "`+security panic status`",
        "`+security panic enable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
        "`+security panic disable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
      ].join("\n"),
    );
}

function panicUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Panic Help")
    .setDescription(
      [
        "`+security panic status` -> Pannello panic paginato.",
        "`+security panic enable antinuke` -> Riabilita AntiNuke e avvia panic manuale.",
        "`+security panic enable automod` -> Riabilita AutoMod e avvia panic manuale.",
        "`+security panic enable joingate` -> Riabilita JoinGate.",
        "`+security panic enable joinraid` -> Riabilita JoinRaid.",
        "`+security panic enable lockcommands` -> Attiva lock comandi.",
        "`+security panic enable all` -> Riabilita tutto insieme.",
        "",
        "`+security panic disable antinuke` -> Spegne AntiNuke se attivo.",
        "`+security panic disable automod` -> Spegne AutoMod se attivo.",
        "`+security panic disable joingate` -> Spegne JoinGate se attivo.",
        "`+security panic disable joinraid` -> Spegne JoinRaid se attivo.",
        "`+security panic disable lockcommands` -> Spegne lock comandi.",
        "`+security panic disable all` -> Spegne tutto insieme.",
      ].join("\n"),
    );
}

function parsePanicTarget(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  const map = {
    antinuke: "antinuke",
    automod: "automod",
    joingate: "joingate",
    joinraid: "joinraid",
    lockcommands: "lockcommands",
    all: "all",
  };
  return map[value] || "";
}

async function sendPagedEmbeds(message, embeds, panelKey) {
  if (!Array.isArray(embeds) || embeds.length === 0) return;
  if (embeds.length === 1) {
    await safeMessageReply(message, {
      embeds: [embeds[0]],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let pageIndex = 0;
  const nonce = `${panelKey}:${message.id}:${Date.now()}`;
  const ids = {
    first: `security:first:${nonce}`,
    prev: `security:prev:${nonce}`,
    next: `security:next:${nonce}`,
    last: `security:last:${nonce}`,
    close: `security:close:${nonce}`,
  };
  const allowed = new Set(Object.values(ids));

  const row = (disabled = false) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ids.first)
        .setLabel("<<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(ids.prev)
        .setLabel("<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(ids.next)
        .setLabel(">")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex >= embeds.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.last)
        .setLabel(">>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex >= embeds.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.close)
        .setLabel("X")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    );

  const sent = await safeMessageReply(message, {
    embeds: [embeds[pageIndex]],
    components: [row(false)],
    allowedMentions: { repliedUser: false },
  });
  if (!sent || typeof sent.createMessageComponentCollector !== "function") return;

  const collector = sent.createMessageComponentCollector({
    time: 120_000,
    filter: (i) => i.user?.id === message.author.id && allowed.has(String(i.customId || "")),
  });

  collector.on("collect", async (interaction) => {
    const id = String(interaction.customId || "");
    if (id === ids.close) {
      await interaction.update({ embeds: [embeds[pageIndex]], components: [] }).catch(() => null);
      collector.stop("closed");
      return;
    }
    if (id === ids.first) pageIndex = 0;
    if (id === ids.prev) pageIndex = Math.max(0, pageIndex - 1);
    if (id === ids.next) pageIndex = Math.min(embeds.length - 1, pageIndex + 1);
    if (id === ids.last) pageIndex = embeds.length - 1;

    await interaction
      .update({ embeds: [embeds[pageIndex]], components: [row(false)] })
      .catch(() => null);
  });

  collector.on("end", async (_, reason) => {
    if (reason === "closed") return;
    await sent.edit({ embeds: [embeds[pageIndex]], components: [row(true)] }).catch(() => null);
  });
}

async function buildStatusEmbeds(guild) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const joinGate = getJoinGateConfigSnapshot();
  const autoCfg = getAutoModConfigSnapshot();
  const autoRules = getAutoModRulesSnapshot();
  const autoPanic = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);

  const page1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Status - Overview (1/3)")
    .setDescription(
      [
        `AntiNuke enabled: **${anti?.enabled ? "ON" : "OFF"}**`,
        `AntiNuke panic active: **${anti?.panicActive ? "ON" : "OFF"}**`,
        `JoinRaid enabled: **${raid?.enabled ? "ON" : "OFF"}**`,
        `JoinRaid active: **${raid?.raidActive ? "ON" : "OFF"}**`,
        `JoinGate enabled: **${joinGate?.enabled ? "ON" : "OFF"}**`,
        `AutoMod enabled: **${autoRules?.status?.enabled ? "ON" : "OFF"}**`,
        `AutoMod panic active: **${autoPanic?.active ? "ON" : "OFF"}**`,
        "",
        `Global join lock: **${sec?.joinLockActive ? "ON" : "OFF"}**`,
        `Global command lock: **${sec?.commandLockActive ? "ON" : "OFF"}**`,
      ].join("\n"),
    );

  const page2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Status - Join Systems (2/3)")
    .setDescription(
      [
        "[JoinGate]",
        `Status: **${joinGate?.enabled ? "ON" : "OFF"}**`,
        `NoAvatar: **${joinGate?.noAvatar?.enabled ? "ON" : "OFF"}** (${String(joinGate?.noAvatar?.action || "log").toUpperCase()})`,
        `NewAccounts: **${joinGate?.newAccounts?.enabled ? "ON" : "OFF"}** (${String(joinGate?.newAccounts?.action || "kick").toUpperCase()})`,
        `MinAgeDays: **${Number(joinGate?.newAccounts?.minAgeDays || 0)}**`,
        `Suspicious: **${joinGate?.suspiciousAccount?.enabled ? "ON" : "OFF"}** (${String(joinGate?.suspiciousAccount?.action || "log").toUpperCase()})`,
        "",
        "[JoinRaid]",
        `Status: **${raid?.enabled ? "ON" : "OFF"}**`,
        `Active: **${raid?.raidActive ? "ON" : "OFF"}** ${raid?.raidActive ? `(until ${toTs(raid?.raidUntil, "F")})` : ""}`,
        `LockCommands: **${raid?.config?.lockCommands ? "ON" : "OFF"}**`,
        `TriggerCount: **${Number(raid?.config?.triggerCount || 0)}**`,
      ].join("\n"),
    );

  const page3 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Status - AntiNuke / AutoMod (3/3)")
    .setDescription(
      [
        "[AntiNuke]",
        `Enabled: **${anti?.enabled ? "ON" : "OFF"}**`,
        `PanicMode enabled: **${anti?.panicModeEnabled ? "ON" : "OFF"}**`,
        `Panic active: **${anti?.panicActive ? "ON" : "OFF"}** ${anti?.panicActive ? `(until ${toTs(anti?.panicActiveUntil, "F")})` : ""}`,
        `Lock moderation commands: **${anti?.config?.panicMode?.lockdown?.lockModerationCommands ? "ON" : "OFF"}**`,
        `Lock all commands: **${anti?.config?.panicMode?.lockdown?.lockAllCommands ? "ON" : "OFF"}**`,
        "",
        "[AutoMod]",
        `Enabled: **${autoRules?.status?.enabled ? "ON" : "OFF"}**`,
        `Panic enabled: **${autoCfg?.panic?.enabled ? "ON" : "OFF"}**`,
        `Panic active: **${autoPanic?.active ? "ON" : "OFF"}** ${autoPanic?.active ? `(until ${toTs(autoPanic?.activeUntil, "F")})` : ""}`,
        `AutoLockdown: **${autoCfg?.autoLockdown?.enabled ? "ON" : "OFF"}**`,
      ].join("\n"),
    );

  return [page1, page2, page3];
}

async function buildPanicStatusEmbeds(guild) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const auto = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);

  const page1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Panic Status (1/2)")
    .setDescription(
      [
        "[AntiNuke Panic]",
        `Enabled: **${anti?.panicModeEnabled ? "ON" : "OFF"}**`,
        `Active: **${anti?.panicActive ? "ON" : "OFF"}**`,
        `Until: ${anti?.panicActive ? toTs(anti?.panicActiveUntil, "F") : "N/A"}`,
        "",
        "[AutoMod Panic]",
        `Enabled: **${auto?.enabled ? "ON" : "OFF"}**`,
        `Active: **${auto?.active ? "ON" : "OFF"}**`,
        `Until: ${auto?.active ? toTs(auto?.activeUntil, "F") : "N/A"}`,
        `Tracked Accounts: **${Number(auto?.trackedAccounts || 0)}**`,
      ].join("\n"),
    );

  const page2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Panic Status (2/2)")
    .setDescription(
      [
        "[JoinRaid Runtime]",
        `Enabled: **${raid?.enabled ? "ON" : "OFF"}**`,
        `Active: **${raid?.raidActive ? "ON" : "OFF"}**`,
        `Until: ${raid?.raidActive ? toTs(raid?.raidUntil, "F") : "N/A"}`,
        `LockCommands: **${raid?.config?.lockCommands ? "ON" : "OFF"}**`,
        "",
        "[Global Locks]",
        `Join lock active: **${sec?.joinLockActive ? "ON" : "OFF"}**`,
        `Command lock active: **${sec?.commandLockActive ? "ON" : "OFF"}**`,
      ].join("\n"),
    );

  return [page1, page2];
}

async function disableAntiNuke(guild, actorId) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const wasActive = Boolean(snap?.panicActive || snap?.enabled || snap?.panicModeEnabled);
  if (!wasActive) return { ok: true, changed: false, note: "AntiNuke gia spento/inattivo." };

  let panicStopped = false;
  if (snap?.panicActive) {
    const stopped = await stopAntiNukePanic(guild, "manual security panic disable", actorId).catch(() => ({ ok: false }));
    panicStopped = Boolean(stopped?.ok);
  }

  const cfg = snap?.config || {};
  const setResult = setAntiNukeConfigSnapshot({
    ...cfg,
    enabled: false,
    panicMode: {
      ...(cfg.panicMode || {}),
      enabled: false,
      lockdown: {
        ...(cfg.panicMode?.lockdown || {}),
        lockModerationCommands: false,
        lockAllCommands: false,
      },
    },
  });

  return {
    ok: Boolean(setResult?.ok),
    changed: true,
    note: `AntiNuke disabilitato${panicStopped ? " + panic stoppata" : ""}.`,
  };
}

async function disableAutoMod(guildId) {
  const cfg = getAutoModConfigSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const rules = getAutoModRulesSnapshot();
  const wasActive = Boolean(rules?.status?.enabled || cfg?.panic?.enabled || panic?.active);
  if (!wasActive) return { ok: true, changed: false, note: "AutoMod gia spento/inattivo." };

  const r1 = updateAutoModConfig("enabled", false);
  const r2 = updateAutoModConfig("panic.enabled", false);
  const r3 = updateAutoModConfig("autoLockdown.enabled", false);
  const ok = Boolean(r1?.ok && r2?.ok && r3?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "AutoMod disabilitato (panic/autolockdown OFF)." : "Errore disabilitazione AutoMod.",
  };
}

async function disableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  const wasActive = Boolean(cfg?.enabled);
  if (!wasActive) return { ok: true, changed: false, note: "JoinGate gia spento." };

  const updated = updateJoinGateConfig("enabled", "false");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate disabilitato." : "Errore disabilitazione JoinGate.",
  };
}

async function disableJoinRaid(guildId) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const wasActive = Boolean(raid?.enabled || raid?.raidActive || raid?.config?.lockCommands);
  if (!wasActive) return { ok: true, changed: false, note: "JoinRaid gia spento/inattivo." };

  const next = {
    ...(raid?.config || {}),
    enabled: false,
    lockCommands: false,
  };
  const updated = setJoinRaidConfigSnapshot(next);
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid disabilitato (lockCommands OFF)." : "Errore disabilitazione JoinRaid.",
  };
}

async function disableLockCommands(guildId) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  const wasActive = antiLockMod || antiLockAll || raidLock;
  if (!wasActive) return { ok: true, changed: false, note: "LockCommands gia disattivati." };

  const antiCfg = anti?.config || {};
  const antiUpdated = setAntiNukeConfigSnapshot({
    ...antiCfg,
    panicMode: {
      ...(antiCfg.panicMode || {}),
      lockdown: {
        ...(antiCfg.panicMode?.lockdown || {}),
        lockModerationCommands: false,
        lockAllCommands: false,
      },
    },
  });

  const raidUpdated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    lockCommands: false,
  });

  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands disattivati (AntiNuke + JoinRaid)." : "Errore disattivazione LockCommands.",
  };
}

async function enableAntiNuke(guild, actorId) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const cfg = snap?.config || {};

  const setResult = setAntiNukeConfigSnapshot({
    ...cfg,
    enabled: true,
    panicMode: {
      ...(cfg.panicMode || {}),
      enabled: true,
    },
  });
  if (!setResult?.ok) return { ok: false, changed: false, note: "Errore riabilitazione AntiNuke." };

  const triggered = await triggerAntiNukePanicExternal(
    guild,
    `manual security panic enable by ${String(actorId || "unknown")}`,
    500,
  ).catch(() => ({ ok: false }));

  return {
    ok: true,
    changed: true,
    note: triggered?.ok
      ? "AntiNuke riabilitato + panic manuale avviata."
      : "AntiNuke riabilitato (panic manuale non avviata).",
  };
}

async function enableAutoMod(guildId, actorId) {
  const cfg = getAutoModConfigSnapshot();
  const rules = getAutoModRulesSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const wasActive = Boolean(rules?.status?.enabled && cfg?.panic?.enabled && panic?.active);
  if (wasActive) return { ok: true, changed: false, note: "AutoMod panic gia attiva." };

  const r1 = updateAutoModConfig("enabled", true);
  const r2 = updateAutoModConfig("panic.enabled", true);
  if (!r1?.ok || !r2?.ok) {
    return { ok: false, changed: false, note: "Errore riabilitazione AutoMod." };
  }
  const trig = triggerAutoModPanicExternal(guildId, String(actorId || "manual"), {
    activityBoost: 1,
    raidBoost: 1,
  });

  return {
    ok: true,
    changed: true,
    note: trig?.activated
      ? "AutoMod riabilitato + panic manuale avviata."
      : "AutoMod riabilitato (panic manuale non avviata).",
  };
}

async function enableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  if (cfg?.enabled) return { ok: true, changed: false, note: "JoinGate gia attivo." };
  const updated = updateJoinGateConfig("enabled", "true");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate riabilitato." : "Errore riabilitazione JoinGate.",
  };
}

async function enableJoinRaid(guildId) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  if (raid?.enabled) return { ok: true, changed: false, note: "JoinRaid gia attivo." };
  const updated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    enabled: true,
  });
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid riabilitato." : "Errore riabilitazione JoinRaid.",
  };
}

async function enableLockCommands(guildId) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  if (antiLockMod && antiLockAll && raidLock) {
    return { ok: true, changed: false, note: "LockCommands gia attivi." };
  }

  const antiCfg = anti?.config || {};
  const antiUpdated = setAntiNukeConfigSnapshot({
    ...antiCfg,
    panicMode: {
      ...(antiCfg.panicMode || {}),
      lockdown: {
        ...(antiCfg.panicMode?.lockdown || {}),
        lockModerationCommands: true,
        lockAllCommands: true,
      },
    },
  });
  const raidUpdated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    lockCommands: true,
  });
  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands attivati (AntiNuke + JoinRaid)." : "Errore attivazione LockCommands.",
  };
}

module.exports = {
  name: "security",
  subcommands: ["status", "panic"],
  subcommandAliases: {
    status: "status",
    panic: "panic",
  },
  allowEmptyArgs: true,

  async execute(message, args = []) {
    if (!message?.guild || !message?.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sub = String(args[0] || "status").toLowerCase();

    if (sub === "status") {
      const pages = await buildStatusEmbeds(message.guild);
      await sendPagedEmbeds(message, pages, "security-status");
      return;
    }

    if (sub !== "panic") {
      await safeMessageReply(message, {
        embeds: [usageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const action = String(args[1] || "status").toLowerCase();
    if (action === "status") {
      const pages = await buildPanicStatusEmbeds(message.guild);
      await sendPagedEmbeds(message, pages, "security-panic-status");
      return;
    }

    if (!["enable", "disable"].includes(action)) {
      await safeMessageReply(message, {
        embeds: [panicUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!hasPanicControlAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Solo Founder/CoFounder possono usare panic enable/disable.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = parsePanicTarget(args[2]);
    if (!target) {
      await safeMessageReply(message, {
        embeds: [panicUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const guildId = String(message.guild.id || "");
    const results = [];

    if (action === "disable") {
      if (target === "antinuke" || target === "all") {
        results.push({ system: "AntiNuke", ...(await disableAntiNuke(message.guild, message.author.id)) });
      }
      if (target === "automod" || target === "all") {
        results.push({ system: "AutoMod", ...(await disableAutoMod(guildId)) });
      }
      if (target === "joingate" || target === "all") {
        results.push({ system: "JoinGate", ...(await disableJoinGate()) });
      }
      if (target === "joinraid" || target === "all") {
        results.push({ system: "JoinRaid", ...(await disableJoinRaid(guildId)) });
      }
      if (target === "lockcommands" || target === "all") {
        results.push({ system: "LockCommands", ...(await disableLockCommands(guildId)) });
      }
    } else {
      if (target === "antinuke" || target === "all") {
        results.push({ system: "AntiNuke", ...(await enableAntiNuke(message.guild, message.author.id)) });
      }
      if (target === "automod" || target === "all") {
        results.push({ system: "AutoMod", ...(await enableAutoMod(guildId, message.author.id)) });
      }
      if (target === "joingate" || target === "all") {
        results.push({ system: "JoinGate", ...(await enableJoinGate()) });
      }
      if (target === "joinraid" || target === "all") {
        results.push({ system: "JoinRaid", ...(await enableJoinRaid(guildId)) });
      }
      if (target === "lockcommands" || target === "all") {
        results.push({ system: "LockCommands", ...(await enableLockCommands(guildId)) });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const changedCount = results.filter((r) => r.changed).length;
    const lines = results.map((r) => {
      const status = r.ok ? "OK" : "ERR";
      const changed = r.changed ? "changed" : "no-change";
      return `- **${r.system}**: ${status} (${changed}) - ${r.note}`;
    });

    await sendSecurityAuditLog(message.guild, {
      actorId: message.author.id,
      action: `security.panic.${action}`,
      details: [`Target: \`${target}\``, `Results: ${okCount}/${results.length} ok, changed ${changedCount}`],
      color: okCount === results.length ? "#57F287" : "#FEE75C",
    }).catch(() => null);

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor(okCount === results.length ? "#57F287" : "#FEE75C")
          .setTitle(`Security Panic ${action === "enable" ? "Enable" : "Disable"}`)
          .setDescription([
            `Target: **${target}**`,
            `Success: **${okCount}/${results.length}**`,
            `Changed: **${changedCount}**`,
            "",
            ...lines,
          ].join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
