const canvasModule = require("canvas");
const { createCanvas, loadImage } = canvasModule;
const {
  registerCanvasFonts,
  drawTextWithSpecialFallback,
  fontStack,
} = require("./canvasFonts");
const emojiImageCache = new Map();
const CUSTOM_EMOJI_START_RE = /^<(a)?:([a-zA-Z0-9_~]+):(\d{16,22})>/;
const ROME_TIME_ZONE = "Europe/Rome";

function roundRectPath(ctx, x, y, w, h, r = 16) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, color, width = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function formatHours(seconds) {
  return (Number(seconds || 0) / 3600).toFixed(2);
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

function textWidth(ctx, text, size = 16, weight = "600") {
  ctx.save();
  ctx.font = fontStack(size, weight);
  const width = ctx.measureText(String(text || "")).width;
  ctx.restore();
  return width;
}

function fitText(ctx, text, maxWidth, size = 16, weight = "600") {
  const value = String(text || "").trim();
  if (!value) return "-";
  if (textWidth(ctx, value, size, weight) <= maxWidth) return value;
  const ellipsis = "...";
  let out = value;
  while (
    out.length > 1 &&
    textWidth(ctx, `${out}${ellipsis}`, size, weight) > maxWidth
  ) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function prepareVisibleText(value) {
  const raw = String(value || "");
  const protectedMap = new Map([
    ["\u00B9", "__VC_KEEP_SUP_1__"],
    ["\u00B2", "__VC_KEEP_SUP_2__"],
    ["\u00B3", "__VC_KEEP_SUP_3__"],
  ]);
  const compatibilityMap = new Map([
    // Hard fallback for hosts where U+0F04 (༄) is not rendered by canvas/font stack
    ["\u0F04", "\u2736"],
    ["\uFE32", "\u2502"],
    ["\u1CBC", "\u00B7"],
  ]);

  let out = raw;
  for (const [char, token] of protectedMap.entries()) {
    out = out.split(char).join(token);
  }
  for (const [char, replacement] of compatibilityMap.entries()) {
    out = out.split(char).join(replacement);
  }

  out = out
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFD/g, "")
    .normalize("NFC")
    .trim();

  // Fallback for hosts/font stacks that cannot render Mathematical Alphanumeric Symbols
  // (e.g. styled nicknames like "𝕯𝖎𝖚𝖓𝕶"): convert only those codepoints to readable ASCII.
  out = out.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => ch.normalize("NFKC"));

  for (const [char, token] of protectedMap.entries()) {
    out = out.split(token).join(char);
  }

  return out || "-";
}

function drawLabel(
  ctx,
  text,
  x,
  y,
  {
    size = 16,
    weight = "600",
    color = "#d7dbe3",
    align = "left",
    baseline = "middle",
  } = {},
) {
  drawTextWithSpecialFallback(ctx, prepareVisibleText(text), x, y, {
    size,
    weight,
    color,
    align,
    baseline,
    normalizeCompatibility: false,
  });
}

function isEmojiCodePoint(cp) {
  if (!Number.isFinite(cp)) return false;
  if (cp >= 0x1f000 && cp <= 0x1faff) return true;
  if (cp >= 0x2600 && cp <= 0x27bf) return true;
  if (cp >= 0x2300 && cp <= 0x23ff) return true;
  if (cp >= 0x2b00 && cp <= 0x2bff) return true;
  if (
    cp === 0x00a9 ||
    cp === 0x00ae ||
    cp === 0x2122 ||
    cp === 0x3030 ||
    cp === 0x303d
  )
    return true;
  return false;
}

