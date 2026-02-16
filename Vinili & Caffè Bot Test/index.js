/**
 * Vinili & Caffè Bot Test – funzionalità server sponsor (ticket, verify, panel).
 * Usa lo stesso MongoDB del bot principale. Token Discord separato.
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const APP_ROOT = __dirname;

const dotenv = require('dotenv');
const envCandidates = [
    path.join(APP_ROOT, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(APP_ROOT, '.env')
];
for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, quiet: true, override: false });
    }
}

global.logger = require('./Utils/Moderation/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

client.config = require('./config.json');
client.config.token = process.env.DISCORD_TOKEN_TEST || process.env.DISCORD_TOKEN || client.config.token;
client.config.mongoURL = process.env.MONGO_URL || process.env.MONGODB_URI || client.config.mongoURL;

if (!client.config.token) {
    global.logger.error('Manca DISCORD_TOKEN. Imposta .env o config.json.');
    process.exit(1);
}

client.logs = global.logger;

// Handlers
const eventHandler = require('./Handlers/eventHandler');
eventHandler(client);

// Carica eventi e avvia
client.handleEvents(path.join(APP_ROOT, 'Events'));
client.login(client.config.token).catch((err) => {
    global.logger.error('Login fallito:', err);
    process.exit(1);
});
