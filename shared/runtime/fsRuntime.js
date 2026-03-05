const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

function loadEnvFiles(appRoot = process.cwd()) {
  const safeAppRoot=typeof appRoot==="string"&&appRoot.trim().length>0?appRoot:process.cwd();
  const envCandidates=[path.join(safeAppRoot,".env"),path.join(safeAppRoot,"..",".env"),path.join(process.cwd(),".env"),];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true, override: false });
  }
}

function listFoldersIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listJsFilesIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listJsFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const files = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(fullPath);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireSingleInstanceLock(lockName) {
  const lockPath = path.join(os.tmpdir(), `${lockName}.lock`);
  const pid = process.pid;

  const writeLock=()=>fs.writeFileSync(lockPath,String(pid),{flag:"wx",encoding:"utf8"});

  try {
    writeLock();
  } catch (error) {
    if (!error || error.code !== "EEXIST") throw error;

    let existingPid = null;
    try {
      existingPid = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
    } catch {}

    if (isPidAlive(existingPid)) {
      global.logger?.error?.(
        `[LOGIN] Another instance is already running (PID: ${existingPid}). Exiting.`,
      );
      process.exit(1);
    }

    try {
      fs.unlinkSync(lockPath);
    } catch {}

    writeLock();
  }

  const release=()=>{try {const current=Number.parseInt(fs.readFileSync(lockPath,"utf8"),10);if(current===pid)fs.unlinkSync(lockPath);} catch {}};

  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit();
  });
  process.on("SIGTERM", () => {
    release();
    process.exit();
  });
}

function installHandlers(appRoot, client) {
  const handlersDir = path.join(appRoot, "Handlers");
  const handlerFiles = listJsFilesIfExists(handlersDir);
  for (const file of handlerFiles) {
    require(path.join(handlersDir, file))(client);
  }
}

module.exports = { acquireSingleInstanceLock, installHandlers, listFoldersIfExists, listJsFilesIfExists, listJsFilesRecursive, loadEnvFiles };