function tokenizeEmojiText(text) {
  const chars = Array.from(prepareVisibleText(text));
  const tokens = [];
  let buffer = "";
  let emoji = "";

  const flushText = () => {
    if (!buffer) return;
    tokens.push({ type: "text", value: buffer });
    buffer = "";
  };
  const flushEmoji = () => {
    if (!emoji) return;
    tokens.push({ type: "emoji", value: emoji });
    emoji = "";
  };

  for (let i = 0; i < chars.length; i += 1) {
    const rest = chars.slice(i).join("");
    const customMatch = rest.match(CUSTOM_EMOJI_START_RE);
    if (customMatch) {
      flushEmoji();
      flushText();
      tokens.push({
        type: "custom_emoji",
        id: customMatch[3],
        animated: customMatch[1] === "a",
        raw: customMatch[0],
      });
      i += customMatch[0].length - 1;
      continue;
    }

    const ch = chars[i];
    const cp = ch.codePointAt(0);
    const next = chars[i + 1];
    const nextCp = next ? next.codePointAt(0) : null;
    const isJoiner = cp === 0x200d;
    const isVariation = cp === 0xfe0f;
    const isEmoji = isEmojiCodePoint(cp);

    if (isEmoji || (emoji && (isJoiner || isVariation))) {
      flushText();
      emoji += ch;
      const nextIsEmoji = isEmojiCodePoint(nextCp);
      const nextIsJoiner = nextCp === 0x200d;
      const nextIsVariation = nextCp === 0xfe0f;

      if (isJoiner || nextIsJoiner || nextIsVariation) {
        continue;
      }
      if (isEmoji && nextIsEmoji) {
        flushEmoji();
        continue;
      }
      flushEmoji();
      continue;
    }

    flushEmoji();
    buffer += ch;
  }

  flushEmoji();
  flushText();
  return tokens.length ? tokens : [{ type: "text", value: "" }];
}

function emojiToTwemojiUrl(emoji) {
  const codepoints = Array.from(emoji)
    .map((ch) => ch.codePointAt(0).toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("-");
  return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codepoints}.png`;
}

function customEmojiUrl(id, animated = false) {
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=96&quality=lossless`;
}

async function getEmojiImage(token) {
  const key =
    typeof token === "string"
      ? token
      : `custom:${token.id}:${token.animated ? 1 : 0}`;
  if (emojiImageCache.has(key)) return emojiImageCache.get(key);
  const sourceUrl =
    typeof token === "string"
      ? emojiToTwemojiUrl(token)
      : customEmojiUrl(token.id, false);
  const promise = loadImage(sourceUrl).catch(() => null);
  emojiImageCache.set(key, promise);
  return promise;
}

function tokenWidth(ctx, token, size, weight) {
  if (token.type === "emoji" || token.type === "custom_emoji") return size + 2;
  return textWidth(ctx, token.value, size, weight);
}

async function drawLabelWithEmoji(
  ctx,
  text,
  x,
  y,
  {
    size = 16,
    weight = "600",
    color = "#d7dbe3",
    align = "left",
    baseline = "middle",
  } = {},
) {
  const tokens = tokenizeEmojiText(text);
  const hasEmoji = tokens.some(
    (t) => t.type === "emoji" || t.type === "custom_emoji",
  );
  if (!hasEmoji) {
    drawLabel(ctx, text, x, y, { size, weight, color, align, baseline });
    return;
  }

  const total = tokens.reduce(
    (sum, token) => sum + tokenWidth(ctx, token, size, weight),
    0,
  );
  let cursorX = x;
  if (align === "center") cursorX = x - total / 2;
  else if (align === "right") cursorX = x - total;

  for (const token of tokens) {
    if (token.type === "text") {
      if (token.value) {
        drawLabel(ctx, token.value, cursorX, y, {
          size,
          weight,
          color,
          align: "left",
          baseline,
        });
        cursorX += textWidth(ctx, token.value, size, weight);
      }
      continue;
    }

    const img =
      token.type === "custom_emoji"
        ? await getEmojiImage(token)
        : await getEmojiImage(token.value);
    if (img) {
      const drawSize = size + 1;
      const topY = y - drawSize / 2;
      ctx.drawImage(img, cursorX, topY, drawSize, drawSize);
      cursorX += drawSize + 1;
    } else {
      drawLabel(ctx, token.value, cursorX, y, {
        size,
        weight,
        color,
        align: "left",
        baseline,
      });
      cursorX += textWidth(ctx, token.value, size, weight);
    }
  }
}

function drawBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111722");
  bg.addColorStop(0.55, "#171f2b");
  bg.addColorStop(1, "#121924");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(180, 80, 10, 180, 80, 260);
  glowA.addColorStop(0, "rgba(88, 136, 255, 0.28)");
  glowA.addColorStop(1, "rgba(88, 136, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(
    width - 110,
    height - 120,
    20,
    width - 110,
    height - 120,
    300,
  );
  glowB.addColorStop(0, "rgba(62, 196, 85, 0.16)");
  glowB.addColorStop(1, "rgba(62, 196, 85, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);
}

async function drawAvatarCircle(ctx, avatarUrl, x, y, size) {
  if (!avatarUrl) return;
  const image = await loadImage(avatarUrl).catch(() => null);
  if (!image) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.stroke();
}

function drawDateBadge(ctx, title, value, x, y, w = 280, h = 80) {
  fillRoundRect(ctx, x, y, w, h, 14, "rgba(43, 52, 67, 0.92)");
  fillRoundRect(ctx, x + 10, y + 10, w - 20, 24, 9, "rgba(88, 99, 120, 0.62)");
  drawLabel(ctx, title, x + 18, y + 22, {
    size: 15,
    weight: "700",
    color: "#e0e5ee",
  });
  drawLabel(ctx, fitText(ctx, value, w - 32, 21, "700"), x + 18, y + 55, {
    size: 21,
    weight: "700",
    color: "#f2f5fa",
  });
}

function drawMetricPanel(ctx, title, rows, x, y, w, h) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 16, y + 24, {
    size: 27,
    weight: "700",
    color: "#e2e7ef",
  });

  const rowHeight = 56;
  const startY = y + 44;
  for (let i = 0; i < rows.length; i += 1) {
    const rowY = startY + i * rowHeight;
    fillRoundRect(ctx, x + 14, rowY, w - 28, 50, 11, "rgba(19, 26, 37, 0.92)");
    fillRoundRect(ctx, x + 14, rowY, 98, 50, 11, "rgba(10, 16, 27, 0.95)");

    drawLabel(ctx, rows[i].label, x + 63, rowY + 25, {
      size: 24,
      weight: "700",
      align: "center",
      color: "#dbe1eb",
    });
    drawLabel(
      ctx,
      fitText(ctx, rows[i].value, w - 170, 24, "700"),
      x + w - 26,
      rowY + 25,
      { size: 24, weight: "700", align: "right", color: "#d2d9e5" },
    );
  }
}

async function drawTopCard(
  ctx,
  title,
  first,
  second,
  x,
  y,
  w,
  h,
  options = {},
) {
  const showRank = options.showRank !== false;
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 24, {
    size: 27,
    weight: "700",
    color: "#e2e7ef",
  });

  await drawTopChip(
    ctx,
    first?.label || "-",
    first?.value || "-",
    first?.unit || "",
    1,
    x + 14,
    y + 44,
    w - 28,
    72,
    { showRank },
  );
  await drawTopChip(
    ctx,
    second?.label || "-",
    second?.value || "-",
    second?.unit || "",
    2,
    x + 14,
    y + 126,
    w - 28,
    72,
    { showRank },
  );
}

