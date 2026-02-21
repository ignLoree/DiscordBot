const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");

const PERMISSIONS_CANDIDATES = [
  path.join(process.cwd(), "permissions.json"),
  path.resolve(__dirname, "../permissions.json"),
];
let prefixPermissionsCache = { filePath: null, mtimeMs: 0, data: {} };

function humanizeCommandName(name) {
  return String(name || "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function buildAutoPrefixDescription(command, folder) {
  const name = String(command?.name || "").toLowerCase();
  const readable = humanizeCommandName(name);
  const exact = {
    help: "Mostra la lista dei comandi disponibili.",
    ping: "Mostra latenza del bot è stato dei servizi.",
    ticket: "Gestisce i ticket.",
    customvoc: "Crea e gestisce una vocale privata personalizzata.",
    customrole: "Gestisce il tuo ruolo personalizzato con subcomandi.",
    "no-dm": "Blocca gli annunci che vengono inviati in DM dallo staff.",
    "no-dm-list": "Mostra la lista utenti bloccati per i DM.",
    addlevel: "Aggiunge livelli a un utente.",
    removelevel: "Rimuove livelli a un utente.",
    recensione: "Premia una recensione assegnando livelli.",
    reviewlock: "Blocca/sblocca il premio recensione su un utente.",
    classifica: "Mostra la classifica livelli del server.",
    rank: "Mostra il rank di un utente.",
    mstats: "Mostra le statistiche minigiochi di un utente.",
    me: "Mostra la tua attività settimanale.",
  };
  if (exact[name]) return exact[name];

  const subcommands = Array.isArray(command?.subcommands)
    ? command.subcommands
    : [];
  if (subcommands.length)
    return `Gestisce ${readable} con subcomandi dedicati.`;

  const folderName = String(folder || "").toLowerCase();
  if (folderName === "community") return `Comando community: ${readable}.`;
  if (folderName === "level") return `Comando livelli: ${readable}.`;
  if (folderName === "staff") return `Comando staff: ${readable}.`;
  if (folderName === "vip") return `Comando VIP: ${readable}.`;
  if (folderName === "partner") return `Comando partnership: ${readable}.`;
  return `Comando prefix per ${readable}.`;
}

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
      ? `${prefix}${name} <${subs.slice(0, 8).join("|")}>`
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

function buildAutoPrefixSubcommandDescriptions(command) {
  const commandName = String(command?.name || "")
    .trim()
    .toLowerCase();
  const source =
    command?.subcommandDescriptions ||
    command?.subcommandsDescriptions ||
    command?.subcommandHelp ||
    command?.subcommandsHelp ||
    {};
  const out =
    source && typeof source === "object" && !Array.isArray(source)
      ? { ...source }
      : {};

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
  const known = Array.from(new Set([...declared, ...mappedTargets]));
  const verbDescriptions = {
    add: "Aggiunge un elemento o un valore.",
    remove: "Rimuove un elemento o un valore.",
    list: "Mostra la lista degli elementi disponibili.",
    clear: "Pulisce o resetta i dati della sezione.",
    set: "Imposta un valore specifico.",
    get: "Recupera e mostra i dati richiesti.",
    create: "Crea una nuova configurazione o risorsa.",
    delete: "Elimina una risorsa esistente.",
    edit: "Modifica una configurazione esistente.",
    update: "Aggiorna lo stato o i dati correnti.",
    enable: "Attiva la funzionalita richiesta.",
    disable: "Disattiva la funzionalita richiesta.",
    lock: "Blocca la funzione indicata.",
    unlock: "Sblocca la funzione indicata.",
    claim: "Assegna a te la gestione dell'elemento.",
    unclaim: "Rilascia la gestione dell'elemento.",
    close: "Chiude l'elemento corrente.",
    closerequest: "Invia una richiesta di chiusura.",
    rename: "Rinomina l'elemento corrente.",
    switchpanel: "Sposta su un pannello differente.",
    grant: "Assegna permessi o risorse.",
    revoke: "Revoca permessi o risorse.",
    ignore: "Esclude dal comportamento previsto.",
    unignore: "Rimuove l'esclusione precedente.",
    multiplier: "Imposta un moltiplicatore temporaneo.",
    config: "Mostra o modifica la configurazione.",
    user: "Opera sul profilo utente.",
    server: "Opera sulle impostazioni server.",
    guild: "Opera sulle impostazioni server.",
    avatar: "Gestisce le opzioni avatar.",
    banner: "Gestisce le opzioni banner.",
    quotes: "Gestisce le opzioni quote.",
    alltime: "Mostra dati complessivi.",
    weekly: "Mostra dati settimanali.",
    voice: "Gestisce la voce TTS.",
    autojoin: "Gestisce l'autojoin TTS.",
    modify: "Apre la modifica avanzata.",
    reset: "Ripristina lo stato iniziale.",
  };
  for (const sub of known) {
    if (String(out[sub] || "").trim()) continue;
    out[sub] =
      verbDescriptions[sub] ||
      `Gestisce l'opzione \`${sub}\` del comando \`+${commandName}\`.`;
  }
  return out;
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
          if (!String(command.description || "").trim()) {
            command.description = buildAutoPrefixDescription(command, folder);
          }
          command.subcommandDescriptions =
            buildAutoPrefixSubcommandDescriptions(command);
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
