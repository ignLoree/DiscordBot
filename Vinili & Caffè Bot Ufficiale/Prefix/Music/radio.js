const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { QueryType } = require("discord-player");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getPlayer, touchMusicOutputChannel } = require("../../Services/Music/musicService");
const { getItalianStations } = require("../../Services/Music/radioService");

const PAGE_SIZE = 10;

function buildSessionInUseEmbed(channel) {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(
      `You already own a session in ${channel}, use the join command if you want it here instead!`,
    );
}

function renderStationLabel(station, index) {
  const city = station.city ? `, ${station.city}` : "";
  return `${index}. ${station.name}${city}`;
}

function toPages(items, size = PAGE_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out.length ? out : [[]];
}

function clampPage(index, total) {
  const max = Math.max(0, Number(total || 1) - 1);
  return Math.max(0, Math.min(max, Number(index || 0)));
}

function buildRadioEmbed(pages, pageIndex) {
  const page = pages[pageIndex] || [];
  const startIndex = pageIndex * PAGE_SIZE;
  const lines = page.map((station, i) => renderStationLabel(station, startIndex + i + 1));
  return new EmbedBuilder()
    .setColor("#1f2328")
    .setDescription(`Page ${pageIndex + 1}/${pages.length}\n\n${lines.join("\n") || "Nessuna stazione disponibile."}`);
}

function buildRadioSelect(pages, pageIndex, customId) {
  const page = pages[pageIndex] || [];
  const startIndex = pageIndex * PAGE_SIZE;
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Seleziona una radio")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      page.map((station, i) => ({
        label: `${startIndex + i + 1}. ${station.name}`.slice(0, 100),
        description: (station.city || station.codec || "Radio italiana").slice(0, 100),
        value: String(startIndex + i),
      })),
    );
}

function buildRows(pages, pageIndex, ids) {
  const { selectId, firstId, prevId, nextId, lastId, cancelId } = ids;
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(firstId)
      .setLabel("<<")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("<")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel(">")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= pages.length - 1),
    new ButtonBuilder()
      .setCustomId(lastId)
      .setLabel(">>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= pages.length - 1),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("X")
      .setStyle(ButtonStyle.Danger),
  );
  const select = new ActionRowBuilder().addComponents(
    buildRadioSelect(pages, pageIndex, selectId),
  );
  return [select, nav];
}

function disableRows(rows) {
  return rows.map((row) =>
    new ActionRowBuilder().addComponents(
      row.components.map((component) => {
        if (component.data?.type === ComponentType.Button) {
          return ButtonBuilder.from(component).setDisabled(true);
        }
        return StringSelectMenuBuilder.from(component).setDisabled(true);
      }),
    ),
  );
}

