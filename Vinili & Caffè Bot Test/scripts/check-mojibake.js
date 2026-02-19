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

const files = walk(ROOT);
const badFiles = [];

for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (SKIP_FILES.has(relative)) continue;
  const lines = findProblems(file);
  if (lines.length > 0) {
    badFiles.push({
      file: relative,
      lines
    });
  }
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

