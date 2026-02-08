const { EmbedBuilder } = require('discord.js');
const DiscadiaBump = require('../../Schemas/Discadia/discadiaBumpSchema');
const bumpTimers = new Map();

function getCooldownMs(client) {
    const minutes = client?.config?.discadia?.cooldownMinutes || 1440;
    return minutes * 60 * 1000;
}

async function sendReminder(client, guildId) {
    const discadia = client?.config?.discadia;
    if (!discadia?.reminderChannelId) return;
    const channel = client.channels.cache.get(discadia.reminderChannelId)
        || await client.channels.fetch(discadia.reminderChannelId).catch(() => null);
    if (!channel) return;
    const embedColor = client?.config?.embedInfo || "#6f4e37";
    await channel.send({
        content: "<@&1442569013074071644>",
        embeds: [
            new EmbedBuilder()
                .setColor(embedColor)
                .setTitle("<:VC_Eye:1331619214410383381> **É L'ORA DEL `BUMP` SU DISCADIA!**")
                .setURL("https://discadia.com/server/viniliecaffe/")
                .setDescription("<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!")
        ]
    });
    await DiscadiaBump.updateOne(
        { guildId },
        { $set: { reminderSentAt: new Date() } }
    );
}

function scheduleReminder(client, guildId, lastBumpAt) {
    const existing = bumpTimers.get(guildId);
    if (existing) clearTimeout(existing);
    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const targetTime = new Date(lastBumpAt).getTime() + cooldownMs;
    const remaining = targetTime - now;
    if (remaining <= 0) {
        void sendReminder(client, guildId);
        return;
    }
    const timeout = setTimeout(async () => {
        try {
            await sendReminder(client, guildId);
        } catch (error) {
            global.logger.error('[DISCADIA REMINDER ERROR]', error);
        }
    }, remaining);
    bumpTimers.set(guildId, timeout);
}

async function recordDiscadiaBump(client, guildId, userId) {
    const bumpedAt = new Date();
    const doc = await DiscadiaBump.findOneAndUpdate(
        { guildId },
        {
            $set: {
                lastBumpAt: bumpedAt,
                lastBumpUserId: userId || null,
                reminderSentAt: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    scheduleReminder(client, guildId, doc.lastBumpAt);
    return doc;
}

async function restorePendingDiscadiaReminders(client) {
    const docs = await DiscadiaBump.find({
        reminderSentAt: null,
        lastBumpAt: { $exists: true }
    });
    for (const doc of docs) {
        scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
}

module.exports = {
    recordDiscadiaBump,
    restorePendingDiscadiaReminders
};
