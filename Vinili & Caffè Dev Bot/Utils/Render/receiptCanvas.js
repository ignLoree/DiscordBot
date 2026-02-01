const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack } = require("./canvasFonts");

const { createCanvas } = canvasModule;

function wrapTextToWidth(text, maxWidth, ctx) {
  if (!text) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (ctx.measureText(current).width > maxWidth) {
      let chunk = "";
      for (const char of current) {
        const chunkNext = chunk + char;
        if (ctx.measureText(chunkNext).width > maxWidth) {
          if (chunk) lines.push(chunk);
          chunk = char;
        } else {
          chunk = chunkNext;
        }
      }
      if (chunk) lines.push(chunk);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildDivider(ctx, maxWidth) {
  let divider = "";
  while (ctx.measureText(divider + "-").width <= maxWidth) {
    divider += "-";
  }
  return divider || "-";
}

function formatDateLine(date) {
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthName = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${dayName}, ${day} ${monthName} ${year}`;
}

function buildLines({ displayName, monthLabel, tracks, subtotalPlays, totalPlays, orderDate, cardYear }) {
  const lines = [];
  lines.push({ type: "center", text: "VINILI & CAFF\u00c8 RECEIPT", size: 22 });
  lines.push({ type: "center", text: monthLabel, size: 18 });
  lines.push({ type: "spacer" });
  lines.push({ type: "center", text: `ORDER #1 FOR ${String(displayName || "UNKNOWN").toUpperCase()}` });
  lines.push({ type: "center", text: formatDateLine(orderDate) });
  lines.push({ type: "line" });
  lines.push({ type: "row", left: "ITEM", right: "AMT" });
  lines.push({ type: "line" });

  tracks.forEach(track => {
    const artist = track.artist?.name || track.artist || "UNKNOWN";
    const name = track.name || "UNKNOWN";
    const plays = String(track.playcount || 0);
    lines.push({ type: "row", left: `${artist} - ${name}`.toUpperCase(), right: plays });
  });

  lines.push({ type: "line" });
  lines.push({ type: "row", left: "SUBTOTAL:", right: String(subtotalPlays) });
  lines.push({ type: "line" });
  lines.push({ type: "row", left: "TOTAL PLAYS:", right: String(totalPlays) });
  lines.push({ type: "spacer" });
  lines.push({ type: "left", text: `CARD #: **** **** **** ${cardYear}` });
  lines.push({ type: "left", text: "AUTH CODE: 1765137" });
  lines.push({ type: "left", text: `CARDHOLDER: ${displayName}` });
  lines.push({ type: "spacer" });
  lines.push({ type: "center", text: "THANK YOU FOR VISITING - GRAZIE !" });
  return lines;
}

function renderReceipt({ displayName, monthLabel, tracks, subtotalPlays, totalPlays, orderDate, cardYear }) {
  registerCanvasFonts(canvasModule);
  const lines = buildLines({ displayName, monthLabel, tracks, subtotalPlays, totalPlays, orderDate, cardYear });
  const width = 402;
  const height = 748;
  const paddingX = 18;
  const paddingTop = 38;
  const paddingBottom = 36;
  const lineHeight = 20;
  const fontSize = 16;
  const usedHeight = paddingTop + lines.length * lineHeight + paddingBottom;
  const offsetY = Math.max(0, Math.floor((height - usedHeight) / 2));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f6f2ed";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 5000; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const alpha = Math.random() * 0.06;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const maxTextWidth = width - paddingX * 2;
  const rightX = width - paddingX;
  ctx.fillStyle = "#111";
  ctx.font = fontStack(fontSize);
  const divider = buildDivider(ctx, maxTextWidth);

  let y = paddingTop + offsetY;
  lines.forEach((line) => {
    if (line.type === "spacer") {
      y += lineHeight;
      return;
    }
    if (line.type === "line") {
      ctx.textAlign = "left";
      ctx.fillText(divider, paddingX, y);
      y += lineHeight;
      return;
    }
    if (line.type === "row") {
      ctx.textAlign = "left";
      const leftLines = wrapTextToWidth(line.left, maxTextWidth - 70, ctx);
      leftLines.forEach((leftLine, index) => {
        ctx.textAlign = "left";
        ctx.fillText(leftLine, paddingX, y);
        if (index === 0) {
          ctx.textAlign = "right";
          ctx.fillText(String(line.right || ""), rightX, y);
        }
        y += lineHeight;
      });
      return;
    }
    if (line.type === "left") {
      ctx.textAlign = "left";
      const leftLines = wrapTextToWidth(line.text, maxTextWidth, ctx);
      leftLines.forEach((leftLine) => {
        ctx.fillText(leftLine, paddingX, y);
        y += lineHeight;
      });
      return;
    }
    const baseSize = fontSize;
    let size = baseSize;
    ctx.textAlign = "center";
    while (size > 12) {
      ctx.font = fontStack(size);
      if (ctx.measureText(line.text).width <= maxTextWidth) break;
      size -= 1;
    }
    if (line.size) {
      ctx.font = fontStack(line.size);
    }
    ctx.fillText(line.text, width / 2, y);
    ctx.font = fontStack(baseSize);
    y += lineHeight;
  });
  return canvas.toBuffer("image/png");
}

module.exports = { renderReceipt };
