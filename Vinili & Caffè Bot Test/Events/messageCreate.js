const { dispatchPrefixMessage } = require('../Utils/Prefix/prefixDispatcher');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        await dispatchPrefixMessage(message, client);
    }
};
