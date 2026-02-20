const fs = require("fs");
const path = require("path");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");

const APPLY_HELPER_BUTTON = "apply_helper";
const APPLY_PM_BUTTON = "apply_partnermanager";
const APPLY_START_PREFIX = "apply_start";
const MODAL_PREFIX = "apply_form";
const STATE_TTL_MS = 30 * 60 * 1000;
const APPLICATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const APPLICATION_REACTIONS = [
  "<:thumbsup:1471292172145004768>",
  "<:thumbsdown:1471292163957457013>",
];

const NOMODULI_ROLE_ID = IDs.roles.blacklistModuli;
const MEMBER_ROLE_ID = IDs.roles.Member;
const HELPER_ROLE_ID = IDs.roles.Helper;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HELPER_REAPPLY_BLOCK_ROLE_IDS = [
  IDs.roles.Staff,
  IDs.roles.Helper,
  IDs.roles.Mod,
  IDs.roles.Coordinator,
  IDs.roles.Supervisor,
  IDs.roles.HighStaff,
  IDs.roles.Admin,
  IDs.roles.Manager,
  IDs.roles.CoFounder,
  IDs.roles.Founder,
].filter(Boolean);

const APPLICATION_COOLDOWN_PATH = path.join(
  process.cwd(),
  "Data",
  "applicationCooldowns.json",
);
const APPLICATION_COUNTERS_PATH = path.join(
  process.cwd(),
  "Data",
  "applicationCounters.json",
);

const pendingApplications = new Map();
const cooldownByUser = new Map();
const applicationCounters = {
  helper: 0,
  partnermanager: 0,
};

const APPLICATIONS = {
  helper: {
    label: "Helper",
    questions: [
      {
        id: "id_discord",
        text: "1. ID",
        modalLabel: "1. ID",
        placeholder: "Copia e incolla il tuo ID di Discord",
        style: TextInputStyle.Short,
      },
      {
        id: "eta",
        text: "2. Età",
        modalLabel: "2. Età",
        placeholder: "Scrivi la tua età",
        style: TextInputStyle.Short,
      },
      {
        id: "staff_server",
        text: "3. Nomina tutti i server dove sei stato staff, per quanto tempo e che ruolo avevi",
        modalLabel: "3. Esperienze staff",
        placeholder: "Server, tempo e ruolo",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "motivo_candidatura",
        text: "4. Come mai ti sei voluto candidare su Vinili & Caffè?",
        modalLabel: "4. Motivo candidatura",
        placeholder: "Spiega il motivo",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "aiuto_economico",
        text: "5. Saresti disposto ad aiutare il server economicamente?",
        modalLabel: "5. Aiuto economico",
        placeholder: "Si / No",
        style: TextInputStyle.Short,
      },
      {
        id: "flame_testuale",
        text: "6. Se due utenti si flammano a vicenda su un determinato argomento, come ti comporti? (flame testuale)",
        modalLabel: "6. Gestione flame",
        placeholder: "Come ti comporti?",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "comandi_dyno",
        text: "7. Elenca i comandi di moderazioni più importanti di Dyno",
        modalLabel: "7. Comandi Dyno",
        placeholder: "Elenca i comandi",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "critica_staff",
        text: "8. Se una persona critica il server o lo staff in maniera non idonea, come ti comporti?",
        modalLabel: "8. Gestione critica",
        placeholder: "Come ti comporti?",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "vocale",
        text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?",
        modalLabel: "9. Disponibilità vocale",
        placeholder: "Spiega la tua disponibilità",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "definizione_flame",
        text: "10. Definizione di flame",
        modalLabel: "10. Definizione flame",
        placeholder: "Scrivi la definizione",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "troll_pubblico",
        text: "11. Se due utenti iniziassero a trollare in pubblico, come agiresti ?",
        modalLabel: "11. Gestione troll",
        placeholder: "Come agiresti?",
        style: TextInputStyle.Paragraph,
      },
    ],
  },
  partnermanager: {
    label: "Partner Manager",
    questions: [
      {
        id: "id_discord",
        text: "1. ID",
        modalLabel: "1. ID",
        placeholder: "Scrivi il tuo ID di Discord",
        style: TextInputStyle.Short,
      },
      {
        id: "luminous_nova",
        text: "2. Conosci il bot Luminous Nova/SkyForce?",
        modalLabel: "2. Luminous Nova/SkyForce",
        placeholder: "Si / No",
        style: TextInputStyle.Short,
      },
      {
        id: "partner_giorno",
        text: "3. Quante partner fai al giorno?",
        modalLabel: "3. Partner al giorno",
        placeholder: "<15 / 15+",
        style: TextInputStyle.Short,
      },
    ],
  },
};

