const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
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

loadEnvFiles();
global.logger = require("./Utils/Moderation/logger");

const installProcessHandlers = require("./Handlers/processHandler");
installProcessHandlers();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
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
});

try {
  client.config = require("./config.json");
} catch (err) {
  global.logger.error(
    "[Bot Test] config.json mancante o non valido:",
    err?.message || err,
  );
  process.exit(1);
}

client.config.token = process.env.DISCORD_TOKEN_TEST || client.config.token;
client.config.mongoURL =
  process.env.MONGO_URL || process.env.MONGODB_URI || client.config.mongoURL;

if (!client.config.token) {
  global.logger.error(
    "[Bot Test] Manca DISCORD_TOKEN_TEST nel .env. Aggiungi DISCORD_TOKEN_TEST=<token del Bot Test> nel file .env (nella cartella principale del progetto). Non usare il token del bot ufficiale.",
  );
  process.exit(1);
}

client.logs = global.logger;
client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();

const handlerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Handlers"));
for (const file of handlerFiles) {
  require(path.join(APP_ROOT, "Handlers", file))(client);
}

const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));
const prefixFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const triggerFiles = listJsFilesIfExists(path.join(APP_ROOT, "Triggers"));

(async () => {
  if (typeof client.handleCommands === "function") {
    await client
      .handleCommands(commandFolders, path.join(APP_ROOT, "Commands"))
      .catch((err) => {
        global.logger.error("[Bot Test] handleCommands:", err);
      });
  }

  if (typeof client.prefixCommands === "function") {
    await client
      .prefixCommands(prefixFolders, path.join(APP_ROOT, "Prefix"))
      .catch((err) => {
        global.logger.error("[Bot Test] prefixCommands:", err);
      });
  }

  if (typeof client.handleEvents === "function") {
    client.handleEvents(path.join(APP_ROOT, "Events"));
  }

  if (typeof client.handleTriggers === "function") {
    await client.handleTriggers(triggerFiles, APP_ROOT).catch((err) => {
      global.logger.error("[Bot Test] handleTriggers:", err);
    });
  }

  client.login(client.config.token).catch((err) => {
    global.logger.error("Login fallito:", err);
    process.exit(1);
  });
})();
