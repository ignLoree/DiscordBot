const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const IDs = require('../../Utils/Config/ids');

const HIGH_STAFF_ROLE_ID = IDs.roles.highStaff;

function countTranscriptFiles() {
  const root = path.join(process.cwd(), 'local_transcripts');
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) count += 1;
    }
  }
  return count;
}

module.exports = {
  name: 'health',
  aliases: ['bothealth'],
  description: 'Mostra stato code/lock del bot.',
  async execute(message, _args, client) {
    if (!message.member?.roles?.cache?.has(HIGH_STAFF_ROLE_ID)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non hai il permesso per usare questo comando.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const prefixLocks = client.prefixCommandLocks?.size || 0;
    const prefixQueue = Array.from(client.prefixCommandQueue?.values?.() || []).reduce((acc, current) => acc + current.length, 0);
    const interactionLocks = client.interactionCommandLocks?.size || 0;
    const ticketOpenLocks = client.ticketOpenLocks?.size || 0;
    const switchLocks = client.ticketSwitchLocks?.size || 0;
    const transcriptFiles = countTranscriptFiles();

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Bot Health')
      .setDescription('Stato runtime del bot')
      .addFields(
        { name: 'Prefix Locks', value: `\`${prefixLocks}\``, inline: true },
        { name: 'Prefix Queue', value: `\`${prefixQueue}\``, inline: true },
        { name: 'Interaction Locks', value: `\`${interactionLocks}\``, inline: true },
        { name: 'Ticket Open Locks', value: `\`${ticketOpenLocks}\``, inline: true },
        { name: 'Ticket Switch Locks', value: `\`${switchLocks}\``, inline: true },
        { name: 'Local Transcripts', value: `\`${transcriptFiles}\``, inline: true }
      )
      .setTimestamp();

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
