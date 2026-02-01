const fs = require("fs");
const path = require("path");

const PRIMARY_FONT = "Noto Sans";
const TIBETAN_FONT = "Noto Serif Tibetan";
const SYMBOLS_FONT = "Noto Sans Symbols2";
const COLOR_EMOJI_FONT = "Noto Color Emoji";
const EMOJI_FONT = "Mojangles";
const FRAKTUR_FONT = "UnifrakturMaguntia";
const MATH_FONT = "Noto Sans Math";
const FALLBACK_FONT = "Yu Gothic";
const BASE_STACK = [
  `"${TIBETAN_FONT}"`,
  `"${SYMBOLS_FONT}"`,
  `"${FRAKTUR_FONT}"`,
  `"${MATH_FONT}"`,
  `"${FALLBACK_FONT}"`,
  "\"Segoe UI Symbol\"",
  "\"Segoe UI Emoji\"",
  "\"Arial Unicode MS\"",
  "sans-serif"
];

const FONT_STACK = [`"${PRIMARY_FONT}"`, ...BASE_STACK].join(", ");

let registered = false;

function registerCanvasFonts(canvasModule) {
  if (registered || !canvasModule?.registerFont) return;
  const notoPath = path.join(__dirname, "..", "..", "UI", "Fonts", "NotoSans-Regular.ttf");
  const tibetanPath = path.join(__dirname, "..", "..", "UI", "Fonts", "NotoSerifTibetan-Regular.ttf");
  const symbolsPath = path.join(__dirname, "..", "..", "UI", "Fonts", "NotoSansSymbols2-Regular.ttf");
  const colorEmojiPath = path.join(__dirname, "..", "..", "UI", "Fonts", "NotoColorEmoji_WindowsCompatible.ttf");
  const mojanglesPath = path.join(__dirname, "..", "..", "UI", "Fonts", "Mojangles.ttf");
  const frakturPath = path.join(__dirname, "..", "..", "UI", "Fonts", "UnifrakturMaguntia-Regular.ttf");
  const mathPath = path.join(__dirname, "..", "..", "UI", "Fonts", "NotoSansMath-Regular.ttf");
  const yuPath = path.join(__dirname, "..", "..", "UI", "Fonts", "YuGothR.ttc");
  if (fs.existsSync(notoPath)) {
    try {
      canvasModule.registerFont(notoPath, { family: PRIMARY_FONT });
    } catch {
    }
  }
  if (fs.existsSync(tibetanPath)) {
    try {
      canvasModule.registerFont(tibetanPath, { family: TIBETAN_FONT });
    } catch {
    }
  }
  if (fs.existsSync(symbolsPath)) {
    try {
      canvasModule.registerFont(symbolsPath, { family: SYMBOLS_FONT });
    } catch {
    }
  }
  if (fs.existsSync(colorEmojiPath)) {
    try {
      canvasModule.registerFont(colorEmojiPath, { family: COLOR_EMOJI_FONT });
    } catch {
    }
  }
  if (fs.existsSync(mojanglesPath)) {
    try {
      canvasModule.registerFont(mojanglesPath, { family: EMOJI_FONT });
    } catch {
    }
  }
  if (fs.existsSync(frakturPath)) {
    try {
      canvasModule.registerFont(frakturPath, { family: FRAKTUR_FONT });
    } catch {
    }
  }
  if (fs.existsSync(mathPath)) {
    try {
      canvasModule.registerFont(mathPath, { family: MATH_FONT });
    } catch {
    }
  }
  if (fs.existsSync(yuPath)) {
    try {
      canvasModule.registerFont(yuPath, { family: FALLBACK_FONT });
    } catch {
    }
  }
  registered = true;
}

function fontStack(size, weight) {
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${FONT_STACK}`;
}

function fontStackWithPrimary(primary, size, weight) {
  const prefix = weight ? `${weight} ` : "";
  const stack = [`"${primary}"`, ...BASE_STACK].join(", ");
  return `${prefix}${size}px ${stack}`;
}

function isTibetanChar(char) {
  if (!char) return false;
  const code = char.codePointAt(0);
  return code >= 0x0f00 && code <= 0x0fff;
}

function drawTextWithSpecialFallback(ctx, text, x, y, options = {}) {
  const value = text == null ? "" : String(text);
  const size = options.size || 16;
  const weight = options.weight || "";
  const align = options.align || ctx.textAlign || "left";
  const baseline = options.baseline || ctx.textBaseline || "alphabetic";
  const color = options.color || ctx.fillStyle;
  const normalFont = fontStack(size, weight);
  const tibetanFont = fontStackWithPrimary(TIBETAN_FONT, size, weight);

  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = baseline;
  if (!Array.from(value).some(isTibetanChar)) {
    ctx.font = normalFont;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
    ctx.restore();
    return;
  }

  const runs = [];
  let current = "";
  let currentTibetan = null;
  for (const char of Array.from(value)) {
    const tibetan = isTibetanChar(char);
    if (currentTibetan === null) {
      currentTibetan = tibetan;
      current = char;
      continue;
    }
    if (tibetan === currentTibetan) {
      current += char;
    } else {
      runs.push({ text: current, tibetan: currentTibetan });
      current = char;
      currentTibetan = tibetan;
    }
  }
  if (current) runs.push({ text: current, tibetan: currentTibetan });

  let totalWidth = 0;
  for (const run of runs) {
    ctx.font = run.tibetan ? tibetanFont : normalFont;
    totalWidth += ctx.measureText(run.text).width;
  }

  let startX = x;
  if (align === "center") startX = x - totalWidth / 2;
  if (align === "right" || align === "end") startX = x - totalWidth;

  let cursor = startX;
  for (const run of runs) {
    ctx.font = run.tibetan ? tibetanFont : normalFont;
    ctx.textAlign = "left";
    ctx.fillText(run.text, cursor, y);
    cursor += ctx.measureText(run.text).width;
  }
  ctx.restore();
}

module.exports = {
  registerCanvasFonts,
  fontStack,
  fontStackWithPrimary,
  drawTextWithSpecialFallback,
  PRIMARY_FONT,
  TIBETAN_FONT,
  SYMBOLS_FONT,
  COLOR_EMOJI_FONT,
  EMOJI_FONT,
  FRAKTUR_FONT,
  MATH_FONT,
  FALLBACK_FONT,
  FONT_STACK
};
