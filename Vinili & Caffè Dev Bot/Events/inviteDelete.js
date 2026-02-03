module.exports = {
    name: 'inviteDelete',
    async execute(invite) {
        try {
            const client = invite.client;
            const cache = client.inviteCache?.get(invite.guild.id);
            if (cache) {
                cache.delete(invite.code);
            }
        } catch (error) {
            global.logger.error('[INVITE DELETE] Failed:', error);
        }
    }
};
