const mongoose = require('mongoose');
const config = require('../config.json');
const IDs = require('../Utils/Config/ids');
const sponsorPanels = require('../Triggers/embeds');

module.exports = {
    name: 'ready',
    once: true,
    async execute(_readyClient, client) {
        const c = client || _readyClient;
        const appId = c.application?.id || c.user?.id;
        global.logger.info('[Bot Test] Bot avviato: ' + c.user.tag + ' (Application ID: ' + appId + ')');

        try {
            c.user.setPresence({ status: 'invisible' });
        } catch (err) {
            global.logger.warn('[Bot Test] setPresence invisible:', err?.message || err);
        }

        const mongodbURL = process.env.MONGO_URL || c.config.mongoURL;
        if (mongodbURL) {
            try {
                await mongoose.connect(mongodbURL, {
                    serverSelectionTimeoutMS: 15000,
                    connectTimeoutMS: 15000
                });
            } catch (err) {
                global.logger.error('[Bot Test] MongoDB:', err.message);
            }
        } else {
            global.logger.warn('[Bot Test] MONGO_URL non impostato.');
        }

        const sponsorIds = Array.isArray(c.config?.sponsorGuildIds) ? c.config.sponsorGuildIds : Object.keys(c.config?.sponsorVerifyChannelIds || {});
        const verifyChannels = c.config?.sponsorVerifyChannelIds || {};
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
            if (sponsorIds.length > 0 && c.guilds.cache.size > 0) {
                const inSponsor = sponsorIds.filter(id => c.guilds.cache.has(id));
                if (inSponsor.length === 0) {
                    global.logger.warn('[Bot Test] Questo bot (Application ID: ' + (c.application?.id || c.user?.id) + ') non è in nessuno dei server sponsor. L\'API Discord restituisce "Unknown Guild": invita QUESTO bot (stesso token/DISCORD_TOKEN_TEST) nei 6 server sponsor, non un altro bot (es. il bot ufficiale).');
                }
            }
        }
    }
};