async function drawTopChip(
  ctx,
  label,
  value,
  unit,
  position,
  x,
  y,
  w,
  h,
  options = {},
) {
  const showRank = options.showRank !== false;
  fillRoundRect(ctx, x, y, w, h, 12, "rgba(12, 18, 28, 0.95)");
  const safeLabel = prepareVisibleText(label);
  const labelMax = showRank ? w - 360 : w - 260;
  const valueRight = showRank ? x + w - 112 : x + w - 14;
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, safeLabel, labelMax, 24, "700"),
    x + 14,
    y + h / 2,
    { size: 24, weight: "700", color: "#e0e5ed", align: "left" },
  );
  drawLabel(ctx, `${value}${unit ? ` ${unit}` : ""}`, valueRight, y + h / 2, {
    size: 30,
    weight: "800",
    align: "right",
    color: "#d5dbe5",
  });
  if (showRank) {
    drawLabel(ctx, `#${Number(position || 0) || "-"}`, x + w - 14, y + h / 2, {
      size: 54,
      weight: "900",
      align: "right",
      color: "#e8edf7",
    });
  }
}

function drawChart(ctx, chart, x, y, w, h) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);

  drawLabel(ctx, "Charts", x + 16, y + 24, {
    size: 27,
    weight: "700",
    color: "#e2e7ef",
  });
  drawLabel(ctx, "Message", x + w - 220, y + 24, {
    size: 20,
    weight: "700",
    color: "#3ec455",
  });
  drawLabel(ctx, "Voice", x + w - 90, y + 24, {
    size: 20,
    weight: "700",
    color: "#d95095",
  });

  const px = x + 16;
  const py = y + 44;
  const pw = w - 32;
  const ph = h - 60;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");

  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;

  const msgValues = points.map((p) => Number(p?.text || 0));
  const voiceValues = points.map((p) => Number(p?.voiceSeconds || 0) / 3600);
  const maxMsg = Math.max(1, ...msgValues);
  const maxVoice = Math.max(1, ...voiceValues);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(px + 8, yy);
    ctx.lineTo(px + pw - 8, yy);
    ctx.stroke();
  }

  const projectX = (idx) => px + idx * (pw / (points.length - 1));
  const projectY = (value, seriesMax) =>
    py + ph - (value / Math.max(1, seriesMax)) * (ph - 16) - 8;

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#3ec455";
  ctx.beginPath();
  msgValues.forEach((v, i) => {
    const cx = projectX(i);
    const cy = projectY(v, maxMsg);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  ctx.strokeStyle = "#d95095";
  ctx.beginPath();
  voiceValues.forEach((v, i) => {
    const cx = projectX(i);
    const cy = projectY(v, maxVoice);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
}

async function drawTopListCard(ctx, title, rows, x, y, w, h, options = {}) {
  const unit = String(options.unit || "");
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 24, {
    size: 22,
    weight: "700",
    color: "#e2e7ef",
  });

  const rowHeight = 70;
  const gap = 8;
  const startY = y + 44;

  for (let i = 0; i < 3; i += 1) {
    const row = rows?.[i] || { label: "N/A", value: 0 };
    const rowY = startY + i * (rowHeight + gap);
    fillRoundRect(ctx, x + 14, rowY, w - 28, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x + 14, rowY, 74, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    drawLabel(ctx, String(i + 1), x + 51, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: "#e0e5ed",
      align: "center",
    });

    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, prepareVisibleText(row.label || "N/A"), w - 280, 24, "700"),
      x + 96,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: "#e0e5ed", align: "left" },
    );

    const valueText = unit ? `${row.value} ${unit}` : String(row.value ?? 0);
    const valueWidth = Math.min(
      w - 260,
      Math.max(110, textWidth(ctx, valueText, 24, "800") + 26),
    );
    fillRoundRect(
      ctx,
      x + w - 14 - valueWidth,
      rowY + 10,
      valueWidth,
      rowHeight - 20,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - 26, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: "#d5dbe5",
      align: "right",
    });
  }
}

