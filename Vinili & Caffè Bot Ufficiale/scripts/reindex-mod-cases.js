const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { ModCase, ModConfig } = require("../Schemas/Moderation/moderationSchemas");

const TEMP_BASE = 1_000_000;

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
    guildId: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token) continue;
    if (token === "--guild") {
      out.guildId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--mongo") {
      out.mongoUrl = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      out.dryRun = true;
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
      "Reindex moderation caseId by chronological order (createdAt asc).",
      "",
      "Usage:",
      "  node scripts/reindex-mod-cases.js --guild <guildId> [options]",
      "",
      "Options:",
      "  --mongo <url>            MongoDB URL (fallback: env MONGO_URL / MONGODB_URI)",
      "  --dry-run                Print mapping only, do not write",
      "  --help                   Show this help",
    ].join("\n"),
  );
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.guildId) {
    console.error("Missing --guild <guildId>");
    process.exitCode = 1;
    return;
  }
  const mongoUrl =
    args.mongoUrl || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Missing Mongo URL. Use --mongo or env MONGO_URL.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUrl, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  });

  try {
    const rows = await ModCase.find({ guildId: args.guildId })
      .select({ _id: 1, caseId: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (!rows.length) {
      console.log("No cases found.");
      return;
    }

    const mapping = rows.map((row, idx) => ({
      _id: row._id,
      oldCaseId: Number(row.caseId || 0),
      newCaseId: idx + 1,
      createdAt: row.createdAt,
    }));
    const changed = mapping.filter((x) => x.oldCaseId !== x.newCaseId);

    console.log(`Total cases: ${rows.length}`);
    console.log(`Case IDs to change: ${changed.length}`);
    for (const item of changed.slice(0, 20)) {
      console.log(
        `  ${item.oldCaseId} -> ${item.newCaseId} (${new Date(item.createdAt).toISOString()})`,
      );
    }
    if (changed.length > 20) {
      console.log(`  ... and ${changed.length - 20} more`);
    }

    if (args.dryRun) return;

    // Two-phase update to avoid unique index collisions on {guildId, caseId}.
    const tempOps = mapping.map((item) => ({
      updateOne: {
        filter: { _id: item._id, guildId: args.guildId },
        update: { $set: { caseId: TEMP_BASE + item.newCaseId } },
      },
    }));
    if (tempOps.length) await ModCase.bulkWrite(tempOps, { ordered: true });

    const finalOps = mapping.map((item) => ({
      updateOne: {
        filter: { _id: item._id, guildId: args.guildId },
        update: { $set: { caseId: item.newCaseId } },
      },
    }));
    if (finalOps.length) await ModCase.bulkWrite(finalOps, { ordered: true });

    await ModConfig.updateOne(
      { guildId: args.guildId },
      {
        $set: { caseCounter: mapping.length },
        $setOnInsert: { guildId: args.guildId },
      },
      { upsert: true },
    );

    console.log(`Reindex completed. caseCounter=${mapping.length}`);
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((error) => {
  console.error("[REINDEX MOD CASES] ERROR", error);
  process.exitCode = 1;
});

