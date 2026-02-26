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
const APPLY_BACK_PREFIX = "apply_back";
const APPLY_PAGE_PREFIX = "apply_page";
const MODAL_PREFIX = "apply_form";
const APPLY_PEX_PREFIX = "apply_pex";
const APPLY_PEX_MODAL_PREFIX = "apply_pex_modal";
const APPLY_PEX_REASON_INPUT_ID = "apply_pex_reason";
const STATE_TTL_MS = 30 * 60 * 1000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
const APPLICATION_DRAFTS_PATH = path.join(
  process.cwd(),
  "Data",
  "applicationDrafts.json",
);

const pendingApplications = new Map();
const cooldownByUser = new Map();
const draftByStateKey = new Map();
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
        style: TextInputStyle.Paragraph,
      },
      {
        id: "motivo_candidatura",
        text: "4. Come mai ti sei voluto candidare su Vinili & Caffè?",
        modalLabel: "4. Motivo candidatura",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "aiuto_economico",
        text: "5. Saresti disposto ad aiutare il server economicamente?",
        modalLabel: "5. Aiuto economico",
        placeholder: "Si / No",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "flame_testuale",
        text: "6. Se due utenti si flammano a vicenda su un determinato argomento, come ti comporti? (in testuale)",
        modalLabel: "6. Gestione flame",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "comandi_dyno",
        text: "7. Elenca i comandi di moderazioni più importanti di Dyno",
        modalLabel: "7. Comandi Dyno",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "critica_staff",
        text: "8. Se una persona critica il server o lo staff in maniera non idonea, come ti comporti?",
        modalLabel: "8. Gestione critica",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "vocale",
        text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?",
        modalLabel: "9. Disponibilità vocale",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "definizione_flame",
        text: "10. Definizione di flame",
        modalLabel: "10. Definizione flame",
        style: TextInputStyle.Paragraph,
      },
      {
        id: "troll_pubblico",
        text: "11. Se due utenti iniziassero a trollare in pubblico, come agiresti?",
        modalLabel: "11. Gestione troll",
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

function loadDraftMap() {
  try {
    if (!fs.existsSync(APPLICATION_DRAFTS_PATH)) return;
    const raw = fs.readFileSync(APPLICATION_DRAFTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [stateKey, draft] of Object.entries(parsed)) {
      if (!draft || typeof draft !== "object") continue;
      const updatedAt = Number(draft.updatedAt || 0);
      const nextStep = Number(draft.nextStep || 1);
      if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) continue;
      if (!Number.isFinite(nextStep) || nextStep < 1) continue;
      draftByStateKey.set(stateKey, {
        answers: draft.answers && typeof draft.answers === "object" ? draft.answers : {},
        nextStep: Math.floor(nextStep),
        updatedAt,
      });
    }
  } catch {}
}

function persistDraftMap() {
  try {
    const dir = path.dirname(APPLICATION_DRAFTS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const out = {};
    for (const [stateKey, draft] of draftByStateKey.entries()) {
      const updatedAt = Number(draft?.updatedAt || 0);
      const nextStep = Number(draft?.nextStep || 1);
      if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) continue;
      if (!Number.isFinite(nextStep) || nextStep < 1) continue;
      out[stateKey] = {
        answers: draft.answers && typeof draft.answers === "object" ? draft.answers : {},
        nextStep: Math.floor(nextStep),
        updatedAt,
      };
    }
    fs.writeFileSync(APPLICATION_DRAFTS_PATH, JSON.stringify(out, null, 2), "utf8");
  } catch {}
}

function setDraftState(stateKey, answers, nextStep) {
  draftByStateKey.set(stateKey, {
    answers: answers && typeof answers === "object" ? answers : {},
    nextStep: Math.max(1, Math.floor(Number(nextStep) || 1)),
    updatedAt: Date.now(),
  });
  persistDraftMap();
}

function getDraftState(stateKey) {
  const draft = draftByStateKey.get(stateKey);
  if (!draft) return null;
  const updatedAt = Number(draft.updatedAt || 0);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > DRAFT_TTL_MS) {
    draftByStateKey.delete(stateKey);
    persistDraftMap();
    return null;
  }
  return draft;
}

function clearDraftState(stateKey) {
  if (!draftByStateKey.has(stateKey)) return;
  draftByStateKey.delete(stateKey);
  persistDraftMap();
}

