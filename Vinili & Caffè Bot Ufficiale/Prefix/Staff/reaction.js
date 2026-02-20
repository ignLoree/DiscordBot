const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { MentionReaction, AutoResponder, } = require("../../Schemas/Community/autoInteractionSchemas");
const {
  invalidateGuildAutoResponderCache,
} = require("../../Utils/Community/autoResponderCache");

const MAX_REACTIONS = 6;
const MAX_RULES = 50;
const MAX_TRIGGER_LENGTH = 120;
const MAX_RESPONSE_LENGTH = 1600;

function parseReactionTokens(input, max = MAX_REACTIONS) {
  const text = String(input || "").trim();
  if (!text) return [];
  const out = [];
  const customRegex = /<a?:[a-zA-Z0-9_]{2,}:(\d{16,20})>/g;
  let match;
  while ((match = customRegex.exec(text)) !== null) {
    out.push(`custom:${match[1]}`);
  }
  const cleaned = text.replace(customRegex, " ");
  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d{16,20}$/.test(part)) out.push(`custom:${part}`);
    else out.push(`unicode:${part}`);
  }
  return Array.from(new Set(out)).slice(0, max);
}

function toDisplay(token) {
  if (String(token).startsWith("custom:")) {
    const id = token.slice("custom:".length);
    return `<:emoji:${id}>`;
  }
  if (String(token).startsWith("unicode:")) {
    return token.slice("unicode:".length);
  }
  return token;
}

function splitRulePayload(raw) {
  const parts = String(raw || "")
    .split("|")
    .map((part) => part.trim());
  return {
    trigger: parts[0] || "",
    response: parts[1] || "",
    reactionText: parts[2] || "",
  };
}

function parseTriggerList(raw) {
  const source = String(raw || "").trim();
  if (!source) return [];
  const list = source
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list));
}

