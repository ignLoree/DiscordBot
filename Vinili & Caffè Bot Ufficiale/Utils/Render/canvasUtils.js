/**
 * Normalizza testo per il rendering su canvas: converte caratteri Unicode
 * stilizzati (es. Mathematical Alphanumeric come 𝕯𝖊𝖒𝖔𝖓, fullwidth) in equivalenti
 * ASCII/Latin base così che il font li renderizzi correttamente.
 * Usato da tutti i canvas (ship, rank, quote, skullboard, activity).
 */
function normalizeTextForCanvas(str) {
  if (str == null || typeof str !== "string") return "";
  const s = String(str).normalize("NFC");
  const out = [];
  const A = 0x41;
  const a = 0x61;
  const zero = 0x30;
  // Ranges: [start, end, base] -> map cp to base + (cp - start)
  const letterRanges = [
    [0x1d400, 0x1d419, A],
    [0x1d41a, 0x1d433, a],
    [0x1d434, 0x1d44d, A],
    [0x1d44e, 0x1d467, a],
    [0x1d468, 0x1d481, A],
    [0x1d482, 0x1d49b, a],
    [0x1d49c, 0x1d4b5, A],
    [0x1d4b6, 0x1d4cf, a],
    [0x1d4d0, 0x1d4e9, A],
    [0x1d4ea, 0x1d503, a],
    [0x1d504, 0x1d51d, A],
    [0x1d51e, 0x1d537, a],
    [0x1d538, 0x1d551, A],
    [0x1d552, 0x1d56b, a],
    [0x1d56c, 0x1d585, A],
    [0x1d586, 0x1d59f, a],
    [0x1d5a0, 0x1d5b9, A],
    [0x1d5ba, 0x1d5d3, a],
    [0x1d5d4, 0x1d5ed, A],
    [0x1d5ee, 0x1d607, a],
    [0x1d608, 0x1d621, A],
    [0x1d622, 0x1d63b, a],
    [0x1d63c, 0x1d655, A],
    [0x1d656, 0x1d66f, a],
    [0x1d670, 0x1d689, A],
    [0x1d68a, 0x1d6a3, a],
  ];
  const digitRanges = [
    [0x1d7ce, 0x1d7d7, zero],
    [0x1d7e2, 0x1d7eb, zero],
    [0x1d7ec, 0x1d7f5, zero],
  ];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (!Number.isFinite(cp)) {
      out.push(ch);
      continue;
    }
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out.push(String.fromCodePoint(cp - 0xff01 + 0x21));
      continue;
    }
    let mapped = null;
    for (const [start, end, base] of letterRanges) {
      if (cp >= start && cp <= end) {
        mapped = String.fromCodePoint(base + (cp - start));
        break;
      }
    }
    if (mapped) {
      out.push(mapped);
      continue;
    }
    for (const [start, end, base] of digitRanges) {
      if (cp >= start && cp <= end) {
        mapped = String.fromCodePoint(base + (cp - start));
        break;
      }
    }
    if (mapped) {
      out.push(mapped);
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

module.exports = {
  normalizeTextForCanvas,
};