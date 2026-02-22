const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");

const EPHEMERAL_FLAG = 1 << 6;
const COUNTER_FILTER_QUESTION = "__counter__";
const NUMBER_EMOJIS = [
  "<:1_:1444099163116535930>",
  "<:2_:1444099161673826368>",
  "<:3_:1444099160294031471>",
  "<:4_:1444099158859321435>",
  "<:5_:1444099157194440884>",
  "<:6_:1444099156007194887>",
  "<:7_:1444099154610618368>",
  "<:8_:1444099153125703690>",
  "<:9_:1444099151443919004>",
  "<:VC_10:1469357839066730627>",
];

function errorEmbed(description) {
  return new EmbedBuilder().setDescription(description).setColor("Red");
}

function successEmbed(description) {
  return new EmbedBuilder().setDescription(description).setColor("#6f4e37");
}

async function getPollChannel(interaction) {
  const channel =
    interaction.guild.channels.cache.get(IDs.channels.polls) ||
    (await interaction.guild.channels
      .fetch(IDs.channels.polls)
      .catch(() => null));
  if (!channel || !channel.isTextBased?.()) return null;
  return channel;
}

function collectCreateAnswers(interaction) {
  const answers = [];
  for (let i = 1; i <= 10; i += 1) {
    answers.push(interaction.options.getString(`risposta${i}`) || null);
  }
  return answers;
}

function collectEditAnswers(interaction, pollMessage) {
  const rawMatches =
    pollMessage.content
      .match(/__([^_]+)__/g)
      ?.map((entry) => entry.replace(/__/g, "").trim()) || [];
  const existingAnswers = rawMatches.filter(
    (text, idx) => idx !== 0 || !/^Poll #\d+$/.test(text)
  );
  const answers = [];

  for (let i = 1; i <= 10; i += 1) {
    const provided = interaction.options.getString(`r${i}`);
    const existing = existingAnswers[i - 1] ?? null;
    const value =
      provided !== null && provided !== undefined && provided !== ""
        ? provided
        : existing;
    answers.push(value);
  }

  return answers.filter((a) => a != null && a !== "");
}

function hasAnswerGap(answers) {
  let foundEmpty = false;
  for (let i = 2; i < answers.length; i += 1) {
    if (!answers[i]) foundEmpty = true;
    if (foundEmpty && answers[i]) return i + 1;
  }
  return null;
}

function buildAnswersSection(answers) {
  let text = "";
  const validEmojis = [];

  answers.forEach((answer, index) => {
    if (!answer) return;
    text += `${NUMBER_EMOJIS[index]} __${answer}__\n`;
    validEmojis.push(NUMBER_EMOJIS[index]);
  });

  return { text, validEmojis };
}

function buildPollMessageContent(pollNumber, question, answersText) {
  return `
<:channeltext:1443247596922470551> __Poll #${pollNumber}__

<a:questionexclaimanimated:1443660299994533960> **${question}**

${answersText}

<:Discord_Mention:1329524304790028328>︲<@&1442569014474965033>`;
}

async function applyPollReactions(pollMessage, reactionEmojis) {
  for (const reaction of reactionEmojis) {
    const emojiId = reaction.match(/:(\d+)>$/)?.[1];
    if (emojiId) await pollMessage.react(emojiId);
  }
}

async function findPollById(guildId, pollId) {
  let pollData = await Poll.findOne({
    guildId,
    pollcount: pollId,
    domanda: { $ne: COUNTER_FILTER_QUESTION },
  });
  if (pollData) return pollData;
  return Poll.findOne({
    pollcount: pollId,
    domanda: { $ne: COUNTER_FILTER_QUESTION },
  });
}

async function findLastPoll(guildId) {
  let lastPoll = await Poll.findOne({
    guildId,
    domanda: { $ne: COUNTER_FILTER_QUESTION },
  }).sort({ pollcount: -1 });
  if (lastPoll) return lastPoll;
  return Poll.findOne({ domanda: { $ne: COUNTER_FILTER_QUESTION } }).sort({
    pollcount: -1,
  });
}

async function handleCreate(interaction) {
  const guildId = interaction.guild.id;
  const channel = await getPollChannel(interaction);
  if (!channel) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const question = interaction.options.getString("domanda");
  const answers = collectCreateAnswers(interaction);

  const gapPosition = hasAnswerGap(answers);
  if (gapPosition) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:vegax:1443934876440068179> Non puoi inserire la risposta **${gapPosition}** senza aver riempito le precedenti!`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const { text: answersText, validEmojis } = buildAnswersSection(answers);

  const counter = await Poll.findOneAndUpdate(
    { guildId, domanda: COUNTER_FILTER_QUESTION },
    {
      $inc: { pollcount: 1 },
      $setOnInsert: { guildId, domanda: COUNTER_FILTER_QUESTION },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const pollNumber = Number(counter?.pollcount || 1);
  const pollMessage = await channel.send({
    content: buildPollMessageContent(pollNumber, question, answersText),
  });

  await applyPollReactions(pollMessage, validEmojis);

  await Poll.create({
    guildId,
    pollcount: pollNumber,
    domanda: question,
    risposta1: answers[0] || null,
    risposta2: answers[1] || null,
    risposta3: answers[2] || null,
    risposta4: answers[3] || null,
    risposta5: answers[4] || null,
    risposta6: answers[5] || null,
    risposta7: answers[6] || null,
    risposta8: answers[7] || null,
    risposta9: answers[8] || null,
    risposta10: answers[9] || null,
    messageId: pollMessage.id,
  });

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:vegacheckmark:1443666279058772028> Poll inviato correttamente in <#${IDs.channels.polls}>!`,
      ),
    ],
  });
}

