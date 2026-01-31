const fs = require('fs');
const path = require('path');
const ascii = require('ascii-table');
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
function logFileTable(label, baseDir, statusLabel) {
    const absBase = path.resolve(baseDir);
    if (!fs.existsSync(absBase)) {
        global.logger.warn(`[${label}] Directory not found: ${baseDir}`);
        return;
    }
    const files = listJsFiles(absBase);
    const table = new ascii().setHeading('File Name', 'Status');
    for (const file of files) {
        const rel = path.relative(absBase, file).replace(/\\/g, '/');
        table.addRow(rel, statusLabel);
    }
    const verb = 'Loaded';
    global.logger.info(table.toString());
    global.logger.info(`[${label}] ${verb} ${files.length} files.`);
}
module.exports = (client) => {
    client.logBootTables = () => {
        logFileTable('HANDLERS', './Handlers', 'Loaded');
        logFileTable('SERVICES', './Services', 'Loaded');
        logFileTable('UTILS', './Utils', 'Loaded');
        logFileTable('SCHEMAS', './Schemas', 'Loaded');
    };
};
