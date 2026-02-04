const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { DEFAULT_EMBED_COLOR, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { registerCanvasFonts, fontStack } = require("../../Utils/Render/canvasFonts");

let canvasModule = null;
try {
  canvasModule = require("canvas");
} catch {
  canvasModule = null;
}

const PERIODS = {
  weekly: "7day",
  w: "7day",
  monthly: "1month",
  m: "1month",
  quarterly: "3month",
  q: "3month",
  half: "6month",
  h: "6month",
  yearly: "12month",
  y: "12month",
  alltime: "overall",
  a: "overall",
  overall: "overall"
};

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function parseOptions(args) {
  let period = "overall";
  let lfmUsername = null;
  let idToken = null;
  const filtered = [];
  let periodLabel = null;
  for (const raw of args) {
    const token = raw.toLowerCase();
    if (PERIODS[token]) {
      period = PERIODS[token];
      continue;
    }
    if (token.startsWith("lfm:")) {
      lfmUsername = raw.slice(4).trim();
      continue;
    }
    if (/^\d{17,20}$/.test(token)) {
      idToken = token;
      continue;
    }
    if (/^\d{4}$/.test(token)) {
      period = "12month";
      periodLabel = token;
      continue;
    }
    if (MONTHS[token] !== undefined) {
      period = "1month";
      periodLabel = raw;
      continue;
    }
    filtered.push(raw);
  }
  return { period, periodLabel, lfmUsername, idToken, args: filtered };
}

function buildIcebergLayout(artists) {
  const limited = artists.slice(0, 33);
  const firstThirty = limited.slice(0, 30);
  const lastThree = limited.slice(30);
  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    const slice = firstThirty.slice(i * 5, (i + 1) * 5);
    if (slice.length === 5) {
      rows.push([slice[0], slice[1], slice[2], slice[3], slice[4]]);
    } else {
      rows.push(slice);
    }
  }
  if (lastThree[0]) rows.push([lastThree[0]]);
  if (lastThree[1] || lastThree[2]) rows.push([lastThree[1], lastThree[2]].filter(Boolean));
  return rows;
}

function formatPeriodLabel(period, customLabel) {
  if (customLabel) return customLabel;
  if (period === "overall") return "Overall";
  if (period === "7day") return "Weekly";
  if (period === "1month") return "Monthly";
  if (period === "3month") return "Quarterly";
  if (period === "6month") return "Half";
  if (period === "12month") return "Yearly";
  return "Overall";
}

