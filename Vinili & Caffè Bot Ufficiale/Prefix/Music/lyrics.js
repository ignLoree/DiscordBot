const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  getQueue,
  searchLyrics,
  touchMusicOutputChannel,
} = require("../../Services/Music/musicService");
const { pickFromPagedMenu } = require("../../Services/Music/pagedPickerService");

const MAX_LYRICS_PAGE = 3200;

function toLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""));
}

function chunkLyrics(text, maxLen = MAX_LYRICS_PAGE) {
  const lines = toLines(text);
  const pages = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) pages.push(current);
    if (line.length <= maxLen) {
      current = line;
      continue;
    }
    let rest = line;
    while (rest.length > maxLen) {
      pages.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }
    current = rest;
  }
  if (current) pages.push(current);
  return pages.length ? pages : ["Lyrics not available."];
}

module.exports = {
  name: "lyrics",
  aliases: ["ly"],
  usage: "+lyrics [nome canzone]",
  examples: ["+lyrics", "+lyrics POLIETILENE TonyPitony"],
  async execute(message, args = []) {
    await message.channel.sendTyping();
    await touchMusicOutputChannel(message.client, message.guild?.id, message.channel).catch(() => {});

    const queryFromArgs = String(args.join(" ") || "").trim();
    const currentTrack = getQueue(message.guild?.id)?.currentTrack || null;
    const query = queryFromArgs || (currentTrack ? `${currentTrack.title} ${currentTrack.author || ""}`.trim() : "");

    if (!query) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Nessuna traccia in riproduzione. Usa `+lyrics <nome canzone>`.",
      );
    }

    const results = await searchLyrics(query).catch(() => []);
    if (!Array.isArray(results) || !results.length) {
      const noLyricsEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Lyrics not found.");
      return safeMessageReply(message, { embeds: [noLyricsEmbed] });
    }

    let first = results[0];
    if (results.length > 1) {
      const picked = await pickFromPagedMenu({
        message,
        items: results.slice(0, 100),
        pageSize: 10,
        deleteOnSelect: true,
        lineBuilder: (item, index) =>
          `${index + 1}. **${item?.trackName || "Unknown"}** by ${item?.artistName || "Unknown"}`,
        optionBuilder: (item, index) => ({
          label: `${index + 1}. ${String(item?.trackName || "Unknown")}`.slice(0, 100),
          description: String(`by ${item?.artistName || "Unknown"}`).slice(0, 100),
        }),
      });
      if (!picked) return;
      first = picked;
    }

    const plainLyrics = String(first?.plainLyrics || "").trim();
    if (!plainLyrics) {
      const noLyricsEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Lyrics not found.");
      return safeMessageReply(message, { embeds: [noLyricsEmbed] });
    }

    const title = `${first.trackName || "Unknown"} by ${first.artistName || "Unknown"}`;
    const pages = chunkLyrics(plainLyrics, MAX_LYRICS_PAGE);

    const buildEmbed = (index) =>
      new EmbedBuilder()
        .setColor("#1f2328")
        .setTitle(title)
        .setDescription(`Page ${index + 1}/${pages.length}\n\n${pages[index]}`);

    if (pages.length === 1) {
      return safeMessageReply(message, { embeds: [buildEmbed(0)] });
    }

    let pageIndex = 0;
    const prevId = `lyrics_prev_${message.id}_${Date.now()}`;
    const nextId = `lyrics_next_${message.id}_${Date.now()}`;

    const buildRow = (index) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(prevId)
          .setLabel("\u25C0")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(index <= 0),
        new ButtonBuilder()
          .setCustomId(nextId)
          .setLabel("\u25B6")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(index >= pages.length - 1),
      );
    const buildDisabledRow = (index) => {
      const row = buildRow(index);
      return new ActionRowBuilder().addComponents(
        row.components.map((button) => ButtonBuilder.from(button).setDisabled(true)),
      );
    };

    const sent = await safeMessageReply(message, {
      embeds: [buildEmbed(pageIndex)],
      components: [buildRow(pageIndex)],
    });
    if (!sent || typeof sent.createMessageComponentCollector !== "function") return;

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "Solo chi ha richiesto i lyrics puo cambiare pagina.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      if (interaction.customId === prevId && pageIndex > 0) pageIndex -= 1;
      if (interaction.customId === nextId && pageIndex < pages.length - 1) pageIndex += 1;

      await interaction.update({
        embeds: [buildEmbed(pageIndex)],
        components: [buildRow(pageIndex)],
      }).catch(() => {});
    });

    collector.on("end", async () => {
      await sent.edit({
        components: [buildDisabledRow(pageIndex)],
      }).catch(() => {});
    });
  },
};