loadDraftMap();

function pruneOldStates() {
  const now = Date.now();
  for (const [key, state] of pendingApplications.entries()) {
    if (!state?.createdAt || now - state.createdAt > STATE_TTL_MS) {
      pendingApplications.delete(key);
    }
  }
  let draftChanged = false;
  for (const [key, draft] of draftByStateKey.entries()) {
    const updatedAt = Number(draft?.updatedAt || 0);
    if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) {
      draftByStateKey.delete(key);
      draftChanged = true;
    }
  }
  if (draftChanged) persistDraftMap();
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

function hasHighStaffRole(interaction) {
  const highStaffRoleId = IDs?.roles?.HighStaff
    ? String(IDs.roles.HighStaff)
    : null;
  if (!highStaffRoleId) return false;
  return Boolean(interaction?.member?.roles?.cache?.has(highStaffRoleId));
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
      `Sei già ${roleText}, perché dovresti ricandidarti?`,
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
        "Compilando questo modulo potrai candidarti come Partner Manager del server.\nSe hai dei dubbi apri un ticket terza categoria.\n\n**__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",
      );
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Candidatura Helper")
    .setDescription(
      "Compilando questo modulo potrai candidarti come Helper del server.\nIn caso verrete accettati farete una prova di 1/2 settimane\nSe hai dei dubbi apri un ticket terza categoria.\n\n**__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",
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

function buildCandidatePexRow(type, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLY_PEX_PREFIX}:${type}:${userId}`)
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
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
    }).catch(() => null);
    return false;
  }
  if (!hasMemberRole(interaction)) {
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    const highestRoleId =
      getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  const until = getCooldownUntil(interaction.user?.id);
  if (until) {
    await interaction.reply({
      embeds: [buildCooldownDeniedEmbed(until)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  return true;
}

function buildModal(type, step, prefillAnswers = {}) {
  const cfg = APPLICATIONS[type];
  if (!cfg) return null;
  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return null;

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${type}:${step}`)
    .setTitle(`${cfg.label} - Modulo ${step}/${chunks.length}`);

  const rows = selected.map((q) => {
    const maxLen = q.style === TextInputStyle.Short ? 120 : 1000;
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(String(q.modalLabel || q.text || "Domanda").replace(/\s+/g, " ").trim().slice(0, 45))
      .setStyle(q.style || TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder(
        `${String(q.text || q.modalLabel || "Domanda").replace(/\s+/g, " ").trim()} | ${String(q.placeholder || "Rispondi qui").replace(/\s+/g, " ").trim()}`
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100),
      )
      .setMaxLength(maxLen);
    const saved = String(prefillAnswers?.[q.id] || "").trim();
    if (saved) input.setValue(saved.slice(0, maxLen));
    return new ActionRowBuilder().addComponents(input);
  });
  modal.addComponents(...rows);
  return modal;
}

function buildPagePickerRow(type, userId, totalSteps, currentStep) {
  const safeTotal = Math.max(1, Math.min(5, Number(totalSteps) || 1));
  const safeCurrent = Math.max(1, Number(currentStep) || 1);
  const buttons = [];
  for (let page = 1; page <= safeTotal; page += 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${APPLY_PAGE_PREFIX}:${type}:${userId}:${page}`)
        .setLabel(`Pagina ${page}`)
        .setStyle(page === safeCurrent ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(page === safeCurrent),
    );
  }
  return new ActionRowBuilder().addComponents(...buttons);
}

function formatApplicationDescription(type, answers) {
  const cfg = APPLICATIONS[type];
  const blocks = [];
  for (const q of cfg.questions) {
    const answer =
      String(answers?.[q.id] || "Nessuna risposta")
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || "Nessuna risposta";
    const question = String(q.text || "")
      .replace(/^(\d+)\./, "$1\\.")
      .trim();
    blocks.push(`**${question}**\n${answer}`);
  }
  return blocks.join("\n\n").trim();
}

async function resolveSubmissionChannel(interaction) {
  const guild = interaction.guild;
  if (!guild) return null;
  const targetId = IDs.channels?.visioneModuli;
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
  }).catch(() => null);
}

async function handleStartButton(interaction, type, step = 1, forceStep = false) {
  const stateKey = getStateKey(interaction, type);
  const normalizedStep = Number(step) || 1;
  if (normalizedStep <= 1 && !forceStep) {
    const draft = getDraftState(stateKey);
    if (draft?.nextStep > 1) {
      const totalSteps = splitQuestions(APPLICATIONS[type]?.questions || [], 4).length || 1;
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${draft.nextStep}`)
          .setLabel(`Riprendi dalla pagina ${draft.nextStep}`)
          .setStyle(ButtonStyle.Primary),
      );
      const row2 = buildPagePickerRow(type, interaction.user.id, totalSteps, draft.nextStep);
      await interaction.reply({
        content:
          "Hai una candidatura in bozza. Puoi riprendere dall'ultima pagina o aprire una pagina specifica per correggere.",
        components: [row1, row2],
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    clearDraftState(stateKey);
    pendingApplications.set(stateKey, { createdAt: Date.now(), answers: {} });
  } else {
    const state = pendingApplications.get(stateKey);
    if (!state) {
      const draft = getDraftState(stateKey);
      if (!draft?.answers) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Sessione candidatura scaduta. Clicca di nuovo il bottone candidatura.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      pendingApplications.set(stateKey, {
        createdAt: Date.now(),
        answers: draft.answers,
      });
    } else {
      state.createdAt = Date.now();
      pendingApplications.set(stateKey, state);
    }
  }
  const currentState = pendingApplications.get(stateKey);
  const modal = buildModal(type, normalizedStep, currentState?.answers || {});
  if (!modal) return false;
  await interaction.showModal(modal);
  return true;
}

