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
const FONT_STACK = [
  `"${PRIMARY_FONT}"`,
  `"${TIBETAN_FONT}"`,
  `"${SYMBOLS_FONT}"`,
  `"${FRAKTUR_FONT}"`,
  `"${MATH_FONT}"`,
  `"${FALLBACK_FONT}"`,
  "\"Segoe UI Symbol\"",
  "\"Segoe UI Emoji\"",
  "\"Arial Unicode MS\"",
  `"${COLOR_EMOJI_FONT}"`,
  `"${EMOJI_FONT}"`,
  "sans-serif"
].join(", ");

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

module.exports = {
  registerCanvasFonts,
  fontStack,
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
