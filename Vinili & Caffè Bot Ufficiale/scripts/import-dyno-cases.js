const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const {
  ModCase,
  ModConfig,
} = require("../Schemas/Moderation/moderationSchemas");

const DEFAULT_DYNO_ID = "155149108183695360";
const USER_ID_REGEX = /\b\d{17,20}\b/g;

function loadEnvFiles() {
  const appRoot = path.resolve(__dirname, "..");
  const envCandidates = [
    path.join(appRoot, "..", ".env"),
    path.join(process.cwd(), ".env"),
    path.join(appRoot, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true, override: false });
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    dynoId: DEFAULT_DYNO_ID,
    maxMessages: 0,
    includeNonDyno: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;

    if (token === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (token === "--include-non-dyno") {
      out.includeNonDyno = true;
      continue;
    }
    if (token === "--guild") {
      out.guildId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--channel") {
      out.channelId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--token") {
      out.token = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--mongo") {
      out.mongoUrl = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--dyno-id") {
      out.dynoId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--max-messages") {
      const n = Number.parseInt(argv[i + 1], 10);
      out.maxMessages = Number.isFinite(n) && n > 0 ? n : 0;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      out.help = true;
      continue;
    }
  }

  return out;
}

function printHelp() {
  console.log(
    [
      "Import Dyno cases into mod_case",
      "",
      "Usage:",
      "  node scripts/import-dyno-cases.js --guild <guildId> --channel <modLogChannelId> [options]",
      "",
      "Options:",
      "  --dry-run                Parse only, do not write to MongoDB",
      "  --token <token>          Discord bot token (fallback: env DISCORD_TOKEN_OFFICIAL / DISCORD_TOKEN)",
      "  --mongo <url>            MongoDB URL (fallback: env MONGO_URL / MONGODB_URI)",
      "  --dyno-id <id>           Dyno bot user id (default: 155149108183695360)",
      "  --max-messages <n>       Stop after reading n messages (default: all history)",
      "  --include-non-dyno       Also parse messages not authored by Dyno",
      "  --help                   Show this help",
      "",
      "Example:",
      "  npm run moderation:import-dyno -- --guild 123 --channel 456 --dry-run",
    ].join("\n"),
  );
}

function fieldByName(embeds, names) {
  const expected = names.map((x) => String(x || "").toLowerCase());
  for (const embed of embeds) {
    const fields = Array.isArray(embed?.fields) ? embed.fields : [];
    for (const field of fields) {
      const name = String(field?.name || "").toLowerCase();
      if (!name) continue;
      if (expected.some((needle) => name.includes(needle))) {
        return String(field?.value || "").trim();
      }
    }
  }
  return "";
}