async function handleMentionReactions(message, args) {
  const guildId = message.guild?.id;
  const userId = message.author.id;
  if (!guildId) return;

  const sub = String(args[0] || "").toLowerCase();
  const rest = args.slice(1).join(" ");
  const doc = await MentionReaction.findOne({ guildId, userId }).catch(
    () => null,
  );
  const current = Array.isArray(doc?.reactions) ? doc.reactions : [];

  if (!sub || sub === "show") {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Reaction menzioni")
      .setDescription(
        current.length
          ? `Le tue reaction attive: ${current.map(toDisplay).join(" ")}`
          : "Non hai reaction configurate.",
      )
      .setFooter({ text: "Usa: +reaction mention set/add/remove/clear" });
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "clear" || sub === "off" || sub === "reset") {
    await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        "<:vegacheckmark:1443666279058772028> Reaction automatiche disattivate.",
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (!["set", "add", "remove", "del", "rm"].includes(sub)) {
    const help = new EmbedBuilder()
      .setColor("Red")
      .setDescription(
        [
          "<:vegax:1443934876440068179> Uso corretto:",
          "`+reaction mention show`",
          "`+reaction mention set 😀 <:emoji:123...>`",
          "`+reaction mention add 😀`",
          "`+reaction mention remove 😀`",
          "`+reaction mention clear`",
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [help],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const tokens = parseReactionTokens(rest, MAX_REACTIONS);
  if (!tokens.length) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Devi indicare almeno una reaction.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let next = [...current];
  if (sub === "set") {
    next = tokens.slice(0, MAX_REACTIONS);
  } else if (sub === "add") {
    next = Array.from(new Set([...current, ...tokens])).slice(0, MAX_REACTIONS);
  } else {
    const removeSet = new Set(tokens);
    next = current.filter((token) => !removeSet.has(token));
  }

  if (!next.length) {
    await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
  } else {
    await MentionReaction.findOneAndUpdate(
      { guildId, userId },
      { $set: { reactions: next } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Reaction menzioni aggiornate")
    .setDescription(
      next.length
        ? `Nuove reaction: ${next.map(toDisplay).join(" ")}`
        : "Nessuna reaction attiva.",
    )
    .setFooter({ text: `Massimo ${MAX_REACTIONS} reaction.` });
  await safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  });
}

async function handleAutoResponders(message, args) {
  const guildId = message.guild?.id;
  if (!guildId) return;

  const sub = String(args[0] || "").toLowerCase();
  const rest = args.slice(1).join(" ").trim();

  if (!sub || sub === "help") {
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Reaction AutoResponder")
      .setDescription(
        [
          "`+reaction auto list`",
          "`+reaction auto add trigger | risposta | 😀 <:emoji:123...>`",
          "`+reaction auto add ciao, salve, buongiorno | risposta | 😀`",
          "`+reaction auto remove trigger`",
          "`+reaction auto clear`",
          "",
          "Note:",
          `- Massimo ${MAX_RULES} regole`,
          `- Massimo ${MAX_REACTIONS} reaction per regola`,
          "- Trigger multipli con separatore virgola",
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "list" || sub === "show") {
    const docs = await AutoResponder.find({ guildId, enabled: true })
      .sort({ triggerLower: 1 })
      .lean()
      .catch(() => []);
    if (!Array.isArray(docs) || !docs.length) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "<:vegax:1443934876440068179> Nessun autoresponder configurato.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const lines = docs.slice(0, 20).map((doc, idx) => {
      const trigger = String(doc?.trigger || "").trim() || "-";
      const response = String(doc?.response || "").trim();
      const reacts = Array.isArray(doc?.reactions) ? doc.reactions : [];
      const reactionLabel = reacts.length
        ? reacts.map(toDisplay).join(" ")
        : "nessuna";
      const responseLabel = response
        ? `risposta: ${response.slice(0, 80)}${response.length > 80 ? "..." : ""}`
        : "risposta: nessuna";
      return `\`${idx + 1}.\` **${trigger}** -> ${responseLabel} | reaction: ${reactionLabel}`;
    });
    const hiddenCount = docs.length - lines.length;
    if (hiddenCount > 0) lines.push(`...e altre ${hiddenCount} regole`);

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("AutoResponder attivi")
          .setDescription(lines.join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "clear" || sub === "reset") {
    await AutoResponder.deleteMany({ guildId }).catch(() => {});
    invalidateGuildAutoResponderCache(guildId);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            "<:vegacheckmark:1443666279058772028> Tutti gli autoresponder sono stati rimossi.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "remove" || sub === "del" || sub === "rm") {
    const triggerList = parseTriggerList(rest);
    if (!triggerList.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Specifica il trigger da rimuovere.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const triggerLowerList = triggerList.map((item) => item.toLowerCase());
    const removedDocs = await AutoResponder.find({
      guildId,
      triggerLower: { $in: triggerLowerList },
    })
      .lean()
      .catch(() => []);
    await AutoResponder.deleteMany({
      guildId,
      triggerLower: { $in: triggerLowerList },
    }).catch(() => {});
    invalidateGuildAutoResponderCache(guildId);

    if (!Array.isArray(removedDocs) || !removedDocs.length) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Trigger non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const removedLabel = removedDocs
      .map((doc) => `\`${doc.trigger}\``)
      .join(", ");
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            `<:vegacheckmark:1443666279058772028> Trigger rimossi: ${removedLabel}`,
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "add" || sub === "set" || sub === "edit") {
    const { trigger, response, reactionText } = splitRulePayload(rest);
    const triggerList = parseTriggerList(trigger);
    const normalizedResponse = String(response || "").trim();
    const reactions = parseReactionTokens(reactionText, MAX_REACTIONS);

    if (!triggerList.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Trigger mancante. Usa: `+reaction auto add trigger | risposta | reaction`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (triggerList.some((item) => item.length > MAX_TRIGGER_LENGTH)) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Trigger troppo lungo (max ${MAX_TRIGGER_LENGTH} caratteri).`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (normalizedResponse.length > MAX_RESPONSE_LENGTH) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Risposta troppo lunga (max ${MAX_RESPONSE_LENGTH} caratteri).`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (!normalizedResponse && !reactions.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Devi impostare almeno una risposta o una reaction.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const currentCount = await AutoResponder.countDocuments({ guildId }).catch(
      () => 0,
    );
    const triggerLowerList = triggerList.map((item) => item.toLowerCase());
    const existingDocs = await AutoResponder.find({
      guildId,
      triggerLower: { $in: triggerLowerList },
    })
      .select("triggerLower")
      .lean()
      .catch(() => []);
    const existingSet = new Set(
      (Array.isArray(existingDocs) ? existingDocs : []).map((doc) =>
        String(doc.triggerLower),
      ),
    );
    const newNeeded = triggerLowerList.filter(
      (item) => !existingSet.has(item),
    ).length;
    if (currentCount + newNeeded > MAX_RULES) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Hai raggiunto il limite massimo di ${MAX_RULES} regole.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const savedTriggers = [];
    for (const normalizedTrigger of triggerList) {
      const triggerLower = normalizedTrigger.toLowerCase();
      const nextDoc = await AutoResponder.findOneAndUpdate(
        { guildId, triggerLower },
        {
          $set: {
            guildId,
            trigger: normalizedTrigger,
            triggerLower,
            response: normalizedResponse,
            reactions,
            enabled: true,
            updatedBy: message.author.id,
          },
          $setOnInsert: {
            createdBy: message.author.id,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
        .lean()
        .catch(() => null);
      if (nextDoc?.trigger) savedTriggers.push(nextDoc.trigger);
    }
    if (!savedTriggers.length) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Errore durante il salvataggio dell'autoresponder.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    invalidateGuildAutoResponderCache(guildId);
    const triggerLabel = savedTriggers.map((item) => `\`${item}\``).join(", ");

    const resultEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("AutoResponder aggiornato")
      .addFields(
        { name: "Trigger", value: triggerLabel.slice(0, 1024) || "Nessuno" },
        {
          name: "Risposta",
          value: normalizedResponse
            ? normalizedResponse.slice(0, 1024)
            : "Nessuna",
        },
        {
          name: "Reaction",
          value: reactions.length
            ? reactions.map(toDisplay).join(" ")
            : "Nessuna",
        },
      );
    await safeMessageReply(message, {
      embeds: [resultEmbed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    content:
      "<:vegax:1443934876440068179> Sottocomando non valido. Usa `+reaction auto help`.",
    allowedMentions: { repliedUser: false },
  });
}

module.exports = {
  name: "reaction",
  aliases: ["myreaction", "autoreaction", "autoresponder", "ar", "autorespond"],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const modeRaw = String(args[0] || "").toLowerCase();
    const mode = modeRaw || "mention";

    if (mode === "help") {
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando Reaction")
        .setDescription(
          [
            "`+reaction mention show|set|add|remove|clear`",
            "`+reaction auto list|add|remove|clear`",
            "",
            "Compatibilità:",
            "- `+autoresponder ...` ora usa automaticamente `+reaction auto ...`",
            "- `+reaction set/add/remove/clear` continua a gestire le reaction menzioni",
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (mode === "auto" || mode === "autoresponder" || mode === "ar") {
      await handleAutoResponders(message, args.slice(1));
      return;
    }

    if (["mention", "mentions", "me", "mine"].includes(mode)) {
      await handleMentionReactions(message, args.slice(1));
      return;
    }

    await handleMentionReactions(message, args);
  },
};