module.exports = {
  name: "radio",
  allowEmptyArgs: true,
  usage: "+radio",
  examples: ["+radio"],
  async execute(message) {
    await message.channel.sendTyping();
    await touchMusicOutputChannel(message.client, message.guild?.id, message.channel).catch(() => {});

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const noVoiceEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("You are not in a voice channel");
      return safeMessageReply(message, { embeds: [noVoiceEmbed] });
    }
    const botVoiceChannel = message.guild?.members?.me?.voice?.channel || null;
    if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
      return safeMessageReply(message, {
        embeds: [buildSessionInUseEmbed(botVoiceChannel)],
      });
    }
    if (!voiceChannel.joinable || !voiceChannel.speakable) {
      const noPermEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Non ho i permessi per entrare/parlare in quel canale vocale.");
      return safeMessageReply(message, { embeds: [noPermEmbed] });
    }

    const stations = await getItalianStations().catch(() => []);
    if (!stations.length) {
      const errorEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Nessuna radio italiana disponibile al momento.");
      return safeMessageReply(message, { embeds: [errorEmbed] });
    }

    const pages = toPages(stations, PAGE_SIZE);
    let pageIndex = 0;
    const nonce = `${message.id}_${Date.now()}`;
    const ids = {
      selectId: `radio_select_${nonce}`,
      firstId: `radio_first_${nonce}`,
      prevId: `radio_prev_${nonce}`,
      nextId: `radio_next_${nonce}`,
      lastId: `radio_last_${nonce}`,
      cancelId: `radio_cancel_${nonce}`,
    };

    let rows = buildRows(pages, pageIndex, ids);
    const sent = await safeMessageReply(message, {
      embeds: [buildRadioEmbed(pages, pageIndex)],
      components: rows,
    });
    if (!sent || typeof sent.createMessageComponentCollector !== "function") return;

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 180_000,
    });
    const selectCollector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 180_000,
    });

    const refreshPanel = async (interaction) => {
      rows = buildRows(pages, pageIndex, ids);
      await interaction.update({
        embeds: [buildRadioEmbed(pages, pageIndex)],
        components: rows,
      });
    };

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "Solo chi ha avviato il comando può usare il pannello.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }
      if (interaction.customId === ids.cancelId) {
        collector.stop("cancel");
        selectCollector.stop("cancel");
        await interaction.update({
          embeds: [buildRadioEmbed(pages, pageIndex)],
          components: disableRows(rows),
        }).catch(() => {});
        return;
      }
      if (interaction.customId === ids.firstId) pageIndex = 0;
      if (interaction.customId === ids.prevId) pageIndex -= 1;
      if (interaction.customId === ids.nextId) pageIndex += 1;
      if (interaction.customId === ids.lastId) pageIndex = pages.length - 1;
      pageIndex = clampPage(pageIndex, pages.length);
      await refreshPanel(interaction).catch(() => {});
    });

    selectCollector.on("collect", async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "Solo chi ha avviato il comando può usare il pannello.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      const pickedIndex = Number(interaction.values?.[0] || -1);
      const station = Number.isFinite(pickedIndex) ? stations[pickedIndex] : null;
      if (!station) {
        await interaction.reply({
          content: "Stazione non valida.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      const botVoiceChannel = message.guild?.members?.me?.voice?.channel || null;
      if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
        await interaction.reply({
          embeds: [
            buildSessionInUseEmbed(botVoiceChannel),
          ],
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      const player = await getPlayer(message.client).catch(() => null);
      if (!player) {
        await interaction.reply({
          content: "Player non disponibile ora.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      const queue = player.nodes.create(message.guild, {
        metadata: { channel: message.channel },
        leaveOnEmpty: false,
        leaveOnEmptyCooldown: 0,
        leaveOnEnd: false,
        leaveOnEndCooldown: 0,
        selfDeaf: true,
        volume: 80,
      });
      queue.metadata = { ...(queue.metadata || {}), channel: message.channel };

      if (!queue.connection) {
        const connected = await queue.connect(voiceChannel).catch(() => null);
        if (!connected) {
          await interaction.reply({
            content: "Non riesco a connettermi al canale vocale.",
            ephemeral: true,
          }).catch(() => {});
          return;
        }
      }

      const result = await player.search(station.streamUrl, {
        requestedBy: message.member,
        searchEngine: QueryType.ARBITRARY,
      }).catch(() => null);
      const track = result?.tracks?.[0] || null;
      if (!track) {
        await interaction.reply({
          content: "Non riesco a riprodurre questa stazione.",
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      queue.clear();
      await queue.node.play(track).catch(() => null);

      collector.stop("selected");
      selectCollector.stop("selected");
      await interaction.message.delete().catch(() => {});

      const startedEmbed = new EmbedBuilder()
        .setColor("#1f2328")
        .setDescription(`Started playing **${station.name}**`);
      await message.channel.send({ embeds: [startedEmbed] }).catch(() => {});
    });

    const endAll = async () => {
      rows = disableRows(rows);
      await sent.edit({ components: rows }).catch(() => {});
    };
    collector.on("end", async (_, reason) => {
      if (reason === "selected" || reason === "cancel") return;
      await endAll();
    });
    selectCollector.on("end", async (_, reason) => {
      if (reason === "selected" || reason === "cancel") return;
      await endAll();
    });
  },
};
