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
  `"${COLOR_EMOJI_FONT}"`,
  '"Noto Sans CJK JP"',
  '"Noto Sans CJK SC"',
  '"Noto Sans CJK TC"',
  '"Noto Sans JP"',
  '"Noto Sans KR"',
  '"Noto Sans SC"',
  '"Noto Sans TC"',
  '"Arial Unicode MS"',
  '"DejaVu Sans"',
  '"Segoe UI"',
  '"Calibri"',
  '"Tahoma"',
  '"Segoe UI Emoji"',
  '"Apple Color Emoji"',
  '"Noto Emoji"',
  `"${SYMBOLS_FONT}"`,
  '"Segoe UI Symbol"',
  `"${MATH_FONT}"`,
  `"${TIBETAN_FONT}"`,
  `"${FRAKTUR_FONT}"`,
  `"${EMOJI_FONT}"`,
  `"${FALLBACK_FONT}"`,
  '"Arial"',
  "sans-serif",
];
const FONT_STACK = [`"${PRIMARY_FONT}"`, ...BASE_STACK].join(", ");

let registered = false;

function registerCanvasFonts(canvasModule) {
  if (registered || !canvasModule?.registerFont) return;
  const notoPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "NotoSans-Regular.ttf",
  );
  const tibetanPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "NotoSerifTibetan-Regular.ttf",
  );
  const symbolsPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "NotoSansSymbols2-Regular.ttf",
  );
  const colorEmojiPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "NotoColorEmoji_WindowsCompatible.ttf",
  );
  const mojanglesPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "Mojangles.ttf",
  );
  const frakturPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "UnifrakturMaguntia-Regular.ttf",
  );
  const mathPath = path.join(
    __dirname,
    "..",
    "..",
    "UI",
    "Fonts",
    "NotoSansMath-Regular.ttf",
  );
  const yuPath = path.join(__dirname, "..", "..", "UI", "Fonts", "YuGothR.ttc");
  if (fs.existsSync(notoPath)) {
    try {
      canvasModule.registerFont(notoPath, { family: PRIMARY_FONT });
    } catch {}
  }
  if (fs.existsSync(tibetanPath)) {
    try {
      canvasModule.registerFont(tibetanPath, { family: TIBETAN_FONT });
    } catch {}
  }
  if (fs.existsSync(symbolsPath)) {
    try {
      canvasModule.registerFont(symbolsPath, { family: SYMBOLS_FONT });
    } catch {}
  }
  if (fs.existsSync(colorEmojiPath)) {
    try {
      canvasModule.registerFont(colorEmojiPath, { family: COLOR_EMOJI_FONT });
    } catch {}
  }
  if (fs.existsSync(mojanglesPath)) {
    try {
      canvasModule.registerFont(mojanglesPath, { family: EMOJI_FONT });
    } catch {}
  }
  if (fs.existsSync(frakturPath)) {
    try {
      canvasModule.registerFont(frakturPath, { family: FRAKTUR_FONT });
    } catch {}
  }
  if (fs.existsSync(mathPath)) {
    try {
      canvasModule.registerFont(mathPath, { family: MATH_FONT });
    } catch {}
  }
  if (fs.existsSync(yuPath)) {
    try {
      canvasModule.registerFont(yuPath, { family: FALLBACK_FONT });
    } catch {}
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

function drawTextWithSpecialFallback(ctx, text, x, y, options = {}) {
  const rawValue = text == null ? "" : String(text);
  const value = options.normalizeCompatibility
    ? rawValue.normalize("NFKC")
    : rawValue;
  const size = options.size || 16;
  const weight = options.weight || "";
  const align = options.align || ctx.textAlign || "left";
  const baseline = options.baseline || ctx.textBaseline || "alphabetic";
  const color = options.color || ctx.fillStyle;
  const normalFont = fontStack(size, weight);
  const tibetanFont = fontStackWithPrimary(TIBETAN_FONT, size, weight);
  const hasTibetan = /[\u0F00-\u0FFF]/.test(value);
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = baseline;
  if (!hasTibetan) {
    ctx.font = normalFont;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
    ctx.restore();
    return;
  }

  const runs = [];
  let current = "";
  let currentFont = null;
  for (const ch of Array.from(value)) {
    const cp = ch.codePointAt(0);
    // Keep U+0F04 (༄) on the normal stack so Symbol fallbacks can render it
    // when Tibetan font coverage differs across environments.
    const isTibetanBlock = cp >= 0x0f00 && cp <= 0x0fff;
    const forceNormalForTibetanMark = cp === 0x0f04;
    const nextFont =
      isTibetanBlock && !forceNormalForTibetanMark ? tibetanFont : normalFont;
    if (nextFont !== currentFont && current) {
      runs.push({ text: current, font: currentFont });
      current = "";
    }
    current += ch;
    currentFont = nextFont;
  }
  if (current) runs.push({ text: current, font: currentFont });

  let totalWidth = 0;
  for (const run of runs) {
    ctx.font = run.font;
    totalWidth += ctx.measureText(run.text).width;
  }

  let cursorX = x;
  if (align === "center") cursorX = x - totalWidth / 2;
  else if (align === "right") cursorX = x - totalWidth;

  ctx.textAlign = "left";
  for (const run of runs) {
    ctx.font = run.font;
    ctx.fillText(run.text, cursorX, y);
    cursorX += ctx.measureText(run.text).width;
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
  FONT_STACK,
};