function extractCaseIdFromText(text) {
  const patterns = [
    /case\s*#?\s*(\d{1,12})/i,
    /caseid\s*[:#]?\s*(\d{1,12})/i,
    /modlog\s*id\s*[:#]?\s*(\d{1,12})/i,
    /\bid\s*[:#]\s*(\d{1,12})/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractFirstUserId(text) {
  if (!text) return null;
  const matches = String(text).match(USER_ID_REGEX) || [];
  return matches[0] || null;
}

function extractReason(embeds, fullText) {
  const fromField = fieldByName(embeds, ["reason", "motivo", "note"]);
  if (fromField) {
    const compact = fromField.replace(/\s+/g, " ").trim();
    return compact || "Nessun motivo fornito";
  }
  const inline = fullText.match(/reason\s*[:\-]\s*([^\n]+)/i);
  if (inline?.[1]) {
    const compact = inline[1].replace(/\s+/g, " ").trim();
    return compact || "Nessun motivo fornito";
  }
  return "Nessun motivo fornito";
}

function parseDurationMs(rawText) {
  const text = String(rawText || "").toLowerCase().trim();
  if (!text) return null;
  if (
    text.includes("perm") ||
    text.includes("n/a") ||
    text.includes("none") ||
    text.includes("indef")
  ) {
    return null;
  }

  const unitRegex =
    /(\d+)\s*(d|day|days|h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)\b/g;
  let total = 0;
  let found = false;

  while (true) {
    const match = unitRegex.exec(text);
    if (!match) break;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[2];
    if (unit === "d" || unit.startsWith("day")) total += value * 86400000;
    else if (unit === "h" || unit === "hr" || unit.startsWith("hour"))
      total += value * 3600000;
    else if (unit === "m" || unit.startsWith("min")) total += value * 60000;
    else total += value * 1000;
    found = true;
  }

  if (found) return total > 0 ? total : null;

  const compact = text.match(/^(\d+)([smhd])$/);
  if (compact) {
    const value = Number.parseInt(compact[1], 10);
    const unit = compact[2];
    if (!Number.isFinite(value) || value <= 0) return null;
    if (unit === "s") return value * 1000;
    if (unit === "m") return value * 60000;
    if (unit === "h") return value * 3600000;
    return value * 86400000;
  }

  return null;
}

function extractDurationMs(embeds, fullText) {
  const fromField = fieldByName(embeds, ["duration", "time", "length", "tempo"]);
  if (fromField) return parseDurationMs(fromField);
  const inline = fullText.match(/duration\s*[:\-]\s*([^\n]+)/i);
  if (inline?.[1]) return parseDurationMs(inline[1]);
  return null;
}

function extractAction(text) {
  const t = String(text || "").toLowerCase();
  const checks = [
    ["UNBAN", /\bunban(?:ned)?\b/],
    ["UNMUTE", /\bunmute(?:d)?\b|\buntimeout\b/],
    ["UNLOCK", /\bunlock(?:ed)?\b/],
    ["CLEARWARN", /\bclearwarn\b|\bwarnings?\s*cleared\b/],
    ["DELWARN", /\bdelwarn\b|\bwarn(?:ing)?\s*removed\b/],
    ["TEMPROLE_REMOVE", /\btemprole\s*remove\b/],
    ["TEMPROLE", /\btemprole\b/],
    ["BAN", /\bban(?:ned)?\b/],
    ["MUTE", /\bmute(?:d)?\b|\btimeout(?:ed)?\b/],
    ["KICK", /\bkick(?:ed)?\b/],
    ["WARN", /\bwarn(?:ed|ing)?\b/],
    ["LOCK", /\block(?:ed)?\b/],
  ];
  for (const [action, re] of checks) {
    if (re.test(t)) return action;
  }
  return null;
}

function parseMessageCase(message, opts) {
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embedLines = [];
  for (const e of embeds) {
    if (e?.title) embedLines.push(String(e.title));
    if (e?.description) embedLines.push(String(e.description));
    if (Array.isArray(e?.fields)) {
      for (const field of e.fields) {
        embedLines.push(`${String(field?.name || "")}: ${String(field?.value || "")}`);
      }
    }
    if (e?.footer?.text) embedLines.push(String(e.footer.text));
    if (e?.author?.name) embedLines.push(String(e.author.name));
  }

  const fullText = [message.content || "", ...embedLines].join("\n");
  if (!fullText.trim()) return { ok: false, reason: "empty" };

  const action = extractAction(fullText);
  if (!action) return { ok: false, reason: "unknown_action" };

  let caseId =
    extractCaseIdFromText(fieldByName(embeds, ["case", "case id", "modlog id"])) ||
    extractCaseIdFromText(fullText);
  if (!Number.isFinite(caseId) || caseId <= 0) caseId = null;

  const userField = fieldByName(embeds, ["user", "member", "target", "offender"]);
  const modField = fieldByName(embeds, ["moderator", "mod", "staff", "by"]);

  let userId = extractFirstUserId(userField);
  let modId = extractFirstUserId(modField);

  if (!userId) {
    const direct = fullText.match(
      /\b(user|member|target|offender)\b\s*[:\-]?\s*(?:<@!?(\d{17,20})>|[^\n]*?(\d{17,20}))/i,
    );
    userId = direct?.[2] || direct?.[3] || null;
  }
  if (!modId) {
    const direct = fullText.match(
      /\b(mod|moderator|staff|by)\b\s*[:\-]?\s*(?:<@!?(\d{17,20})>|[^\n]*?(\d{17,20}))/i,
    );
    modId = direct?.[2] || direct?.[3] || null;
  }
  if (!userId) {
    const mentions = Array.from(message.mentions?.users?.values?.() || []).filter(
      (u) => String(u.id) !== String(opts.dynoId),
    );
    if (mentions.length) userId = String(mentions[0].id);
  }
  if (!modId) modId = String(opts.dynoId || message.author?.id || "0");

  if (!userId) return { ok: false, reason: "missing_user" };
  if (!modId) return { ok: false, reason: "missing_mod" };

  const reason = extractReason(embeds, fullText);
  const durationMs = extractDurationMs(embeds, fullText);
  const embedTs =
    embeds.find((e) => e?.timestamp)?.timestamp ||
    embeds.find((e) => e?.data?.timestamp)?.data?.timestamp ||
    null;
  const createdAt = new Date(embedTs || message.createdTimestamp || Date.now());

  const hasTimedDuration = Number.isFinite(durationMs) && durationMs > 0;
  const expiresAt = hasTimedDuration
    ? new Date(createdAt.getTime() + durationMs)
    : null;

  let active = false;
  if (["BAN", "MUTE", "LOCK", "TEMPROLE"].includes(action) && expiresAt) {
    active = expiresAt.getTime() > Date.now();
  }

  return {
    ok: true,
    data: {
      caseId,
      action,
      userId: String(userId),
      modId: String(modId),
      reason: String(reason || "Nessun motivo fornito").slice(0, 512),
      durationMs: hasTimedDuration ? durationMs : null,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      active,
      context: {
        channelId: String(message.channelId || ""),
        messageId: String(message.id || ""),
      },
      createdAt,
      updatedAt: createdAt,
    },
  };
}

async function fetchAllMessages(channel, maxMessages) {
  const out = [];
  let before = undefined;

  while (true) {
    const remaining =
      maxMessages > 0 ? Math.max(0, maxMessages - out.length) : 100;
    if (maxMessages > 0 && remaining <= 0) break;
    const limit = Math.max(1, Math.min(100, remaining));

    const batch = await channel.messages.fetch({ limit, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const rows = Array.from(batch.values());
    out.push(...rows);

    before = rows[rows.length - 1]?.id;
    if (!before) break;
    if (batch.size < limit) break;
  }

  return out;
}

async function run() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.guildId || !args.channelId) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const token =
    args.token || process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  const mongoUrl =
    args.mongoUrl || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!token) {
    console.error("Missing Discord token. Use --token or env DISCORD_TOKEN_OFFICIAL.");
    process.exitCode = 1;
    return;
  }
  if (!mongoUrl) {
    console.error("Missing Mongo URL. Use --mongo or env MONGO_URL.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 20000,
    maxPoolSize: 10,
    minPoolSize: 1,
  });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel, Partials.Message],
  });

  try {
    await client.login(token);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Discord ready timeout")), 15000);
      client.once("clientReady", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const guild =
      client.guilds.cache.get(args.guildId) ||
      (await client.guilds.fetch(args.guildId).catch(() => null));
    if (!guild) throw new Error(`Guild non trovata: ${args.guildId}`);

    const channel =
      guild.channels.cache.get(args.channelId) ||
      (await guild.channels.fetch(args.channelId).catch(() => null));
    if (!channel?.isTextBased?.()) {
      throw new Error(`Canale non valido o non testuale: ${args.channelId}`);
    }

    console.log(`Reading messages from #${channel.name} (${channel.id})...`);
    const allMessages = await fetchAllMessages(channel, args.maxMessages);
    console.log(`Fetched ${allMessages.length} messages.`);

    const inChrono = allMessages
      .slice()
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const usable = [];
    const stats = {
      skippedNonDyno: 0,
      skippedNoEmbedOrContent: 0,
      skippedUnknownAction: 0,
      skippedMissingUser: 0,
    };

    for (const msg of inChrono) {
      const isDyno = String(msg.author?.id || "") === String(args.dynoId);
      if (!args.includeNonDyno && !isDyno) {
        stats.skippedNonDyno += 1;
        continue;
      }
      if (!msg.content && (!Array.isArray(msg.embeds) || msg.embeds.length === 0)) {
        stats.skippedNoEmbedOrContent += 1;
        continue;
      }

      const parsed = parseMessageCase(msg, args);
      if (!parsed.ok) {
        if (parsed.reason === "unknown_action") stats.skippedUnknownAction += 1;
        else if (parsed.reason === "missing_user") stats.skippedMissingUser += 1;
        continue;
      }

      usable.push(parsed.data);
    }

    const lastExistingCase = await ModCase.findOne({ guildId: args.guildId })
      .sort({ caseId: -1 })
      .select({ caseId: 1 })
      .lean()
      .catch(() => null);
    const existingCfg = await ModConfig.findOne({ guildId: args.guildId })
      .select({ caseCounter: 1 })
      .lean()
      .catch(() => null);

    let rollingCaseId = Math.max(
      Number(lastExistingCase?.caseId || 0),
      Number(existingCfg?.caseCounter || 0),
      0,
    );
    const seenCaseIds = new Set();
    const normalized = [];

    for (const row of usable) {
      let caseId = Number(row.caseId || 0);
      if (!Number.isFinite(caseId) || caseId <= 0 || seenCaseIds.has(caseId)) {
        rollingCaseId += 1;
        caseId = rollingCaseId;
      }
      seenCaseIds.add(caseId);
      if (caseId > rollingCaseId) rollingCaseId = caseId;
      normalized.push({ ...row, caseId });
    }

    if (args.dryRun) {
      const byAction = normalized.reduce((acc, row) => {
        acc[row.action] = (acc[row.action] || 0) + 1;
        return acc;
      }, {});
      console.log("Dry run summary:");
      console.log(`  Parsed cases: ${normalized.length}`);
      console.log(`  Skip non-dyno: ${stats.skippedNonDyno}`);
      console.log(`  Skip unknown action: ${stats.skippedUnknownAction}`);
      console.log(`  Skip missing user: ${stats.skippedMissingUser}`);
      console.log(`  Max caseId after import: ${rollingCaseId}`);
      console.log("  Actions:", byAction);
      return;
    }

    let inserted = 0;
    let existing = 0;
    for (const row of normalized) {
      const filter = { guildId: args.guildId, caseId: row.caseId };
      const update = {
        $setOnInsert: {
          guildId: args.guildId,
          caseId: row.caseId,
          action: row.action,
          userId: row.userId,
          modId: row.modId,
          reason: row.reason,
          durationMs: row.durationMs,
          expiresAt: row.expiresAt,
          active: row.active,
          context: row.context,
          edits: [],
          closedAt: row.active ? null : row.expiresAt || row.createdAt,
          closeReason: row.active ? null : "Imported from Dyno log",
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      };
      const out = await ModCase.updateOne(filter, update, {
        upsert: true,
        timestamps: false,
      });
      if (out?.upsertedCount > 0) inserted += 1;
      else existing += 1;
    }

    await ModConfig.findOneAndUpdate(
      { guildId: args.guildId },
      { $max: { caseCounter: rollingCaseId }, $setOnInsert: { guildId: args.guildId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    console.log("Import completed.");
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Existing (skipped): ${existing}`);
    console.log(`  Parsed: ${normalized.length}`);
    console.log(`  Skip non-dyno: ${stats.skippedNonDyno}`);
    console.log(`  Skip unknown action: ${stats.skippedUnknownAction}`);
    console.log(`  Skip missing user: ${stats.skippedMissingUser}`);
    console.log(`  caseCounter set to: ${rollingCaseId}`);
  } finally {
    await client.destroy();
    await mongoose.disconnect().catch(() => null);
  }
}

run().catch((error) => {
  console.error("[IMPORT_DYNO_CASES_ERROR]", error?.stack || error?.message || error);
  process.exitCode = 1;
});
