const mongoose = require('mongoose');
const config = require('../config.json');
const IDs = require('../Utils/Config/ids');
const sponsorPanels = require('../Triggers/sponsorPanels');

module.exports = {
    name: 'ready',
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
    }
};