async function finalizeApplication(interaction, type, state, stateKey = null) {
  const cfg = APPLICATIONS[type];
  const channel = await resolveSubmissionChannel(interaction);
  if (!channel?.isTextBased?.()) {
    await interaction.reply({
      content:
        "<:vegax:1443934876440068179> Non trovo il canale `visioneModuli` per inviare la candidatura.",
      flags: 1 << 6,
    }).catch(() => null);
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
    components: [buildCandidatePexRow(type, user.id)],
  }).catch(() => null);
  if (!sent) return null;

  if (typeof sent.startThread === "function") {
    const threadUserLabel = String(user.globalName || user.username || user.id)
      .replace(/[\r\n#:@<>`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || user.id;
    const thread = await sent
      .startThread({
        name: `Candidatura ${threadUserLabel}`,
        autoArchiveDuration: 1440,
        reason: `Thread candidatura ${cfg.label} per ${user.tag}`,
      })
      .catch(() => null);
    if (thread?.isTextBased?.() && highStaffRoleId) {
      const pingMsg = await thread.send({ content: `<@&${highStaffRoleId}>` }).catch(() => null);
      if (pingMsg) {
        setTimeout(() => {
          pingMsg.delete().catch(() => {});
        }, 2500);
      }
    }
  }

  for (const emoji of APPLICATION_REACTIONS) {
    await sent.react(emoji).catch(() => {});
  }

  const nextAllowedAt = Date.now() + APPLICATION_COOLDOWN_MS;
  setCooldown(user.id, nextAllowedAt);
  if (stateKey) clearDraftState(stateKey);

  await interaction.reply({
    embeds: [buildFinalThanksEmbed(nextAllowedAt)],
    flags: 1 << 6,
  }).catch(() => null);
  return true;
}

async function getOrCreateStaffDoc(guildId, userId) {
  const StaffModel = require("../../Schemas/Staff/staffSchema");
  let doc = await StaffModel.findOne({ guildId, userId });
  if (!doc) doc = new StaffModel({ guildId, userId });
  return doc;
}

async function sendPartnerManagerWelcome(pmChannel, user) {
  if (!pmChannel?.isTextBased?.()) return;
  await pmChannel.send({
    content: `
${user}
# Benvenutx nei Partner Manager <:partneredserverowner:1443651871125409812>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569199229730836>
__Per qualsiasi cosa l'High Staff e disponibile__ <a:BL_crown_yellow:1330194103564238930>`,
  }).catch(() => null);
}

async function sendHelperWelcome(staffChannel, user) {
  if (!staffChannel?.isTextBased?.()) return;
  await staffChannel.send({
    content: `
${user}
# Benvenutx nello staff <:discordstaff:1443651872258003005>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569237142044773>
<:dot:1443660294596329582> <#1442569239063167139>
<:dot:1443660294596329582> <#1442569243626307634>
__Per qualsiasi cosa l'High Staff e disponibile__ <a:BL_crown_yellow:1330194103564238930>`,
  }).catch(() => null);
}

async function deleteThreadForStarterMessage(guild, starterMessage) {
  const starterId = String(starterMessage?.id || "");
  if (!/^\d{16,20}$/.test(starterId)) return;
  const thread =
    guild.channels.cache.get(starterId) ||
    (await guild.channels.fetch(starterId).catch(() => null));
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

async function applyCandidatePex(guild, actor, type, userId, reason, sourceMessage) {
  const targetRoleId = type === "partnermanager" ? PARTNER_MANAGER_ROLE_ID : HELPER_ROLE_ID;
  if (!targetRoleId) return "Ruolo target non configurato.";

  const member =
    guild.members.cache.get(String(userId)) ||
    (await guild.members.fetch(String(userId)).catch(() => null));
  if (!member) return "Utente non trovato nel server.";
  if (member.roles.cache.has(String(targetRoleId))) return "Utente già pexato su quel ruolo.";

  await member.roles.add(String(targetRoleId)).catch(() => null);
  if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
    await member.roles.add(String(IDs.roles.Staff)).catch(() => null);
    const staffChat =
      guild.channels.cache.get(IDs.channels.staffChat) ||
      (await guild.channels.fetch(IDs.channels.staffChat).catch(() => null));
    await sendHelperWelcome(staffChat, member.user);
  }
  if (String(targetRoleId) === String(PARTNER_MANAGER_ROLE_ID)) {
    const pmChannel =
      guild.channels.cache.get(IDs.channels.partnersChat) ||
      (await guild.channels.fetch(IDs.channels.partnersChat).catch(() => null));
    await sendPartnerManagerWelcome(pmChannel, member.user);
  }

  const roleBeforeId = String(IDs.roles.Member || member.roles.highest?.id || "");
  const staffDoc = await getOrCreateStaffDoc(guild.id, member.id);
  if (!Array.isArray(staffDoc.rolesHistory)) staffDoc.rolesHistory = [];
  staffDoc.rolesHistory.push({
    oldRole: roleBeforeId,
    newRole: String(targetRoleId),
    reason: String(reason || "").trim(),
    date: new Date(),
  });
  await staffDoc.save();

  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels.pexDepex) ||
    (await guild.channels.fetch(IDs.channels.pexDepex).catch(() => null));
  if (pexDepexChannel?.isTextBased?.()) {
    const oldRole = guild.roles.cache.get(roleBeforeId);
    const newRole = guild.roles.cache.get(String(targetRoleId));
    await pexDepexChannel.send({
      content: `**<a:everythingisstable:1444006799643508778> PEX** <@${member.id}>
<:member_role_icon:1330530086792728618> \`${oldRole?.name || roleBeforeId || "N/A"}\` <a:vegarightarrow:1443673039156936837> \`${newRole?.name || targetRoleId}\`
<:discordstaff:1443651872258003005> __${reason}__`,
    }).catch(() => null);
  }

  if (sourceMessage) {
    await sourceMessage.edit({ components: [] }).catch(() => null);
    await deleteThreadForStarterMessage(guild, sourceMessage);
  }

  return `Pex completato per <@${member.id}>.`;
}

function parseCandidatePexCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_PREFIX}:`)) return null;
  const [, type, userId] = raw.split(":");
  if (!["helper", "partnermanager"].includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  return { type: String(type), userId: String(userId) };
}

function parseCandidatePexModalId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_MODAL_PREFIX}:`)) return null;
  const [, type, userId, messageId] = raw.split(":");
  if (!["helper", "partnermanager"].includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  if (!/^\d{16,20}$/.test(String(messageId || ""))) return null;
  return { type: String(type), userId: String(userId), messageId: String(messageId) };
}

async function handleModalSubmit(interaction, type, stepRaw) {
  const stateKey = getStateKey(interaction, type);
  if (hasNoModuliRole(interaction)) {
    pendingApplications.delete(stateKey);
    clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildNoModuliDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  if (!hasMemberRole(interaction)) {
    pendingApplications.delete(stateKey);
    clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    pendingApplications.delete(stateKey);
    clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    pendingApplications.delete(stateKey);
    clearDraftState(stateKey);
    const highestRoleId =
      getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  const cfg = APPLICATIONS[type];
  if (!cfg) return false;
  const step = Number(stepRaw);
  if (!Number.isFinite(step) || step < 1) return false;

  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return false;

  const state = pendingApplications.get(stateKey);
  if (!state) {
    const draft = getDraftState(stateKey);
    if (!draft?.answers) {
      await interaction.reply({
        content:
          "<:vegax:1443934876440068179> Sessione candidatura non valida. Clicca di nuovo il bottone candidatura.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    pendingApplications.set(stateKey, {
      createdAt: Date.now(),
      answers: draft.answers,
    });
  }
  const activeState = pendingApplications.get(stateKey);

  for (const q of selected) {
    const value = interaction.fields.getTextInputValue(q.id);
    activeState.answers[q.id] = String(value || "").trim();
  }

  const nextStep = step + 1;
  if (nextStep <= chunks.length) {
    pendingApplications.set(stateKey, activeState);
    setDraftState(stateKey, activeState.answers, nextStep);
    const controls = [
      new ButtonBuilder()
        .setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${nextStep}`)
        .setLabel(`Continua modulo (${nextStep}/${chunks.length})`)
        .setStyle(ButtonStyle.Primary),
    ];
    if (step >= 1) {
      controls.push(
        new ButtonBuilder()
          .setCustomId(`${APPLY_BACK_PREFIX}:${type}:${interaction.user.id}:${step}`)
          .setLabel(`Indietro (${step}/${chunks.length})`)
          .setStyle(ButtonStyle.Secondary),
      );
    }
    const row = new ActionRowBuilder().addComponents(...controls);
    const pageRow = buildPagePickerRow(type, interaction.user.id, chunks.length, nextStep);
    await interaction.reply({
      content: "Puoi continuare oppure tornare indietro per correggere le risposte.",
      components: [row, pageRow],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  pendingApplications.delete(stateKey);
  return finalizeApplication(interaction, type, activeState, stateKey);
}

async function handleCandidatureApplicationInteraction(interaction) {
  if (interaction.isButton?.()) {
    if (String(interaction.customId || "").startsWith(`${APPLY_PEX_PREFIX}:`)) {
      const parsed = parseCandidatePexCustomId(interaction.customId);
      if (!parsed) return false;
      if (!hasHighStaffRole(interaction)) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Questo bottone è riservato all'High Staff.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const modal = new ModalBuilder()
        .setCustomId(`${APPLY_PEX_MODAL_PREFIX}:${parsed.type}:${parsed.userId}:${interaction.message.id}`)
        .setTitle("Motivo Pex Candidatura");
      const reasonInput = new TextInputBuilder()
        .setCustomId(APPLY_PEX_REASON_INPUT_ID)
        .setLabel("Motivo")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal).catch(() => null);
      return true;
    }

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
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Number(rawStep || 1);
      return handleStartButton(interaction, type, step, false);
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_BACK_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Math.max(1, Number(rawStep || 1));
      return handleStartButton(interaction, type, step, true);
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_PAGE_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<:vegax:1443934876440068179> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Math.max(1, Number(rawStep || 1));
      return handleStartButton(interaction, type, step, true);
    }
    return false;
  }

  if (!interaction.isModalSubmit?.()) return false;
  if (String(interaction.customId || "").startsWith(`${APPLY_PEX_MODAL_PREFIX}:`)) {
    const parsed = parseCandidatePexModalId(interaction.customId);
    if (!parsed) return false;
    if (!hasHighStaffRole(interaction)) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Questo modulo è riservato all'High Staff.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    const reason = String(
      interaction.fields.getTextInputValue(APPLY_PEX_REASON_INPUT_ID) || "",
    ).trim();
    if (!reason) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Devi inserire un motivo valido.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    const srcMessage = await interaction.channel?.messages
      ?.fetch(parsed.messageId)
      .catch(() => null);
    const status = await applyCandidatePex(
      interaction.guild,
      interaction.user,
      parsed.type,
      parsed.userId,
      reason,
      srcMessage,
    );
    await interaction.reply({
      content: status,
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  const raw = String(interaction.customId || "");
  if (!raw.startsWith(`${MODAL_PREFIX}:`)) return false;
  const modalParts = raw.split(":");
  if (modalParts.length < 3) return false;
  const [, type, step] = modalParts;
  return handleModalSubmit(interaction, type, step);
}

module.exports = {
  handleCandidatureApplicationInteraction,
};