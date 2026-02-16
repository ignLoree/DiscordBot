const mongoose = require('mongoose');
const config = require('../config.json');
const IDs = require('../Utils/Config/ids');
const sponsorPanels = require('../Triggers/sponsorPanels');

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

        // Breve delay così la cache delle guild è popolata (Discord può inviare guild dopo ready).
        await new Promise((r) => setTimeout(r, 2000));

        // Solo panel sponsor + verify + ticket. NON aggiungere qui Staff list, staff pagato, guida staff, best staff, moderazione (restano solo nel Bot Ufficiale).
        try {
            await sponsorPanels.runSponsorPanel(client);
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorPanel:', err);
        }
        try {
            await sponsorPanels.runSponsorVerifyPanels(client);
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorVerifyPanels:', err);
        }
        try {
            await sponsorPanels.runSponsorTicketPanels(client);
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorTicketPanels:', err);
        }
    }
};
