const discord = require("discord.js");
const { Client, IntentsBitField, Options } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const fs = require("fs");
const path = require("path");
const APP_ROOT = __dirname;
const { acquireSingleInstanceLock, installHandlers, listFoldersIfExists, loadEnvFiles, } = require("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime");

loadEnvFiles(APP_ROOT);
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-official-bot");
}

const { installEmbedFooterPatch } = require("./Utils/Embeds/defaultFooter");

const pcommandFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));

let client;

try {
  installEmbedFooterPatch();
  let baseIntents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessageTyping, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildIntegrations, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.GuildBans, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildWebhooks, GatewayIntentBits.AutoModerationExecution, GatewayIntentBits.AutoModerationConfiguration,].filter((x) => x !== undefined && x !== null);
  if (baseIntents.length === 0) baseIntents = [1];
  const basePartials = [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.ThreadMember,].filter((x) => x !== undefined && x !== null);

  client = new Client({
    intents: baseIntents,
    partials: basePartials,
    rest: {
      timeout: 15_000,
      offset: 50,
      retries: 2,
    },
    ...(typeof Options?.cacheWithLimits === "function" && {
      makeCache: Options.cacheWithLimits({
        ...(Options.DefaultMakeCacheSettings || {}),
        MessageManager: 150,
        GuildMemberManager: 300,
        PresenceManager: 0,
        ReactionManager: 50,
      }),
    }),
    ...(typeof Options?.DefaultSweeperSettings === "object" && {
      sweepers: {
        ...(Options.DefaultSweeperSettings || {}),
        messages: { interval: 300, lifetime: 900 },
      },
    }),
  });
} catch (error) {
  global.logger.error("[ERROR] Error while creating the client.", error);
  process.exit(1);
}

client.logs = require("./Utils/Moderation/logs");
client.config = require("./config.json");

const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
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
  const clearCacheByDir = (dirName) => { const abs = path.join(APP_ROOT, dirName); if (!fs.existsSync(abs)) return; for (const key of Object.keys(require.cache)) { if (!key.startsWith(abs)) continue; delete require.cache[key]; } };

  const reloadCommands = async () => { clearCacheByDir("Commands"); const folders = listFoldersIfExists(path.join(APP_ROOT, "Commands")); await client.handleCommands(folders, path.join(APP_ROOT, "Commands")); };

  const reloadPrefix = async () => { clearCacheByDir("Prefix"); const folders = listFoldersIfExists(path.join(APP_ROOT, "Prefix")); await client.prefixCommands(folders, path.join(APP_ROOT, "Prefix")); };

  const reloadEvents = () => { clearCacheByDir("Events"); client.handleEvents(path.join(APP_ROOT, "Events")); };

  const reloadTriggers = () => { clearCacheByDir("Triggers"); client.handleTriggers(APP_ROOT); };

  if (scope === "commands") return reloadCommands();
  if (scope === "prefix") return reloadPrefix();
  if (scope === "events") return reloadEvents();

  const reloadButtons = async () => { clearCacheByDir("Buttons"); await client.loadButtonHandlers(path.join(APP_ROOT, "Buttons")); };

  if (scope === "triggers") return reloadTriggers();
  if (scope === "buttons") return reloadButtons();
  if (scope === "services") return clearCacheByDir("Services");
  if (scope === "utils") return clearCacheByDir("Utils");
  if (scope === "schemas") return clearCacheByDir("Schemas");

  if (scope === "handlers") {
    await reloadCommands();
    await reloadPrefix();
    reloadEvents();
    reloadTriggers();
    await reloadButtons();
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
    await reloadButtons();
  }
};

initializeCommandCollections(client, { includeSnipes: true });

(async () => {
  try {
    installHandlers(APP_ROOT, client);

    client.handleEvents(path.join(APP_ROOT, "Events"));
    client.handleTriggers(APP_ROOT);
    await client.handleCommands(commandFolders, path.join(APP_ROOT, "Commands"));
    await client.prefixCommands(pcommandFolders, path.join(APP_ROOT, "Prefix"));
    await client.loadButtonHandlers(path.join(APP_ROOT, "Buttons"));

    if (typeof client.logBootTables === "function") {
      client.logBootTables();
    }

    client.once("ready", () => {
      client.emit("clientReady", client);
    });
    const { getPlayer } = require("./Services/Music/musicService");
    await getPlayer(client).catch(() => {});

    client.login(client.config.token).catch((error) => {
      global.logger.error(
        "[LOGIN] Error while logging in. Check if your token is correct or double check your also using the correct intents.",
        error,
      );
      process.exit(1);
    });
  } catch (err) {
    if (global.logger && typeof global.logger.error === "function") {
      global.logger.error("[STARTUP]", err);
    }
  }
})();