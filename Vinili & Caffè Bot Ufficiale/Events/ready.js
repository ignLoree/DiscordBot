const config = require('../config.json');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { ActivityType } = require('discord.js');
const { restorePendingVoteReminders, restorePendingDiscadiaReminders, restorePendingReminders } = require('../Services/Bump/bumpService')
const { bootstrapSupporter } = require('./presenceUpdate');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const { startMinigameLoop, restoreActiveGames } = require('../Services/Minigames/minigameService');
const { startHourlyReminderLoop } = require('../Services/Community/chatReminderService');
const { startVerificationTenureLoop, backfillVerificationTenure, startVoteRoleCleanupLoop, runAllGuilds: renumberAllCategories, startCategoryNumberingLoop } = require('../Services/Community/communityOpsService');
const { startWeeklyActivityWinnersLoop } = require('../Services/Community/weeklyActivityWinnersService');
const { removeExpiredTemporaryRoles, startTemporaryRoleCleanupLoop } = require('../Services/Community/temporaryRoleService');
const { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop } = require('../Services/Community/customRoleExpiryService');
const { startDailyPartnerAuditLoop } = require('../Services/Partner/partnerAuditService');
const { startTicketAutoClosePromptLoop } = require('../Services/Ticket/ticketMaintenanceService');
const { startTranscriptCleanupLoop } = require('../Services/Ticket/ticketMaintenanceService');
const { retroSyncGuildLevels } = require('../Services/Community/expService');
const IDs = require('../Utils/Config/ids');
const startupPanelsTrigger = require('../Triggers/embeds');
const { queueIdsCatalogSync } = require('../Utils/Config/idsAutoSync');
const { scheduleMemberCounterRefresh } = require('../Utils/Community/memberCounterUtils');

