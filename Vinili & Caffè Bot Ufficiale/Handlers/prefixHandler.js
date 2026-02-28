const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");

const PERMISSIONS_CANDIDATES = [
  path.join(process.cwd(), "permissions.json"),
  path.resolve(__dirname, "../permissions.json"),
];
let prefixPermissionsCache = { filePath: null, mtimeMs: 0, data: {} };

function loadPrefixPermissions() {
  try {
    const permissionsPath =
      PERMISSIONS_CANDIDATES.find((p) => fs.existsSync(p)) || null;
    if (!permissionsPath) return {};
    const stat = fs.statSync(permissionsPath);
    if (
      prefixPermissionsCache.filePath === permissionsPath &&
      prefixPermissionsCache.mtimeMs === stat.mtimeMs
    ) {
      return prefixPermissionsCache.data || {};
    }
    const raw = fs.readFileSync(permissionsPath, "utf8");
    const parsed = JSON.parse(raw) || {};
    const prefix = parsed.prefix && typeof parsed.prefix === "object"
      ? parsed.prefix
      : {};
    prefixPermissionsCache = {
      filePath: permissionsPath,
      mtimeMs: stat.mtimeMs,
      data: prefix,
    };
    return prefix;
  } catch {
    return {};
  }
}

function getPermissionSubcommands(commandName) {
  const safeName = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!safeName) return [];
  const prefixPerms = loadPrefixPermissions();
  const cfg = prefixPerms?.[safeName];
  const subMap =
    cfg?.subcommands && typeof cfg.subcommands === "object"
      ? cfg.subcommands
      : null;
  if (!subMap) return [];
  return Object.keys(subMap)
    .map((sub) =>
      String(sub || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function inferSubcommandsFromExecute(command) {
  const src = String(command?.execute || "");
  if (!src) return [];
  const out = new Set();
  let match = null;

  const eqRegex =
    /\b(?:sub|subcommand|mode|action|type|operation|choice)\s*={2,3}\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const caseRegex = /\bcase\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const includesRegex =
    /\[((?:\s*['"`][a-z0-9._-]+['"`]\s*,?)+)\]\.includes\((?:[^)]*)\)/gi;
  while ((match = includesRegex.exec(src)) !== null) {
    const block = String(match[1] || "");
    const tokenRegex = /['"`]([a-z0-9._-]+)['"`]/gi;
    let tokenMatch = null;
    while ((tokenMatch = tokenRegex.exec(block)) !== null) {
      out.add(String(tokenMatch[1] || "").toLowerCase());
    }
  }

  return Array.from(out.values()).filter(Boolean);
}

function ensurePrefixSubcommandMetadata(command) {
  const declared = Array.isArray(command?.subcommands)
    ? command.subcommands
        .map((sub) =>
          String(sub || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
  const mappedTargets =
    command?.subcommandAliases && typeof command.subcommandAliases === "object"
      ? Object.values(command.subcommandAliases)
          .map((sub) =>
            String(sub || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];
  const fromPermissions = getPermissionSubcommands(command?.name);
  const inferred = inferSubcommandsFromExecute(command);

  const known = Array.from(
    new Set([...declared, ...mappedTargets, ...fromPermissions, ...inferred]),
  );

  if (!known.length) return;

  command.canonicalSubcommands = Array.from(new Set(declared));
  command.subcommands = known;
  if (
    !command.subcommandAliases ||
    typeof command.subcommandAliases !== "object"
  ) {
    command.subcommandAliases = {};
  }
  for (const sub of known) {
    if (!String(command.subcommandAliases[sub] || "").trim()) {
      command.subcommandAliases[sub] = sub;
    }
  }
}

function ensurePrefixUsageMetadata(command) {
  const prefix = "+";
  const name = String(command?.name || "")
    .trim()
    .toLowerCase();
  if (!name) return;

  const subs = Array.isArray(command?.subcommands)
    ? command.subcommands
        .map((sub) =>
          String(sub || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];

  const usage =
    String(command?.usage || "").trim() ||
    (subs.length
      ? Boolean(command?.allowEmptyArgs)
        ? `${prefix}${name} [${subs.slice(0, 8).join("|")}]`
        : `${prefix}${name} <${subs.slice(0, 8).join("|")}>`
      : Boolean(command?.args)
        ? `${prefix}${name} <opzioni>`
        : `${prefix}${name}`);
  command.usage = usage;

  const examples =
    Array.isArray(command?.examples) &&
    command.examples.some((item) => String(item || "").trim())
      ? command.examples
      : subs.length >= 2
        ? [`${prefix}${name} ${subs[0]}`, `${prefix}${name} ${subs[1]}`]
        : subs.length === 1
          ? [`${prefix}${name} ${subs[0]}`, `${prefix}${name}`]
          : Boolean(command?.args)
            ? [`${prefix}${name} esempio`]
            : [`${prefix}${name}`];
  command.examples = examples;

  if (
    !command.subcommandUsages ||
    typeof command.subcommandUsages !== "object" ||
    Array.isArray(command.subcommandUsages)
  ) {
    command.subcommandUsages = {};
  }
  for (const sub of subs) {
    if (!String(command.subcommandUsages[sub] || "").trim()) {
      command.subcommandUsages[sub] = `${prefix}${name} ${sub} ...`;
    }
  }
}

module.exports = (client) => {
  client.prefixCommands = async (folders, basePath) => {
    const prefixBase = basePath || path.join(process.cwd(), "Prefix");
    const newPcommands = new client.pcommands.constructor();
    const newAliases = new client.aliases.constructor();
    const statusMap = new Map();

    for (const folder of folders) {
      const folderPath = path.join(prefixBase, folder);
      const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
      for (const file of files) {
        const fullPath = path.join(prefixBase, folder, file);
        const key = `${folder}/${file}`;
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          if (!command || !command.name) {
            statusMap.set(key, "Missing name");
            continue;
          }
          if (command.skipLoad || command.skipPrefix) {
            statusMap.set(key, "Skipped");
            continue;
          }
          command.folder = command.folder || folder;
          ensurePrefixSubcommandMetadata(command);
          ensurePrefixUsageMetadata(command);
          newPcommands.set(command.name, command);
          statusMap.set(key, "Loaded");
          if (Array.isArray(command.aliases)) {
            for (const alias of command.aliases)
              newAliases.set(alias, command.name);
          }
        } catch (err) {
          statusMap.set(key, "Error loading");
          global.logger.error(`[PREFIX_COMMANDS] Failed to load ${key}:`, err);
        }
      }
    }

    client.pcommands.clear();
    client.aliases.clear();
    for (const [k, v] of newPcommands) client.pcommands.set(k, v);
    for (const [k, v] of newAliases) client.aliases.set(k, v);

    const table = new ascii().setHeading("Folder", "File", "Status");
    for (const [key, status] of Array.from(statusMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const [folder, file] = key.split("/");
      table.addRow(folder, file, status);
    }

    global.logger.info(table.toString());
    global.logger.info(
      `[PREFIX_COMMANDS] Loaded ${client.pcommands.size} PrefixCommands.`,
    );

    client._prefixOverrideCache = null;
    client.logs.success("[FUNCTION] Successfully reloaded prefix commands.");
  };
};