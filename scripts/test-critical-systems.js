const fs = require("fs");
const path = require("path");

function getBotRoot() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const botFolder = process.argv[2] || process.env.BOT_FOLDER || "Vinyls";
  return path.join(workspaceRoot, botFolder);
}

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

function run(root) {
  const cwdOrig = process.cwd();
  try {
    process.chdir(root);
  } catch {
    // ignore
  }

  const permissionsPath = path.join(root, "permissions.json");
  const prefixRoot = path.join(root, "Prefix");

  assert(fs.existsSync(permissionsPath), "permissions.json mancante");
  const permissions = JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
  const prefix = permissions?.prefix || {};
  const prefixPerms = prefix;

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
    const aliasMap = mod.subcommandAliases && typeof mod.subcommandAliases === "object" ? mod.subcommandAliases : null;
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

  const hasJoinRaid = fs.existsSync(path.join(root, "Services", "Moderation", "joinRaidService.js"));
  if (hasJoinRaid) {
    const securityPerms = prefix.security?.subcommands || {};
    let securityCmd = null;
    try {
      securityCmd = require(path.join(root, "Prefix", "Admin", "security.js"));
    } catch {
      try {
        securityCmd = require(path.join(root, "Prefix", "Staff", "security.js"));
      } catch {
        securityCmd = null;
      }
    }
    assert(securityCmd, "security.js (Admin o Staff) mancante");
    const requiredSecuritySubs = Array.isArray(securityCmd?.subcommands)
      ? [...new Set(securityCmd.subcommands.map((sub) => String(sub || "").trim().split(/\s+/)[0]).filter(Boolean))]
      : [];
    assert(requiredSecuritySubs.length > 0, "security.subcommands mancante");
    for (const sub of requiredSecuritySubs) {
      assert(Array.isArray(securityPerms[sub]), `permissions.security.${sub} mancante`);
    }
    assert(prefix.security && Array.isArray(prefix.security.roles), "permissions.security mancante");
    assert(Array.isArray(securityCmd.subcommands), "security.subcommands mancante");

    const birthdayService = require(path.join(root, "Services", "Community", "birthdayService.js"));
    const birthdayStatus = birthdayService.getBirthdayLoopStatus?.();
    assert(birthdayStatus && typeof birthdayStatus.active === "boolean", "birthday loop status non disponibile");

    const joinRaidService = require(path.join(root, "Services", "Moderation", "joinRaidService.js"));
    const joinRaidCfg = joinRaidService.getJoinRaidConfigSnapshot?.();
    assert(joinRaidCfg && typeof joinRaidCfg.lockCommands === "boolean", "joinRaid.lockCommands mancante");

    const orchestrator = require(path.join(root, "Services", "Moderation", "securityOrchestratorService.js"));
    const lockDecisionA = orchestrator.buildSecurityLockDecision?.({
      antiNukePanic: false,
      autoModPanic: false,
      joinRaid: true,
      lockAllCommands: true,
      joinRaidLockCommands: false,
    });
    assert(lockDecisionA && lockDecisionA.joinLockActive === true, "security decision A join lock errato");
    assert(lockDecisionA.commandLockActive === false, "security decision A command lock errato");
    const lockDecisionB = orchestrator.buildSecurityLockDecision?.({
      antiNukePanic: false,
      autoModPanic: false,
      joinRaid: true,
      lockAllCommands: true,
      joinRaidLockCommands: true,
    });
    assert(lockDecisionB && lockDecisionB.commandLockActive === true, "security decision B command lock errato");

    const automodService = require(path.join(root, "Services", "Moderation", "automodService.js"));
    const detectCmd = automodService?.__test?.isLikelyCommandMessage;
    assert(typeof detectCmd === "function", "automod __test isLikelyCommandMessage mancante");
    assert(detectCmd({ content: "+help", client: { config: { prefix: "+" } } }) === true, "automod command detection '+' errata");
    assert(detectCmd({ content: "!raid", client: { config: { prefix: "+" } } }) === false, "automod command detection '!' non deve bypassare");
    const explainDecision = automodService?.__test?.buildAutoModDecisionExplain;
    assert(typeof explainDecision === "function", "automod __test buildAutoModDecisionExplain mancante");
    const explainText = explainDecision("timeout", 120, [{ key: "link_blacklist", heat: 100 }, { key: "attachment_image", heat: 20 }]);
    assert(
      typeof explainText === "string" && explainText.includes("timeout") && explainText.includes("top_rules="),
      "automod decision explain non valido",
    );
  }

  const setJsPath = path.join(root, "Prefix", "TTS", "set.js");
  const ttsServicePath = path.join(root, "Services", "TTS", "ttsService.js");
  if (fs.existsSync(setJsPath) && prefixPerms?.set) {
    const setPerms = prefixPerms.set?.subcommands || {};
    assert(Array.isArray(setPerms.voice), "permissions.prefix.set.subcommands.voice mancante");
    assert(Array.isArray(setPerms.autojoin), "permissions.prefix.set.subcommands.autojoin mancante");

    const setCmd = require(setJsPath);
    assert(Array.isArray(setCmd.subcommands), "set.subcommands mancante");
    assert(setCmd.subcommands.includes("voice"), "set subcommand voice mancante");
    assert(setCmd.subcommands.includes("autojoin"), "set subcommand autojoin mancante");

    if (fs.existsSync(ttsServicePath)) {
      const requiredPrefixCommands = ["help", "join", "leave", "set", "voices"];
      for (const cmd of requiredPrefixCommands) {
        assert(prefixPerms[cmd], `permissions.prefix.${cmd} mancante`);
      }
      const ttsService = require(ttsServicePath);
      assert(typeof ttsService.handleTtsMessage === "function", "ttsService.handleTtsMessage mancante");
      assert(typeof ttsService.joinTtsChannel === "function", "ttsService.joinTtsChannel mancante");
      assert(typeof ttsService.leaveTtsGuild === "function", "ttsService.leaveTtsGuild mancante");
    }
  }

  console.log("CRITICAL_SYSTEMS_TEST_OK");
  try {
    process.chdir(cwdOrig);
  } catch {
    // ignore
  }
}

if (require.main === module) {
  try {
    run(getBotRoot());
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} else {
  module.exports = run;
}