const discord = require("discord.js");
const { Client, Collection, IntentsBitField, Options } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const fs = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const APP_ROOT = __dirname;

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

loadEnvFiles();
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-test-bot");
}

const installProcessHandlers = require("./Handlers/processHandler");
installProcessHandlers();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
  presence: { status: "invisible" },
  rest: {
    timeout: 12_000,
    offset: 50,
    retries: 2,
  },
  ...(typeof Options?.cacheWithLimits === "function" && {
    makeCache: Options.cacheWithLimits({
      ...(Options.DefaultMakeCacheSettings || {}),
      MessageManager: 100,
      GuildMemberManager: 200,
      PresenceManager: 0,
      ReactionManager: 50,
    }),
  }),
  ...(typeof Options?.DefaultSweeperSettings === "object" && {
    sweepers: {
      ...(Options.DefaultSweeperSettings || {}),
      messages: { interval: 300, lifetime: 600 },
    },
  }),
});

try {
  client.config = require("./config.json");
} catch (err) {
  global.logger.error(
    " config.json mancante o non valido:",
    err && err.message ? err.message : err,
  );
  process.exit(1);
}

client.config.token = process.env.DISCORD_TOKEN_TEST || client.config.token;
client.config.mongoURL =
  process.env.MONGO_URL || process.env.MONGODB_URI || client.config.mongoURL;

if (!client.config.token) {
  global.logger.error(
    " Manca DISCORD_TOKEN_TEST nel .env. Aggiungi DISCORD_TOKEN_TEST=<token del Bot Test> nel file .env (nella cartella principale del progetto). Non usare il token del bot ufficiale.",
  );
  process.exit(1);
}

client.logs = require("./Utils/Moderation/logs");
client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();

const handlerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Handlers"));
for (const file of handlerFiles) {
  require(path.join(APP_ROOT, "Handlers", file))(client);
}

const prefixFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));
const triggerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Triggers"));

(async () => {
  if (typeof client.prefixCommands === "function") {
    await client
      .prefixCommands(prefixFolders, path.join(APP_ROOT, "Prefix"))
      .catch((err) => {
        global.logger.error(" prefixCommands:", err);
      });
  }

  if (typeof client.handleEvents === "function") {
    client.handleEvents(path.join(APP_ROOT, "Events"));
  }

  if (typeof client.handleCommands === "function") {
    await client
      .handleCommands(commandFolders, path.join(APP_ROOT, "Commands"))
      .catch((err) => {
        global.logger.error(" handleCommands:", err);
      });
  }

  if (typeof client.handleTriggers === "function") {
    await client.handleTriggers(triggerFiles, APP_ROOT).catch((err) => {
      global.logger.error(" handleTriggers:", err);
    });
  }

  if (typeof client.logBootTables === "function") {
    client.logBootTables();
  }

  client.login(client.config.token).catch((err) => {
    global.logger.error("Login fallito:", err);
    process.exit(1);
  });
})();