const getChannelSafe = async (client, channelId) => {
    if (!channelId) return null;
    return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
};

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        client.setMaxListeners(client.config.eventListeners || 50);
        const mongodbURL = process.env.MONGO_URL || process.env.MONGODB_URI || client.config.mongoURL;
        let dbConnected = false;
        if (!mongodbURL) {
            client.logs.error('[DATABASE] No MongoDB URL has been provided. Set MONGO_URL (or MONGODB_URI) or fallback config.mongoURL.');
        } else {
            try {
                mongoose.set('strictQuery', false);
                mongoose.set('bufferCommands', false);
                if (mongoose.connection.readyState === 1) {
                    dbConnected = true;
                } else {
                    await mongoose.connect(mongodbURL, {
                        serverSelectionTimeoutMS: 3000,
                        connectTimeoutMS: 3000,
                        socketTimeoutMS: 15000,
                        maxPoolSize: 20,
                        minPoolSize: 1
                    });
                    dbConnected = true;
                }
            } catch (err) {
                client.logs.error(`[DATABASE] Error connecting to the database (continuo comunque il bootstrap): ${err}`);
            }
        }
        if (dbConnected) {
            client.logs.success('[DATABASE] Connected to MongoDB successfully.');
        }
        require('events').EventEmitter.defaultMaxListeners = config.eventListeners;
        const primaryScheduler = !client.shard || client.shard.ids?.[0] === 0;

        async function primeInviteCache() {
            client.inviteCache = new Map();
            for (const guild of client.guilds.cache.values()) {
                const invites = await guild.invites.fetch().catch(() => null);
                if (!invites) continue;
                const map = new Map();
                for (const invite of invites.values()) {
                    map.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id || null });
                }
                client.inviteCache.set(guild.id, map);
            }
        }

        if (primaryScheduler) {
            const [reminders, discadia, voteReminders] = await Promise.allSettled([
                restorePendingReminders(client),
                restorePendingDiscadiaReminders(client),
                restorePendingVoteReminders(client)
            ]);
            if (reminders.status === 'rejected') global.logger.error('[DISBOARD REMINDER ERROR]', reminders.reason);
            if (discadia.status === 'rejected') global.logger.error('[DISCADIA REMINDER ERROR]', discadia.reason);
            if (voteReminders.status === 'rejected') global.logger.error('[DISCADIA VOTE REMINDER ERROR]', voteReminders.reason);
            try { startDailyPartnerAuditLoop(client); } catch (err) { global.logger.error('[DAILY PARTNER AUDIT ERROR]', err); }
        }

        const [bootstrap, inviteCache, tts] = await Promise.allSettled([
            bootstrapSupporter(client),
            primeInviteCache(),
            restoreTtsConnections(client)
        ]);
        if (bootstrap.status === 'rejected') global.logger.error('[PRESENCE BOOTSTRAP ERROR]', bootstrap.reason);
        if (inviteCache.status === 'rejected') global.logger.error('[INVITE CACHE] Failed to prime:', inviteCache.reason);
        if (tts.status === 'rejected') global.logger.error('[TTS RESTORE ERROR]', tts.reason);

        if (primaryScheduler) {
            const mainGuild = client.guilds.cache.get(IDs.guilds.main) || await client.guilds.fetch(IDs.guilds.main).catch(() => null);
            let engagementTickRunning = false;
            const engagementTick = async () => {
                if (engagementTickRunning) return;
                engagementTickRunning = true;
                try { await runDueOneTimeReminders(client); } catch (err) { global.logger.error(err); }
                finally { engagementTickRunning = false; }
            };

            const runStartupPanelsOnce = async () => {
                if (client._startupPanelsRefreshRunning) return;
                client._startupPanelsRefreshRunning = true;
                try {
                    if (typeof startupPanelsTrigger?.execute === 'function') await startupPanelsTrigger.execute(client);
                } catch (err) {
                    global.logger.error('[CLIENT READY] Startup panels refresh failed:', err);
                } finally {
                    client._startupPanelsRefreshRunning = false;
                }
            };

            const heavyTasks = [
                mainGuild ? retroSyncGuildLevels(mainGuild, { syncRoles: true }) : Promise.resolve(),
                engagementTick(),
                restoreActiveGames(client),
                backfillVerificationTenure(client),
                renumberAllCategories(client),
                removeExpiredTemporaryRoles(client),
                runExpiredCustomRolesSweep(client),
                runStartupPanelsOnce()
            ];
            const results = await Promise.allSettled(heavyTasks);
            const errLabels = ['[LEVEL RETRO]', '[ENGAGEMENT TICK]', '[MINIGAMES RESTORE]', '[VERIFY TENURE]', '[CATEGORY NUMBERING]', '[TEMP ROLE]', '[CUSTOM ROLE EXPIRY]', '[STARTUP PANELS]'];
            results.forEach((r, i) => { if (r.status === 'rejected' && errLabels[i]) global.logger.error(errLabels[i], r.reason); });
            setInterval(engagementTick, 60 * 1000);

            try { startMinigameLoop(client); } catch (err) { global.logger.error('[MINIGAMES] Failed to start loop', err); }
            try { startVoteRoleCleanupLoop(client); } catch (err) { global.logger.error('[VOTE ROLE] Failed to start cleanup loop', err); }
            try { startHourlyReminderLoop(client); } catch (err) { global.logger.error('[CHAT REMINDER] Failed to start hourly loop', err); }
            try { startVerificationTenureLoop(client); } catch (err) { global.logger.error('[VERIFY TENURE] Failed to start loop', err); }
            try { startCategoryNumberingLoop(client); } catch (err) { global.logger.error('[CATEGORY NUMBERING] Failed to start loop', err); }
            try { startWeeklyActivityWinnersLoop(client); } catch (err) { global.logger.error('[WEEKLY ACTIVITY] Failed to start loop', err); }
            try { startTemporaryRoleCleanupLoop(client); } catch (err) { global.logger.error('[TEMP ROLE] Failed to start cleanup loop', err); }
            try { startCustomRoleExpiryLoop(client); } catch (err) { global.logger.error('[CUSTOM ROLE EXPIRY] Failed to start cleanup loop', err); }
            try { startTicketAutoClosePromptLoop(client); } catch (err) { global.logger.error('[TICKET AUTO CLOSE PROMPT] Failed to start loop', err); }
            try { startTranscriptCleanupLoop(); } catch (err) { global.logger.error('[TRANSCRIPT CLEANUP] Failed to start loop', err); }
        }
        const runStartupPanels = async (label = 'immediate') => {
            if (client._startupPanelsRefreshRunning) return;
            client._startupPanelsRefreshRunning = true;
            try {
                if (typeof startupPanelsTrigger?.execute === 'function') await startupPanelsTrigger.execute(client);
            } catch (err) {
                global.logger.error(`[CLIENT READY] Startup panels refresh failed (${label}):`, err);
            } finally {
                client._startupPanelsRefreshRunning = false;
            }
        };
        setTimeout(() => runStartupPanels('retry+15s').catch(() => { }), 15000);
        try {
            const mainGuildId = IDs.guilds.main || client.guilds.cache.first()?.id;
            if (mainGuildId) {
                queueIdsCatalogSync(client, mainGuildId, 'startup', { delayMs: 5000 });
                const guild = client.guilds.cache.get(mainGuildId)
                    || await client.guilds.fetch(mainGuildId).catch(() => null);
                if (guild) {
                    scheduleMemberCounterRefresh(guild, { delayMs: 800, secondPassMs: 2400 });
                }
            }
        } catch (err) {
            global.logger.error('[IDS AUTO SYNC] Startup queue failed', err);
        }
        try {
            cron.schedule("0 0 1 * *", async () => {
                const channelId = IDs.channels.joinLeaveLogs;
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

        try {
            client.user.setPresence({
                status: client.config?.status || 'idle',
                activities: [{
                    type: ActivityType.Custom,
                    name: 'irrelevant',
                    state: '☕📀 discord.gg/viniliecaffe'
                }]
            });
        } catch (err) {
            client.logs.error('[STATUS] Errore impostazione presence:', err?.message || err);
        }

        client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
    },
};
