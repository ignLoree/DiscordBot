const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const TEST_GUILD_ID = IDs.guilds?.test || "1462458562507964584";
const {
  addItem,
  removeItem,
  setItemTest,
  setItemStatus,
  refreshBugMessage,
  normalizeStatus,
  STATUS_ORDER,
} = require("../../Utils/Bug/bugListService");

const ERROR_COLOR = "Red";
const SUCCESS_COLOR = "#6f4e37";

function parseBugArgs(args) {
  const first = (args[0] || "").toLowerCase();

  if (first === "modify") {
    const raw = String(args.slice(1).join(" ") || "").trim();
    if (!raw) return null;

    const twoQuoted = raw.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
    if (twoQuoted) {
      const task = twoQuoted[1].trim();
      const status = normalizeStatus(twoQuoted[2]);
      if (status) return { action: "modify", task, status };
    }

    const oneQuotedThenWord = raw.match(/^"([^"]*)"\s+(\S+)\s*$/);
    if (oneQuotedThenWord) {
      const task = oneQuotedThenWord[1].trim();
      const status = normalizeStatus(oneQuotedThenWord[2]);
      if (status) return { action: "modify", task, status };
    }

    const parts = raw.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      if (STATUS_ORDER.includes(last)) {
        const task = parts.slice(0, -1).join(" ").trim();
        if (task) return { action: "modify", task, status: last };
      }
    }
    return null;
  }

  if (first !== "report") {
    const raw = String(args.join(" ") || "").trim();
    if (!raw) return null;

    const stripQuotes = (value) =>
      String(value || "")
        .trim()
        .replace(/^["']|["']$/g, "");
    const lower = raw.toLowerCase();

    if (lower.endsWith(" fatto")) {
      return { action: "fatto", task: stripQuotes(raw.slice(0, -6)) };
    }

    if (lower.endsWith(" test")) {
      return { action: "test", task: stripQuotes(raw.slice(0, -5)) };
    }

    return null;
  }

  const raw = String(args.slice(1).join(" ") || "").trim();
  if (!raw) return null;

  const twoQuoted = raw.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
  if (twoQuoted) {
    const task = twoQuoted[1].trim();
    const status = normalizeStatus(twoQuoted[2]);
    if (status) return { action: "add", task, status };
  }

  const oneQuotedThenWord = raw.match(/^"([^"]*)"\s+(\S+)\s*$/);
  if (oneQuotedThenWord) {
    const task = oneQuotedThenWord[1].trim();
    const status = normalizeStatus(oneQuotedThenWord[2]);
    if (status) return { action: "add", task, status };
  }

  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    if (STATUS_ORDER.includes(last)) {
      const task = parts.slice(0, -1).join(" ").trim();
      if (task) return { action: "add", task, status: last };
    }
  }

  return null;
}

async function reply(message, description, color) {
  return safeMessageReply(message, {
    embeds: [new EmbedBuilder().setColor(color).setDescription(description)],
    allowedMentions: { repliedUser: false },
  });
}

async function runBugCommand(message, args, client) {
  if (!message?.guild || !message.member) return false;

  if (message.guild.id !== TEST_GUILD_ID) {
    await reply(
      message,
      "<:vegax:1472992044140990526> Il comando `-bug` e utilizzabile solo nel **server test**.",
      ERROR_COLOR,
    );
    return true;
  }

  const parsed = parseBugArgs(args);

  if (!parsed) {
    await reply(
      message,
      "**Uso:**\n" +
        '`-bug report "descrizione" "online"` | `"inattivo"` | `"pausa"` | `"offline"`\n' +
        '`-bug modify "descrizione" "nuova gravita"` - modifica la gravita\n' +
        '`-bug "descrizione" fatto` - rimuove il bug\n' +
        '`-bug "descrizione" test` - segna in test (online + **[TEST]**)',
      ERROR_COLOR,
    );
    return true;
  }

  if (parsed.action === "add") {
    const result = await addItem(parsed.task, parsed.status);
    if (!result.ok) {
      await reply(
        message,
        result.error === "status_invalid"
          ? "Gravita non valida. Usa: `online`, `inattivo`, `pausa`, `offline`."
          : "Inserisci una descrizione per il bug.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshBugMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Bug segnalato: **${parsed.task}** (gravita: ${parsed.status})`,
      SUCCESS_COLOR,
    );
    return true;
  }

  if (parsed.action === "fatto") {
    const result = await removeItem(parsed.task);
    if (!result.ok) {
      await reply(
        message,
        result.error === "not_found"
          ? "Nessun bug trovato con questa descrizione."
          : "Inserisci la descrizione del bug da rimuovere.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshBugMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Bug rimosso: **${parsed.task}**`,
      SUCCESS_COLOR,
    );
    return true;
  }

  if (parsed.action === "modify") {
    const result = await setItemStatus(parsed.task, parsed.status);
    if (!result.ok) {
      await reply(
        message,
        result.error === "status_invalid"
          ? "Gravita non valida. Usa: `online`, `inattivo`, `pausa`, `offline`."
          : result.error === "not_found"
            ? "Nessun bug trovato con questa descrizione."
            : "Inserisci la descrizione del bug e la nuova gravita.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshBugMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Gravita aggiornata: **${parsed.task}** -> **${parsed.status}**`,
      SUCCESS_COLOR,
    );
    return true;
  }

  if (parsed.action === "test") {
    const result = await setItemTest(parsed.task, true);
    if (!result.ok) {
      await reply(
        message,
        result.error === "not_found"
          ? "Nessun bug trovato."
          : "Inserisci la descrizione del bug.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshBugMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Bug in **test**: **${parsed.task}** (online + **[TEST]**)`,
      SUCCESS_COLOR,
    );
    return true;
  }

  return true;
}

module.exports = {
  name: "bug",
  aliases: [],
  async execute(message, args, client, context = {}) {
    const invoked = String(context?.invokedName || "bug").toLowerCase();
    return runBugCommand(
      message,
      [invoked, ...(Array.isArray(args) ? args : [])],
      client,
    );
  },
};