function loadCooldownMap() {
  try {
    if (!fs.existsSync(APPLICATION_COOLDOWN_PATH)) return;
    const raw = fs.readFileSync(APPLICATION_COOLDOWN_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [userId, until] of Object.entries(parsed)) {
      const ts = Number(until || 0);
      if (Number.isFinite(ts) && ts > now) cooldownByUser.set(String(userId), ts);
    }
  } catch {}
}

function persistCooldownMap() {
  try {
    const dir = path.dirname(APPLICATION_COOLDOWN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const out = {};
    for (const [userId, until] of cooldownByUser.entries()) {
      if (Number(until) > now) out[userId] = Number(until);
    }
    fs.writeFileSync(APPLICATION_COOLDOWN_PATH, JSON.stringify(out, null, 2), "utf8");
  } catch {}
}

loadCooldownMap();

function loadApplicationCounters() {
  try {
    if (!fs.existsSync(APPLICATION_COUNTERS_PATH)) return;
    const raw = fs.readFileSync(APPLICATION_COUNTERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const helper = Number(parsed.helper || 0);
    const pm = Number(parsed.partnermanager || 0);
    applicationCounters.helper = Number.isFinite(helper) && helper > 0 ? Math.floor(helper) : 0;
    applicationCounters.partnermanager =
      Number.isFinite(pm) && pm > 0 ? Math.floor(pm) : 0;
  } catch {}
}

function persistApplicationCounters() {
  try {
    const dir = path.dirname(APPLICATION_COUNTERS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      APPLICATION_COUNTERS_PATH,
      JSON.stringify(applicationCounters, null, 2),
      "utf8",
    );
  } catch {}
}

function nextApplicationNumber(type) {
  const key = type === "partnermanager" ? "partnermanager" : "helper";
  const current = Number(applicationCounters[key] || 0);
  const next = Number.isFinite(current) ? Math.floor(current) + 1 : 1;
  applicationCounters[key] = next;
  persistApplicationCounters();
  return next;
}

loadApplicationCounters();

function pruneOldStates() {
  const now = Date.now();
  for (const [key, state] of pendingApplications.entries()) {
    if (!state?.createdAt || now - state.createdAt > STATE_TTL_MS) {
      pendingApplications.delete(key);
    }
  }
}

const cleanupTimer = setInterval(pruneOldStates, 5 * 60 * 1000);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

function splitQuestions(questions, chunkSize = 4) {
  const chunks = [];
  for (let i = 0; i < questions.length; i += chunkSize) {
    chunks.push(questions.slice(i, i + chunkSize));
  }
  return chunks;
}

function getStateKey(interaction, type) {
  return `${interaction.guildId || "dm"}:${interaction.user?.id || "unknown"}:${type}`;
}

function getRoleCache(interaction) {
  const cache = interaction?.member?.roles?.cache;
  return cache && typeof cache.has === "function" ? cache : null;
}

function hasAnyRole(interaction, roleIds) {
  const cache = getRoleCache(interaction);
  if (!cache) return false;
  return roleIds.some((id) => cache.has(id));
}

function getHighestRoleId(interaction, roleIds) {
  const cache = getRoleCache(interaction);
  if (!cache || !Array.isArray(roleIds) || roleIds.length === 0) return null;
  const roles = roleIds
    .map((id) => cache.get(id))
    .filter(Boolean)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0));
  return roles[0]?.id || null;
}

function hasMemberRole(interaction) {
  if (!MEMBER_ROLE_ID) return true;
  return hasAnyRole(interaction, [MEMBER_ROLE_ID]);
}

function hasNoModuliRole(interaction) {
  if (!NOMODULI_ROLE_ID) return false;
  return hasAnyRole(interaction, [NOMODULI_ROLE_ID]);
}

function getCooldownUntil(userId) {
  const safeId = String(userId || "");
  const ts = Number(cooldownByUser.get(safeId) || 0);
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    cooldownByUser.delete(safeId);
    return 0;
  }
  return ts;
}

function setCooldown(userId, untilTs) {
  cooldownByUser.set(String(userId || ""), Number(untilTs));
  persistCooldownMap();
}

function buildRoleDeniedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Accesso negato")
    .setDescription(
      "<:vegax:1443934876440068179> Le candidature sono disponibili solo agli utenti con ruolo Member.",
    );
}

function buildAlreadyRoleEmbed(roleId) {
  const roleText = roleId ? `<@&${roleId}>` : "questo ruolo";
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Accesso negato")
    .setDescription(
      `Sei già ${roleText}, perchè dovresti ricandidarti?`,
    );
}

function buildNoModuliDeniedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Accesso negato")
    .setDescription(
      "<:vegax:1443934876440068179> Non puoi inviare candidature: sei blacklistato dai moduli.",
    );
}

function buildCooldownDeniedEmbed(untilTs) {
  const unix = Math.floor(Number(untilTs) / 1000);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Candidatura non disponibile")
    .setDescription(
      [
        "Hai già inviato una candidatura recentemente.",
        "",
        `Potrai inviarne una nuova dopo: <t:${unix}:F> (<t:${unix}:R>).`,
        "Devi attendere 7 giorni prima di riprovare.",
      ].join("\n"),
    );
}

function buildIntroEmbed(type) {
  if (type === "partnermanager") {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Candidatura Partner Manager")
      .setDescription(
        "Compilando questo modulo potrai candidarti come Partner Manager del server.\nSe hai dei dubbi apri un ticket terza categoria.",
      );
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Candidatura Helper")
    .setDescription(
      "Compilando questo modulo potrai candidarti come Helper del server.\nIn caso verrete accettati farete una prova di 1/2 settimane\nSe hai dei dubbi apri un ticket terza categoria.",
    );
}

function buildFinalThanksEmbed(untilTs) {
  const unix = Math.floor(Number(untilTs) / 1000);
  return new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle("<:vegacheckmark:1443666279058772028> Candidatura inviata")
    .setDescription(
      [
        "Grazie per esserti candidato.",
        "",
        `Non potrai inviare una nuova candidatura prima di: <t:${unix}:F> (<t:${unix}:R>).`,
        "",
        "Non aprire ticket e non pingare lo staff per chiedere l'esito, altrimenti la candidatura verrà automaticamente scartata.",
      ].join("\n"),
    );
}

function getTargetRoleIdByType(type) {
  if (type === "partnermanager") return PARTNER_MANAGER_ROLE_ID;
  if (type === "helper") return HELPER_ROLE_ID;
  return null;
}

async function enforceEligibility(interaction, type) {
  if (hasNoModuliRole(interaction)) {
    await interaction.reply({
      embeds: [buildNoModuliDeniedEmbed()],
      flags: 1 << 6,
    });
    return false;
  }
  if (!hasMemberRole(interaction)) {
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    });
    return false;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    });
    return false;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    const highestRoleId =
      getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    });
    return false;
  }
  const until = getCooldownUntil(interaction.user?.id);
  if (until) {
    await interaction.reply({
      embeds: [buildCooldownDeniedEmbed(until)],
      flags: 1 << 6,
    });
    return false;
  }
  return true;
}

function buildModal(type, step) {
  const cfg = APPLICATIONS[type];
  if (!cfg) return null;
  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return null;

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${type}:${step}`)
    .setTitle(`${cfg.label} - Modulo ${step}/${chunks.length}`);

  const rows = selected.map((q) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.modalLabel)
        .setStyle(q.style || TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder(q.placeholder || "Rispondi qui")
        .setMaxLength(q.style === TextInputStyle.Short ? 120 : 1000),
    ),
  );
  modal.addComponents(...rows);
  return modal;
}

function formatApplicationDescription(type, answers) {
  const cfg = APPLICATIONS[type];
  const lines = [];
  for (const q of cfg.questions) {
    const answer = String(answers?.[q.id] || "Nessuna risposta").trim();
    lines.push(`**${q.text}**`);
    lines.push(answer || "Nessuna risposta");
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function resolveSubmissionChannel(interaction) {
  const guild = interaction.guild;
  if (!guild) return null;
  const targetId = IDs.channels.visioneModuli;
  if (targetId) {
    return (
      guild.channels.cache.get(targetId) ||
      (await guild.channels.fetch(targetId).catch(() => null))
    );
  }
  return guild.channels.cache.find((c) => String(c?.name || "") === "visioneModuli") || null;
}

async function sendIntro(interaction, type) {
  const userId = String(interaction.user?.id || "");
  const embed = buildIntroEmbed(type);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLY_START_PREFIX}:${type}:${userId}`)
      .setLabel("Inizia modulo")
      .setStyle(ButtonStyle.Primary),
  );
  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 1 << 6,
  });
}

async function handleStartButton(interaction, type, step = 1) {
  const stateKey = getStateKey(interaction, type);
  const normalizedStep = Number(step) || 1;
  if (normalizedStep <= 1) {
    pendingApplications.set(stateKey, {
      createdAt: Date.now(),
      answers: {},
    });
  } else {
    const state = pendingApplications.get(stateKey);
    if (!state) {
      await interaction.reply({
        content:
          "<:vegax:1443934876440068179> Sessione candidatura scaduta. Clicca di nuovo il bottone candidatura.",
        flags: 1 << 6,
      });
      return true;
    }
    state.createdAt = Date.now();
    pendingApplications.set(stateKey, state);
  }
  const modal = buildModal(type, normalizedStep);
  if (!modal) return false;
  await interaction.showModal(modal);
  return true;
}

