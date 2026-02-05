const config = require('../config.json');
const mongoose = require('mongoose');
const mongodbURL = config.mongoURL;
const config2 = require('../config.js');
const { restorePendingReminders } = require('../Services/Disboard/disboardReminderService');
const { restorePendingDiscadiaReminders } = require('../Services/Discadia/discadiaReminderService');
const { startDiscadiaVoteReminderLoop } = require('../Services/Discadia/discadiaVoteReminderService');
const { bootstrapSupporter } = require('./presenceUpdate');
const { maybeRunMorningReminder } = require('../Services/Community/morningReminderService');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const { startMinigameLoop, forceStartMinigame, restoreActiveGames } = require('../Services/Minigames/minigameService');
const { startVoteRoleCleanupLoop } = require('../Services/Community/voteRoleService');
const { startHourlyReminderLoop } = require('../Services/Community/chatReminderService');
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
            cron.schedule('0 9 * * *', async () => {
                await forceStartMinigame(client);
            }, { timezone: 'Europe/Rome' });
            cron.schedule('45 23 * * *', async () => {
                await forceStartMinigame(client);
            }, { timezone: 'Europe/Rome' });
        } catch (err) {
            global.logger.error('[MINIGAMES] Failed to schedule forced runs', err);
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

        // reminders now handled per-message in messageCreate
        if (logOnce) {
            client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
        }
    },
};
