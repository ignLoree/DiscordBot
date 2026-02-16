const fs = require('fs');
const path = require('path');
const ascii = require('ascii-table');

function listJsFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listJsFiles(fullPath));
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
    }
    return files;
}

module.exports = (client) => {
    client.logBootTables = () => {
        const categories = ['Handlers', 'Services', 'Utils', 'Schemas'];
        const table = new ascii().setHeading('Folder', 'File', 'Status');

        for (const category of categories) {
            const absBase = path.resolve(process.cwd(), category);
            const files = listJsFiles(absBase).map((file) => path.relative(absBase, file).replace(/\\/g, '/'));
            for (const rel of files.sort()) {
                const folder = path.dirname(rel).replace(/\\/g, '/');
                const file = path.basename(rel);
                const folderLabel = folder === '.' ? category : `${category}/${folder}`;
                table.addRow(folderLabel, file, 'Loaded');
            }
        }

        global.logger.info(table.toString());
    };
};