async function handleRemove(interaction) {
  const guildId = interaction.guild.id;
  const channel = await getPollChannel(interaction);
  if (!channel) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const lastPoll = await findLastPoll(guildId);
  if (!lastPoll || !lastPoll.messageId) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Nessun poll trovato da rimuovere.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  try {
    const message = await channel.messages.fetch(lastPoll.messageId);
    await message.delete();
  } catch {}

  await lastPoll.deleteOne();

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:VC_Trash:1460645075242451025> L'ultimo poll (#${lastPoll.pollcount}) è stato rimosso.`,
      ),
    ],
  });
}

async function handleEdit(interaction) {
  const guildId = interaction.guild.id;
  const pollId = interaction.options.getInteger("id");
  const newQuestion = interaction.options.getString("domanda");

  const pollData = await findPollById(guildId, pollId);
  if (!pollData) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:vegax:1443934876440068179> Nessun poll con ID **${pollId}** trovato.`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const channel = await getPollChannel(interaction);
  if (!channel) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  let pollMessage;
  try {
    pollMessage = await channel.messages.fetch(pollData.messageId);
  } catch {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Il messaggio del poll non esiste più.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const answers = collectEditAnswers(interaction, pollMessage);
  const gapPosition = hasAnswerGap(answers);
  if (gapPosition) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:vegax:1443934876440068179> Non puoi impostare risposta ${gapPosition} senza aver riempito le precedenti!`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const { text: answersText, validEmojis } = buildAnswersSection(answers);
  const question =
    newQuestion ||
    pollMessage.content.match(/\*\*(.*?)\*\*/)?.[1]?.trim() ||
    "<:vegax:1443934876440068179> Domanda non trovata";

  await pollMessage.edit({
    content: buildPollMessageContent(pollId, question, answersText),
  });

  await pollMessage.reactions.removeAll().catch(() => {});
  await applyPollReactions(pollMessage, validEmojis);

  const risposte = [...answers];
  while (risposte.length < 10) risposte.push(null);
  await Poll.updateOne(
    { guildId, pollcount: pollId },
    {
      $set: {
        domanda: question,
        risposta1: risposte[0] ?? null,
        risposta2: risposte[1] ?? null,
        risposta3: risposte[2] ?? null,
        risposta4: risposte[3] ?? null,
        risposta5: risposte[4] ?? null,
        risposta6: risposte[5] ?? null,
        risposta7: risposte[6] ?? null,
        risposta8: risposte[7] ?? null,
        risposta9: risposte[8] ?? null,
        risposta10: risposte[9] ?? null,
      },
    }
  ).catch(() => {});

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:vegax:1443934876440068179> Poll **#${pollId}** aggiornato correttamente!`,
      ),
    ],
    flags: EPHEMERAL_FLAG,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Crea un poll.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un nuovo poll")
        .addStringOption((o) =>
          o
            .setName("domanda")
            .setDescription("Domanda del poll")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("risposta1").setDescription("Risposta 1").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("risposta2").setDescription("Risposta 2").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("risposta3")
            .setDescription("Risposta 3")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta4")
            .setDescription("Risposta 4")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta5")
            .setDescription("Risposta 5")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta6")
            .setDescription("Risposta 6")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta7")
            .setDescription("Risposta 7")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta8")
            .setDescription("Risposta 8")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta9")
            .setDescription("Risposta 9")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta10")
            .setDescription("Risposta 10")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Rimuove l'ultimo poll inviato"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Modifica un poll esistente")
        .addIntegerOption((o) =>
          o
            .setName("id")
            .setDescription("ID del poll da modificare (numero)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("domanda")
            .setDescription("Nuova domanda (opzionale)")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r1").setDescription("Nuova risposta 1").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r2").setDescription("Nuova risposta 2").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r3").setDescription("Nuova risposta 3").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r4").setDescription("Nuova risposta 4").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r5").setDescription("Nuova risposta 5").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r6").setDescription("Nuova risposta 6").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r7").setDescription("Nuova risposta 7").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r8").setDescription("Nuova risposta 8").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r9").setDescription("Nuova risposta 9").setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("r10")
            .setDescription("Nuova risposta 10")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    try {
      if (subcommand === "create") return handleCreate(interaction);
      if (subcommand === "remove") return handleRemove(interaction);
      if (subcommand === "edit") return handleEdit(interaction);
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};
