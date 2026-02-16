/**
 * Configurazione ID per Vinili & Caffè Bot Test (server sponsor). Usa config.json e .env.
 * Il bot principale resta la fonte di verità; qui solo ciò che serve per sponsor.
 */
const path = require('path');
const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = {};
try {
    config = require(configPath);
} catch (e) {
    // config potrebbe non esistere
}

const MAIN_GUILD_ID = config.mainGuildId || process.env.MAIN_GUILD_ID || '1329080093599076474';
const SPONSOR_GUILD_IDS = Array.isArray(config.sponsorGuildIds) ? config.sponsorGuildIds : [
    '1471511676019933354', '1471511928739201047', '1471512183547498579',
    '1471512555762483330', '1471512797140484230', '1471512808448458958'
];

const sponsorStaffRoleIds = config.sponsorStaffRoleIds || {};

/** ID guild test (stesso del bot ufficiale). */
const GUILD_TEST_ID = '1462458562507964584';

const IDs = {
    guilds: {
        main: MAIN_GUILD_ID,
        test: GUILD_TEST_ID,
        sponsorGuildIds: SPONSOR_GUILD_IDS
    },
    channels: {
        infoSponsor: config.channels?.infoSponsor || '1442569211611185323',
        ticketLogs: config.channels?.ticketLogs || '1442569290682208296'
    },
    sponsorVerifyChannelIds: config.sponsorVerifyChannelIds || {},
    verificatoRoleIds: config.verificatoRoleIds || {},
    roles: {
        sponsorStaffRoleIds
    }
};

module.exports = IDs;
