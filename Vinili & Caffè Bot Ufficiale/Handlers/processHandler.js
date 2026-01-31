module.exports = (db) => {
    process.on('SIGINT', () => {
        global.logger.info();
        error('SIGINT: Exiting...');
        process.exit();
    });
    process.on('uncaughtException', (err) => {
        error(`UNCAUGHT EXCEPTION: ${err.stack}`);
    });
    process.on('SIGTERM', () => {
        error('SIGTERM: Closing database and exiting...');
        process.exit();
    });
    process.on('unhandledRejection', (err) => {
        error(`UNHANDLED REJECTION: ${err.stack}`);
    });
    process.on('warning', (warning) => {
        warn(warning);
    });
    process.on('uncaughtReferenceError', (err) => {
        error(err.stack);
    });
};
const client = require('../index')
client.logs = require('../Utils/Moderation/logs')
function error(message) {
    client.logs.error(`[ERROR] ${message}`);
}
function warn(message) {
    client.logs.warn(`[WARN] ${message}`);
}
client.logs.success(`[PROCESS] Process handlers loaded.`);
