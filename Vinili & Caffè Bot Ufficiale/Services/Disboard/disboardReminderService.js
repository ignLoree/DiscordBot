const { EmbedBuilder } = require('discord.js');
const DisboardBump = require('../../Schemas/Disboard/disboardBumpSchema');
const bumpTimers = new Map();

function getCooldownMs(client) {
    const minutes = client?.config2?.disboard?.cooldownMinutes || 120;
    return minutes * 60 * 1000;
}

async function sendReminder(client, guildId) {
    const disboard = client?.config2?.disboard;
    if (!disboard?.reminderChannelId) return;
    const channel = await client.channels.fetch(disboard.reminderChannelId).catch(() => null);
    if (!channel) return;
    const embedColor = client?.config2?.embedInfo || "#6f4e37";
    await channel.send({
        content: "<@&1442569013074071644>",
        embeds: [
            new EmbedBuilder()
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: "© 2025 Vinili & Caffè. Tutti i diritti riservati." })
                .setTitle(`<:VC_Eye:1331619214410383381> **É L'ORA DEL \`BUMP\`!**`)
                .setURL("https://disboard.org/it/server/1329080093599076474")
                .setDescription("<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!")
        ]
    });
    await DisboardBump.updateOne(
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
            global.logger.error('[DISBOARD REMINDER ERROR]', error);
        }
    }, remaining);
    bumpTimers.set(guildId, timeout);
}

async function recordBump(client, guildId, userId) {
    const bumpedAt = new Date();
    const doc = await DisboardBump.findOneAndUpdate(
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

async function setBumpAt(client, guildId, bumpAt, userId) {
    const doc = await DisboardBump.findOneAndUpdate(
        { guildId },
        {
            $set: {
                lastBumpAt: bumpAt,
                lastBumpUserId: userId || null,
                reminderSentAt: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    scheduleReminder(client, guildId, doc.lastBumpAt);
    return doc;
}

async function restorePendingReminders(client) {
    const docs = await DisboardBump.find({
        reminderSentAt: null,
        lastBumpAt: { $exists: true }
    });
    for (const doc of docs) {
        scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
}

module.exports = {
    recordBump,
    setBumpAt,
    restorePendingReminders
};