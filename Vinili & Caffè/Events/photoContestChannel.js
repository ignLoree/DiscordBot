const CONTEST_CHANNEL_ID = '1471449237035417642';
const HEART_EMOJI = '<a:VC_HeartsPink:1468685897389052008>';
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEDIA_PER_USER = 2;

function isContestAttachment(attachment) {
    const contentType = String(attachment?.contentType || '').toLowerCase();
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) return true;
    const name = String(attachment?.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|mp4|mov|m4v|webm|mkv|avi)$/i.test(name);
}

function getContestAttachmentCount(message) {
    const attachments = Array.from(message?.attachments?.values?.() || []);
    if (!attachments.length) return 0;
    return attachments.reduce((acc, attachment) => acc + (isContestAttachment(attachment) ? 1 : 0), 0);
}

async function countRecentUserMedia(message) {
    const channel = message?.channel;
    if (!channel?.messages?.fetch) return 0;

    let count = 0;
    let beforeId = message.id;
    const minTimestamp = Date.now() - LOOKBACK_MS;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before: beforeId }).catch(() => null);
        if (!batch?.size) break;

        const ordered = Array.from(batch.values());
        for (const msg of ordered) {
            if (msg.createdTimestamp < minTimestamp) continue;
            if (msg.author?.id !== message.author.id) continue;
            if (msg.author?.bot || msg.system || msg.webhookId) continue;

            count += getContestAttachmentCount(msg);
            if (count >= MAX_MEDIA_PER_USER) return count;
        }

        const oldest = ordered[ordered.length - 1];
        if (!oldest) break;
        if (oldest.createdTimestamp < minTimestamp) break;
        beforeId = oldest.id;
    }

    return count;
}

async function notifyLimit(message) {
    const warn = await message.channel.send({
        content: `<@${message.author.id}> massimo **${MAX_MEDIA_PER_USER} foto/video** a persona per settimana.`,
        allowedMentions: { parse: [], users: [message.author.id], roles: [] }
    }).catch(() => null);
    if (!warn) return;

    setTimeout(() => {
        warn.delete().catch(() => {});
    }, 5000);
}

async function lockUserFromContestChannel(message) {
    const guild = message?.guild;
    const channel = message?.channel;
    const userId = String(message?.author?.id || '');
    if (!guild || !channel || !userId) return false;

    await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false
    }, {
        reason: `Raggiunto limite contest (${MAX_MEDIA_PER_USER} foto/video)`
    }).catch(() => {});

    return true;
}

async function notifyLocked(message) {
    const warn = await message.channel.send({
        content: `<@${message.author.id}> hai raggiunto il limite di **${MAX_MEDIA_PER_USER} foto/video**: non puoi più scrivere in questo canale.`,
        allowedMentions: { parse: [], users: [message.author.id], roles: [] }
    }).catch(() => null);
    if (!warn) return;
    setTimeout(() => {
        warn.delete().catch(() => {});
    }, 6000);
}

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message?.guild) return;
        if (String(message.channelId) !== CONTEST_CHANNEL_ID) return;
        if (message.author?.bot || message.system || message.webhookId) return;

        const incomingCount = getContestAttachmentCount(message);
        if (!incomingCount) {
            await message.delete().catch(() => {});
            return;
        }

        const previousMediaCount = await countRecentUserMedia(message);
        if ((previousMediaCount + incomingCount) > MAX_MEDIA_PER_USER) {
            await message.delete().catch(() => {});
            if (previousMediaCount >= MAX_MEDIA_PER_USER) {
                await lockUserFromContestChannel(message);
            }
            await notifyLimit(message);
            return;
        }

        await message.react(HEART_EMOJI).catch(() => {});

        const updatedCount = previousMediaCount + incomingCount;
        if (updatedCount >= MAX_MEDIA_PER_USER) {
            await lockUserFromContestChannel(message);
            await notifyLocked(message);
        }
    }
};