function dateText(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    timeZone: ROME_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function renderUserActivityCanvas({
  guildName,
  userTag,
  displayName,
  avatarUrl,
  createdOn,
  joinedOn,
  lookbackDays,
  windows,
  ranks,
  topChannelsText,
  topChannelsVoice,
  chart,
}) {
  registerCanvasFonts(canvasModule);
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};

  const width = 1280;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  fillRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, avatarUrl, 28, 24, 80);
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, `${displayName || userTag}`, 560, 52, "700"),
    124,
    52,
    { size: 52, weight: "700", color: "#eef3fb" },
  );
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, `${guildName || "Server"} / My Activity`, 560, 28, "600"),
    124,
    88,
    { size: 28, weight: "600", color: "#bfc8d6" },
  );

  drawDateBadge(ctx, "Created On", dateText(createdOn), 700, 24, 250, 80);
  drawDateBadge(ctx, "Joined On", dateText(joinedOn), 960, 24, 290, 80);

  drawMetricPanel(
    ctx,
    "Server Ranks",
    [
      { label: "Text", value: `#${ranks?.text || "-"}` },
      { label: "Voice", value: `#${ranks?.voice || "-"}` },
    ],
    20,
    132,
    400,
    236,
  );

  drawMetricPanel(
    ctx,
    "Messages",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} messages` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} messages` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} messages`,
      },
    ],
    440,
    132,
    400,
    236,
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} hours`,
      },
    ],
    860,
    132,
    400,
    236,
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "hours",
    },
    20,
    392,
    610,
    242,
    { showRank: false },
  );

  drawChart(ctx, chart, 650, 392, 610, 242);
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 24, 670, {
    size: 20,
    weight: "700",
    color: "#cfd6e2",
  });

  return canvas.toBuffer("image/png");
}

async function renderServerActivityCanvas({
  guildName,
  guildIconUrl,
  createdOn,
  invitedBotOn,
  lookbackDays,
  windows,
  topUsersText,
  topUsersVoice,
  topChannelsText,
  topChannelsVoice,
  chart,
}) {
  registerCanvasFonts(canvasModule);
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};

  const width = 1280;
  const height = 910;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  fillRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80);
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, guildName || "Server", 500, 60, "700"),
    124,
    52,
    { size: 60, weight: "700", color: "#eef3fb" },
  );
  drawLabel(ctx, "Server Overview", 124, 88, {
    size: 28,
    weight: "600",
    color: "#bfc8d6",
  });

  drawDateBadge(ctx, "Created On", dateText(createdOn), 650, 24, 270, 80);
  drawDateBadge(
    ctx,
    "Invited Bot On",
    dateText(invitedBotOn),
    940,
    24,
    300,
    80,
  );

  drawMetricPanel(
    ctx,
    "Messages",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} messages` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} messages` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} messages`,
      },
    ],
    20,
    132,
    400,
    220,
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} hours`,
      },
    ],
    440,
    132,
    400,
    220,
  );

  drawMetricPanel(
    ctx,
    "Contributors",
    [
      {
        label: "1d",
        value: `${Number(windows?.d1?.contributors || 0)} members`,
      },
      {
        label: "7d",
        value: `${Number(windows?.d7?.contributors || 0)} members`,
      },
      {
        label: `${safeLookback}d`,
        value: `${Number(lookbackWindow?.contributors || 0)} members`,
      },
    ],
    860,
    132,
    400,
    220,
  );

  await drawTopCard(
    ctx,
    "Top Members",
    {
      label: topUsersText?.[0]?.label || "-",
      value: compactNumber(topUsersText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topUsersVoice?.[0]?.label || "-",
      value: formatHours(topUsersVoice?.[0]?.value || 0),
      unit: "hours",
    },
    20,
    370,
    600,
    220,
    { showRank: false },
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "hours",
    },
    640,
    370,
    620,
    220,
    { showRank: false },
  );

  drawChart(ctx, chart, 20, 610, 1240, 240);
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 28, 878, {
    size: 20,
    weight: "700",
    color: "#cfd6e2",
  });

  return canvas.toBuffer("image/png");
}

