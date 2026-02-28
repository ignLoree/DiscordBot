const discord = require("discord.js");
const { Client, Collection, IntentsBitField } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const fs = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const APP_ROOT = __dirname;
const { startDashboardServer } = require("./Services/Dashboard/dashboardServer");

function loadEnvFiles() {
  const envCandidates = [
    path.join(APP_ROOT, "..", ".env"),
    path.join(process.cwd(), ".env"),
    path.join(APP_ROOT, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true, override: false });
  }
}

function listFoldersIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath);
}

function listJsFilesIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter((file) => file.endsWith(".js"));
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

  const writeLock = () =>
    fs.writeFileSync(lockPath, String(pid), { flag: "wx", encoding: "utf8" });

  try {
    writeLock();
  } catch (error) {
    if (!error || error.code !== "EEXIST") throw error;

    let existingPid = null;
    try {
      existingPid = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
    } catch {}

    if (isPidAlive(existingPid)) {
      if (global.logger && typeof global.logger.error === "function") {
        global.logger.error(
          `[LOGIN] Another instance is already running (PID: ${existingPid}). Exiting.`,
        );
      }
      process.exit(1);
    }

    try {
      fs.unlinkSync(lockPath);
    } catch {}

    writeLock();
  }

  const release = () => {
    try {
      const current = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
      if (current === pid) fs.unlinkSync(lockPath);
    } catch {}
  };

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

function installHandlers(client) {
  const handlerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Handlers"));
  for (const file of handlerFiles) {
    require(`./Handlers/${file}`)(client);
  }
}

loadEnvFiles();
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-official-bot");
}

const { installEmbedFooterPatch } = require("./Utils/Embeds/defaultFooter");

const triggerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Triggers"));
const pcommandFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));

let client;
try {
  installEmbedFooterPatch();

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessageTyping,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildScheduledEvents,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildIntegrations,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.AutoModerationExecution,
      GatewayIntentBits.AutoModerationConfiguration,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.User,
      Partials.GuildMember,
      Partials.GuildScheduledEvent,
      Partials.ThreadMember,
    ],
  });
} catch (error) {
  global.logger.error("[ERROR] Error while creating the client.", error);
  process.exit(1);
}

client.logs = require("./Utils/Moderation/logs");
client.config = require("./config.json");

const envToken =
  process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const envMongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
client.config.token = envToken || client.config.token;
client.config.mongoURL = envMongoUrl || client.config.mongoURL;

if (!client.config.token) {
  global.logger.error(
    "[LOGIN] Missing bot token. Set DISCORD_TOKEN (or DISCORD_TOKEN_OFFICIAL) in .env.",
  );
  process.exit(1);
}

global.botClient = client;

client.reloadScope = async (scope) => {
  const clearCacheByDir = (dirName) => {
    const abs = path.join(APP_ROOT, dirName);
    if (!fs.existsSync(abs)) return;

    for (const key of Object.keys(require.cache)) {
      if (!key.startsWith(abs)) continue;
      delete require.cache[key];
    }
  };

  const reloadCommands = async () => {
    clearCacheByDir("Commands");
    const folders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));
    await client.handleCommands(folders, path.join(APP_ROOT, "Commands"));
  };

  const reloadPrefix = async () => {
    clearCacheByDir("Prefix");
    const folders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
    await client.prefixCommands(folders, path.join(APP_ROOT, "Prefix"));
  };

  const reloadEvents = () => {
    clearCacheByDir("Events");
    client.handleEvents(path.join(APP_ROOT, "Events"));
  };

  const reloadTriggers = () => {
    clearCacheByDir("Triggers");
    const files = listJsFilesIfExists(path.join(APP_ROOT, "Triggers"));
    client.handleTriggers(files, APP_ROOT);
  };

  if (scope === "commands") return reloadCommands();
  if (scope === "prefix") return reloadPrefix();
  if (scope === "events") return reloadEvents();
  if (scope === "triggers") return reloadTriggers();
  if (scope === "services") return clearCacheByDir("Services");
  if (scope === "utils") return clearCacheByDir("Utils");
  if (scope === "schemas") return clearCacheByDir("Schemas");

  if (scope === "handlers") {
    await reloadCommands();
    await reloadPrefix();
    reloadEvents();
    reloadTriggers();
    return;
  }

  if (scope === "all") {
    clearCacheByDir("Services");
    clearCacheByDir("Utils");
    clearCacheByDir("Schemas");
    await reloadCommands();
    await reloadPrefix();
    reloadEvents();
    reloadTriggers();
  }
};

client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();
client.snipes = new Map();

(async () => {
  try {
    installHandlers(client);

    client.handleEvents(path.join(APP_ROOT, "Events"));
    client.handleTriggers(triggerFiles, APP_ROOT);
    await client.handleCommands(commandFolders, path.join(APP_ROOT, "Commands"));
    await client.prefixCommands(pcommandFolders, path.join(APP_ROOT, "Prefix"));
    startDashboardServer(client);

    if (typeof client.logBootTables === "function") {
      client.logBootTables();
    }

    client.login(client.config.token).catch((error) => {
      global.logger.error(
        "[LOGIN] Error while logging in. Check if your token is correct or double check your also using the correct intents.",
        error,
      );
    });
  } catch (err) {
    if (global.logger && typeof global.logger.error === "function") {
      global.logger.error("[STARTUP]", err);
    }
  }
})();