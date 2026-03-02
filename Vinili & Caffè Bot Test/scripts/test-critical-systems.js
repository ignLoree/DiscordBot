const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const permissionsPath = path.join(root, "permissions.json");
const prefixRoot = path.join(root, "Prefix");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function walkJsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

(function main() {
  const permissions = JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
  const prefixPerms = permissions?.prefix || {};

  const requiredPrefixCommands = ["help", "join", "leave", "set", "voices", "restart"];
  for (const cmd of requiredPrefixCommands) {
    assert(prefixPerms[cmd], `permissions.prefix.${cmd} mancante`);
  }

  const setPerms = prefixPerms.set?.subcommands || {};
  assert(Array.isArray(setPerms.voice), "permissions.prefix.set.subcommands.voice mancante");
  assert(Array.isArray(setPerms.autojoin), "permissions.prefix.set.subcommands.autojoin mancante");

  const setCmd = require(path.join(root, "Prefix", "TTS", "set.js"));
  assert(Array.isArray(setCmd.subcommands), "set.subcommands mancante");
  assert(setCmd.subcommands.includes("voice"), "set subcommand voice mancante");
  assert(setCmd.subcommands.includes("autojoin"), "set subcommand autojoin mancante");

  const prefixFiles = walkJsFiles(prefixRoot);
  const missingAliasPermissions = [];
  for (const file of prefixFiles) {
    let mod = null;
    try {
      mod = require(file);
    } catch {
      continue;
    }
    if (!mod || typeof mod !== "object") continue;
    const commandName = String(mod.name || "").toLowerCase();
    if (!commandName) continue;
    const aliasMap =
      mod.subcommandAliases && typeof mod.subcommandAliases === "object"
        ? mod.subcommandAliases
        : null;
    if (!aliasMap) continue;
    const commandPerm = prefixPerms?.[commandName];
    const subcommands = commandPerm?.subcommands;
    if (!subcommands || typeof subcommands !== "object") continue;
    for (const [alias, target] of Object.entries(aliasMap)) {
      const aliasKey = String(alias || "").trim();
      const targetKey = String(target || "").trim();
      if (!aliasKey || !targetKey) continue;
      if (Object.prototype.hasOwnProperty.call(subcommands, aliasKey)) continue;
      if (!Object.prototype.hasOwnProperty.call(subcommands, targetKey)) continue;
      missingAliasPermissions.push(`${commandName}.${aliasKey}->${targetKey}`);
    }
  }
  assert(
    missingAliasPermissions.length === 0,
    `alias permissions mancanti: ${missingAliasPermissions.join(", ")}`,
  );

  const ttsService = require(path.join(root, "Services", "TTS", "ttsService.js"));
  assert(typeof ttsService.handleTtsMessage === "function", "ttsService.handleTtsMessage mancante");
  assert(typeof ttsService.joinTtsChannel === "function", "ttsService.joinTtsChannel mancante");
  assert(typeof ttsService.leaveTtsGuild === "function", "ttsService.leaveTtsGuild mancante");

  console.log("CRITICAL_SYSTEMS_TEST_OK");
})();