const discord = require("discord.js");
const { Client, IntentsBitField, Options } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const path = require("path");
const APP_ROOT = __dirname;
const {acquireSingleInstanceLock,installHandlers,listFoldersIfExists,loadEnvFiles,}= require("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime");

loadEnvFiles(APP_ROOT);
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-test-bot");
}

const installProcessHandlers = require("./Handlers/processHandler");
installProcessHandlers();

let intentList = [GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.DirectMessages,GatewayIntentBits.GuildMessageReactions,GatewayIntentBits.GuildModeration,].filter((x) => x !== undefined && x !== null);
if (intentList.length === 0) intentList = [1];
const partialList = [Partials.Message,Partials.Channel,Partials.Reaction,Partials.User,Partials.GuildMember,].filter((x) => x !== undefined && x !== null);
const client = new Client({intents:intentList,partials:partialList,presence:{status:"invisible"},rest:{timeout:12_000,offset:50,retries:2,},...(typeof Options ?. cacheWithLimits === "function" &&{makeCache:Options.cacheWithLimits({...(Options.DefaultMakeCacheSettings ||{}),MessageManager:100,GuildMemberManager:200,PresenceManager:0,ReactionManager:50,}),}),...(typeof Options ?. DefaultSweeperSettings === "object" &&{sweepers:{...(Options.DefaultSweeperSettings ||{}),messages:{interval:300,lifetime:600},},}),});

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
initializeCommandCollections(client);

installHandlers(APP_ROOT, client);

const prefixFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandsDir = path.join(APP_ROOT, "Commands");
const commandFolders = listFoldersIfExists(commandsDir);
if (commandFolders.length === 0 && !require("fs").existsSync(commandsDir)) {
  global.logger?.info?.("[COFFEE] Nessuna cartella Commands: nessuno slash command verrà registrato (solo bot Test).");
}

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
      .handleCommands(commandFolders, commandsDir)
      .catch((err) => {
        global.logger.error(" handleCommands:", err);
      });
  }

  if (typeof client.handleTriggers === "function") {
    await client.handleTriggers(APP_ROOT).catch((err) => {
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