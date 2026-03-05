const { BACKUP_LOAD_PREFIXES } = require("../ids/backup");
const { handleBackupLoadInteraction } = require("../../Services/Backup/backupLoadService");

const name = "backupLoad";
const label = "Backup Load";
const description = "Sessioni di ripristino backup: azioni, limite messaggi, conferma, annulla.";
const order = 1;

function match(interaction) {
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  const id = String(interaction.customId || "");
  return BACKUP_LOAD_PREFIXES.some((p) => id.startsWith(p));
}

async function execute(interaction) {
  return handleBackupLoadInteraction(interaction);
}

module.exports = { name, label, description, order, match, execute };
