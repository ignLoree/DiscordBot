const config = require('../config.json');
const mongoose = require('mongoose');
const { restorePendingReminders } = require('../Services/Bump/bumpService');
const { restorePendingDiscadiaReminders } = require('../Services/Bump/bumpService');
const { startDiscadiaVoteReminderLoop } = require('../Services/Bump/bumpService');
const { bootstrapSupporter } = require('./presenceUpdate');
const { maybeRunMorningReminder } = require('../Services/Community/morningReminderService');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const { startMinigameLoop, restoreActiveGames } = require('../Services/Minigames/minigameService');
const { startVoteRoleCleanupLoop } = require('../Services/Community/communityOpsService');
const { startHourlyReminderLoop } = require('../Services/Community/chatReminderService');
const { startVerificationTenureLoop, backfillVerificationTenure } = require('../Services/Community/communityOpsService');
const { runAllGuilds: renumberAllCategories, startCategoryNumberingLoop } = require('../Services/Community/communityOpsService');
const { startWeeklyActivityWinnersLoop } = require('../Services/Community/weeklyActivityWinnersService');
const { startPhotoContestLoop } = require('../Services/Community/photoContestService');
const { removeExpiredTemporaryRoles, startTemporaryRoleCleanupLoop } = require('../Services/Community/temporaryRoleService');
const { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop } = require('../Services/Community/customRoleExpiryService');
const { startDailyPartnerAuditLoop } = require('../Services/Partner/partnerAuditService');
const { startTicketAutoClosePromptLoop } = require('../Services/Ticket/ticketMaintenanceService');
const { startTranscriptCleanupLoop } = require('../Services/Ticket/ticketMaintenanceService');
const { retroSyncGuildLevels } = require('../Services/Community/expService');
const cron = require('node-cron');
const IDs = require('../Utils/Config/ids');
const startupPanelsTrigger = require('../Triggers/embeds');
const { queueIdsCatalogSync } = require('../Utils/Config/idsAutoSync');

const getChannelSafe = async (client, channelId) => {
    if (!channelId) return null;
    return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
};

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        client.setMaxListeners(client.config.eventListeners || 20);
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
                        serverSelectionTimeoutMS: 5000,
                        connectTimeoutMS: 5000,
                        socketTimeoutMS: 20000,
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
        const primaryScheduler = true;
        if (primaryScheduler) {
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
        if (primaryScheduler) {
            try {
                const guild = client.guilds.cache.get(IDs.guilds.main)
                    || await client.guilds.fetch(IDs.guilds.main).catch(() => null);
                if (guild) {
                    await retroSyncGuildLevels(guild, { syncRoles: true });
                }
            } catch (err) {
                global.logger.error('[LEVEL RETRO] Failed to run startup retro sync', err);
            }
            let engagementTickRunning = false;
            const engagementTick = async () => {
                if (engagementTickRunning) return;
                engagementTickRunning = true;
                try {
                    await maybeRunMorningReminder(client);
                    await runDueOneTimeReminders(client);
                } catch (err) {
                    global.logger.error(err);
                } finally {
                    engagementTickRunning = false;
                }
            };
            await engagementTick();
            setInterval(engagementTick, 60 * 1000);
            try {
                startMinigameLoop(client);
            } catch (err) {
                global.logger.error('[MINIGAMES] Failed to start loop', err);
            }
            try {
                await restoreActiveGames(client);
            } catch (err) {
                global.logger.error('[MINIGAMES] Failed to restore active game', err);
            }
            try {
                startVoteRoleCleanupLoop(client);
            } catch (err) {
                global.logger.error('[VOTE ROLE] Failed to start cleanup loop', err);
            }
            try {
                startHourlyReminderLoop(client);
            } catch (err) {
                global.logger.error('[CHAT REMINDER] Failed to start hourly loop', err);
            }
            try {
                await backfillVerificationTenure(client);
            } catch (err) {
                global.logger.error('[VERIFY TENURE] Failed to backfill existing verified users', err);
            }
            try {
                startVerificationTenureLoop(client);
            } catch (err) {
                global.logger.error('[VERIFY TENURE] Failed to start loop', err);
            }
            try {
                await renumberAllCategories(client);
                startCategoryNumberingLoop(client);
            } catch (err) {
                global.logger.error('[CATEGORY NUMBERING] Failed to start', err);
            }
            try {
                startWeeklyActivityWinnersLoop(client);
            } catch (err) {
                global.logger.error('[WEEKLY ACTIVITY] Failed to start loop', err);
            }
            try {
                startPhotoContestLoop(client);
            } catch (err) {
                global.logger.error('[PHOTO CONTEST] Failed to start loop', err);
            }
            try {
                await removeExpiredTemporaryRoles(client);
                startTemporaryRoleCleanupLoop(client);
            } catch (err) {
                global.logger.error('[TEMP ROLE] Failed to start cleanup loop', err);
            }
            try {
                await runExpiredCustomRolesSweep(client);
                startCustomRoleExpiryLoop(client);
            } catch (err) {
                global.logger.error('[CUSTOM ROLE EXPIRY] Failed to start cleanup loop', err);
            }
            try {
                startDailyPartnerAuditLoop(client);
            } catch (err) {
                global.logger.error('[PARTNER AUDIT] Failed to start loop', err);
            }
            try {
                startTicketAutoClosePromptLoop(client);
            } catch (err) {
                global.logger.error('[TICKET AUTO CLOSE PROMPT] Failed to start loop', err);
            }
            try {
                startTranscriptCleanupLoop();
            } catch (err) {
                global.logger.error('[TRANSCRIPT CLEANUP] Failed to start loop', err);
            }
        }
        const runStartupPanels = async (label = 'immediate') => {
            if (client._startupPanelsRefreshRunning) return;
            client._startupPanelsRefreshRunning = true;
            try {
                if (typeof startupPanelsTrigger?.execute === 'function') {
                    await startupPanelsTrigger.execute(client);
                }
            } catch (err) {
                global.logger.error(`[CLIENT READY] Startup panels refresh failed (${label}):`, err);
            } finally {
                client._startupPanelsRefreshRunning = false;
            }
        };
        await runStartupPanels('immediate');
        setTimeout(() => {
            runStartupPanels('retry+15s').catch(() => {});
        }, 15000);
        try {
            const mainGuildId = IDs.guilds.main || client.guilds.cache.first()?.id;
            if (mainGuildId) {
                queueIdsCatalogSync(client, mainGuildId, 'startup', { delayMs: 5000 });
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

        client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
    },
};