async function finalizeApplication(interaction, type, state) {
  const cfg = APPLICATIONS[type];
  const channel = await resolveSubmissionChannel(interaction);
  if (!channel?.isTextBased?.()) {
    await interaction.reply({
      content:
        "<:vegax:1443934876440068179> Non trovo il canale `visioneModuli` per inviare la candidatura.",
      flags: 1 << 6,
    });
    return true;
  }

  const user = interaction.user;
  const applicationNumber = nextApplicationNumber(type);
  const embed = new EmbedBuilder()
    .setColor("#3498DB")
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setTitle(`CANDIDATURA ${cfg.label.toUpperCase()} (#${applicationNumber})`)
    .setDescription(formatApplicationDescription(type, state.answers))
    .setFooter({
      text: `User ID: ${user.id} • ${new Date().toLocaleString("it-IT")}`,
    })
    .setTimestamp();

  const highStaffRoleId = IDs.roles.HighStaff;
  const mention = highStaffRoleId ? `<@&${highStaffRoleId}>` : null;
  const sent = await channel.send({
    content: mention || undefined,
    embeds: [embed],
  });

  for (const emoji of APPLICATION_REACTIONS) {
    await sent.react(emoji).catch(() => {});
  }

  const nextAllowedAt = Date.now() + APPLICATION_COOLDOWN_MS;
  setCooldown(user.id, nextAllowedAt);

  await interaction.reply({
    embeds: [buildFinalThanksEmbed(nextAllowedAt)],
    flags: 1 << 6,
  });
  return true;
}

async function handleModalSubmit(interaction, type, stepRaw) {
  if (hasNoModuliRole(interaction)) {
    pendingApplications.delete(getStateKey(interaction, type));
    await interaction.reply({
      embeds: [buildNoModuliDeniedEmbed()],
      flags: 1 << 6,
    });
    return true;
  }
  if (!hasMemberRole(interaction)) {
    pendingApplications.delete(getStateKey(interaction, type));
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    });
    return true;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    pendingApplications.delete(getStateKey(interaction, type));
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    });
    return true;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    pendingApplications.delete(getStateKey(interaction, type));
    const highestRoleId =
      getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    });
    return true;
  }

  const cfg = APPLICATIONS[type];
  if (!cfg) return false;
  const step = Number(stepRaw);
  if (!Number.isFinite(step) || step < 1) return false;

  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return false;

  const stateKey = getStateKey(interaction, type);
  const state = pendingApplications.get(stateKey);
  if (!state) {
    await interaction.reply({
      content:
        "<:vegax:1443934876440068179> Sessione candidatura non valida. Clicca di nuovo il bottone candidatura.",
      flags: 1 << 6,
    });
    return true;
  }

  for (const q of selected) {
    const value = interaction.fields.getTextInputValue(q.id);
    state.answers[q.id] = String(value || "").trim();
  }

  const nextStep = step + 1;
  if (nextStep <= chunks.length) {
    pendingApplications.set(stateKey, state);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${nextStep}`)
        .setLabel(`Continua modulo (${nextStep}/${chunks.length})`)
        .setStyle(ButtonStyle.Primary),
    );
    await interaction.reply({
      content: "Sei quasi alla fine. Clicca per continuare la candidatura.",
      components: [row],
      flags: 1 << 6,
    });
    return true;
  }

  pendingApplications.delete(stateKey);
  return finalizeApplication(interaction, type, state);
}

async function handleCandidatureApplicationInteraction(interaction) {
  if (interaction.isButton?.()) {
    if (interaction.customId === APPLY_HELPER_BUTTON) {
      const ok = await enforceEligibility(interaction, "helper");
      if (!ok) return true;
      await sendIntro(interaction, "helper");
      return true;
    }

    if (interaction.customId === APPLY_PM_BUTTON) {
      const ok = await enforceEligibility(interaction, "partnermanager");
      if (!ok) return true;
      await sendIntro(interaction, "partnermanager");
      return true;
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_START_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        });
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Number(rawStep || 1);
      return handleStartButton(interaction, type, step);
    }
    return false;
  }

  if (!interaction.isModalSubmit?.()) return false;
  const raw = String(interaction.customId || "");
  if (!raw.startsWith(`${MODAL_PREFIX}:`)) return false;
  const [, type, step] = raw.split(":");
  return handleModalSubmit(interaction, type, step);
}

module.exports = {
  handleCandidatureApplicationInteraction,
};
