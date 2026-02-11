const ascii = require('ascii-table');
const fs = require('fs');

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
    if (subcommands.length) return `Gestisce ${readable} con subcomandi dedicati.`;

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
        client.pcommands.clear();
        client.aliases.clear();
        const statusMap = new Map();

        for (const folder of folders) {
            const folderPath = `./Prefix/${folder}`;
            const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'));
            for (const file of files) {
                const filePath = `../Prefix/${folder}/${file}`;
                const key = `${folder}/${file}`;
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);
                if (!command || !command.name) {
                    statusMap.set(key, 'Missing name');
                    continue;
                }
                if (command.skipLoad || command.skipPrefix) {
                    statusMap.set(key, 'Skipped');
                    continue;
                }
                command.folder = command.folder || folder;
                if (!String(command.description || '').trim()) {
                    command.description = buildAutoPrefixDescription(command, folder);
                }
                client.pcommands.set(command.name, command);
                statusMap.set(key, 'Loaded');
                if (Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) client.aliases.set(alias, command.name);
                }
            }
        }

        const table = new ascii().setHeading('Folder', 'File', 'Status');
        for (const [key, status] of Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            const [folder, file] = key.split('/');
            table.addRow(folder, file, status);
        }

        global.logger.info(table.toString());
        global.logger.info(`[PREFIX_COMMANDS] Loaded ${client.pcommands.size} PrefixCommands.`);

        client._prefixOverrideCache = null;
        client.logs.success('[FUNCTION] Successfully reloaded prefix commands.');
    };
};