async function renderIcebergImage(title, periodLabel, rows) {
  if (!canvasModule) return null;
  const { createCanvas, loadImage } = canvasModule;
  registerCanvasFonts(canvasModule);
  const templatePath = path.resolve(__dirname, "../../UI/iceberg-template.png");
  if (!fs.existsSync(templatePath)) return null;
  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0, template.width, template.height);
  const width = template.width;
  const height = template.height;

  function drawOutlined(text, x, y, size, fill, stroke) {
    if (!text) return;
    ctx.font = fontStack(size, "bold");
    ctx.lineWidth = Math.max(2, Math.floor(size * 0.12));
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  function drawHeader(text, x, y, size) {
    if (!text) return;
    ctx.font = fontStack(size, "bold");
    ctx.fillStyle = "#0b0b0b";
    ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
    ctx.shadowBlur = Math.max(1, Math.floor(size * 0.06));
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  function fitFontSize(text, base, minSize) {
    const safe = String(text || "");
    if (safe.length <= 14) return base;
    if (safe.length <= 18) return Math.max(minSize, base - 4);
    if (safe.length <= 22) return Math.max(minSize, base - 7);
    return Math.max(minSize, base - 10);
  }

  ctx.textAlign = "center";
  drawHeader(title, width * 0.34, height * 0.105, 62);
  drawHeader("iceberg", width * 0.56, height * 0.14, 48);
  drawHeader(periodLabel, width * 0.80, height * 0.19, 42);

  ctx.textAlign = "center";
  const rowY = [0.305, 0.39, 0.475, 0.56, 0.645, 0.735, 0.82, 0.90];
  rows.forEach((row, index) => {
    const y = height * rowY[index];
    const baseSize = index < 2 ? 44 : 40;
    const fontSize = Math.max(34, baseSize);
    const lineHeight = Math.round(fontSize * 1.3);
    const isAboveWater = index < 3;
    const fill = isAboveWater ? "#0b0b0b" : "#ffffff";
    const stroke = isAboveWater ? null : "#0b1d2a";
    if (row.length === 5) {
      const upper = y - lineHeight * 0.6;
      const lower = y + lineHeight * 0.6;
      const leftX = width * 0.20;
      const rightX = width * 0.80;
      const centerX = width * 0.50;
      const a = row[1]?.name;
      const b = row[3]?.name;
      const c = row[0]?.name;
      const d = row[2]?.name;
      const e = row[4]?.name;
      const aSize = fitFontSize(a, fontSize, 30);
      const bSize = fitFontSize(b, fontSize, 30);
      const cSize = fitFontSize(c, fontSize, 30);
      const dSize = fitFontSize(d, fontSize, 30);
      const eSize = fitFontSize(e, fontSize, 30);
      if (stroke) {
        drawOutlined(a, leftX, upper, aSize, fill, stroke);
        drawOutlined(b, leftX, lower, bSize, fill, stroke);
        drawOutlined(c, centerX, y, cSize, fill, stroke);
        drawOutlined(d, rightX, upper, dSize, fill, stroke);
        drawOutlined(e, rightX, lower, eSize, fill, stroke);
      } else {
        drawHeader(a, leftX, upper, aSize);
        drawHeader(b, leftX, lower, bSize);
        drawHeader(c, centerX, y, cSize);
        drawHeader(d, rightX, upper, dSize);
        drawHeader(e, rightX, lower, eSize);
      }
      return;
    }
    if (row.length === 1) {
      const name = row[0]?.name;
      const size = fitFontSize(name, fontSize, 32);
      if (stroke) {
        drawOutlined(name, width * 0.50, y, size, fill, stroke);
      } else {
        drawHeader(name, width * 0.50, y, size);
      }
      return;
    }
    if (row.length === 2) {
      const left = row[0]?.name;
      const right = row[1]?.name;
      const leftSize = fitFontSize(left, fontSize, 32);
      const rightSize = fitFontSize(right, fontSize, 32);
      if (stroke) {
        drawOutlined(left, width * 0.24, y, leftSize, fill, stroke);
        drawOutlined(right, width * 0.76, y, rightSize, fill, stroke);
      } else {
        drawHeader(left, width * 0.24, y, leftSize);
        drawHeader(right, width * 0.76, y, rightSize);
      }
    }
  });
  return canvas.toBuffer("image/png");
}

module.exports = {
  skipPrefix: false,
  name: "iceberg",
  aliases: ["ice", "icebergify", "berg"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!canvasModule) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Il modulo canvas non è installato. Installa 'canvas' per usare .iceberg.")
        ]
      });
    }

    const options = parseOptions(args);
    const { target, lastfm } = extractTargetUserWithLastfm(message, options.args);

    let targetUser = target || message.author;
    if (options.idToken && message.guild) {
      targetUser = message.guild.members.cache.get(options.idToken)?.user || targetUser;
    }

    const targetDoc = await getLastFmUserForMessageOrUsername(message, targetUser, options.lfmUsername || lastfm);
    if (!targetDoc) return;

    if (message.guild?.members?.cache?.size < message.guild?.memberCount) {
      try {
        await message.guild.members.fetch();
      } catch {
      }
    }

    try {
      const data = await lastFmRequest("user.gettopartists", {
        user: targetDoc.lastFmUsername,
        period: options.period,
        limit: 200
      });
      const artists = data?.topartists?.artist || [];
      if (!artists.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessun artista trovato per questo periodo.")
          ]
        });
      }

      const rows = buildIcebergLayout(artists.map(artist => ({ name: artist.name })));
      const displayName = options.lfmUsername
        ? options.lfmUsername
        : (message.guild?.members.cache.get(targetUser.id)?.displayName || targetUser.username);
      const title = `${displayName}'s iceberg`;
      const periodLabel = formatPeriodLabel(options.period, options.periodLabel);
      const imageBuffer = await renderIcebergImage(title, periodLabel, rows);
      if (!imageBuffer) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Errore durante la generazione dell'iceberg. Template mancante.")
          ]
        });
      }

      const attachment = new AttachmentBuilder(imageBuffer, { name: "iceberg.png" });
      return safeChannelSend(message.channel, { files: [attachment] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};


