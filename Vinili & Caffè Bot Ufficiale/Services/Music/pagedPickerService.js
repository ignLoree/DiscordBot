const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");

const DEFAULT_PAGE_SIZE = 10;

function toPages(items, pageSize = DEFAULT_PAGE_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += pageSize) {
    out.push(items.slice(i, i + pageSize));
  }
  return out.length ? out : [[]];
}

function clampPage(index, totalPages) {
  const max = Math.max(0, Number(totalPages || 1) - 1);
  return Math.max(0, Math.min(max, Number(index || 0)));
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

async function pickFromPagedMenu({
  message,
  title = null,
  items = [],
  pageSize = DEFAULT_PAGE_SIZE,
  color = "#1f2328",
  timeoutMs = 180_000,
  deleteOnSelect = false,
  lineBuilder = (item, index) => `${index + 1}. ${String(item)}`,
  optionBuilder = (item, index) => ({
    label: `${index + 1}. ${String(item)}`.slice(0, 100),
    description: "Seleziona questo risultato",
  }),
}) {
  if (!Array.isArray(items) || !items.length) return null;

  const pages = toPages(items, pageSize);
  let pageIndex = 0;
  const nonce = `${message.id}_${Date.now()}`;
  const ids = {
    selectId: `pick_select_${nonce}`,
    firstId: `pick_first_${nonce}`,
    prevId: `pick_prev_${nonce}`,
    nextId: `pick_next_${nonce}`,
    lastId: `pick_last_${nonce}`,
    cancelId: `pick_cancel_${nonce}`,
  };

  const buildEmbed = (index) => {
    const page = pages[index] || [];
    const start = index * pageSize;
    const lines = page.map((item, i) => lineBuilder(item, start + i));
    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`Page ${index + 1}/${pages.length}\n\n${lines.join("\n")}`);
    if (title) embed.setTitle(String(title));
    return embed;
  };

  const buildRows = (index) => {
    const page = pages[index] || [];
    const start = index * pageSize;
    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(ids.selectId)
        .setPlaceholder("Seleziona")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          page.map((item, i) => {
            const absoluteIndex = start + i;
            const opt = optionBuilder(item, absoluteIndex) || {};
            return {
              label: String(opt.label || `${absoluteIndex + 1}. Risultato`).slice(0, 100),
              description: String(opt.description || "Seleziona questo risultato").slice(0, 100),
              value: String(absoluteIndex),
            };
          }),
        ),
    );
    const nav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ids.firstId)
        .setLabel("<<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index <= 0),
      new ButtonBuilder()
        .setCustomId(ids.prevId)
        .setLabel("<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index <= 0),
      new ButtonBuilder()
        .setCustomId(ids.nextId)
        .setLabel(">")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index >= pages.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.lastId)
        .setLabel(">>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index >= pages.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.cancelId)
        .setLabel("X")
        .setStyle(ButtonStyle.Danger),
    );
    return [select, nav];
  };

  let rows = buildRows(pageIndex);
  const sent = await safeMessageReply(message, {
    embeds: [buildEmbed(pageIndex)],
    components: rows,
  });
  if (!sent || typeof sent.createMessageComponentCollector !== "function") return null;

  let resolved = null;

  const buttonCollector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeoutMs,
  });
  const selectCollector = sent.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: timeoutMs,
  });

  const stopAll = (reason) => {
    buttonCollector.stop(reason);
    selectCollector.stop(reason);
  };

  buttonCollector.on("collect", async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({
        content: "Solo chi ha avviato il comando può usare il pannello.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    if (interaction.customId === ids.cancelId) {
      stopAll("cancel");
      if (deleteOnSelect) {
        await interaction.message.delete().catch(() => {});
      } else {
        rows = disableRows(rows);
        await interaction.update({
          embeds: [buildEmbed(pageIndex)],
          components: rows,
        }).catch(() => {});
      }
      return;
    }
    if (interaction.customId === ids.firstId) pageIndex = 0;
    if (interaction.customId === ids.prevId) pageIndex -= 1;
    if (interaction.customId === ids.nextId) pageIndex += 1;
    if (interaction.customId === ids.lastId) pageIndex = pages.length - 1;
    pageIndex = clampPage(pageIndex, pages.length);
    rows = buildRows(pageIndex);
    await interaction.update({
      embeds: [buildEmbed(pageIndex)],
      components: rows,
    }).catch(() => {});
  });

  selectCollector.on("collect", async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({
        content: "Solo chi ha avviato il comando può usare il pannello.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }
    const picked = Number(interaction.values?.[0] || -1);
    if (!Number.isFinite(picked) || picked < 0 || picked >= items.length) {
      await interaction.reply({ content: "Selezione non valida.", ephemeral: true }).catch(() => {});
      return;
    }
    resolved = items[picked];
    stopAll("selected");
    if (deleteOnSelect) {
      await interaction.message.delete().catch(() => {});
    } else {
      rows = disableRows(rows);
      await interaction.update({
        embeds: [buildEmbed(pageIndex)],
        components: rows,
      }).catch(() => {});
    }
  });

  const finalize = async (reason) => {
    if (reason === "selected" || reason === "cancel" || deleteOnSelect) return;
    rows = disableRows(rows);
    await sent.edit({ components: rows }).catch(() => {});
  };

  await new Promise((resolve) => {
    let done = false;
    const complete = async (reason) => {
      if (done) return;
      done = true;
      await finalize(reason);
      resolve();
    };
    buttonCollector.on("end", (_, reason) => complete(reason));
    selectCollector.on("end", (_, reason) => complete(reason));
  });

  return resolved;
}

module.exports = {
  pickFromPagedMenu,
};