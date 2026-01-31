const fs = require('fs');
const path = require('path');
const ascii = require('ascii-table');

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes('ufficiale');
    const official = isOfficial ? cwd : path.join(base, 'Vinili & Caffè Bot Ufficiale');
    const dev = isOfficial ? path.join(base, 'Vinili & Caffè Dev Bot') : cwd;
    return { official, dev, isOfficial };
}

function listJsFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function listCategoryFiles(root, categoryDir) {
    const absBase = path.resolve(root, categoryDir);
    if (!fs.existsSync(absBase)) return new Set();
    const files = listJsFiles(absBase).map((file) => {
        return path.relative(absBase, file).replace(/\\/g, '/');
    });
    return new Set(files);
}

module.exports = (client) => {
    client.logBootTables = () => {
        const isPrimary = process.cwd().toLowerCase().includes('ufficiale');
        if (!isPrimary) return;
        const roots = getBotRoots();
        const categories = [
            { label: 'HANDLERS', dir: 'Handlers' },
            { label: 'SERVICES', dir: 'Services' },
            { label: 'UTILS', dir: 'Utils' },
            { label: 'SCHEMAS', dir: 'Schemas' }
        ];

        const table = new ascii().setHeading('Folder', 'File', 'Ufficiale', 'Dev');
        for (const category of categories) {
            const uffFiles = listCategoryFiles(roots.official, category.dir);
            const devFiles = listCategoryFiles(roots.dev, category.dir);
            const allFiles = new Set([...uffFiles, ...devFiles]);
            for (const rel of Array.from(allFiles).sort()) {
                const folder = path.dirname(rel).replace(/\\/g, '/');
                const file = path.basename(rel);
                const folderLabel = folder === '.' ? category.label : `${category.label}/${folder}`;
                const uffStatus = uffFiles.has(rel) ? 'Loaded' : '-';
                const devStatus = devFiles.has(rel) ? 'Loaded' : '-';
                table.addRow(folderLabel, file, uffStatus, devStatus);
            }
        }

        global.logger.info(table.toString());
    };
};
