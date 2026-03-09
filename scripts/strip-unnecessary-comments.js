const fs = require("fs");
const path = require("path");

function getBotRoot() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const botFolder = process.argv[2] || process.env.BOT_FOLDER || "Vinyls";
  return path.join(workspaceRoot, botFolder);
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "scripts"]);
const SKIP_FILES = new Set(["strip-unnecessary-comments.js", "check-mojibake.js"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath, out);
    } else if (entry.isFile() && fullPath.endsWith(".js")) {
      out.push(fullPath);
    }
  }
  return out;
}

function isKeepComment(line, index) {
  const t = line.trim();
  if (index > 20) return false;
  return /@license|@preserve|Copyright|All rights reserved|DO NOT EDIT|eslint-disable|istanbul ignore/i.test(t);
}

function stripFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  const lines = content.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length && i < 25) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("/*")) {
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !lines[j].includes("*/")) {
        block.push(lines[j]);
        j++;
      }
      if (j < lines.length) block.push(lines[j]);
      const blockText = block.join("\n");
      if (isKeepComment(blockText, i)) out.push(...block);
      i = j + 1;
      continue;
    }
    if (/^\s*\/\//.test(line)) {
      if (isKeepComment(line, i)) out.push(line);
      i++;
      continue;
    }
    break;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^\s*\/\//.test(line)) {
      if (isKeepComment(line, i)) out.push(line);
      continue;
    }
    out.push(line);
  }
  const newContent = out.join("\n").replace(/(?:\r?\n){3,}/g, "\n\n").replace(/(?:\r?\n[\t ]*)+$/g, "\n");
  if (newContent === content) return false;
  fs.writeFileSync(filePath, newContent, "utf8");
  return true;
}

function run(root) {
  const files = walk(root);
  let changed = 0;
  for (const file of files) {
    const rel = path.relative(root, file);
    const base = path.basename(file);
    if (SKIP_FILES.has(base)) continue;
    if (stripFile(file)) {
      changed++;
      console.log(rel);
    }
  }
  console.log(`Done. Modified ${changed} files.`);
}

if (require.main === module) {
  run(getBotRoot());
} else {
  module.exports = run;
}