const DiscadiaVoter = require('../../Schemas/Discadia/discadiaVoterSchema');

function getCooldownMs(client) {
    const hours = client?.config2?.discadiaVoteReminder?.cooldownHours || 24;
    return hours * 60 * 60 * 1000;
}

function getCheckIntervalMs(client) {
    const minutes = client?.config2?.discadiaVoteReminder?.checkIntervalMinutes || 30;
    return minutes * 60 * 1000;
}

function getReminderText(client) {
    return client?.config2?.discadiaVoteReminder?.message
        || 'Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia. Grazie per il supporto!';
}

async function recordDiscadiaVote(guildId, userId) {
    const now = new Date();
    const doc = await DiscadiaVoter.findOneAndUpdate(
        { guildId, userId },
        {
            $set: { lastVoteAt: now },
            $setOnInsert: { lastRemindedAt: null },
            $inc: { voteCount: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc?.voteCount || 1;
}

async function sendDueReminders(client) {
    const enabled = client?.config2?.discadiaVoteReminder?.enabled;
    if (!enabled) return;
    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const due = await DiscadiaVoter.find({
        lastVoteAt: { $exists: true },
        $or: [
            { lastRemindedAt: null },
            { lastRemindedAt: { $lt: new Date(now - cooldownMs) } }
        ]
    }).lean();
    if (!due.length) return;
    const message = getReminderText(client);
    for (const doc of due) {
        if (!doc?.userId || !doc?.guildId) continue;
        if (now - new Date(doc.lastVoteAt).getTime() < cooldownMs) continue;
        const user = client.users.cache.get(doc.userId)
            || await client.users.fetch(doc.userId).catch(() => null);
        if (!user) continue;
        try {
            await user.send(message);
            await DiscadiaVoter.updateOne(
                { guildId: doc.guildId, userId: doc.userId },
                { $set: { lastRemindedAt: new Date() } }
            );
        } catch {
            // ignore DM failures
        }
    }
}

function startDiscadiaVoteReminderLoop(client) {
    const enabled = client?.config2?.discadiaVoteReminder?.enabled;
    if (!enabled) return;
    const intervalMs = getCheckIntervalMs(client);
    setInterval(() => {
        sendDueReminders(client).catch((error) => {
            global.logger.error('[DISCADIA VOTE REMINDER ERROR]', error);
        });
    }, intervalMs);
}

module.exports = {
    recordDiscadiaVote,
    sendDueReminders,
    startDiscadiaVoteReminderLoop
};
