const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");
const isDev = process.cwd().toLowerCase().includes("dev bot");
const config = require("../config.json");

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes("ufficiale");
    const isDev = cwd.toLowerCase().includes("dev bot");
    const official = isOfficial ? cwd : path.join(base, "Vinili & Caffè Bot Ufficiale");
    const dev = isDev ? cwd : path.join(base, "Vinili & Caffè Dev Bot");
    return { official, dev, isOfficial };
}

function listPrefixFiles(root) {
    const out = new Map();
    const prefixRoot = path.join(root, "Prefix");
    if (!fs.existsSync(prefixRoot)) return out;
    const folders = fs.readdirSync(prefixRoot).filter((f) => {
        const full = path.join(prefixRoot, f);
        return fs.statSync(full).isDirectory();
    });
    for (const folder of folders) {
        const folderPath = path.join(prefixRoot, folder);
        const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
        out.set(folder, new Set(files));
    }
    return out;
}

function shouldLogOnce(tag) {
    return !isDev;
}

function humanizeCommandName(name) {
    return String(name || '')
        .replace(/[_-]+/g, ' ')
        .trim();
}

function buildAutoPrefixDescription(command, folder) {
    const name = String(command?.name || '').toLowerCase();
    const readable = humanizeCommandName(name);
    const exact = {
        help: 'Mostra la lista dei comandi disponibili.',
        ping: 'Mostra latenza del bot e stato dei servizi.',
        ticket: 'Gestisce i ticket.',
        customvoc: 'Crea e gestisce una vocale privata personalizzata.',
        customrolecreate: 'Crea il tuo ruolo personalizzato.',
        customrolemodify: 'Apre il pannello di modifica del ruolo personalizzato.',
        customroleadd: 'Aggiunge utenti al tuo ruolo personalizzato.',
        customroleremove: 'Rimuove utenti dal tuo ruolo personalizzato.',
        'no-dm': 'Blocca gli annunci che vengono inviati in DM dallo staff.',
        'no-dm-list': 'Mostra la lista utenti bloccati per i DM.',
        addlevel: 'Aggiunge livelli a un utente.',
        removelevel: 'Rimuove livelli a un utente.',
        recensione: 'Premia una recensione assegnando livelli.',
        reviewlock: 'Blocca/sblocca il premio recensione su un utente.',
        classifica: 'Mostra la classifica livelli del server.',
        rank: 'Mostra il rank di un utente.',
        mstats: 'Mostra le statistiche minigiochi di un utente.',
        myactivity: 'Mostra la tua attività settimanale.'
    };
    if (exact[name]) return exact[name];

    const subcommands = Array.isArray(command?.subcommands) ? command.subcommands : [];
    if (subcommands.length) {
        return `Gestisce ${readable} con subcomandi dedicati.`;
    }

    const folderName = String(folder || '').toLowerCase();
    if (folderName === 'community') return `Comando community: ${readable}.`;
    if (folderName === 'level') return `Comando livelli: ${readable}.`;
    if (folderName === 'staff') return `Comando staff: ${readable}.`;
    if (folderName === 'vip') return `Comando VIP: ${readable}.`;
    if (folderName === 'partner') return `Comando partnership: ${readable}.`;
    return `Comando prefix per ${readable}.`;
}

module.exports = (client) => {
    client.prefixCommands = async (folders) => {
        const disabledPrefixCommands = Array.isArray(config.disabledPrefixCommands)
            ? new Set(config.disabledPrefixCommands)
            : new Set();
        const statusMap = new Map();
        for (const folder of folders) {
            const folderPath = `./Prefix/${folder}`;
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".js"));
            for (const file of files) {
                const filePath = `../Prefix/${folder}/${file}`;
                const key = `${folder}/${file}`;
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);
                if (!command || !command.name) {
                    statusMap.set(key, "Missing name");
                    continue;
                }
                if (command.skipLoad || command.skipPrefix) {
                    statusMap.set(key, "Skipped");
                    continue;
                }
                const folderName = String(folder).toLowerCase();
                command.folder = command.folder || folder;
                if (!String(command.description || '').trim()) {
                    command.description = buildAutoPrefixDescription(command, folder);
                }
                if (typeof command.staffOnly === 'undefined') {
                    command.staffOnly = folderName === 'staff' || folderName === 'moderation';
                }
                if (typeof command.adminOnly === 'undefined') {
                    command.adminOnly = folderName === 'admin';
                }
                if (folderName === 'moderation') {
                    command.prefixOverride = '?';
                }
                client.pcommands.set(command.name, command);
                if (disabledPrefixCommands.has(command.name)) {
                    statusMap.set(key, "Disabilitato");
                } else {
                    statusMap.set(key, "Loaded");
                }
                if (Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.aliases.set(alias, command.name);
                    }
                }
            }
        }

        const roots = getBotRoots();
        const officialMap = listPrefixFiles(roots.official);
        const devMap = listPrefixFiles(roots.dev);
        const allFolders = new Set([...officialMap.keys(), ...devMap.keys()]);
        const unified = new ascii().setHeading("Folder", "File", "Ufficiale", "Dev");
        const isOfficial = roots.isOfficial;

        for (const folder of Array.from(allFolders).sort()) {
            const uffFiles = officialMap.get(folder) || new Set();
            const devFiles = devMap.get(folder) || new Set();
            const allFiles = new Set([...uffFiles, ...devFiles]);
            for (const file of Array.from(allFiles).sort()) {
                const key = `${folder}/${file}`;
                const currentStatus = statusMap.get(key) || (isOfficial ? (uffFiles.has(file) ? "Loaded" : "-") : (devFiles.has(file) ? "Loaded" : "-"));
                const otherStatus = isOfficial ? (devFiles.has(file) ? "Loaded" : "-") : (uffFiles.has(file) ? "Loaded" : "-");
                if (isOfficial) {
                    unified.addRow(folder, file, currentStatus, otherStatus);
                } else {
                    unified.addRow(folder, file, otherStatus, currentStatus);
                }
            }
        }

        if (shouldLogOnce('prefix')) {
            global.logger.info(unified.toString());
            global.logger.info(`[PREFIX_COMMANDS] Loaded ${client.pcommands.size} PrefixCommands.`);
        }
        client._prefixOverrideCache = null;
        try {
            client.logs.success(`[FUNCTION] Successfully reloaded prefix commands.`);
        } catch (error) {
            global.logger.error(error);
        }
    };
};
