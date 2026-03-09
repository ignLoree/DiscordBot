const path = require("path");
const { PassThrough } = require("stream");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const PImage = require("pureimage");
const IDs = require("../Config/ids");
const { getClientGuildCached, getGuildMemberCached, getGuildRoleCached } = require("./interactionEntityCache");
const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 3;
const CENTRAL_VERIFY_LOG_CHANNEL_ID = IDs.channels.verifyLogs || IDs.channels.modLogs || "1442569294796820541";
const VERIFY_PING_CHANNEL_IDS = [...new Set([IDs.channels?.news, IDs.channels?.candidatureStaff, IDs.channels?.candidature].filter(Boolean))];
const VERIFY_CAPTCHA = { width: 300, height: 100, fontSize: 40, fontColor: "#33d17a", codeLength: 6, charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", decoys: { trace: true, mixedUnderEach: true, spreadAround: true } };
const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const MAIN_VERIFIED_ROLE_ID = IDs.roles?.Member || null;
const verifyState = new Map();
const fontPath = path.join(__dirname, "..", "..", "UI", "Fonts", "Mojangles.ttf");
let captchaFontFamily = "captcha";

try {
  PImage.registerFont(fontPath, "captcha").loadSync();
} catch (err) {
  captchaFontFamily = "Arial";
  global.logger?.warn?.("[VERIFY] Failed to load captcha font, text may not render:", err);
}

function getVerifyStateKey(userId, guildId) {
  return `${String(guildId || "dm")}:${String(userId || "")}`;
}

function clearVerifyState(stateKey) {
  const safeKey = String(stateKey || "");
  const state = verifyState.get(safeKey);
  if (state?.timeoutId) clearTimeout(state.timeoutId);
  verifyState.delete(safeKey);
}

function isSponsorGuildVerify(guildId) {
  if (!guildId || guildId === MAIN_GUILD_ID) return false;
  return Boolean(IDs.verificatoRoleIds?.[guildId]);
}

async function getMainGuild(client) {
  if (!client) return null;
  return getClientGuildCached(client, MAIN_GUILD_ID);
}

async function isUserInMainGuild(client, userId) {
  if (!client || !userId) return false;
  const guild = await getMainGuild(client);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, userId);
  return Boolean(member);
}

async function isUserVerifiedInMainGuild(client, userId) {
  if (!client || !userId) return false;
  const guild = await getMainGuild(client);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, userId);
  if (!member?.roles?.cache) return false;
  if (!MAIN_VERIFIED_ROLE_ID) return Boolean(member);
  return member.roles.cache.has(MAIN_VERIFIED_ROLE_ID);
}

function makeExpiredEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Operazione non riuscita!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> La tua verifica è scaduta, devi premere Verifica di nuovo.",
    );
}

function makeWrongAnswerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Operazione non riuscita!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Risposta sbagliata, riprova prima che sia troppo tardi.",
    );
}

function makeTooManyAttemptsEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Operazione non riuscita!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Troppi tentativi errati. Premi **Verifica** per ricominciare.",
    );
}

function makeVerifyStartRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_start")
      .setLabel("Verifica")
      .setEmoji(`<:VC_Verify:1478859646587633717>`)
      .setStyle(ButtonStyle.Success),
  );
}

function makeVerifiedEmbed(serverName) {
  return new EmbedBuilder()
    .setColor("#57f287")
    .setTitle("<:success:1461731530333229226> **Sei stato verificato!**")
    .setDescription(
      `<:success:1461731530333229226> Hai superato la verifica con successo. Ora puoi accedere a \`${serverName}\``,
    );
}

function makeAlreadyVerifiedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:alarm:1461725841451909183> **Sei già verificato!**");
}

function makeOwnerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Operazione non riuscita!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Sei il proprietario, perché un owner dovrebbe provare a verificarsi?",
    );
}

function isUnknownInteraction(error) {
  return error?.code === 10062;
}