async function renderTopStatisticsCanvas({
  guildName,
  guildIconUrl,
  lookbackDays = 14,
  topUsersText = [],
  topChannelsText = [],
  topUsersVoice = [],
  topChannelsVoice = [],
}) {
  registerCanvasFonts(canvasModule);
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;

  const width = 1280;
  const height = 860;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  fillRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80);
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, guildName || "Server", 820, 46, "700"),
    124,
    52,
    { size: 46, weight: "700", color: "#eef3fb" },
  );
  drawLabel(ctx, "Top Statistics", 124, 88, {
    size: 28,
    weight: "600",
    color: "#bfc8d6",
  });

  drawLabel(ctx, "# Messages", 24, 150, {
    size: 44,
    weight: "700",
    color: "#e2e7ef",
  });

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersText.map((x) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    20,
    176,
    610,
    288,
    { unit: "msg" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsText.map((x) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    650,
    176,
    610,
    288,
    { unit: "msg" },
  );

  drawLabel(ctx, "Voice Activity", 24, 510, {
    size: 44,
    weight: "700",
    color: "#e2e7ef",
  });

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersVoice.map((x) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    20,
    536,
    610,
    288,
    { unit: "h" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsVoice.map((x) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    650,
    536,
    610,
    288,
    { unit: "h" },
  );

  drawLabel(
    ctx,
    `Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    844,
    {
      size: 20,
      weight: "700",
      color: "#cfd6e2",
    },
  );

  return canvas.toBuffer("image/png");
}

async function renderTopStatisticsSingleCanvas({
  guildName,
  guildIconUrl,
  lookbackDays = 14,
  title = "Top Statistics",
  rows = [],
  unit = "msg",
  mode = "messages",
}) {
  registerCanvasFonts(canvasModule);
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;

  const width = 1280;
  const height = 860;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  fillRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80);
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, guildName || "Server", 820, 46, "700"),
    124,
    52,
    { size: 46, weight: "700", color: "#eef3fb" },
  );
  drawLabel(ctx, "Top Statistics", 124, 88, {
    size: 28,
    weight: "600",
    color: "#bfc8d6",
  });

  drawLabel(ctx, fitText(ctx, title, 1220, 62, "700"), 24, 172, {
    size: 62,
    weight: "700",
    color: "#e2e7ef",
  });

  const normalizedRows = Array.isArray(rows)
    ? rows.map((x) => ({
        label: x?.label || "N/A",
        value:
          mode === "voice"
            ? formatHours(x?.value || 0)
            : compactNumber(x?.value || 0),
      }))
    : [];

  await drawTopListCard(
    ctx,
    "Top 3",
    normalizedRows,
    20,
    240,
    1240,
    520,
    { unit },
  );

  drawLabel(
    ctx,
    `Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    824,
    {
      size: 20,
      weight: "700",
      color: "#cfd6e2",
    },
  );

  return canvas.toBuffer("image/png");
}

async function drawTopRowsColumn(
  ctx,
  rows,
  {
    x,
    y,
    w,
    rankStart = 1,
    unit = "msg",
    rowHeight = 62,
    rowGap = 8,
  },
) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const rowY = y + i * (rowHeight + rowGap);
    fillRoundRect(ctx, x, rowY, w, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x, rowY, 72, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    const rank = rankStart + i;
    drawLabel(ctx, String(rank), x + 36, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: "#e0e5ed",
      align: "center",
    });

    const labelMaxWidth = w - 260;
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, prepareVisibleText(row.label || "N/A"), labelMaxWidth, 24, "700"),
      x + 90,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: "#e0e5ed", align: "left" },
    );

    const valueText = `${row.value} ${unit}`;
    const valueWidth = Math.min(
      w - 240,
      Math.max(110, textWidth(ctx, valueText, 24, "800") + 26),
    );
    fillRoundRect(
      ctx,
      x + w - valueWidth - 10,
      rowY + 9,
      valueWidth,
      rowHeight - 18,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - 18, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: "#d5dbe5",
      align: "right",
    });
  }
}

