const noop = () => {};
const log = (level, ...args) => {
    const prefix = `[Bot Test][${level}]`;
    if (typeof console[level] === 'function') {
        console[level](prefix, ...args);
    } else {
        console.log(prefix, ...args);
    }
};

module.exports = {
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    debug: (...args) => (process.env.DEBUG ? log('debug', ...args) : noop),
    success: (...args) => log('info', ...args)
};