function sanitizeEmbedText(value) {
  return String(value || "")
    .replace(/[\\`*_~|>]/g, "\\$&")
    .replace(/\n/g, " ")
    .trim();
}

function randomChar(set) {
  const chars = set || VERIFY_CAPTCHA.charset;
  return chars[Math.floor(Math.random() * chars.length)];
}

function makeCode(len = VERIFY_CAPTCHA.codeLength) {
  const targetLen = Math.max(1, Number(len || VERIFY_CAPTCHA.codeLength));
  const code = [];
  while (code.length < targetLen) code.push(randomChar(VERIFY_CAPTCHA.charset));
  return code.join("");
}

async function makeCaptchaPng(code) {
  const width = VERIFY_CAPTCHA.width;
  const height = VERIFY_CAPTCHA.height;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");

  ctx.fillStyle = "#1d1f26";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(45,47,58,0.6)";
  for (let i = 0; i < 12; i += 1) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const w = Math.floor(12 + Math.random() * 40);
    const h = Math.floor(3 + Math.random() * 8);
    ctx.fillRect(x, y, w, h);
  }

  if (VERIFY_CAPTCHA.decoys.spreadAround) {
    ctx.fillStyle = "rgba(140,145,156,0.5)";
    ctx.font = `14pt ${captchaFontFamily}`;
    for (let i = 0; i < 16; i += 1) {
      const x = Math.floor(10 + Math.random() * (width - 20));
      const y = Math.floor(18 + Math.random() * (height - 20));
      const rot = (Math.random() * 50 - 25) * (Math.PI / 180);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillText(randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), 0, 0);
      ctx.restore();
    }
  }

  ctx.fillStyle = VERIFY_CAPTCHA.fontColor;
  ctx.font = `${VERIFY_CAPTCHA.fontSize}pt ${captchaFontFamily}`;

  const chars = code.split("");
  const points = [];
  const step = Math.floor((width - 40) / Math.max(chars.length, 1));
  chars.forEach((ch, i) => {
    const x = 20 + i * step + Math.floor(Math.random() * 4);
    const y = 68 + Math.floor(Math.random() * 6);
    const rot = (Math.random() * 12 - 6) * (Math.PI / 180);
    points.push({ x: x + 5, y: y - 14 });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    if (VERIFY_CAPTCHA.decoys.mixedUnderEach) {
      ctx.fillStyle = "rgba(180,190,210,0.6)";
      ctx.font = `14pt ${captchaFontFamily}`;
      ctx.fillText(
        randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"),
        x + 2,
        y + 18,
      );
      ctx.fillStyle = VERIFY_CAPTCHA.fontColor;
      ctx.font = `${VERIFY_CAPTCHA.fontSize}pt ${captchaFontFamily}`;
    }
  });

  if (VERIFY_CAPTCHA.decoys.trace) {
    ctx.strokeStyle = "rgba(46,204,113,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 80; i += 1) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    ctx.fillRect(x, y, 2, 2);
  }

  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  await PImage.encodePNGToStream(img, stream);
  return Buffer.concat(chunks);
}

async function resolveValidVerifyRoleIds(guild) {
  if (!guild) return [];
  const gid = guild.id;
  let roleIds = [];
  if (gid === MAIN_GUILD_ID) {
    roleIds = [
      IDs.roles.Member,
      IDs.roles.separatore6,
      IDs.roles.separatore8,
      IDs.roles.separatore5,
      IDs.roles.separatore7,
    ].filter(Boolean);
  } else {
    const sponsorRoleId = IDs.verificatoRoleIds?.[gid];
    roleIds = sponsorRoleId ? [sponsorRoleId] : [];
  }
  const valid = [];
  for (const roleId of roleIds) {
    const role = await getGuildRoleCached(guild, roleId);
    if (role?.id) valid.push(role.id);
  }
  return Array.from(new Set(valid));
}

function isAlreadyVerifiedInThisGuild(member, guildId) {
  if (!member?.roles?.cache) return false;
  if (guildId === MAIN_GUILD_ID) {
    const ids = [IDs.roles.Member].filter(Boolean);
    return ids.some((id) => member.roles.cache.has(id));
  }
  const sponsorRoleId = IDs.verificatoRoleIds?.[guildId];
  if (sponsorRoleId && member.roles.cache.has(sponsorRoleId)) return true;
  return false;
}

module.exports = { verifyState, VERIFY_CODE_TTL_MS, VERIFY_MAX_ATTEMPTS, CENTRAL_VERIFY_LOG_CHANNEL_ID, VERIFY_PING_CHANNEL_IDS, VERIFY_CAPTCHA, getVerifyStateKey, clearVerifyState, isSponsorGuildVerify, getMainGuild, isUserInMainGuild, isUserVerifiedInMainGuild, makeExpiredEmbed, makeWrongAnswerEmbed, makeTooManyAttemptsEmbed, makeVerifyStartRow, makeVerifiedEmbed, makeAlreadyVerifiedEmbed, makeOwnerEmbed, isUnknownInteraction, sanitizeEmbedText, makeCode, makeCaptchaPng, resolveValidVerifyRoleIds, isAlreadyVerifiedInThisGuild }; 