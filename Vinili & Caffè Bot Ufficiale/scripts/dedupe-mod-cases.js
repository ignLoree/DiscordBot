const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { ModCase } = require("../Schemas/Moderation/moderationSchemas");

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
    windowSec: 30,
    guildId: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;

    if (token === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (token === "--guild") {
      out.guildId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--window-sec") {
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(n) && n > 0) out.windowSec = n;
      i += 1;
      continue;
    }
    if (token === "--mongo") {
      out.mongoUrl = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      out.help = true;
    }
  }

  return out;
}

function printHelp() {
  console.log(
    [
      "Deduplicate moderation cases in mod_cases.",
      "",
      "Usage:",
      "  node scripts/dedupe-mod-cases.js [options]",
      "",
      "Options:",
      "  --guild <guildId>        Limit cleanup to one guild",
      "  --window-sec <n>         Max seconds between duplicates (default: 30)",
      "  --mongo <url>            MongoDB URL (fallback: env MONGO_URL / MONGODB_URI)",
      "  --dry-run                Only print duplicates, do not delete",
      "  --help                   Show this help",
    ].join("\n"),
  );
}

function buildGroupKey(doc) {
  return [
    String(doc.guildId || ""),
    String(doc.action || "").toUpperCase(),
    String(doc.userId || ""),
    String(doc.modId || ""),
    String(doc.reason || "").trim(),
  ].join("::");
}

function toMs(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const mongoUrl =
    args.mongoUrl || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Missing Mongo URL. Use --mongo or env MONGO_URL.");
    process.exitCode = 1;
    return;
  }

  const filter = {};
  if (args.guildId) filter.guildId = args.guildId;

  await mongoose.connect(mongoUrl, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  });

  try {
    const rows = await ModCase.find(filter)
      .select({
        _id: 1,
        guildId: 1,
        caseId: 1,
        action: 1,
        userId: 1,
        modId: 1,
        reason: 1,
        createdAt: 1,
      })
      .sort({ guildId: 1, action: 1, userId: 1, modId: 1, reason: 1, createdAt: 1, caseId: 1 })
      .lean();

    const windowMs = Number(args.windowSec) * 1000;
    const buckets = new Map();
    const duplicates = [];

    for (const row of rows) {
      const key = buildGroupKey(row);
      const bucket = buckets.get(key) || [];
      const currentMs = toMs(row.createdAt);
      const lastKept = bucket.length ? bucket[bucket.length - 1] : null;

      if (!lastKept) {
        bucket.push(row);
        buckets.set(key, bucket);
        continue;
      }

      const lastMs = toMs(lastKept.createdAt);
      if (currentMs - lastMs <= windowMs) {
        duplicates.push({
          _id: row._id,
          guildId: row.guildId,
          caseId: row.caseId,
          action: row.action,
          userId: row.userId,
          modId: row.modId,
          reason: row.reason,
          createdAt: row.createdAt,
          keptCaseId: lastKept.caseId,
        });
        continue;
      }

      bucket.push(row);
      buckets.set(key, bucket);
    }

    console.log(`Scanned cases: ${rows.length}`);
    console.log(`Duplicate candidates: ${duplicates.length}`);
    if (duplicates.length) {
      for (const item of duplicates.slice(0, 25)) {
        console.log(
          `  case=${item.caseId} dupOf=${item.keptCaseId} guild=${item.guildId} action=${item.action} user=${item.userId} at=${new Date(item.createdAt).toISOString()}`,
        );
      }
      if (duplicates.length > 25) {
        console.log(`  ... and ${duplicates.length - 25} more`);
      }
    }

    if (args.dryRun || !duplicates.length) {
      return;
    }

    const ids = duplicates.map((d) => d._id);
    const res = await ModCase.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted duplicates: ${res.deletedCount || 0}`);
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((error) => {
  console.error("[DEDUPE MOD CASES] ERROR", error);
  process.exitCode = 1;
});
