const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);
const SKIP_FILES = new Set([path.join('scripts', 'check-mojibake.js')]);
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.env'
]);

const MOJIBAKE_PATTERNS = [
  "\uFFFD",
  "\u00EF\u00BF\u00BD",
  "\u00C3\u00AF\u00C2\u00BB\u00C2\u00BF",
  "\u00C3\u00AF\u00C2\u00BF\u00C2\u00BD",
  "\u00E2\u20AC",
  "\u00C3\u00A2",
  "\u00C3\u0192",
  "\u00F0\u0178",
  "\u00EF\u00B8",
  "\u00EF\u00BB\u00BF"
];

const MOJIBAKE_REPLACEMENTS = [
  ["\u00C3\u00A0", "\u00E0"],
  ["\u00C3\u00A8", "\u00E8"],
  ["\u00C3\u00A9", "\u00E9"],
  ["\u00C3\u00AC", "\u00EC"],
  ["\u00C3\u00B2", "\u00F2"],
  ["\u00C3\u00B9", "\u00F9"],
  ["\u00E2\u20AC\u2122", "\u2019"],
  ["\u00E2\u20AC\u02DC", "\u2018"],
  ["\u00E2\u20AC\u0153", "\u201C"],
  ["\u00E2\u20AC?", "\u201D"],
  ["\u00E2\u20AC\u201C", "\u2013"],
  ["\u00E2\u20AC\u201D", "\u2014"],
  ["\u00E2\u20AC\u00A6", "\u2026"],
  ["\u00EF\u00BF\u00BD", ""],
  ["\u00C2", ""]
];

const ITALIAN_WORD_FIXES = [
  [/\bpiu\b/g, "pi\u00F9"],
  [/\bPiu\b/g, "Pi\u00F9"],
  [/\bperche\b/g, "perch\u00E9"],
  [/\bPerche\b/g, "Perch\u00E9"],
  [/\bpoiche\b/g, "poich\u00E9"],
  [/\bPoiche\b/g, "Poich\u00E9"],
  [/\bgia\b/g, "gi\u00E0"],
  [/\bGia\b/g, "Gi\u00E0"],
  [/\bcioe\b/g, "cio\u00E8"],
  [/\bCioe\b/g, "Cio\u00E8"],
  [/\bqualita\b/g, "qualit\u00E0"],
  [/\bQualita\b/g, "Qualit\u00E0"],
  [/\bquantita\b/g, "quantit\u00E0"],
  [/\bQuantita\b/g, "Quantit\u00E0"],
  [/\bnovita\b/g, "novit\u00E0"],
  [/\bNovita\b/g, "Novit\u00E0"],
  [/\battivita\b/g, "attivit\u00E0"],
  [/\bAttivita\b/g, "Attivit\u00E0"],
  [/\bcomunita\b/g, "comunit\u00E0"],
  [/\bComunita\b/g, "Comunit\u00E0"],
  [/\bserieta\b/g, "seriet\u00E0"],
  [/\bSerieta\b/g, "Seriet\u00E0"],
  [/\bpossibilita\b/g, "possibilit\u00E0"],
  [/\bPossibilita\b/g, "Possibilit\u00E0"],
  [/\bresponsabilita\b/g, "responsabilit\u00E0"],
  [/\bResponsabilita\b/g, "Responsabilit\u00E0"],
  [/\baffidabilita\b/g, "affidabilit\u00E0"],
  [/\bAffidabilita\b/g, "Affidabilit\u00E0"],
  [/\butilita\b/g, "utilit\u00E0"],
  [/\bUtilita\b/g, "Utilit\u00E0"],
  [/\bc'e\b/g, "c'\u00E8"],
  [/\bC'e\b/g, "C'\u00E8"],
  [/\be'\b/g, "\u00E8"],
  [/\bE'\b/g, "\u00C8"],
  [/\bverra\b/g, "verr\u00E0"],
  [/\bVerra\b/g, "Verr\u00E0"]
];

function shouldScanFile(filePath) {
  const base = path.basename(filePath);
  if (base === '.env') return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath, out);
    } else if (entry.isFile() && shouldScanFile(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function findProblems(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasMojibake = MOJIBAKE_PATTERNS.some((token) => line.includes(token));
    const hasControlChars = /[\u0080-\u009F]/.test(line);
    if (hasMojibake || hasControlChars) {
      problems.push(i + 1);
    }
  }
  return problems;
}

function fixMojibake(content) {
  let out = content;
  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  out = out.replace(/\uFFFD/g, '');
  return out;
}

function fixItalian(content) {
  let out = content;
  for (const [pattern, replacement] of ITALIAN_WORD_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function removeTrailingEmptyLines(content) {
  return content.replace(/(?:\r?\n[\t ]*)+$/g, "");
}

function applyFixes(filePath, { italian = true } = {}) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  let updated = fixMojibake(content);
  if (italian) updated = fixItalian(updated);
  updated = removeTrailingEmptyLines(updated);

  if (updated === content) return false;
  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

const args = new Set(process.argv.slice(2));
const FIX_MODE = args.has('--fix');
const ENABLE_ITALIAN_FIX = FIX_MODE && !args.has('--no-italian');

const files = walk(ROOT);
const badFiles = [];
const fixedFiles = [];

for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (SKIP_FILES.has(relative)) continue;

  if (FIX_MODE && applyFixes(file, { italian: ENABLE_ITALIAN_FIX })) {
    fixedFiles.push(relative);
  }

  const lines = findProblems(file);
  if (lines.length > 0) {
    badFiles.push({
      file: relative,
      lines
    });
  }
}

if (FIX_MODE) {
  console.log(`Fix completato. File modificati: ${fixedFiles.length}`);
}

if (badFiles.length === 0) {
  console.log('OK: nessun carattere corrotto rilevato.');
  process.exit(0);
}

console.log('Trovati possibili caratteri corrotti:');
for (const item of badFiles) {
  console.log(`- ${item.file}: ${item.lines.join(', ')}`);
}
console.log(`Totale file: ${badFiles.length}`);
process.exit(1);
