const mongoose = require('mongoose');
const config = require('../config.json');
const IDs = require('../Utils/Config/ids');
const sponsorPanels = require('../Triggers/embeds');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        global.logger.info('[Bot Test] Bot avviato: ' + client.user.tag);

        const mongodbURL = process.env.MONGO_URL || client.config.mongoURL;
        if (mongodbURL) {
            try {
                await mongoose.connect(mongodbURL, {
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 5000
                });
                global.logger.info('[Bot Test] MongoDB connesso.');
            } catch (err) {
                global.logger.error('[Bot Test] MongoDB:', err.message);
            }
        } else {
            global.logger.warn('[Bot Test] MONGO_URL non impostato.');
        }

        const guildList = client.guilds.cache.map(g => g.name + ' (' + g.id + ')').join(', ') || 'nessuno';
        const sponsorIds = client.config?.sponsorGuildIds || [];
        const verifyChannels = client.config?.sponsorVerifyChannelIds || {};
        global.logger.info('[Bot Test] Server in cui sono: ' + client.guilds.cache.size + ' → ' + guildList);
        global.logger.info('[Bot Test] Config sponsorGuildIds: ' + (sponsorIds.length || 0) + ', sponsorVerifyChannelIds: ' + Object.keys(verifyChannels).length + ' canali.');

        // Delay per cache guild (Discord può inviare guild dopo ready).
        await new Promise((r) => setTimeout(r, 5000));

        const runPanels = async () => {
            try {
                await sponsorPanels.runSponsorPanel(client);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorPanel:', err);
            }
            let verifySent = 0;
            let ticketSent = 0;
            try {
                verifySent = await sponsorPanels.runSponsorVerifyPanels(client);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorVerifyPanels:', err);
            }
            try {
                ticketSent = await sponsorPanels.runSponsorTicketPanels(client);
            } catch (err) {
                global.logger.error('[Bot Test] runSponsorTicketPanels:', err);
            }
            return { verifySent, ticketSent };
        };

        let result = await runPanels();
        if (result.verifySent === 0 && result.ticketSent === 0 && client.guilds.cache.size > 0) {
            global.logger.warn('[Bot Test] Nessun panel verify/ticket inviato. Riprovo tra 5 secondi...');
            await new Promise((r) => setTimeout(r, 5000));
            result = await runPanels();
        }
        if (result.verifySent === 0 && result.ticketSent === 0) {
            global.logger.warn('[Bot Test] Dopo il retry: ancora 0 panel. Verifica che il bot sia invitato in ogni server sponsor (config.sponsorGuildIds), sponsorVerifyChannelIds per la verifica e sponsorTicketChannelIds per i ticket.');
        }
    }
};