async function renderTopLeaderboardPageCanvas({
  guildName,
  guildIconUrl,
  lookbackDays = 14,
  title = "Top Statistics",
  page = 1,
  totalPages = 1,
  rows = [],
  unit = "msg",
  mode = "messages",
}) {
  registerCanvasFonts(canvasModule);
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays))
    ? Number(lookbackDays)
    : 14;
  const safePage = Math.max(1, Number(page || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || 1));

  const mappedRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    label: row?.label || "N/A",
    value:
      mode === "voice"
        ? formatHours(row?.value || 0)
        : compactNumber(row?.value || 0),
  }));

  const totalRows = mappedRows.length;
  const forceSingleWideColumn =
    safePage === safeTotalPages && totalRows > 0 && totalRows < 5;
  const splitAt = totalRows > 5 ? 5 : Math.ceil(totalRows / 2);
  const leftRows = forceSingleWideColumn
    ? mappedRows
    : mappedRows.slice(0, splitAt);
  const rightRows = forceSingleWideColumn
    ? []
    : mappedRows.slice(splitAt, 10);
  const panelHeight = 560;
  const panelY = 216;
  const footerY = 824;

  const width = 1280;
  const height = 860;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  fillRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, 96, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80);
  await drawLabelWithEmoji(
    ctx,
    fitText(ctx, guildName || "Server", 820, 46, "700"),
    124,
    52,
    { size: 46, weight: "700", color: "#eef3fb" },
  );
  drawLabel(ctx, "Top Statistics", 124, 88, {
    size: 28,
    weight: "600",
    color: "#bfc8d6",
  });

  drawLabel(ctx, fitText(ctx, title, 1220, 56, "700"), 24, 164, {
    size: 56,
    weight: "700",
    color: "#e2e7ef",
  });

  fillRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(46, 55, 70, 0.92)");
  strokeRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(255,255,255,0.05)", 1);

  const panelInnerTop = 236;
  const panelInnerBottom = panelY + panelHeight - 20;
  const panelInnerHeight = panelInnerBottom - panelInnerTop;
  const computeColumnLayout = (count) => {
    const safeCount = Math.max(1, Number(count || 0));
    const rowGap = safeCount > 1 ? 10 : 0;
    const rowHeight = Math.max(
      48,
      Math.floor((panelInnerHeight - rowGap * (safeCount - 1)) / safeCount),
    );
    return { rowHeight, rowGap };
  };

  if (forceSingleWideColumn) {
    const singleLayout = computeColumnLayout(leftRows.length);
    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 1212,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: singleLayout.rowHeight,
      rowGap: singleLayout.rowGap,
    });
  } else {
    const leftLayout = computeColumnLayout(leftRows.length);
    const rightLayout = computeColumnLayout(rightRows.length);

    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: leftLayout.rowHeight,
      rowGap: leftLayout.rowGap,
    });
    await drawTopRowsColumn(ctx, rightRows, {
      x: 646,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + leftRows.length + 1,
      unit,
      rowHeight: rightLayout.rowHeight,
      rowGap: rightLayout.rowGap,
    });
  }

  if (!leftRows.length && !rightRows.length) {
    drawLabel(ctx, "Nessun dato disponibile", width / 2, panelY + panelHeight / 2, {
      size: 34,
      weight: "700",
      color: "#cfd6e2",
      align: "center",
    });
  }

  drawLabel(
    ctx,
    `Page ${safePage}/${safeTotalPages} | Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    footerY,
    {
      size: 20,
      weight: "700",
      color: "#cfd6e2",
    },
  );

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderUserActivityCanvas,
  renderServerActivityCanvas,
  renderTopStatisticsCanvas,
  renderTopStatisticsSingleCanvas,
  renderTopLeaderboardPageCanvas,
};
