module.exports = function installProcessHandlers() {
    if (process.__viniliTestProcessHandlersInstalled) return;
    process.__viniliTestProcessHandlersInstalled = true;

    const log = (msg) => {
        try {
            if (global?.logger?.error) global.logger.error('[Bot Test] ' + msg);
            else console.error('[Bot Test]', msg);
        } catch (_) {}
    };

    process.on('SIGINT', () => {
        log('SIGINT: Exiting...');
        process.exit();
    });

    process.on('uncaughtException', (err) => {
        log('UNCAUGHT EXCEPTION: ' + (err?.stack || err));
    });

    process.on('SIGTERM', () => {
        log('SIGTERM: Exiting...');
        process.exit();
    });

    process.on('unhandledRejection', (err) => {
        log('UNHANDLED REJECTION: ' + (err?.stack || err));
    });

    process.on('warning', (w) => {
        try {
            if (global?.logger?.warn) global.logger.warn('[Bot Test]', w);
        } catch (_) {}
    });

    if (global?.logger?.info) global.logger.info('[Bot Test] Process handlers loaded.');
};
