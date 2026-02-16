const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const SponsorMainLeave = require('../Schemas/Tags/tagsSchema');
const IDs = require('../Utils/Config/ids');

const MAIN_GUILD_ID = IDs.guilds?.main || '1329080093599076474';
const SPONSOR_GUILD_IDS = IDs.guilds?.sponsorGuildIds || [];
const OFFICIAL_INVITE_URL = 'https://discord.gg/viniliecaffe';

function makeRejoinEmbed() {
    return new EmbedBuilder()
        .setColor('#ffb020')
        .setTitle('Rientra nel server principale')
        .setDescription(
            'Hai lasciato il server principale **Vinili & Caffè**.\n\n' +
            'Per mantenere l\'accesso ai server TAGS devi rientrare entro **24 ore**.\n\n' +
            'Clicca il bottone qui sotto per rientrare.'
        )
        .setFooter({ text: 'Se non rientri entro 24h sarai rimosso dal server e perderai la TAG.' });
}

function makeRejoinRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Rientra nel server principale')
            .setURL(OFFICIAL_INVITE_URL)
    );
}

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            if (member?.user?.bot) return;
            if (member?.guild?.id !== MAIN_GUILD_ID) return;

            const userId = member.id;
            let inSomeSponsor = false;
            for (const sid of SPONSOR_GUILD_IDS) {
                const g = member.client.guilds.cache.get(sid);
                if (!g) continue;
                const m = await g.members.fetch(userId).catch(() => null);
                if (m) {
                    inSomeSponsor = true;
                    break;
                }
            }

            if (!inSomeSponsor) return;

            const now = new Date();
            const kickAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await SponsorMainLeave.updateOne(
                { userId },
                { $set: { userId, leftAt: now, kickAt, dmSent: false, dmFailed: false } },
                { upsert: true }
            ).catch(() => {});

            const dmOk = await member.user
                .send({ embeds: [makeRejoinEmbed()], components: [makeRejoinRow()] })
                .then(() => true)
                .catch(() => false);

            await SponsorMainLeave.updateOne(
                { userId },
                { $set: dmOk ? { dmSent: true } : { dmFailed: true } }
            ).catch(() => {});
        } catch (err) {
            global.logger.error('[Bot Test] guildMemberRemove', err);
        }
    }
};
