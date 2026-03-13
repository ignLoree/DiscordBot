const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIRS = [path.join(ROOT, "Vinyls"), path.join(ROOT, "Coffee")];

const SKIP_SUBSTR = [
  ".test(", ".match(", "new RegExp", "RegExp(", "/(?:", "/\\", "langpair=",
  "@returns", "import(", "partnershipModal_", "eqRegex", "MYMEMORY",
  "strip-unnecessary-comments", "check-user-pipe",
];

const GLUED_PIPE = /[a-zA-Z0-9#%)}\]`'"]\|[a-zA-Z@#<]/;

const USERISH = /(content:|usage:|Uso:|Usa:|setDescription|setTitle|setFooter|followUp|safeMessageReply|send\(\s*\{|\.setDescription\(|subcommandUsages|examples:\s*\[)/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

function main() {
  const files = DIRS.flatMap((d) => walk(d));
  const bad = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("//")) return;
      if (SKIP_SUBSTR.some((s) => line.includes(s))) return;
      if (t.startsWith("*") && t.includes("@")) return;
      if (!USERISH.test(line)) return;
      if (GLUED_PIPE.test(line)) {
        bad.push({ file: rel, line: i + 1, text: line.trim().slice(0, 140), why: "pipe" });
        return;
      }
      if (/\*\*[^*]+:\*\*\$\{/.test(line) && !line.includes(".test(")) {
        bad.push({ file: rel, line: i + 1, text: line.trim().slice(0, 140), why: "label:" });
      }
    });
  }
  if (bad.length) {
    console.error("TROVATE righe user-facing con pipe attaccate (usa \"a | b\"):\n");
    bad.slice(0, 80).forEach((b) => console.error(`  ${b.file}:${b.line} [${b.why}] ${b.text}`));
    if (bad.length > 80) console.error(`  ... altre ${bad.length - 80} righe`);
    process.exit(1);
  }
  console.log("OK: nessuna pipe attaccata in testi utente (Vinyls + Coffee).");
}

main();