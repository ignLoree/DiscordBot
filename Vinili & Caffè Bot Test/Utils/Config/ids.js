const path = require("path");
const configPath = path.join(__dirname, "..", "..", "config.json");
let config = {};
try {
  config = require(configPath);
} catch (e) {}

const MAIN_GUILD_ID =
  config.mainGuildId || process.env.MAIN_GUILD_ID || "1329080093599076474";
const GUILD_TEST_ID = "1462458562507964584";

const IDs = {
  guilds: {
    main: MAIN_GUILD_ID,
    test: GUILD_TEST_ID,
  },
  channels: {
    ticketLogs: config.channels?.ticketLogs || "1442569290682208296",
    verifyLog: config.channels?.verifyLog || null,
    verifyPing: config.channels?.verifyPing || null,
    errorLogChannel: config.channels?.errorLogChannel || "1466489404867481802",
    serverBotLogs: config.channels?.serverBotLogs || "1472733599496409292",
    commands: config.channels?.commands || null,
    staffCmds: config.channels?.staffCmds || null,
    highCmds: config.channels?.highCmds || null,
  },
  roles: {},
};

module.exports = IDs;
