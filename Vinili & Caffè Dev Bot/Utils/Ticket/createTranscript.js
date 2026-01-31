module.exports = async function createTranscript(channel) {
    
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    let txt = `Transcript of: ${channel.name}\n\n`;
    sorted.forEach(msg => {
        let content = msg.content || "";
        if (msg.embeds.length > 0) {
            msg.embeds.forEach((embed, i) => {
                content += `\n[Embed ${i + 1}]\n`;
                if (embed.title) content += `Title: ${embed.title}\n`;
                if (embed.description) content += `Description: ${embed.description}\n`;
                if (embed.fields) {
                    embed.fields.forEach(f => {
                        content += `${f.name}: ${f.value}\n`;
                    });
                }
            });
        }
        if (msg.attachments.size > 0) {
            msg.attachments.forEach(att => {
                content += `\n[Attachment] ${att.url}`;
            });
        }
        if (!content) content = "*No message content*";
        txt += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${content}\n\n`;
    });
    return txt;
};