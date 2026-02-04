const config = require('../config.json');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const mongodbURL = config.mongoURL;
const config2 = require('../config.js');
const { restorePendingReminders } = require('../Services/Disboard/disboardReminderService');
const { restorePendingDiscadiaReminders } = require('../Services/Discadia/discadiaReminderService');
const { startDiscadiaVoteReminderLoop } = require('../Services/Discadia/discadiaVoteReminderService');
const { bootstrapSupporter } = require('./presenceUpdate');
const { maybeRunMorningReminder } = require('../Services/Community/morningReminderService');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

const getChannelSafe = async (client, channelId) => {
    if (!channelId) return null;
    return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
};

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        let logOnce = true;
        client.setMaxListeners(client.config2.eventListeners || 20);
        if (!mongodbURL) {
            client.logs.error('[DATABASE] No MongoDB URL has been provided. Double check your config.json file and make sure it is correct.');
            return;
        }
        try {
            mongoose.set('strictQuery', false);
            await mongoose.connect(mongodbURL || '', {
                serverSelectionTimeoutMS: 10000,
            });
        } catch (err) {
            client.logs.error(`[DATABASE] Error connecting to the database: ${err}`);
            return;
        }
        if (mongoose.connect && logOnce) {
            client.logs.success('[DATABASE] Connected to MongoDB successfully.');
        }
        require('events').EventEmitter.defaultMaxListeners = config2.eventListeners;
        try {
            await restorePendingReminders(client);
        } catch (err) {
            global.logger.error('[DISBOARD REMINDER ERROR]', err);
        }
        try {
            await restorePendingDiscadiaReminders(client);
        } catch (err) {
            global.logger.error('[DISCADIA REMINDER ERROR]', err);
        }
        try {
            startDiscadiaVoteReminderLoop(client);
        } catch (err) {
            global.logger.error('[DISCADIA VOTE REMINDER ERROR]', err);
        }
        try {
            await bootstrapSupporter(client);
        } catch (err) {
            global.logger.error('[PRESENCE BOOTSTRAP ERROR]', err);
        }
        try {
            client.inviteCache = new Map();
            for (const guild of client.guilds.cache.values()) {
                const invites = await guild.invites.fetch().catch(() => null);
                if (!invites) continue;
                const map = new Map();
                for (const invite of invites.values()) {
                    map.set(invite.code, {
                        uses: invite.uses || 0,
                        inviterId: invite.inviter?.id || null
                    });
                }
                client.inviteCache.set(guild.id, map);
            }
        } catch (err) {
            global.logger.error('[INVITE CACHE] Failed to prime:', err);
        }
        try {
            await restoreTtsConnections(client);
        } catch (err) {
            global.logger.error('[TTS RESTORE ERROR]', err);
        }
        const engagementTick = async () => {
            try {
                await maybeRunMorningReminder(client);
                await runDueOneTimeReminders(client);
            } catch (err) {
                global.logger.error(err);
            }
        };
        await engagementTick();
        setInterval(engagementTick, 60 * 1000);
        try {
            cron.schedule("0 0 1 * *", async () => {
                const channelId = "1442569130573303898";
                const channel = await getChannelSafe(client, channelId);
                if (!channel) return;
                await channel.send({
                    content: "@everyone",
                    files: [
                        {
                            attachment: "https://media.tenor.com/crZirRXKLuQAAAAC/manhdz2k9.gif",
                            name: "monthly.gif"
                        }
                    ]
                });
            }, { timezone: "Europe/Rome" });
        } catch (err) {
            global.logger.error('[MONTHLY GIF] Failed to schedule', err);
        }
        const REMINDER_CHANNEL_ID = "1442569130573303898";
        const REMINDER_MIN_MS = 1 * 60 * 60 * 1000;
        const REMINDER_MAX_MS = 2 * 60 * 60 * 1000;
        const ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

        const reminderPool = [
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("⭐ Votaci su Discadia!")
                .setDescription(
                    [
                        "La prima volta otterrai **250 EXP**, le altre volte altri exp!",
                        "Vota qui: https://discadia.com/server/viniliecaffe/"
                    ].join("\n")
                ),
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("⭐ Lascia una recensione su DISBOARD!")
                .setDescription(
                    [
                        "Lasciare un recensione aiuta il server a farci conoscere e crescere, una volta messa la recensione apri un <#1442569095068254219> `HIGH STAFF` e riceverei **5 livelli**!",
                        "Recensisci il nostro server qui: https://disboard.org/it/review/update/1019527"
                    ].join("\n")
                ),
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("📌 Marca un messaggio e rendilo un post")
                .setDescription(
                    [
                        "Rispondendo al messaggio con <@1329118940110127204> o con tasto destro -> App -> Quote, che si vuole postare, potrai poi vederlo nel canale <#1468540884537573479>"
                    ].join("\n")
                ),
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("🔢 Conta fino all'infinito!")
                .setDescription(
                    [
                        "Sei un appasionato di calcoli e matematica? Vieni a contare nel canale <#1442569179743125554>"
                    ].join("\n")
                ),
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("💌 Devi segnalare un utente, fare una partnership o ti serve supporto?")
                .setDescription(
                    [
                        "Attraverso i ticket nel canale <#1442569095068254219> puoi contattare un membro dello Staff che ti darà una mano per ogni tua richiesta."
                    ].join("\n")
                ),
            () => new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("📸 Sblocca i Picperms")
                .setDescription(
                    [
                        `Puoi sbloccarli in modo veloce mettendo ".gg/viniliecaffe" nello stato del tuo profilo Discord, potenziando il server oppure salendo al Livello 20.`,
                        `> <a:VC_Arrow:1448672967721615452> Scopri tutte le ricompense dei boost & livelli su: <#1442569159237177385>`
                    ].join("\n")
                )
        ];

        let rotationDate = new Date().toDateString();
        let rotationQueue = [];

        const shuffle = (arr) => {
            const copy = arr.slice();
            for (let i = copy.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        };

        const ensureRotation = () => {
            const today = new Date().toDateString();
            if (rotationDate !== today || rotationQueue.length === 0) {
                rotationDate = today;
                rotationQueue = shuffle(reminderPool);
            }
        };

        const hasRecentHumanMessage = async (channel) => {
            const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
            if (!messages) return false;
            const now = Date.now();
            return messages.some(m => !m.author?.bot && (now - m.createdTimestamp) <= ACTIVITY_WINDOW_MS);
        };

        const sendRotatingReminder = async () => {
            const channel = await getChannelSafe(client, REMINDER_CHANNEL_ID);
            if (!channel) return;
            const isActive = await hasRecentHumanMessage(channel);
            if (!isActive) return;
            ensureRotation();
            const next = rotationQueue.shift();
            if (!next) return;
            const embed = next();
            await channel.send({ embeds: [embed] }).catch(() => {});
        };

        const scheduleNextReminder = () => {
            const delay = Math.floor(Math.random() * (REMINDER_MAX_MS - REMINDER_MIN_MS + 1)) + REMINDER_MIN_MS;
            setTimeout(async () => {
                try {
                    await sendRotatingReminder();
                } finally {
                    scheduleNextReminder();
                }
            }, delay);
        };

        scheduleNextReminder();
        if (logOnce) {
            client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
        }
    },
};
