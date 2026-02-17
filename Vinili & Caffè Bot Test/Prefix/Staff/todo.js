const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const TEST_GUILD_ID = IDs.guilds?.test || "1462458562507964584";
const {
  addItem,
  removeItem,
  setItemTest,
  setItemStatus,
  refreshTodoMessage,
  normalizeStatus,
  STATUS_ORDER,
} = require("../../Utils/Todo/todoListService");

const ERROR_COLOR = "Red";
const SUCCESS_COLOR = "#6f4e37";

function parseTodoArgs(rest) {
  const raw = String(rest || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.endsWith(" fatto")) {
    return { action: "fatto", task: raw.slice(0, -6).trim() };
  }
  if (lower.endsWith(" test")) {
    return { action: "test", task: raw.slice(0, -5).trim() };
  }

  if (lower.startsWith("modify ")) {
    const remainder = raw.slice(7).trim();

    const twoQuoted = remainder.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
    if (twoQuoted) {
      const task = twoQuoted[1].trim();
      const status = normalizeStatus(twoQuoted[2]);
      if (status) return { action: "modify", task, status };
    }

    const oneQuotedThenWord = remainder.match(/^"([^"]*)"\s+(\S+)\s*$/);
    if (oneQuotedThenWord) {
      const task = oneQuotedThenWord[1].trim();
      const status = normalizeStatus(oneQuotedThenWord[2]);
      if (status) return { action: "modify", task, status };
    }

    const parts = remainder.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      if (STATUS_ORDER.includes(last)) {
        const task = parts.slice(0, -1).join(" ").trim();
        if (task) return { action: "modify", task, status: last };
      }
    }

    return null;
  }

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

async function runTodoCommand(message, args, client) {
  if (!message?.guild || !message.member) return false;

  if (message.guild.id !== TEST_GUILD_ID) {
    await reply(
      message,
      "<:vegax:1472992044140990526> I comandi `-to-do` / `-todo` sono utilizzabili solo nel **server test**.",
      ERROR_COLOR,
    );
    return true;
  }

  const parsed = parseTodoArgs(args.slice(1).join(" "));
  if (!parsed) {
    await reply(
      message,
      "**Uso:**\n" +
        '`+to-do "cosa fare" "online"` | `"inattivo"` | `"pausa"` | `"offline"`\n' +
        '`+to-do modify "cosa fare" "nuovo stato"` - modifica lo stato\n' +
        '`+to-do "cosa fare" fatto` - rimuove la voce\n' +
        '`+to-do "cosa fare" test` - segna in test (online + **[TEST]**)',
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
          ? "Stato non valido. Usa: `online`, `inattivo`, `pausa`, `offline`."
          : "Inserisci un testo per la voce.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshTodoMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Aggiunto: **${parsed.task}** (${parsed.status})`,
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
          ? "Nessuna voce trovata con questo testo."
          : "Inserisci il testo della voce da rimuovere.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshTodoMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Voce rimossa: **${parsed.task}**`,
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
          ? "Stato non valido. Usa: `online`, `inattivo`, `pausa`, `offline`."
          : result.error === "not_found"
            ? "Nessuna voce trovata con questo testo."
            : "Inserisci il testo della voce e il nuovo stato.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshTodoMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Stato aggiornato: **${parsed.task}** -> **${parsed.status}**`,
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
          ? "Nessuna voce trovata."
          : "Inserisci il testo della voce.",
        ERROR_COLOR,
      );
      return true;
    }

    await refreshTodoMessage(client);
    await reply(
      message,
      `<:vegacheckmark:1472992042203349084> Voce in **test**: **${parsed.task}** (online + **[TEST]**)`,
      SUCCESS_COLOR,
    );
    return true;
  }

  return true;
}

module.exports = {
  name: "todo",
  aliases: ["to-do"],
  async execute(message, args, client, context = {}) {
    const invoked = String(context?.invokedName || "todo").toLowerCase();
    return runTodoCommand(
      message,
      [invoked, ...(Array.isArray(args) ? args : [])],
      client,
    );
  },
};
