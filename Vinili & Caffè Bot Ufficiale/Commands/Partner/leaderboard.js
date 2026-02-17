const { safeEditReply } = require('../../Utils/Moderation/reply');
const { ChatInputCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const PartnershipCount = require('../../Schemas/Staff/staffSchema');

module.exports = {
    data: new ChatInputCommandBuilder()
        .setName('leaderboard')
        .setDescription('Guarda la classifica delle partnership')
        .addStringOption(option =>
            option
                .setName('tipo')
                .setDescription('Scegli quale classifica visualizzare')
                .addChoices(
                    { name: 'Totale', value: 'totale' },
                    { name: 'Settimanale', value: 'settimanale' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply().catch(() => {});
        const tipo = interaction.options.getString('tipo') || 'totale';
        const isWeekly = tipo === 'settimanale';
        const weekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
        const partnersPerPage = 10;

        const allStaff = await PartnershipCount.find({ guildId: interaction.guild.id }).lean();
        const allPartners = allStaff
            .map((staff) => {
                if (!isWeekly) {
                    return { userId: staff.userId, score: staff.partnerCount || 0 };
                }

                const actions = Array.isArray(staff.partnerActions) ? staff.partnerActions : [];
                const weeklyCount = actions.reduce((total, action) => {
                    if (!action || action.action !== 'create' || !action.date) return total;
                    return new Date(action.date) >= weekAgo ? total + 1 : total;
                }, 0);

                return { userId: staff.userId, score: weeklyCount };
            })
            .filter((staff) => staff.score > 0)
            .sort((a, b) => b.score - a.score);

        if (allPartners.length === 0) {
            return await safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setDescription(
                            isWeekly
                                ? '<:attentionfromvega:1443651874032062505> Nessuno ha effettuato partner negli ultimi 7 giorni!'
                                : '<:attentionfromvega:1443651874032062505> Nessuno ha ancora effettuato partner!'
                        )
                ]
            });
        }

        const totalPages = Math.ceil(allPartners.length / partnersPerPage);
        const generateEmbed = async (page) => {
            const startIndex = (page - 1) * partnersPerPage;
            const currentPartners = allPartners.slice(startIndex, startIndex + partnersPerPage);
            let description = '';

            for (let i = 0; i < currentPartners.length; i++) {
                const partner = currentPartners[i];
                const userId = partner.userId;
                let userTag = 'Utente sconosciuto';

                try {
                    const user = await interaction.client.users.fetch(userId);
                    userTag = user.username;
                } catch {}

                description += `**${startIndex + i + 1}.** ${userTag} - <:VC_Partner:1443933014835986473> ${partner.score} partnership\n`;
            }

            return new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle(`<a:VC_Winner:1448687700235256009> Classifica Partnership (${isWeekly ? 'Settimanale' : 'Totale'})`)
                .setDescription(description)
                .setFooter({ text: `Pagina ${page} di ${totalPages}` })
                .setTimestamp();
        };

        let currentPage = 1;
        const embed = await generateEmbed(currentPage);
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setEmoji('<a:vegarightarrow:1443673039156936837>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === totalPages)
            );

        const message = await safeEditReply(interaction, { embeds: [embed], components: [row] });
        if (!message) return;

        const collector = message.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '<:vegax:1443934876440068179> Non puoi usare questi pulsanti.', flags: 1 << 6 });
            }

            if (i.customId === 'prev' && currentPage > 1) {
                currentPage--;
            } else if (i.customId === 'next' && currentPage < totalPages) {
                currentPage++;
            }

            const newEmbed = await generateEmbed(currentPage);
            row.components[0].setDisabled(currentPage === 1);
            row.components[1].setDisabled(currentPage === totalPages);
            await i.update({ embeds: [newEmbed], components: [row] });
        });

        collector.on('end', () => {
            row.components.forEach(button => button.setDisabled(true));
            message.edit({ components: [row] }).catch(() => {});
        });
    }
};
