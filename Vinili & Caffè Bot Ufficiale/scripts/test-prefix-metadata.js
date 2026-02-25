const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");

const root = path.resolve(__dirname, "..");
const prefixRoot = path.join(root, "Prefix");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const folders = fs
    .readdirSync(prefixRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const oldLogger = global.logger;
  global.logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
  };

  const client = {
    pcommands: new Collection(),
    aliases: new Collection(),
    logs: { success: () => {} },
  };

  try {
    const loadPrefix = require(path.join(root, "Handlers", "prefixHandler.js"));
    loadPrefix(client);
    await client.prefixCommands(folders, prefixRoot);

    const bad = [];
    for (const [name, command] of client.pcommands.entries()) {
      if (!command || command.skipLoad || command.skipPrefix || !command.name) continue;
      const usage = String(command.usage || "").trim();
      const examples = Array.isArray(command.examples)
        ? command.examples.filter((x) => String(x || "").trim())
        : [];
      if (!usage || !examples.length) bad.push(name);
    }

    assert(!bad.length, `Comandi senza usage/examples runtime: ${bad.join(", ")}`);
    console.log("PREFIX_METADATA_TEST_OK", client.pcommands.size);
  } finally {
    global.logger = oldLogger;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
