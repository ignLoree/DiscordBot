const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getQueue, touchMusicOutputChannel } = require("../../Services/Music/musicService");

function formatDateTime(value) {
  const date = new Date(Number(value || Date.now()));
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function renderProgressBar(currentMs, totalMs, size = 16) {
  const safeTotal = Math.max(1, Number(totalMs || 0));
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number(currentMs || 0)));
  const ratio = safeCurrent / safeTotal;
  const knob = Math.max(0, Math.min(size - 1, Math.round(ratio * (size - 1))));
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += i === knob ? "\u25C9" : "\u2500";
  }
  return out;
}

module.exports = {
  name: "nowplaying",
  aliases: ["np"],
  allowEmptyArgs: true,
  usage: "+nowplaying",
  examples: ["+np"],
  async execute(message) {
    await message.channel.sendTyping();
    await touchMusicOutputChannel(message.client, message.guild?.id, message.channel).catch(() => {});

    const queue = getQueue(message.guild?.id);
    const current = queue?.currentTrack || null;
    if (!queue || !current || !queue?.node?.isPlaying?.()) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non sto riproducendo nulla al momento.",
      );
    }

    const timestamp = queue.node.getTimestamp?.() || null;
    const currentMs = Number(timestamp?.current?.value || queue?.positionMs || 0);
    const totalMs = Number(timestamp?.total?.value || current.durationMS || 0);
    const currentLabel = String(timestamp?.current?.label || "00:00");
    const totalLabel = String(timestamp?.total?.label || current.duration || "00:00");
    const bar = renderProgressBar(currentMs, totalMs, 18);

    const requestedByUser =
      current?.requestedBy?.username ||
      message.guild?.members?.cache?.get(current?.metadata?.requestedById || "")?.user?.username ||
      "unknown";
    const requestedAt = formatDateTime(current?.metadata?.requestedAt || Date.now());

    const embed = new EmbedBuilder()
      .setColor("#1f2328")
      .setTitle("\uD83C\uDF08 Now Playing \u266A")
      .setDescription(
        [
          "**Playing**",
          `[${current.title}](${current.url}) by **${current.author || "Unknown"}**`,
        ].join("\n"),
      )
      .setThumbnail(current?.thumbnail || null)
      .addFields(
        {
          name: "Position",
          value: `\`${bar}\``,
          inline: true,
        },
        {
          name: "Position in queue",
          value: "1",
          inline: true,
        },
        {
          name: "Position",
          value: currentLabel,
          inline: true,
        },
        {
          name: "Length",
          value: totalLabel,
          inline: true,
        },
      )
      .setFooter({
        text: `Requested by ${requestedByUser}  ${requestedAt}`,
      });

    return safeMessageReply(message, { embeds: [embed] });
  },
};