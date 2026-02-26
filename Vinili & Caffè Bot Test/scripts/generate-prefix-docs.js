const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const outPath = path.join(docsDir, "commands.md");

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

global.logger = { info: () => {}, error: () => {} };

const handlerFactory = require(path.join(root, "Handlers", "prefixHandler.js"));
const client = {
  pcommands: new Map(),
  aliases: new Map(),
  logs: { success: () => {} },
};
handlerFactory(client);

function listFolders(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

(async () => {
  const prefixDir = path.join(root, "Prefix");
  await client.prefixCommands(listFolders(prefixDir), prefixDir);

  const cmds = Array.from(client.pcommands.values())
    .filter((cmd) => cmd && cmd.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "it"));

  const lines = [];
  lines.push("# Prefix Commands");
  lines.push("");
  lines.push(`Generato automaticamente il ${new Date().toISOString()}.`);
  lines.push("");

  for (const cmd of cmds) {
    const name = String(cmd.name);
    const aliases = asList(cmd.aliases).map((a) => `\`${a}\``).join(", ") || "-";
    const usage = String(cmd.usage || "").trim() || `+${name}`;
    const examples = asList(cmd.examples).map((x) => `- \`${String(x)}\``);
    const subcommands = asList(cmd.subcommands).map((s) => `\`${s}\``).join(", ") || "-";

    lines.push(`## +${name}`);
    lines.push(`- Categoria: \`${String(cmd.folder || "misc")}\``);
    lines.push(`- Alias: ${aliases}`);
    lines.push(`- Uso: \`${usage}\``);
    lines.push(`- Subcommand: ${subcommands}`);
    lines.push("- Esempi:");
    if (examples.length) lines.push(...examples);
    else lines.push(`- \`+${name}\``);
    lines.push("");
  }

  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log("DOCS_GENERATED", path.relative(root, outPath));
})();