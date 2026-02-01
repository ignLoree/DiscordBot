const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra i comandi che può usare un Partner Manager')
        .addStringOption(o =>
            o.setName('tipo')
                .setDescription('Schermata help da mostrare')
                .setRequired(true)
                .addChoices(
                    { name: 'partner manager', value: 'partner manager' },
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 6 });
        const tipo = interaction.options.getString('tipo') || 'partner manager';
        const allowedRoles = ['1442568905582317740'];
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

        if (!tipo) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`<:vegax:1443934876440068179> Prima devi selezionare quale schermata mostrare!`)
                        .setColor("Red")
                ],
                flags: 1 << 6
            })
        }

        return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`<:partnermanager:1443651916838998099> Questi sono i comandi che puoi usare da <@&1442568905582317740>:
                    
                    <:dot:1443660294596329582> \`!desc\` - Per inviare direttamente la descrizione (Solo ticket)
                    <:dot:1443660294596329582> \`/partnership\` - Per fare una partnership, bisogna inserire il manager (colui con cui state facendo la partner) e premere invio, nel riquadro inserire la descrzione e fare invia. (Solo ticket e <#1442569209849843823>)
                    <:dot:1443660294596329582> \`Partnership\` - Cliccando col tasto destro direttamente sul messaggio con la descrizione da mettere vi uscirà "App > Partnership" il bot autocompilerà il tutto e a voi basterà premere invio. (Solo ticket)
                    <:dot:1443660294596329582> \`/leaderboard\` - Per mostrare la classifica delle partnership (Sperimentale)
                    
                    <:attentionfromvega:1443651874032062505> Per segnalare un bug col bot apri un <#1442569095068254219> \`HIGH STAFF\``)
                    .setColor("#6f4e37")
            ]
        })
    }
}