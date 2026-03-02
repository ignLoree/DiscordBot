const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const ping = require("../../Schemas/Ping/pingSchema");

function formatUptime(uptime) {
  const minutes = Math.floor((uptime / 60) % 60);
  const hours = Math.floor((uptime / (60 * 60)) % 24);
  const days = Math.floor(uptime / (60 * 60 * 24));
  return `${days}d ${hours}h ${minutes}m`;
}

function getShardLabel(client) {
  const shardIds = Array.isArray(client?.shard?.ids)
    ? client.shard.ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id >= 0)
    : [];
  if (!shardIds.length) return "single";
  const totalShards = Number(client?.shard?.count || 0);
  const current = shardIds.join(", ");
  return totalShards > 0 ? `${current}/${totalShards}` : current;
}

module.exports = {
  name: "ping",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    try {
      const gatewayPing = Number(message.client.ws.ping || 0);
      const commandRoundtrip = Date.now() - message.createdTimestamp;
      const shardLabel = getShardLabel(message.client);
      const uptime = process.uptime();
      const uptimeString = formatUptime(uptime);
      const getDatabasePing = async () => {
        const Now = Date.now();
        await ping.findOne().select("_id").lean();
        return ~~(Date.now() - Now);
      };
      const databasePing = await getDatabasePing();
      const empty = "​";
      const pingEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `<a:VC_GreenDot:1454118116392042711> Ping: **\`${gatewayPing}ms\`**`,
        )
        .addFields(
          {
            name: `<:Clock:1330530065133338685> **Uptime:** \`${uptimeString}\``,
            value: empty,
            inline: true,
          },
          {
            name: `<a:VC_Loading:1448687876018540695> **API:** \`${commandRoundtrip}ms\``,
            value: empty,
            inline: true,
          },
          { name: empty, value: empty, inline: true },
          {
            name: `<:DatabaseCheck:1330543470259212329> **Database:** \`${databasePing}ms\``,
            value: empty,
            inline: true,
          },
          {
            name: `<a:VC_Calendar:1448670320180592724> **Shard:** \`${shardLabel}\``,
            value: empty,
            inline: true,
          },
          { name: empty, value: empty, inline: true },
        );
      await safeMessageReply(message, {
        embeds: [pingEmbed],
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      global.logger.error(error);
    }
  },
};
