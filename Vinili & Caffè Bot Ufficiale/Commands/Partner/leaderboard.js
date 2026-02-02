const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');
const PartnershipCount = require('../../Schemas/Staff/staffSchema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Guarda la classifica delle partnership'),

    async execute(interaction) {
        await interaction.deferReply()
        const allowedRoles = ['1442568894349840435', '1442568896237277295', '1442568905582317740'];
        const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
        if (!hasAllowedRole) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
        const partnersPerPage = 10;
        const allPartners = await PartnershipCount.find().sort({ partnerCount: -1 }).lean();
        if (allPartners.length === 0) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setDescription('<:attentionfromvega:1443651874032062505> Nessuno ha ancora effettuato partner!')
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
                let userTag = "Utente sconosciuto";
                try {
                    const user = await interaction.client.users.fetch(userId);
                    userTag = user.username;
                } catch {
                }
                description += `**${startIndex + i + 1}.** ${userTag} — ⭐ ${partner.partnerCount} partnership\n`;
            }
            return new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<a:VC_Winner:1448687700235256009> Classifica delle Partnership')
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
                    .setLabel('<a:vegaleftarrow:1462914743416131816>️ Precedente')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Prossima <a:vegarightarrow:1443673039156936837>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === totalPages)
            );
        const message = await interaction.editReply({ embeds: [embed], components: [row] });
        const collector = message.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.editReply({ content: '<:vegax:1443934876440068179> Non puoi usare questi pulsanti.', flags: 1 << 6 });
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
            message.edit({ components: [row] }).catch(() => { });
        });
    }
};