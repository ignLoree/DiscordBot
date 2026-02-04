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
const { restorePendingDiscadiaReminders } = require('../Services/Discadia/discadiaReminderService');
const { startDiscadiaVoteReminderLoop } = require('../Services/Discadia/discadiaVoteReminderService');
const { bootstrapSupporter } = require('./presenceUpdate');
const { maybeRunMorningReminder } = require('../Services/Community/morningReminderService');
const { restoreTtsConnections } = require('../Services/TTS/ttsService');
const { runDueOneTimeReminders } = require('../Services/Reminders/oneTimeReminderService');
const cron = require('node-cron');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        let logOnce = true;
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
            cron.schedule("30 11 * * *", async () => {
                const channelId = "1442569130573303898";
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return;
                const embed = new (require("discord.js").EmbedBuilder)()
                    .setColor("#6f4e37")
                    .setTitle("⭐ Votaci su Discadia!")
                    .setDescription(
                        [
                            "La prima volta otterrai **250 EXP**, le altre volte altri exp!",
                            "Vota qui: https://discadia.com/vote/ploshin-italia-social-active-c/",
                        ].join("\n")
                    );
                await channel.send({ embeds: [embed] });
            }, { timezone: "Europe/Rome" });
        } catch (err) {
            global.logger.error('[DISCADIA DAILY] Failed to schedule', err);
        }
        if (logOnce) {
            client.logs.logging(`[BOT] ${client.user.username} has been launched!`);
        }
    },
};
