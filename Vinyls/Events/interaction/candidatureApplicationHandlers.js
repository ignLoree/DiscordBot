const fs = require("fs");
const path = require("path");
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { EPHEMERAL_TTL_PING_ONLY_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const { getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage } = require("../../Utils/Staff/staffDocUtils");
const BOT_ROOT = path.resolve(__dirname, "..", "..");
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
const APPLICATION_REACTIONS = ["<:thumbsup:1471292172145004768>", "<:thumbsdown:1471292163957457013>",];
const NOMODULI_ROLE_ID = IDs.roles.blacklistModuli;
const MEMBER_ROLE_ID = IDs.roles.Member;
const HELPER_ROLE_ID = IDs.roles.Helper;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HELPER_REAPPLY_BLOCK_ROLE_IDS = [IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.Coordinator, IDs.roles.Supervisor, IDs.roles.HighStaff, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.CoFounder, IDs.roles.Founder,].filter(Boolean);
const APPLICATION_COOLDOWN_PATH = path.join(BOT_ROOT, "Data", "applicationCooldowns.json",);
const APPLICATION_COUNTERS_PATH = path.join(BOT_ROOT, "Data", "applicationCounters.json",);
const APPLICATION_DRAFTS_PATH = path.join(BOT_ROOT, "Data", "applicationDrafts.json",);
const pendingApplications = new Map();
const cooldownByUser = new Map();
const draftByStateKey = new Map();
const candidatePexLocks = new Set();
const applicationCounters = { helper: 0, partnermanager: 0, };
const APPLICATIONS = { helper: { label: "Helper", questions: [{ id: "id_discord", text: "1. ID", modalLabel: "1. ID", placeholder: "Copia e incolla il tuo ID di Discord", style: TextInputStyle.Short, }, { id: "eta", text: "2. Età", modalLabel: "2. Età", placeholder: "Scrivi la tua età", style: TextInputStyle.Short, }, { id: "staff_server", text: "3. Nomina tutti i server dove sei stato staff, per quanto tempo e che ruolo avevi", modalLabel: "3. Esperienze staff", style: TextInputStyle.Paragraph, }, { id: "motivo_candidatura", text: "4. Come mai ti sei voluto candidare su Vinili & Caffè?", modalLabel: "4. Motivo candidatura", style: TextInputStyle.Paragraph, }, { id: "aiuto_economico", text: "5. Saresti disposto ad aiutare il server economicamente?", modalLabel: "5. Aiuto economico", placeholder: "Si / No", style: TextInputStyle.Paragraph, }, { id: "flame_testuale", text: "6. Se due utenti si flammano a vicenda su un determinato argomento, come ti comporti? (in testuale)", modalLabel: "6. Gestione flame", style: TextInputStyle.Paragraph, }, { id: "comandi_dyno", text: "7. Elenca i comandi di moderazioni più importanti di Dyno", modalLabel: "7. Comandi Dyno", style: TextInputStyle.Paragraph, }, { id: "critica_staff", text: "8. Se una persona critica il server o lo staff in maniera non idonea, come ti comporti?", modalLabel: "8. Gestione critica", style: TextInputStyle.Paragraph, }, { id: "vocale", text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?", modalLabel: "9. Disponibilità vocale", style: TextInputStyle.Paragraph, }, { id: "definizione_flame", text: "10. Definizione di flame", modalLabel: "10. Definizione flame", style: TextInputStyle.Paragraph, }, { id: "troll_pubblico", text: "11. Se due utenti iniziassero a trollare in pubblico, come agiresti?", modalLabel: "11. Gestione troll", style: TextInputStyle.Paragraph, },], }, partnermanager: { label: "Partner Manager", questions: [{ id: "id_discord", text: "1. ID", modalLabel: "1. ID", placeholder: "Scrivi il tuo ID di Discord", style: TextInputStyle.Short, }, { id: "luminous_nova", text: "2. Conosci il bot Luminous Nova/SkyForce?", modalLabel: "2. Luminous Nova/SkyForce", placeholder: "Si / No", style: TextInputStyle.Short, }, { id: "partner_giorno", text: "3. Quante partner fai al giorno?", modalLabel: "3. Partner al giorno", placeholder: "<15 / 15+", style: TextInputStyle.Short, },], }, };

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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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
  } catch (err) {
    global.logger?.warn?.("[candidature] load:", err?.message || err);
  }
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

if (!global.__vcCandidatureCleanupTimer) {
  global.__vcCandidatureCleanupTimer = setInterval(pruneOldStates, 5 * 60 * 1000);
  if (typeof global.__vcCandidatureCleanupTimer.unref === "function") {
    global.__vcCandidatureCleanupTimer.unref();
  }
}

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
  const roles = roleIds.map((id) => cache.get(id)).filter(Boolean).sort((a, b) => Number(b.position || 0) - Number(a.position || 0));
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
  const highStaffRoleId = IDs?.roles?.HighStaff ? String(IDs.roles.HighStaff) : null;
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
      "<a:VC_Alert:1448670089670037675> Le candidature sono disponibili solo agli utenti con ruolo Member.",
    );
}

function buildAlreadyRoleEmbed(roleId) {
  const roleText = roleId ? `<@&${roleId}>` : "questo ruolo";
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Accesso negato")
    .setDescription(
      `<:VC_Info:1460670816214585481> Sei già ${roleText}, perché dovresti ricandidarti?`,
    );
}

function buildNoModuliDeniedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Accesso negato")
    .setDescription(
      "<a:VC_Alert:1448670089670037675> Sei blacklistato dalle candidature.",
      "",
      "<:VC_Ticket:1448694637106692156> Se pensi sia un errore apri un ticket.",
    );
}

function buildCooldownDeniedEmbed(untilTs) {
  const unix = Math.floor(Number(untilTs) / 1000);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> Candidatura non disponibile")
    .setDescription(
      [
        "<:VC_Clock:1473359204189474886> Hai già inviato una candidatura recentemente.",
        "",
        `<:VC_update:1478721333096349817> Potrai inviarne una nuova dopo: <t:${unix}:F> (<t:${unix}:R>).`,
        "<a:VC_Timer:1462779065625739344> Devi attendere 7 giorni prima di riprovare.",
      ].join("\n"),
    );
}

function buildIntroEmbed(type) {
  if (type === "partnermanager") {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:partnermanager:1443651916838998099> Candidatura Partner Manager")
      .setDescription(
        "<:VC_Poll:1448695754972729436> Compilando questo modulo potrai candidarti come Partner Manager del server.",
        "<a:VC_Timer:1462779065625739344> In caso verrete accettati farete una prova di 1/2 settimane",
        "<:VC_Ticket:1448694637106692156> Se hai dei dubbi apri un ticket terza categoria.",
        "",
        "<a:VC_Alert:1448670089670037675> **__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",);
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:helper:1443651909448630312> Candidatura Helper")
    .setDescription(
      "<:VC_Poll:1448695754972729436> Compilando questo modulo potrai candidarti come Helper del server.",
      "<a:VC_Timer:1462779065625739344> In caso verrete accettati farete una prova di 1/2 settimane",
      "<:VC_Ticket:1448694637106692156> Se hai dei dubbi apri un ticket terza categoria.",
      "",
      "<a:VC_Alert:1448670089670037675> **__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",
    );
}

function buildFinalThanksEmbed(untilTs) {
  const unix = Math.floor(Number(untilTs) / 1000);
  return new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle("<:vegacheckmark:1443666279058772028> Candidatura inviata")
    .setDescription(
      [
        "<a:VC_ThankYou:1330186319673950401> Grazie per esserti candidato.",
        "",
        `<:VC_update:1478721333096349817> Non potrai inviare una nuova candidatura prima di: <t:${unix}:F> (<t:${unix}:R>).`,
        "",
        "<a:VC_Alert:1448670089670037675> Non aprire ticket e non pingare lo staff per chiedere l'esito, altrimenti la candidatura verrà automaticamente scartata.",
      ].join("\n"),
    );
}

function buildCandidatePexRow(type, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLY_PEX_PREFIX}:${type}:${userId}`)
      .setEmoji("<:success:1461731530333229226>")
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
    const highestRoleId = getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) || HELPER_ROLE_ID;
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

  const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}:${type}:${step}`)
    .setTitle(`${cfg.label}- Modulo ${step}/${chunks.length}`);

  const rows = selected.map((q) => {
    const maxLen = q.style === TextInputStyle.Short ? 120 : 1000; const input = new TextInputBuilder().setCustomId(q.id).setLabel(String(q.modalLabel || q.text || "Domanda").replace(/\s+/g, " ").trim().slice(0, 45)).setStyle(q.style || TextInputStyle.Paragraph).setRequired(true).setPlaceholder(`${String(q.text || q.modalLabel || "Domanda").replace(/\s+/g, " ").trim()}|${String(q.placeholder || "Rispondi qui").replace(/\s+/g, " ").trim()}`
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
    const answer = String(answers?.[q.id] || "Nessuna risposta").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim() || "Nessuna risposta";
    const question = String(q.text || "").replace(/^(\d+)\./, "$1\\.").trim();
    blocks.push(`**${question}**\n${answer}`);
  }
  return blocks.join("\n\n").trim();
}

async function resolveSubmissionChannel(interaction) {
  const guild = interaction.guild;
  if (!guild) return null;
  const targetId = IDs.channels?.visioneModuli;
  if (targetId) {
    return guild.channels.cache.get(targetId) || (await getGuildChannelCached(guild, targetId));
  }
  return guild.channels.cache.find((c) => String(c?.name || "") === "visioneModuli") || null;
}

async function sendIntro(interaction, type) {
  const userId = String(interaction.user?.id || "");
  const embed = buildIntroEmbed(type);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${userId}`)
    .setLabel("Inizia")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("<:success:1461731530333229226>")
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
      const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${draft.nextStep}`)
        .setLabel(`Riprendi dalla pagina ${draft.nextStep}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Refresh:1473359252276904203>"),
      );
      const row2 = buildPagePickerRow(type, interaction.user.id, totalSteps, draft.nextStep);
      await interaction.reply({
        content:
          "<:VC_update:1478721333096349817> Hai una candidatura in bozza. Puoi riprendere dall'ultima pagina o aprire una pagina specifica per correggere.",
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
            "<a:VC_Alert:1448670089670037675> Sessione candidatura scaduta. Clicca di nuovo il bottone candidatura.",
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
        "<a:VC_Alert:1448670089670037675> Non trovo il canale `visioneModuli` per inviare la candidatura.",
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  const user = interaction.user;
  const applicationNumber = nextApplicationNumber(type);
  const embed = new EmbedBuilder()
    .setColor("#3498DB")
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setTitle(`<:VC_Poll:1448695754972729436> CANDIDATURA ${cfg.label.toUpperCase()} (#${applicationNumber})`)
    .setDescription(formatApplicationDescription(type, state.answers))
    .setFooter({
      text: `User ID: ${user.id}\u2022${new Date().toLocaleString("it-IT")}`,
    })
    .setTimestamp();

  const highStaffRoleId = IDs.roles.HighStaff;
  const mention = highStaffRoleId ? `<@&${highStaffRoleId}>` : null;
  const sent = await channel.send({ content: mention || undefined, embeds: [embed], components: [buildCandidatePexRow(type, user.id)], }).catch(() => null);
  if (!sent) {
    await interaction.reply({
      content:
        "<a:VC_Alert:1448670089670037675> Non sono riuscito a inviare la candidatura. Riprova più tardi.",
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  if (typeof sent.startThread === "function") {
    const threadUserLabel = String(user.globalName || user.username || user.id).replace(/[\r\n#:@<>`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || user.id;
    const thread = await sent.startThread({
      name: `Candidatura ${threadUserLabel}`,
      autoArchiveDuration: 1440,
      reason: `Thread candidatura ${cfg.label}per ${user.tag}`,
    })
      .catch(() => null);
    if (thread?.isTextBased?.() && highStaffRoleId) {
      const pingMsg = await thread.send({ content: `<@&${highStaffRoleId}>` }).catch(() => null);
      if (pingMsg) scheduleMessageDeletion(pingMsg, EPHEMERAL_TTL_PING_ONLY_MS);
    }
  }

  for (const emoji of APPLICATION_REACTIONS) {
    await sent.react(emoji).catch(() => { });
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

async function sendPartnerManagerWelcome(pmChannel, user) {
  if (!pmChannel?.isTextBased?.()) return;
  await pmChannel.send({
    content: `${user}
# Benvenutx nei Partner Manager <:partnermanager:1443651916838998099>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_Reply:1468262952934314131> <#1442569199229730836>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
}

async function sendHelperWelcome(staffChannel, user) {
  if (!staffChannel?.isTextBased?.()) return;
  await staffChannel.send({
    content: `${user}
# Benvenutx nello staff <:staff:1443651912179388548>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_DoubleReply:1468713981152727120> <#1442569237142044773>
<:VC_DoubleReply:1468713981152727120> <#1442569239063167139>
<:VC_Reply:1468262952934314131> <#1442569243626307634>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
}

async function applyCandidatePex(guild, actor, type, userId, reason, sourceMessage) {
  const targetRoleId = type === "partnermanager" ? PARTNER_MANAGER_ROLE_ID : HELPER_ROLE_ID;
  if (!targetRoleId) return "Ruolo target non configurato.";

  const member = guild.members.cache.get(String(userId)) || (await getGuildMemberCached(guild, String(userId)));
  if (!member) return "Utente non trovato nel server.";
  if (member.roles.cache.has(String(targetRoleId))) return "Utente già pexato su quel ruolo.";

  const roleApplied = await member.roles
    .add(String(targetRoleId))
    .then(() => true)
    .catch(() => false);
  if (!roleApplied) {
    const refreshedMember = await getGuildMemberCached(guild, String(userId), {
      preferFresh: true,
    }).catch(() => null);
    if (!refreshedMember?.roles?.cache?.has(String(targetRoleId))) {
      return "Impossibile assegnare il ruolo target.";
    }
  }
  if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
    const staffRoleApplied = await member.roles
      .add(String(IDs.roles.Staff))
      .then(() => true)
      .catch(() => false);
    if (!staffRoleApplied) {
      const refreshedMember = await getGuildMemberCached(guild, String(userId), {
        preferFresh: true,
      }).catch(() => null);
      if (!refreshedMember?.roles?.cache?.has(String(IDs.roles.Staff))) {
        return "Ruolo Helper assegnato, ma non sono riuscito ad aggiungere il ruolo Staff.";
      }
    }
    const staffChat = guild.channels.cache.get(IDs.channels.staffChat) || (await getGuildChannelCached(guild, IDs.channels.staffChat));
    await sendHelperWelcome(staffChat, member.user);
  }
  if (String(targetRoleId) === String(PARTNER_MANAGER_ROLE_ID)) {
    const pmChannel = guild.channels.cache.get(IDs.channels.partnersChat) || (await getGuildChannelCached(guild, IDs.channels.partnersChat));
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

  const pexDepexChannel = guild.channels.cache.get(IDs.channels.pexDepex) || (await getGuildChannelCached(guild, IDs.channels.pexDepex));
  if (pexDepexChannel?.isTextBased?.()) {
    const oldRole = guild.roles.cache.get(roleBeforeId);
    const newRole = guild.roles.cache.get(String(targetRoleId));
    await pexDepexChannel.send({
      content: `**<:success:1461731530333229226> PEX** <@${member.id}>
<:staff:1443651912179388548> \`${oldRole?.name || roleBeforeId || "N/A"}\` <a:VC_Arrow:1448672967721615452> \`${newRole?.name || targetRoleId}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    }).catch(() => null);
  }

  if (sourceMessage) {
    await sourceMessage.edit({ components: [] }).catch(() => null);
    await deleteThreadForMessage(guild, sourceMessage);
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
    const highestRoleId = getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) || HELPER_ROLE_ID;
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
          "<:VC_Refresh:1473359252276904203> Sessione candidatura non valida. Clicca di nuovo il bottone candidatura.",
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
    const controls = [new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${nextStep}`)
      .setLabel(`Continua (${nextStep}/${chunks.length})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:VC_Refresh:1473359252276904203>")
    ];
    if (step >= 1) {
      controls.push(
        new ButtonBuilder()
          .setCustomId(`${APPLY_BACK_PREFIX}:${type}:${interaction.user.id}:${step}`)
          .setLabel(`Indietro (${step}/${chunks.length})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("<a:vegaleftarrow:1462914743416131816>")
      );
    }
    const row = new ActionRowBuilder().addComponents(...controls);
    const pageRow = buildPagePickerRow(type, interaction.user.id, chunks.length, nextStep);
    await interaction.reply({
      content: "<:VC_PinkQuestionMark:1471892611026391306> Puoi continuare oppure tornare indietro per correggere le risposte.",
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
          content: "<a:VC_Alert:1448670089670037675> Questo bottone è riservato all'High Staff.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const modal = new ModalBuilder().setCustomId(`${APPLY_PEX_MODAL_PREFIX}:${parsed.type}:${parsed.userId}:${interaction.message.id}`)
        .setTitle("Motivo Pex Candidatura");
      const reasonInput = new TextInputBuilder().setCustomId(APPLY_PEX_REASON_INPUT_ID).setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(500);
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
            "<a:VC_Alert:1448670089670037675> Questo modulo non è associato al tuo click iniziale.",
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
            "<a:VC_Alert:1448670089670037675> Questo modulo non è associato al tuo click iniziale.",
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
            "<a:VC_Alert:1448670089670037675> Questo modulo non è associato al tuo click iniziale.",
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
        content: "<a:VC_Alert:1448670089670037675> Questo modulo è riservato all'High Staff.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    const pexLockKey = `${String(interaction.guildId || "dm")}:${String(parsed.messageId)}`;
    if (candidatePexLocks.has(pexLockKey)) {
      await interaction.reply({
        content:
          "<a:VC_Alert:1448670089670037675> Questa candidatura è già in elaborazione.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    candidatePexLocks.add(pexLockKey);
    try {
      const reason = String(interaction.fields.getTextInputValue(APPLY_PEX_REASON_INPUT_ID) || "",).trim();
      if (!reason) {
        await interaction.reply({
          content: "<a:VC_Alert:1448670089670037675> Devi inserire un motivo valido.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const srcMessage = await interaction.channel?.messages?.fetch(parsed.messageId).catch(() => null);
      const status = await applyCandidatePex(interaction.guild, interaction.user, parsed.type, parsed.userId, reason, srcMessage,);
      await interaction.reply({
        content: status,
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    } finally {
      candidatePexLocks.delete(pexLockKey);
    }
  }

  const raw = String(interaction.customId || "");
  if (!raw.startsWith(`${MODAL_PREFIX}:`)) return false;
  const modalParts = raw.split(":");
  if (modalParts.length < 3) return false;
  const [, type, step] = modalParts;
  return handleModalSubmit(interaction, type, step);
}

module.exports = { handleCandidatureApplicationInteraction };