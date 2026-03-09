const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const TEXT_EXT = new Set([".js", ".cjs", ".mjs", ".json", ".md", ".txt", ".yml", ".yaml", ".mdc"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function hasTrailingNewline(content) {
  if (!content) return false;
  return content.endsWith("\n") || content.endsWith("\r\n");
}

const fix = process.argv.includes("--fix");
const files = walk(ROOT);
let bad = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  if (!hasTrailingNewline(raw)) continue;
  bad++;
  const rel = path.relative(ROOT, file);
  if (fix) {
    const trimmed = raw.replace(/\r?\n$/, "");
    fs.writeFileSync(file, trimmed, "utf8");
    console.log("[fix] " + rel);
  } else {
    console.log(rel);
  }
}

if (bad === 0) {
  console.log("Nessun file con newline finale.");
  process.exit(0);
}
if (!fix) {
  console.error("\nTrovati " + bad + " file. Esegui con --fix per correggere.");
  process.exit(1);
}
console.log("Corretti " + bad + " file.");
process.exit(0);