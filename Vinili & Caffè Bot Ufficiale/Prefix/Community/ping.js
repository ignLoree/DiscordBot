const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const ping = require('../../Schemas/Ping/pingSchema');

module.exports = {
  name: 'ping',

  async execute(message) {
    await message.channel.sendTyping();
    try {
      const ws = message.client.ws.ping;
      const msgEdit = Date.now() - message.createdTimestamp;
      const uptime = process.uptime();
      const uptimeString = formatUptime(uptime);
      const shardId = message.client.shard?.ids?.[0] ?? 0;
      const shardCount = message.client.options.shardCount ?? 1;
      const getDatabasePing = async () => {
        const Now = Date.now();
        await ping.findOne().select('_id').lean();
        return ~~(Date.now() - Now);
      };
      const databasePing = await getDatabasePing();
      const empty = '\u200b';
      const pingEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(`<a:VC_GreenDot:1454118116392042711> Il ping del bot è **\`${ws}ms\`**`)
        .addFields(
          { name: `<:Clock:1330530065133338685> **Uptime:** \`${uptimeString}\``, value: empty, inline: true },
          { name: `<a:VC_Loading:1448687876018540695> **API:** \`${msgEdit}ms\``, value: empty, inline: true },
          { name: empty, value: empty, inline: true },
          { name: `<:DatabaseCheck:1330543470259212329> **Database:** \`${databasePing}ms\``, value: empty, inline: true },
          { name: `<a:VC_Calendar:1448670320180592724> **Shard:** \`${shardId + 1}/${shardCount}\``, value: empty, inline: true },
          { name: empty, value: empty, inline: true }
        );
      await safeMessageReply(message, { embeds: [pingEmbed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      global.logger.error(error);
    }
  },
};

function formatUptime(uptime) {
  const minutes = Math.floor((uptime / 60) % 60);
  const hours = Math.floor((uptime / (60 * 60)) % 24);
  const days = Math.floor(uptime / (60 * 60 * 24));
  return `${days}d ${hours}h ${minutes}m`;
}
