const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const permissionsPath = path.join(root, "permissions.json");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

(function main() {
  const permissions = JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
  const prefix = permissions?.prefix || {};

  const securityPerms = prefix.security?.subcommands || {};
  let securityCmd = null;
  try {
    securityCmd = require(path.join(root, "Prefix", "Admin", "security.js"));
  } catch {
    securityCmd = require(path.join(root, "Prefix", "Staff", "security.js"));
  }

  const requiredSecuritySubs = Array.isArray(securityCmd?.subcommands)
    ? securityCmd.subcommands
    : [];
  assert(requiredSecuritySubs.length > 0, "security.subcommands mancante");
  for (const sub of requiredSecuritySubs) {
    assert(Array.isArray(securityPerms[sub]), `permissions.security.${sub} mancante`);
  }

  const staticsPerm = prefix.statics;
  assert(staticsPerm && Array.isArray(staticsPerm.roles), "permissions.statics mancante");
  assert(prefix.security && Array.isArray(prefix.security.roles), "permissions.security mancante");

  const birthdayService = require(path.join(root, "Services", "Community", "birthdayService.js"));
  const birthdayStatus = birthdayService.getBirthdayLoopStatus?.();
  assert(birthdayStatus && typeof birthdayStatus.active === "boolean", "birthday loop status non disponibile");

  const reminderService = require(path.join(root, "Services", "Community", "chatReminderService.js"));
  const reminderStatus = reminderService.getChatReminderLoopStatus?.();
  assert(reminderStatus && typeof reminderStatus.active === "boolean", "chat reminder loop status non disponibile");
  assert(Array.isArray(securityCmd.subcommands), "security.subcommands mancante");
  assert(securityCmd.subcommands.includes("antinuke"), "security subcommand antinuke mancante");
  assert(securityCmd.subcommands.includes("raid"), "security subcommand raid mancante");

  console.log("CRITICAL_SYSTEMS_TEST_OK");
})();
