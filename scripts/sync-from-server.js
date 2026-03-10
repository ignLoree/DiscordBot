/**
 * Scarica dal server i file generati/aggiornati dal bot (es. idsCatalog.js).
 * Esegui dalla root del progetto: node scripts/sync-from-server.js
 *
 * Configura nel .env (root):
 *   SYNC_SERVER=user@host     (es. root@myserver.com)
 *   SYNC_REMOTE_PATH=/opt/bot (path sul server dove sta il progetto)
 *
 * Su Windows serve OpenSSH (scp) in PATH; su Linux/macOS è incluso.
 */
const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const TEMP_PREFIX = "sync-from-server-";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const SYNC_SERVER = env.SYNC_SERVER || process.env.SYNC_SERVER;
const SYNC_REMOTE_PATH = (env.SYNC_REMOTE_PATH || process.env.SYNC_REMOTE_PATH || "/opt/bot").replace(/\\/g, "/").replace(/\/+$/, "");

const FILES = [
  "Vinyls/Utils/Config/idsCatalog.js",
  "Vinyls/Utils/Config/helpNewUntil.json",
];

if (!SYNC_SERVER) {
  console.error("Manca SYNC_SERVER nel .env. Esempio: SYNC_SERVER=user@host SYNC_REMOTE_PATH=/opt/bot");
  process.exit(1);
}

for (const rel of FILES) {
  const remote = `${SYNC_SERVER}:${SYNC_REMOTE_PATH}/${rel}`;
  const localDir = path.join(ROOT, path.dirname(rel));
  const localPath = path.join(ROOT, rel);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const tempPath = path.join(ROOT, path.dirname(rel), TEMP_PREFIX + path.basename(rel));
  try {
    const quotedRemote = remote.includes(" ") ? `"${remote}"` : remote;
    const quotedTemp = tempPath.includes(" ") ? `"${tempPath.replace(/"/g, '\\"')}"` : tempPath;
    execSync(`scp ${quotedRemote} ${quotedTemp}`, { stdio: "pipe", cwd: ROOT, shell: true });
    const remoteContent = fs.readFileSync(tempPath, "utf8");
    const localExists = fs.existsSync(localPath);
    const localContent = localExists ? fs.readFileSync(localPath, "utf8") : "";
    if (localContent === remoteContent) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      continue;
    }
    fs.writeFileSync(localPath, remoteContent, "utf8");
    try { fs.unlinkSync(tempPath); } catch (_) {}
    console.log("Aggiornato:", rel);
  } catch (e) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    const ext = path.extname(rel).toLowerCase();
    const placeholder = ext === ".json" ? "{}" : "module.exports = {};\n";
    if (!fs.existsSync(localPath)) {
      fs.writeFileSync(localPath, placeholder, "utf8");
      console.warn("Creato placeholder locale (file assente sul server):", rel);
    }
  }
}

console.log("Sync completato.");
