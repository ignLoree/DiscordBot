const mongoose = require('mongoose');
const config = require('../config.json');
const IDs = require('../Utils/Config/ids');
const sponsorPanels = require('../Triggers/embeds');

module.exports = {
    name: 'ready',
    once: true,
    async execute(_readyClient, client) {
        const c = client || _readyClient;
        global.logger.info('[Bot Test] Bot avviato: ' + c.user.tag);

        const mongodbURL = process.env.MONGO_URL || c.config.mongoURL;
        if (mongodbURL) {
            try {
                await mongoose.connect(mongodbURL, {
                    serverSelectionTimeoutMS: 15000,
                    connectTimeoutMS: 15000
                });
                global.logger.info('[Bot Test] MongoDB connesso.');
            } catch (err) {
                global.logger.error('[Bot Test] MongoDB:', err.message);
            }
        } else {
            global.logger.warn('[Bot Test] MONGO_URL non impostato.');
        }

        const sponsorIds = Array.isArray(c.config?.sponsorGuildIds) ? c.config.sponsorGuildIds : Object.keys(c.config?.sponsorVerifyChannelIds || {});
        const verifyChannels = c.config?.sponsorVerifyChannelIds || {};
        global.logger.info('[Bot Test] Server in cache (subito dopo ready): ' + c.guilds.cache.size);
        global.logger.info('[Bot Test] Config sponsor: ' + sponsorIds.length + ' guild, ' + Object.keys(verifyChannels).length + ' canali verify.');

        // Delay: Discord a volte invia le guild dopo il ready.
        await new Promise((r) => setTimeout(r, 3000));

        // Warm-up: forza fetch dall'API per ogni server sponsor così la cache è piena anche se il gateway era in ritardo.
        for (const guildId of sponsorIds) {
            try {
                await c.guilds.fetch(guildId).catch((err) => {
                    global.logger.warn('[Bot Test] Fetch guild ' + guildId + ': ' + (err?.message || err));
                    return null;
                });
                await new Promise((r) => setTimeout(r, 300));
            } catch (e) {
                global.logger.warn('[Bot Test] Warm-up guild ' + guildId + ':', e?.message || e);
            }
        }
        const guildList = c.guilds.cache.map(g => g.name + ' (' + g.id + ')').join(', ') || 'nessuno';
        global.logger.info('[Bot Test] Server in cache dopo fetch: ' + c.guilds.cache.size + ' → ' + guildList);

        const runPanels = async () => {
            try {
                await sponsorPanels.runSponsorPanel(c);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorPanel:', err);
            }
            let verifySent = 0;
            let ticketSent = 0;
            try {
                verifySent = await sponsorPanels.runSponsorVerifyPanels(c);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorVerifyPanels:', err);
            }
            try {
                ticketSent = await sponsorPanels.runSponsorTicketPanels(c);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorTicketPanels:', err);
            }
            return { verifySent, ticketSent };
        };

        let result = await runPanels();
        if (result.verifySent === 0 && result.ticketSent === 0 && c.guilds.cache.size > 0) {
            global.logger.warn('[Bot Test] Nessun panel verify/ticket inviato. Riprovo tra 5 secondi...');
            await new Promise((r) => setTimeout(r, 5000));
            result = await runPanels();
        }
        if (result.verifySent === 0 && result.ticketSent === 0) {
            global.logger.warn('[Bot Test] Dopo il retry: ancora 0 panel. Verifica che il bot sia invitato in ogni server sponsor (config.sponsorGuildIds), sponsorVerifyChannelIds per la verifica e sponsorTicketChannelIds per i ticket.');
        }
    }
};
