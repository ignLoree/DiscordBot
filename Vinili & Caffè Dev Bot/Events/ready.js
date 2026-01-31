const config = require('../config.json');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const mongodbURL = config.mongoURL;
const config2 = require('../config.js');
const { seedPassData } = require('../Services/Pass/passSeedService');
const { PassUser } = require('../Schemas/Pass/passUser');
const { resetMissionsIfNeeded, refreshMissionWindows } = require('../Services/Pass/missionService');
const { maybeRunEngagement, maybeRunQuizLoop } = require('../Services/Economy/engagementService');
const { restorePendingReminders } = require('../Services/Disboard/disboardReminderService');
const { maybeRunMorningReminder } = require('../Services/Community/morningReminderService');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const cron = require('node-cron');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        const botTag = path.basename(process.cwd()).replace(/\s+/g, '_').toLowerCase();
        const lockPath = path.join(path.dirname(process.cwd()), `.ready_logged_${botTag}`);
        let logOnce = false;
        try {
            if (fs.existsSync(lockPath)) {
                const age = Date.now() - fs.statSync(lockPath).mtimeMs;
                if (age < 30000) {
                    logOnce = false;
                } else {
                    fs.writeFileSync(lockPath, `${new Date().toISOString()} | ${client.user?.id || 'unknown'}\n`, 'utf8');
                    logOnce = true;
                }
            } else {
                fs.writeFileSync(lockPath, `${new Date().toISOString()} | ${client.user?.id || 'unknown'}\n`, 'utf8');
                logOnce = true;
            }
        } catch {
            logOnce = true;
        }
        const SEASON_ID = config.passSeasonId;
        const GUILD_ID = config.guildid;
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
            await restoreTtsConnections(client);
        } catch (err) {
            global.logger.error('[TTS RESTORE ERROR]', err);
        }
        const seedResult = await seedPassData({ guildId: GUILD_ID, seasonId: SEASON_ID });
        if (logOnce) {
            client.logs.success(`[SEED] ${seedResult.nodesCount} nodi inseriti, ${seedResult.missionsCount} missioni inserite.`);
        }
        const runPassReset = async () => {
            try {
                await refreshMissionWindows({ guildId: GUILD_ID, seasonId: SEASON_ID });
                const users = await PassUser.find({ guildId: GUILD_ID, seasonId: SEASON_ID });
                for (const u of users) {
                    await resetMissionsIfNeeded(u);
                }
            } catch (err) {
                global.logger.error(err);
            }
        };
        await runPassReset();
        setInterval(runPassReset, 60 * 60 * 1000);
        const engagementTick = async () => {
            try {
                await maybeRunEngagement(client);
                await maybeRunQuizLoop(client);
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
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return;
                await channel.send({
                    content: "@everyone",
                    files: [
                        {
                            attachment: "https://media.tenor.com/crZirRXKLuQAAAPo/manhdz2k9.mp4",
                            name: "monthly.gif"
                        }
                    ]
                });
            }, { timezone: "Europe/Rome" });
        } catch (err) {
            global.logger.error('[MONTHLY GIF] Failed to schedule', err);
        }
        if (logOnce) {
            client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
        }
    },
};